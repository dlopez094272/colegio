const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const multer = require('multer');
const InscripcionModel = require('../models/inscripcionModel');
const EstudianteModel  = require('../models/estudianteModel');
const VinculoModel     = require('../models/vinculoModel');
const { registrarBitacora } = require('../utils/bitacora');
const { enTransaccion, fail } = require('../utils/transaccion');
const { generarCargos, calcularMora, hoy, redondear } = require('../utils/cargos');
const { siguienteCorrelativo } = require('../utils/correlativo');
const { enviar } = require('../pdf/base');
const { generarContrato } = require('../pdf/contrato');
const { generarEstadoCuenta } = require('../pdf/estadoCuenta');

// El contrato firmado es un documento sensible: igual que el expediente del
// estudiante, se guarda en storage/<tenant>/ (fuera de public/) y solo se
// entrega por la API con token y permiso.
const STORAGE_ROOT = path.join(__dirname, '../../storage');
const MAX_MB = 15;
const MIME_CONTRATO = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  defParamCharset: 'utf8',
});

const carpetaTenant = req => path.join(STORAGE_ROOT, req.tenant.uploadsDir || '');

function rutaEnDisco(req, archivo) {
  if (!archivo || !archivo.startsWith('inscripciones/')) return null;
  const base = carpetaTenant(req);
  const ruta = path.join(base, archivo);
  return ruta.startsWith(base + path.sep) ? ruta : null;
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
function leerFecha(v, etiqueta) {
  const s = String(v ?? '').substring(0, 10);
  if (!RE_FECHA.test(s) || isNaN(Date.parse(s))) throw fail(400, `${etiqueta} no es válida`);
  return s;
}

function leerCiclo(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw fail(400, 'Ciclo escolar no válido');
  return n;
}

const idPositivo = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const nombreGrado = g => [g.nivel, g.carrera, g.grado].filter(Boolean).join(' › ');
const numerico = c => ({ ...c, monto: Number(c.monto), mora_valor: Number(c.mora_valor) });

/** Sección: obligatoria si el grado tiene secciones activas; si no tiene, debe ir vacía. */
async function validarSeccion(idgrados, idsecciones, conn) {
  const secciones = await InscripcionModel.seccionesActivas(idgrados, conn);
  if (!secciones.length) {
    if (idsecciones) throw fail(400, 'El grado no tiene secciones activas');
    return null;
  }
  const s = secciones.find(x => x.idsecciones === idsecciones);
  if (!s) throw fail(400, 'Seleccione una sección válida del grado');
  return s;
}

/** El encargado que firma debe estar vinculado al estudiante. */
async function validarEncargado(idestudiantes, idpadres, conn) {
  if (!idpadres) return null;
  const padres = await VinculoModel.getPadresDeEstudiante(idestudiantes, conn);
  const p = padres.find(x => x.idpadres === idpadres);
  if (!p) throw fail(400, 'El encargado seleccionado no está vinculado al estudiante');
  return p;
}

/** Estado de cuenta: cargos con la mora a la fecha y totales. */
function armarEstadoCuenta(cargos, fecha = hoy()) {
  const tot = { pagado: 0, pendiente: 0, mora: 0, vencido: 0, anulado: 0 };
  const lista = cargos.map(c => {
    const r = numerico(c);
    r.mora_pagada = c.mora_pagada === null || c.mora_pagada === undefined ? null : Number(c.mora_pagada);
    r.total_pagado = c.total_pagado === null || c.total_pagado === undefined ? null : Number(c.total_pagado);
    r.mora_actual = 0;
    r.vencido = 0;
    if (r.estado === 'Pagado') tot.pagado += r.total_pagado ?? r.monto;
    else if (r.estado === 'Anulado') tot.anulado += r.monto;
    else {
      r.mora_actual = calcularMora(r, fecha);
      r.vencido = r.fecha_vencimiento < fecha ? 1 : 0;
      tot.pendiente += r.monto;
      tot.mora += r.mora_actual;
      if (r.vencido) tot.vencido += r.monto + r.mora_actual;
    }
    return r;
  });
  for (const k of Object.keys(tot)) tot[k] = redondear(tot[k]);
  return { fecha, cargos: lista, totales: { ...tot, saldo: redondear(tot.pendiente + tot.mora) } };
}

const ctrl = {
  // GET /api/inscripciones
  async getAll(req, res, next) {
    try {
      const r = await InscripcionModel.getAll(req.query);
      r.data = r.data.map(i => ({ ...i, saldo_pendiente: Number(i.saldo_pendiente) }));
      res.json({ success: true, ...r });
    } catch (err) { next(err); }
  },

  // GET /api/inscripciones/opciones   → estructura activa (niveles, carreras, grados, secciones)
  async opciones(req, res, next) {
    try {
      res.json({ success: true, data: await InscripcionModel.estructuraActiva() });
    } catch (err) { next(err); }
  },

  // GET /api/inscripciones/cuotas-grado?ciclo=&idgrados=   → cuotas que se cobrarán (vista previa)
  async cuotasGrado(req, res, next) {
    try {
      const ciclo = leerCiclo(req.query.ciclo);
      const idgrados = idPositivo(req.query.idgrados);
      if (!idgrados) return res.status(400).json({ message: 'Grado no válido' });
      const cuotas = (await InscripcionModel.cuotasDelGrado(ciclo, idgrados)).map(c => ({
        ...numerico(c), cobros: generarCargos([c]).length,
      }));
      res.json({ success: true, data: cuotas });
    } catch (err) { next(err); }
  },

  // GET /api/inscripciones/estudiante/:id   → encargados vinculados e historial de inscripciones
  async contextoEstudiante(req, res, next) {
    try {
      const id = Number(req.params.id);
      const e = await EstudianteModel.findById(id);
      if (!e) return res.status(404).json({ message: 'Estudiante no encontrado' });
      const [padres, inscripciones] = await Promise.all([
        VinculoModel.getPadresDeEstudiante(id),
        InscripcionModel.deEstudiante(id),
      ]);
      res.json({
        success: true,
        data: {
          estudiante: { idestudiantes: e.idestudiantes, nombre_completo: e.nombre_completo, dpi: e.dpi, foto: e.foto, activo: e.activo, edad: e.edad },
          padres, inscripciones,
        },
      });
    } catch (err) { next(err); }
  },

  // GET /api/inscripciones/:id
  async getById(req, res, next) {
    try {
      const i = await InscripcionModel.findById(req.params.id);
      if (!i) return res.status(404).json({ message: 'Inscripción no encontrada' });
      res.json({ success: true, data: { ...i, saldo_pendiente: Number(i.saldo_pendiente) } });
    } catch (err) { next(err); }
  },

  // POST /api/inscripciones
  //   { idestudiantes, ciclo, idgrados, idsecciones?, idpadres?, fecha_inscripcion, observaciones?, opcionales?: [idcuotas_ciclos] }
  async create(req, res, next) {
    try {
      const idestudiantes = idPositivo(req.body.idestudiantes);
      const ciclo = leerCiclo(req.body.ciclo);
      const idgrados = idPositivo(req.body.idgrados);
      const idsecciones = idPositivo(req.body.idsecciones);
      const idpadres = idPositivo(req.body.idpadres);
      const fecha_inscripcion = leerFecha(req.body.fecha_inscripcion, 'La fecha de inscripción');
      const observaciones = String(req.body.observaciones ?? '').trim().substring(0, 255) || null;
      const opcionales = new Set((Array.isArray(req.body.opcionales) ? req.body.opcionales : []).map(Number));

      if (!idestudiantes) return res.status(400).json({ message: 'Seleccione el estudiante' });
      if (!idgrados) return res.status(400).json({ message: 'Seleccione el grado' });
      const estudiante = await EstudianteModel.findById(idestudiantes);
      if (!estudiante) return res.status(400).json({ message: 'El estudiante no existe' });
      if (!estudiante.activo) return res.status(409).json({ message: `${estudiante.nombre_completo} está inactivo` });
      const grado = await InscripcionModel.findGrado(idgrados);
      if (!grado) return res.status(400).json({ message: 'El grado no existe' });
      if (!grado.activo) return res.status(409).json({ message: `${nombreGrado(grado)} está inactivo` });
      const seccion = await validarSeccion(idgrados, idsecciones);
      const encargado = await validarEncargado(idestudiantes, idpadres);

      const previa = await InscripcionModel.activaEnCiclo(idestudiantes, ciclo);
      if (previa) return res.status(409).json({ message: `${estudiante.nombre_completo} ya está inscrito en el ciclo ${ciclo} (${previa.codigo})` });

      // Cuotas obligatorias del grado + las opcionales elegidas
      const cuotas = await InscripcionModel.cuotasDelGrado(ciclo, idgrados);
      const elegidas = cuotas.filter(c => c.obligatoria || opcionales.has(c.idcuotas_ciclos));
      const cargos = generarCargos(elegidas);

      const { id, codigo } = await enTransaccion(async conn => {
        const n = await siguienteCorrelativo(conn, `INS-${ciclo}`);
        const codigo = `INS-${ciclo}-${String(n).padStart(4, '0')}`;
        const id = await InscripcionModel.create(conn, {
          codigo, ciclo, idestudiantes, idgrados, idsecciones: seccion?.idsecciones ?? null,
          idpadres: encargado?.idpadres ?? null, fecha_inscripcion, observaciones, idusuarios: req.user?.id ?? null,
        });
        await InscripcionModel.insertarCargos(conn, id, cargos);
        return { id, codigo };
      }).catch(err => {
        if (err.code === 'ER_DUP_ENTRY') throw fail(409, `${estudiante.nombre_completo} ya está inscrito en el ciclo ${ciclo}`);
        throw err;
      });

      await registrarBitacora({
        tabla: 'inscripciones', idregistro: id, accion: 'CREAR',
        descripcion: `Inscripción ${codigo}: ${estudiante.nombre_completo} — ${nombreGrado(grado)}${seccion ? ` ${seccion.seccion}` : ''} (${ciclo})`,
        valoresDespues: {
          codigo, ciclo, estudiante: estudiante.nombre_completo, grado: nombreGrado(grado), seccion: seccion?.seccion ?? null,
          encargado: encargado?.nombre_completo ?? null, fecha_inscripcion, observaciones,
          cuotas: elegidas.map(c => c.cuota), cargos: cargos.length,
        },
        req,
      });
      res.status(201).json({ success: true, id, codigo, cargos: cargos.length, sinCuotas: !cuotas.length });
    } catch (err) { next(err); }
  },

  // PUT /api/inscripciones/:id   { idsecciones, idpadres, fecha_inscripcion, observaciones }
  // El grado y el ciclo no se cambian (los cargos ya se generaron con sus montos): anule e inscriba de nuevo.
  async update(req, res, next) {
    try {
      const id = Number(req.params.id);
      const antes = await InscripcionModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Inscripción no encontrada' });
      if (antes.estado !== 'Activa') return res.status(409).json({ message: 'La inscripción está anulada' });

      const idsecciones = idPositivo(req.body.idsecciones);
      let seccion = null;
      if (idsecciones !== antes.idsecciones) seccion = await validarSeccion(antes.idgrados, idsecciones);
      const idpadres = idPositivo(req.body.idpadres);
      if (idpadres !== antes.idpadres) await validarEncargado(antes.idestudiantes, idpadres);

      const data = {
        idsecciones: idsecciones !== antes.idsecciones ? (seccion?.idsecciones ?? null) : antes.idsecciones,
        idpadres,
        fecha_inscripcion: leerFecha(req.body.fecha_inscripcion, 'La fecha de inscripción'),
        observaciones: String(req.body.observaciones ?? '').trim().substring(0, 255) || null,
      };
      await InscripcionModel.update(id, data);
      const despues = await InscripcionModel.findById(id);
      const resumen = r => ({ seccion: r.seccion, encargado: r.encargado, fecha_inscripcion: r.fecha_inscripcion, observaciones: r.observaciones });
      await registrarBitacora({
        tabla: 'inscripciones', idregistro: id, accion: 'MODIFICAR',
        descripcion: `Inscripción modificada: ${antes.codigo} — ${antes.estudiante}`,
        valoresAntes: resumen(antes), valoresDespues: resumen(despues), req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // POST /api/inscripciones/:id/anular   { motivo }
  async anular(req, res, next) {
    try {
      const id = Number(req.params.id);
      const i = await InscripcionModel.findById(id);
      if (!i) return res.status(404).json({ message: 'Inscripción no encontrada' });
      if (i.estado !== 'Activa') return res.status(409).json({ message: 'La inscripción ya está anulada' });
      const motivo = String(req.body.motivo ?? '').trim().substring(0, 255);
      if (!motivo) return res.status(400).json({ message: 'Indique el motivo de la anulación' });
      if (await InscripcionModel.tienePagos(id))
        return res.status(409).json({ message: 'La inscripción tiene cuotas pagadas. Anule primero los recibos en Pagos.' });

      await enTransaccion(conn => InscripcionModel.anular(conn, id, motivo));
      await registrarBitacora({
        tabla: 'inscripciones', idregistro: id, accion: 'ANULAR',
        descripcion: `Inscripción anulada: ${i.codigo} — ${i.estudiante}. Motivo: ${motivo}`,
        valoresAntes: { estado: i.estado }, valoresDespues: { estado: 'Anulada', motivo }, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // ═════════════ Estado de cuenta ═════════════
  // GET /api/inscripciones/:id/estado-cuenta
  async estadoCuenta(req, res, next) {
    try {
      const id = Number(req.params.id);
      const i = await InscripcionModel.findById(id);
      if (!i) return res.status(404).json({ message: 'Inscripción no encontrada' });
      const [cargos, cuotas] = await Promise.all([
        InscripcionModel.cargos(id),
        InscripcionModel.cuotasDelGrado(i.ciclo, i.idgrados),
      ]);
      // Cuotas del grado que aún no tiene (agregadas al ciclo después, u opcionales no tomadas)
      const usadas = new Set(cargos.map(c => c.idcuotas_ciclos));
      const disponibles = cuotas.filter(c => !usadas.has(c.idcuotas_ciclos)).map(c => ({ ...numerico(c), cobros: generarCargos([c]).length }));
      res.json({ success: true, data: { inscripcion: { ...i, saldo_pendiente: Number(i.saldo_pendiente) }, ...armarEstadoCuenta(cargos), disponibles } });
    } catch (err) { next(err); }
  },

  // GET /api/inscripciones/:id/estado-cuenta/pdf[?descargar=1]
  async estadoCuentaPdf(req, res, next) {
    try {
      const id = Number(req.params.id);
      const i = await InscripcionModel.findById(id);
      if (!i) return res.status(404).json({ message: 'Inscripción no encontrada' });
      const doc = generarEstadoCuenta(i, await InscripcionModel.cargos(id));
      enviar(res, doc, `Estado de cuenta ${i.codigo}.pdf`, req.query.descargar === '1');
    } catch (err) { next(err); }
  },

  // POST /api/inscripciones/:id/cargos   { idcuotas_ciclos: [] }
  // Agrega al estado de cuenta cuotas del grado que no tenía (ej. una cuota
  // configurada después de inscribir, o una opcional que tomó a medio año).
  async agregarCuotas(req, res, next) {
    try {
      const id = Number(req.params.id);
      const i = await InscripcionModel.findById(id);
      if (!i) return res.status(404).json({ message: 'Inscripción no encontrada' });
      if (i.estado !== 'Activa') return res.status(409).json({ message: 'La inscripción está anulada' });
      const ids = new Set((Array.isArray(req.body.idcuotas_ciclos) ? req.body.idcuotas_ciclos : []).map(Number));
      if (!ids.size) return res.status(400).json({ message: 'Seleccione al menos una cuota' });

      const usadas = new Set((await InscripcionModel.cargos(id)).map(c => c.idcuotas_ciclos));
      const elegidas = (await InscripcionModel.cuotasDelGrado(i.ciclo, i.idgrados)).filter(c => ids.has(c.idcuotas_ciclos) && !usadas.has(c.idcuotas_ciclos));
      if (!elegidas.length) return res.status(409).json({ message: 'Las cuotas seleccionadas ya están en el estado de cuenta o no aplican al grado' });

      const cargos = generarCargos(elegidas);
      await enTransaccion(conn => InscripcionModel.insertarCargos(conn, id, cargos)).catch(err => {
        if (err.code === 'ER_DUP_ENTRY') throw fail(409, 'Las cuotas ya fueron agregadas');
        throw err;
      });
      await registrarBitacora({
        tabla: 'inscripciones', idregistro: id, accion: 'MODIFICAR',
        descripcion: `Cuotas agregadas a ${i.codigo}: ${elegidas.map(c => c.cuota).join(', ')} (${cargos.length} cobro(s))`,
        valoresDespues: { cuotas: elegidas.map(c => ({ cuota: c.cuota, monto: Number(c.monto) })), cobros: cargos.length }, req,
      });
      res.status(201).json({ success: true, cargos: cargos.length });
    } catch (err) { next(err); }
  },

  // PATCH /api/inscripciones/cargos/:idCargo/anular   { motivo }   (ej. ingresó a medio año, beca)
  async anularCargo(req, res, next) {
    try {
      const c = await InscripcionModel.findCargo(Number(req.params.idCargo));
      if (!c) return res.status(404).json({ message: 'Cuota no encontrada' });
      if (c.estado !== 'Pendiente') return res.status(409).json({ message: `La cuota está ${c.estado.toLowerCase()}` });
      const motivo = String(req.body.motivo ?? '').trim().substring(0, 255);
      if (!motivo) return res.status(400).json({ message: 'Indique el motivo' });
      const i = await InscripcionModel.findById(c.idinscripciones);

      await InscripcionModel.anularCargo(c.idinscripciones_cargos, motivo);
      await registrarBitacora({
        tabla: 'inscripciones', idregistro: c.idinscripciones, accion: 'MODIFICAR',
        descripcion: `Cuota anulada en ${i.codigo}: ${c.concepto} (${Number(c.monto).toFixed(2)}). Motivo: ${motivo}`,
        valoresAntes: { cargo: c.concepto, estado: 'Pendiente' }, valoresDespues: { cargo: c.concepto, estado: 'Anulado', motivo }, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // PATCH /api/inscripciones/cargos/:idCargo/restaurar
  async restaurarCargo(req, res, next) {
    try {
      const c = await InscripcionModel.findCargo(Number(req.params.idCargo));
      if (!c) return res.status(404).json({ message: 'Cuota no encontrada' });
      if (c.estado !== 'Anulado') return res.status(409).json({ message: 'La cuota no está anulada' });
      const i = await InscripcionModel.findById(c.idinscripciones);
      if (i.estado !== 'Activa') return res.status(409).json({ message: 'La inscripción está anulada' });

      await InscripcionModel.restaurarCargo(c.idinscripciones_cargos);
      await registrarBitacora({
        tabla: 'inscripciones', idregistro: c.idinscripciones, accion: 'MODIFICAR',
        descripcion: `Cuota restaurada en ${i.codigo}: ${c.concepto}`,
        valoresAntes: { cargo: c.concepto, estado: 'Anulado', motivo: c.motivo_anulacion }, valoresDespues: { cargo: c.concepto, estado: 'Pendiente' }, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // ═════════════ Contrato ═════════════
  // GET /api/inscripciones/:id/contrato[?descargar=1]   → contrato para firmar (generado)
  async contratoPdf(req, res, next) {
    try {
      const id = Number(req.params.id);
      const i = await InscripcionModel.findById(id);
      if (!i) return res.status(404).json({ message: 'Inscripción no encontrada' });
      const doc = generarContrato(i, await InscripcionModel.cargos(id));
      enviar(res, doc, `Contrato ${i.codigo}.pdf`, req.query.descargar === '1');
    } catch (err) { next(err); }
  },

  recibirContrato(req, res, next) {
    upload.single('archivo')(req, res, (err) => {
      if (!err) return next();
      const message = err.code === 'LIMIT_FILE_SIZE' ? `El archivo excede ${MAX_MB} MB` : err.message;
      res.status(400).json({ success: false, message });
    });
  },

  // POST /api/inscripciones/:id/contrato-firmado   (multipart: archivo)
  async subirContrato(req, res, next) {
    try {
      const id = Number(req.params.id);
      const i = await InscripcionModel.findById(id);
      if (!i) return res.status(404).json({ message: 'Inscripción no encontrada' });
      if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });
      if (!MIME_CONTRATO.has(req.file.mimetype)) return res.status(400).json({ message: 'El contrato debe ser PDF o imagen (JPG, PNG, WEBP)' });

      const ext = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype];
      const dirRel = `inscripciones/${id}`;
      const dir = path.join(carpetaTenant(req), dirRel);
      await fs.promises.mkdir(dir, { recursive: true });
      const nombre = `${crypto.randomBytes(16).toString('hex')}${ext}`;
      await fs.promises.writeFile(path.join(dir, nombre), req.file.buffer);

      const anterior = await InscripcionModel.contratoArchivo(id);
      const nombre_original = `Contrato firmado ${i.codigo}${ext}`;
      try {
        await InscripcionModel.setContrato(id, { archivo: `${dirRel}/${nombre}`, nombre: nombre_original, mime: req.file.mimetype });
      } catch (err) {
        fs.promises.unlink(path.join(dir, nombre)).catch(() => {});
        throw err;
      }
      const rutaAnterior = rutaEnDisco(req, anterior?.contrato_archivo);
      if (rutaAnterior) fs.promises.unlink(rutaAnterior).catch(() => {});

      await registrarBitacora({
        tabla: 'inscripciones', idregistro: id, accion: 'MODIFICAR',
        descripcion: `Contrato firmado ${anterior?.contrato_archivo ? 'reemplazado' : 'cargado'}: ${i.codigo} — ${i.estudiante}`,
        valoresAntes: anterior?.contrato_archivo ? { contrato: anterior.contrato_nombre } : null,
        valoresDespues: { contrato: req.file.originalname, tamano: req.file.size }, req,
      });
      res.status(201).json({ success: true });
    } catch (err) { next(err); }
  },

  // GET /api/inscripciones/:id/contrato-firmado[?descargar=1]
  async descargarContrato(req, res, next) {
    try {
      const a = await InscripcionModel.contratoArchivo(Number(req.params.id));
      if (!a?.contrato_archivo) return res.status(404).json({ message: 'La inscripción no tiene contrato firmado' });
      const ruta = rutaEnDisco(req, a.contrato_archivo);
      if (!ruta || !fs.existsSync(ruta)) return res.status(404).json({ message: 'El archivo ya no existe en el servidor' });

      const inline = req.query.descargar !== '1';
      res.attachment(a.contrato_nombre);
      if (inline) res.setHeader('Content-Disposition', res.getHeader('Content-Disposition').replace(/^attachment/, 'inline'));
      res.setHeader('Content-Type', inline ? a.contrato_mime : 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      fs.createReadStream(ruta).on('error', next).pipe(res);
    } catch (err) { next(err); }
  },

  // DELETE /api/inscripciones/:id/contrato-firmado
  async quitarContrato(req, res, next) {
    try {
      const id = Number(req.params.id);
      const i = await InscripcionModel.findById(id);
      if (!i) return res.status(404).json({ message: 'Inscripción no encontrada' });
      const a = await InscripcionModel.contratoArchivo(id);
      if (!a?.contrato_archivo) return res.status(404).json({ message: 'La inscripción no tiene contrato firmado' });

      await InscripcionModel.setContrato(id, null);
      const ruta = rutaEnDisco(req, a.contrato_archivo);
      if (ruta) fs.promises.unlink(ruta).catch(() => {});
      await registrarBitacora({
        tabla: 'inscripciones', idregistro: id, accion: 'MODIFICAR',
        descripcion: `Contrato firmado eliminado: ${i.codigo} — ${i.estudiante}`,
        valoresAntes: { contrato: a.contrato_nombre }, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = ctrl;
module.exports.armarEstadoCuenta = armarEstadoCuenta;

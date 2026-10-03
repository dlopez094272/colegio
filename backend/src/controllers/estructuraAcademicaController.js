const { pool } = require('../config/database');
const Model = require('../models/estructuraAcademicaModel');
const { registrarBitacora } = require('../utils/bitacora');

const { TIPOS } = Model;

async function enTransaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const fail = (status, message) => Object.assign(new Error(message), { status });

/** "Diversificado › Perito en Computación › Cuarto" — contexto legible para mensajes y bitácora. */
async function rutaPadres(tipo, row) {
  const partes = [];
  let r = row;
  if (tipo === 'seccion') {
    r = await Model.findById('grado', r.idgrados);
    if (r) partes.unshift(r.grado);
  }
  if ((tipo === 'seccion' || tipo === 'grado') && r?.idcarreras) {
    const c = await Model.findById('carrera', r.idcarreras);
    if (c) partes.unshift(c.carrera);
  }
  if (tipo !== 'nivel' && r?.idniveles) {
    const n = await Model.findById('nivel', r.idniveles);
    if (n) partes.unshift(n.nivel);
  }
  return partes.join(' › ');
}

/** Concordancia de género: g(TIPOS.carrera, 'cread') → "creada". */
const g = (t, raiz) => raiz + (t.fem ? 'a' : 'o');
const elLa = t => (t.fem ? 'la' : 'el');
const bloqueoTxt = b => `${elLa(TIPOS[b.tipo])} ${TIPOS[b.tipo].etiqueta.toLowerCase()} "${b.nombre}" está ${g(TIPOS[b.tipo], 'inactiv')}`;

const conRuta = (nombre, ruta) => (ruta ? `${nombre} (${ruta})` : nombre);

const resumenCambios = c => Object.entries(c).map(([k, n]) => `${n} ${k}`).join(', ');

/**
 * Valida el padre según el tipo y devuelve las columnas de padre del registro
 * (idniveles / idcarreras / idgrados) que definen su ubicación en el árbol.
 */
async function resolverPadre(tipo, body) {
  if (tipo === 'nivel') return {};

  if (tipo === 'seccion') {
    const grado = await Model.findById('grado', body.idgrados);
    if (!grado) throw fail(400, 'Seleccione un grado válido');
    return { idgrados: grado.idgrados };
  }

  const nivel = await Model.findById('nivel', body.idniveles);
  if (!nivel) throw fail(400, 'Seleccione un nivel válido');

  if (tipo === 'carrera') {
    if (!nivel.usa_carreras) throw fail(400, `El nivel "${nivel.nivel}" no está configurado para usar carreras`);
    return { idniveles: nivel.idniveles };
  }

  // grado
  if (!nivel.usa_carreras) return { idniveles: nivel.idniveles, idcarreras: null };
  const carrera = await Model.findById('carrera', body.idcarreras);
  if (!carrera || carrera.idniveles !== nivel.idniveles)
    throw fail(400, `El nivel "${nivel.nivel}" agrupa sus grados por carrera: seleccione una carrera`);
  return { idniveles: nivel.idniveles, idcarreras: carrera.idcarreras };
}

/** Acepta `nombres: []` (alta en lote) o `nombre`. Quita vacíos y valida repetidos dentro del lote. */
function leerNombres(body) {
  const crudos = Array.isArray(body.nombres) ? body.nombres : [body.nombre];
  const nombres = crudos.map(n => String(n ?? '').trim()).filter(Boolean);
  if (!nombres.length) throw fail(400, 'El nombre es requerido');
  const vistos = new Set();
  for (const n of nombres) {
    const k = n.toLocaleLowerCase('es');
    if (vistos.has(k)) throw fail(400, `"${n}" está repetido en la lista`);
    vistos.add(k);
  }
  return nombres;
}

const parseOrden = v => (v === undefined || v === null || v === '' ? null : Math.max(0, parseInt(v, 10) || 0));

const ctrl = {
  // GET /api/estructura-academica/arbol
  async arbol(req, res, next) {
    try {
      res.json({ success: true, data: await Model.arbol() });
    } catch (err) { next(err); }
  },

  // POST /api/estructura-academica/:tipo   { nombre | nombres[], idniveles?, idcarreras?, idgrados?, orden?, usa_carreras?, activo? }
  async create(req, res, next) {
    try {
      const { tipo } = req.params;
      const t = TIPOS[tipo];
      const nombres = leerNombres(req.body);
      const padre = await resolverPadre(tipo, req.body);

      const repetidos = await Model.nombresExistentes(tipo, nombres, padre);
      if (repetidos.length)
        return res.status(409).json({ message: `Ya existe: ${repetidos.join(', ')}` });

      // Bajo un padre inactivo el registro nace inactivo, para no romper la cascada.
      const bloqueo = tipo === 'nivel' ? null : await Model.ancestroInactivo(tipo, padre);
      const activo = bloqueo ? 0 : (req.body.activo === undefined ? 1 : (req.body.activo ? 1 : 0));

      const creados = await enTransaccion(async conn => {
        let orden = t.orden ? (parseOrden(req.body.orden) ?? await Model.siguienteOrden(tipo, padre, conn)) : null;
        const out = [];
        for (const nombre of nombres) {
          const data = { ...padre, nombre, activo, orden, usa_carreras: req.body.usa_carreras };
          out.push({ id: await Model.create(tipo, data, conn), data });
          if (t.orden) orden++;
        }
        return out;
      });

      const ruta = await rutaPadres(tipo, padre);
      for (const { id, data } of creados) {
        await registrarBitacora({
          tabla: t.tabla, idregistro: id, accion: 'CREAR',
          descripcion: `${t.etiqueta} ${g(t, 'cread')}: ${conRuta(data.nombre, ruta)}`,
          valoresDespues: { [t.pk]: id, ...padre, [t.campo]: data.nombre, activo, ...(t.orden ? { orden: data.orden } : {}) },
          req,
        });
      }
      res.status(201).json({
        success: true,
        ids: creados.map(c => c.id),
        message: bloqueo ? `Se guardó ${g(t, 'inactiv')}${nombres.length > 1 ? 's' : ''} porque ${bloqueoTxt(bloqueo)}` : undefined,
      });
    } catch (err) { next(err); }
  },

  // PUT /api/estructura-academica/:tipo/:id   { nombre, orden?, usa_carreras?, activo? }
  async update(req, res, next) {
    try {
      const { tipo, id } = req.params;
      const t = TIPOS[tipo];
      const antes = await Model.findById(tipo, id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });

      const [nombre] = leerNombres({ nombre: req.body.nombre });
      if ((await Model.nombresExistentes(tipo, [nombre], antes, id)).length)
        return res.status(409).json({ message: `Ya existe ${t.fem ? 'una' : 'un'} ${t.etiqueta.toLowerCase()} "${nombre}" en el mismo lugar` });

      const usaCarreras = tipo === 'nivel'
        ? (req.body.usa_carreras === undefined ? antes.usa_carreras : (req.body.usa_carreras ? 1 : 0))
        : undefined;
      if (tipo === 'nivel' && usaCarreras !== antes.usa_carreras) {
        if (usaCarreras && await Model.contar('SELECT COUNT(*) AS n FROM grados WHERE idniveles = ? AND idcarreras IS NULL', [id]))
          return res.status(409).json({ message: 'El nivel ya tiene grados sin carrera. Elimínelos antes de activar "usa carreras".' });
        if (!usaCarreras && await Model.contar('SELECT COUNT(*) AS n FROM carreras WHERE idniveles = ?', [id]))
          return res.status(409).json({ message: 'El nivel tiene carreras registradas. Elimínelas antes de desactivar "usa carreras".' });
      }

      const orden = t.orden ? (parseOrden(req.body.orden) ?? antes.orden) : undefined;
      const activo = req.body.activo === undefined ? antes.activo : (req.body.activo ? 1 : 0);
      if (activo && !antes.activo) {
        const bloqueo = await Model.ancestroInactivo(tipo, antes);
        if (bloqueo) return res.status(409).json({ message: `No se puede activar: ${bloqueoTxt(bloqueo)}. Actívelo primero.` });
      }

      const cambios = await enTransaccion(async conn => {
        await Model.update(tipo, id, { nombre, orden, usa_carreras: usaCarreras }, conn);
        return activo !== antes.activo ? Model.setActivoCascada(tipo, id, activo, conn) : null;
      });

      const despues = { ...antes, [t.campo]: nombre, activo, ...(t.orden ? { orden } : {}), ...(tipo === 'nivel' ? { usa_carreras: usaCarreras } : {}) };
      const ruta = await rutaPadres(tipo, antes);
      await registrarBitacora({
        tabla: t.tabla, idregistro: Number(id), accion: 'MODIFICAR',
        descripcion: `${t.etiqueta} ${g(t, 'modificad')}: ${conRuta(nombre, ruta)}${cambios ? ` — ${activo ? 'activado' : 'inactivado'} en cascada (${resumenCambios(cambios)})` : ''}`,
        valoresAntes: antes, valoresDespues: despues, req,
      });
      res.json({ success: true, cambios });
    } catch (err) { next(err); }
  },

  // PATCH /api/estructura-academica/:tipo/:id/estado   { activo }
  async estado(req, res, next) {
    try {
      const { tipo, id } = req.params;
      const t = TIPOS[tipo];
      const antes = await Model.findById(tipo, id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });
      const activo = req.body.activo ? 1 : 0;

      if (activo) {
        const bloqueo = await Model.ancestroInactivo(tipo, antes);
        if (bloqueo) return res.status(409).json({ message: `No se puede activar: ${bloqueoTxt(bloqueo)}. Actívelo primero.` });
      }

      const cambios = await enTransaccion(conn => Model.setActivoCascada(tipo, id, activo, conn));
      const ruta = await rutaPadres(tipo, antes);
      const detalle = resumenCambios(cambios);
      await registrarBitacora({
        tabla: t.tabla, idregistro: Number(id), accion: activo ? 'ACTIVAR' : 'INACTIVAR',
        descripcion: `${t.etiqueta} ${g(t, activo ? 'activad' : 'inactivad')}: ${conRuta(antes[t.campo], ruta)}${detalle ? ` (${detalle})` : ''}`,
        valoresAntes: { activo: antes.activo }, valoresDespues: { activo, cascada: cambios }, req,
      });
      res.json({ success: true, cambios });
    } catch (err) { next(err); }
  },

  // DELETE /api/estructura-academica/:tipo/:id
  async delete(req, res, next) {
    try {
      const { tipo, id } = req.params;
      const t = TIPOS[tipo];
      const antes = await Model.findById(tipo, id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });

      const hijos = await Model.contarHijos(tipo, id);
      if (hijos)
        return res.status(409).json({ message: `No se puede eliminar: tiene ${hijos} registro(s) dependiente(s). Elimínelos primero o inactívelo.` });

      const ruta = await rutaPadres(tipo, antes);
      await Model.delete(tipo, id);
      await registrarBitacora({
        tabla: t.tabla, idregistro: Number(id), accion: 'ELIMINAR',
        descripcion: `${t.etiqueta} ${g(t, 'eliminad')}: ${conRuta(antes[t.campo], ruta)}`,
        valoresAntes: antes, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = ctrl;

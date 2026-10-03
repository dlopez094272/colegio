const { pool } = require('../config/database');
const CuotaModel = require('../models/cuotaModel');
const { registrarBitacora } = require('../utils/bitacora');

const PERIODICIDADES = ['Unica', 'Mensual'];
const MORA_TIPOS = ['Ninguna', 'Monto', 'Porcentaje'];
const MONTO_MAX = 99999999.99;

const fail = (status, message) => Object.assign(new Error(message), { status });

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

const nombreGrado = g => [g.nivel, g.carrera, g.grado].filter(Boolean).join(' › ');

/** Ciclo escolar = año (2000–2100). */
function leerCiclo(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw fail(400, 'Ciclo escolar no válido');
  return n;
}

/** Monto con 2 decimales, o null cuando viene vacío. */
function leerMonto(v, etiqueta = 'El monto') {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw fail(400, `${etiqueta} debe ser un número mayor o igual a 0`);
  if (n > MONTO_MAX) throw fail(400, `${etiqueta} excede el máximo permitido`);
  return Math.round(n * 100) / 100;
}

function leerCuota(body, antes = null) {
  const cuota = String(body.cuota ?? '').trim().replace(/\s+/g, ' ');
  if (!cuota) throw fail(400, 'El nombre de la cuota es requerido');
  if (cuota.length > 100) throw fail(400, 'El nombre excede 100 caracteres');
  const descripcion = String(body.descripcion ?? '').trim() || null;
  if (descripcion && descripcion.length > 255) throw fail(400, 'La descripción excede 255 caracteres');
  const periodicidad = body.periodicidad ?? antes?.periodicidad ?? 'Unica';
  if (!PERIODICIDADES.includes(periodicidad)) throw fail(400, 'Periodicidad no válida');
  const bool = (v, def) => (v === undefined ? def : (v ? 1 : 0));
  return {
    cuota, descripcion, periodicidad,
    obligatoria: bool(body.obligatoria, antes?.obligatoria ?? 1),
    activo: bool(body.activo, antes?.activo ?? 1),
  };
}

// ─── Fechas (siempre 'YYYY-MM-DD', sin zona horaria) ─────────
const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const diasDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function leerFecha(v, etiqueta) {
  const m = RE_FECHA.exec(String(v ?? ''));
  if (!m) throw fail(400, `${etiqueta} es requerida`);
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || d < 1 || d > diasDelMes(y, mes)) throw fail(400, `${etiqueta} no es válida`);
  return m[0];
}

/** Corre la fecha N años; el 29 de febrero cae en el 28 si el año destino no es bisiesto. */
function sumarAnios(fecha, n) {
  const [y, m, d] = fecha.split('-').map(Number);
  const ny = y + n;
  const nd = Math.min(d, diasDelMes(ny, m));
  return `${ny}-${String(m).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/** Cantidad de cobros mensuales: meses calendario entre inicio y fin (inclusive). */
function mesesEntre(inicio, fin) {
  const [y1, m1] = inicio.split('-').map(Number);
  const [y2, m2] = fin.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

/** Fechas, día límite y mora de una cuota en un ciclo. */
function leerConfig(body, periodicidad) {
  const fecha_inicio = leerFecha(body.fecha_inicio, 'La fecha de inicio');
  const fecha_fin = leerFecha(body.fecha_fin, 'La fecha de fin');
  if (fecha_fin < fecha_inicio) throw fail(400, 'La fecha de fin no puede ser anterior a la de inicio');
  if (periodicidad === 'Mensual' && mesesEntre(fecha_inicio, fecha_fin) > 12)
    throw fail(400, 'Una cuota mensual no puede abarcar más de 12 meses');

  const dia_limite = body.dia_limite === undefined || body.dia_limite === null || body.dia_limite === '' ? 5 : Number(body.dia_limite);
  if (!Number.isInteger(dia_limite) || dia_limite < 1 || dia_limite > 31) throw fail(400, 'El día límite debe estar entre 1 y 31');

  const mora_tipo = body.mora_tipo || 'Ninguna';
  if (!MORA_TIPOS.includes(mora_tipo)) throw fail(400, 'Tipo de mora no válido');
  let mora_valor = 0;
  if (mora_tipo !== 'Ninguna') {
    mora_valor = leerMonto(body.mora_valor, 'El valor de la mora');
    if (!mora_valor) throw fail(400, 'Indique el valor de la mora');
    if (mora_tipo === 'Porcentaje' && mora_valor > 100) throw fail(400, 'El porcentaje de mora no puede ser mayor a 100');
  }
  return { fecha_inicio, fecha_fin, dia_limite, mora_tipo, mora_valor };
}

/** Redondeo al copiar montos: 0 = centavos, 1 = quetzal entero, 5 / 10 = múltiplo. */
function redondear(monto, paso) {
  if (!paso) return Math.round(monto * 100) / 100;
  return Math.round(monto / paso) * paso;
}

const numerico = r => ({ ...r, monto: r.monto === undefined ? undefined : Number(r.monto), mora_valor: r.mora_valor === undefined ? undefined : Number(r.mora_valor) });

const ctrl = {
  // ═════════════ Catálogo ═════════════
  // GET /api/cuotas?activos=1
  async getAll(req, res, next) {
    try {
      res.json({ success: true, data: await CuotaModel.getAll(req.query.activos === '1') });
    } catch (err) { next(err); }
  },

  // POST /api/cuotas
  async create(req, res, next) {
    try {
      const data = leerCuota(req.body);
      if (await CuotaModel.existeNombre(data.cuota))
        return res.status(409).json({ message: `La cuota "${data.cuota}" ya existe` });
      data.orden = req.body.orden === undefined || req.body.orden === null || req.body.orden === ''
        ? await CuotaModel.siguienteOrden()
        : Math.max(0, parseInt(req.body.orden, 10) || 0);

      const id = await CuotaModel.create(data);
      await registrarBitacora({ tabla: 'cuotas', idregistro: id, accion: 'CREAR', descripcion: `Cuota creada: ${data.cuota}`, valoresDespues: data, req });
      res.status(201).json({ success: true, id });
    } catch (err) { next(err); }
  },

  // PUT /api/cuotas/:id
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const antes = await CuotaModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Cuota no encontrada' });
      const data = leerCuota(req.body, antes);
      if (await CuotaModel.existeNombre(data.cuota, id))
        return res.status(409).json({ message: `La cuota "${data.cuota}" ya existe` });
      data.orden = req.body.orden === undefined || req.body.orden === null || req.body.orden === ''
        ? antes.orden
        : Math.max(0, parseInt(req.body.orden, 10) || 0);

      await CuotaModel.update(id, data);
      await registrarBitacora({ tabla: 'cuotas', idregistro: Number(id), accion: 'MODIFICAR', descripcion: `Cuota modificada: ${data.cuota}`, valoresAntes: antes, valoresDespues: { idcuotas: Number(id), ...data }, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // DELETE /api/cuotas/:id
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const antes = await CuotaModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Cuota no encontrada' });
      if (await CuotaModel.enUso(id))
        return res.status(409).json({ message: `La cuota "${antes.cuota}" está configurada en uno o más ciclos. Quítela de esos ciclos o inactívela.` });

      await CuotaModel.delete(id);
      await registrarBitacora({ tabla: 'cuotas', idregistro: Number(id), accion: 'ELIMINAR', descripcion: `Cuota eliminada: ${antes.cuota}`, valoresAntes: antes, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // ═════════════ Ciclos ═════════════
  // GET /api/cuotas/ciclos
  async ciclos(req, res, next) {
    try {
      res.json({ success: true, data: await CuotaModel.ciclos() });
    } catch (err) { next(err); }
  },

  // GET /api/cuotas/ciclos/:ciclo   → { ciclo, cuotas, montos, grados }
  async ciclo(req, res, next) {
    try {
      const ciclo = leerCiclo(req.params.ciclo);
      const [{ cuotas, montos }, grados] = await Promise.all([CuotaModel.ciclo(ciclo), CuotaModel.grados()]);
      res.json({ success: true, data: { ciclo, cuotas: cuotas.map(numerico), montos: montos.map(numerico), grados } });
    } catch (err) { next(err); }
  },

  // POST /api/cuotas/ciclos/:ciclo/cuotas   { idcuotas, fecha_inicio, fecha_fin, dia_limite, mora_tipo, mora_valor }
  async agregarAlCiclo(req, res, next) {
    try {
      const ciclo = leerCiclo(req.params.ciclo);
      const cuota = await CuotaModel.findById(req.body.idcuotas);
      if (!cuota) return res.status(400).json({ message: 'Seleccione una cuota válida' });
      if (!cuota.activo) return res.status(409).json({ message: `La cuota "${cuota.cuota}" está inactiva` });
      const config = leerConfig(req.body, cuota.periodicidad);

      const ya = (await CuotaModel.configsDeCiclo(ciclo)).some(c => c.idcuotas === cuota.idcuotas);
      if (ya) return res.status(409).json({ message: `"${cuota.cuota}" ya está en el ciclo ${ciclo}` });

      const data = { idcuotas: cuota.idcuotas, ciclo, ...config };
      const id = await CuotaModel.createConfig(data);
      await registrarBitacora({ tabla: 'cuotas_ciclos', idregistro: id, accion: 'CREAR', descripcion: `Cuota agregada al ciclo ${ciclo}: ${cuota.cuota}`, valoresDespues: data, req });
      res.status(201).json({ success: true, id });
    } catch (err) { next(err); }
  },

  // PUT /api/cuotas/config/:id
  async updateConfig(req, res, next) {
    try {
      const { id } = req.params;
      const antes = await CuotaModel.findConfig(id);
      if (!antes) return res.status(404).json({ message: 'Configuración no encontrada' });
      const config = leerConfig(req.body, antes.periodicidad);

      await CuotaModel.updateConfig(id, config);
      await registrarBitacora({
        tabla: 'cuotas_ciclos', idregistro: Number(id), accion: 'MODIFICAR',
        descripcion: `Configuración modificada: ${antes.cuota} ${antes.ciclo}`,
        valoresAntes: numerico(antes), valoresDespues: config, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // DELETE /api/cuotas/config/:id   (quita la cuota del ciclo junto con sus montos)
  async deleteConfig(req, res, next) {
    try {
      const { id } = req.params;
      const antes = await CuotaModel.findConfig(id);
      if (!antes) return res.status(404).json({ message: 'Configuración no encontrada' });
      const inscritos = await CuotaModel.configEnUso(id);
      if (inscritos)
        return res.status(409).json({ message: `${antes.cuota} ${antes.ciclo} ya está en el estado de cuenta de ${inscritos} inscripción(es); no se puede quitar del ciclo.` });
      const montos = await CuotaModel.montosDeConfigs([Number(id)]);

      await CuotaModel.deleteConfig(id);
      await registrarBitacora({
        tabla: 'cuotas_ciclos', idregistro: Number(id), accion: 'ELIMINAR',
        descripcion: `Cuota quitada del ciclo ${antes.ciclo}: ${antes.cuota} (${montos.length} grado(s))`,
        valoresAntes: { ...numerico(antes), montos: montos.map(numerico) }, req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // PUT /api/cuotas/ciclos/:ciclo/montos   { cambios: [{ idcuotas_ciclos, idgrados, monto | null }] }
  // monto null/vacío = la cuota deja de aplicar a ese grado.
  async guardarMontos(req, res, next) {
    try {
      const ciclo = leerCiclo(req.params.ciclo);
      const cambios = Array.isArray(req.body.cambios) ? req.body.cambios : [];
      if (!cambios.length) return res.status(400).json({ message: 'No hay cambios que guardar' });

      const configs = new Map((await CuotaModel.configsDeCiclo(ciclo)).map(c => [c.idcuotas_ciclos, c]));
      const grados = new Map((await CuotaModel.grados()).map(g => [g.idgrados, g]));
      const actuales = new Map(
        (await CuotaModel.montosDeConfigs([...configs.keys()])).map(m => [`${m.idcuotas_ciclos}-${m.idgrados}`, Number(m.monto)])
      );

      // Normaliza y valida todo antes de tocar la BD.
      const ops = [];
      const vistos = new Set();
      for (const c of cambios) {
        const cfg = configs.get(Number(c.idcuotas_ciclos));
        const g = grados.get(Number(c.idgrados));
        if (!cfg) throw fail(400, `Una de las cuotas no pertenece al ciclo ${ciclo}`);
        if (!g) throw fail(400, 'Uno de los grados no existe');
        const key = `${cfg.idcuotas_ciclos}-${g.idgrados}`;
        if (vistos.has(key)) continue;
        vistos.add(key);
        const monto = leerMonto(c.monto, `El monto de ${cfg.cuota} en ${g.grado}`);
        const antes = actuales.has(key) ? actuales.get(key) : null;
        if (monto === antes) continue;
        if (monto !== null && antes === null && !g.activo)
          throw fail(409, `No se puede asignar "${cfg.cuota}" a ${nombreGrado(g)}: el grado está inactivo`);
        ops.push({ cfg, g, antes, monto });
      }
      if (!ops.length) return res.json({ success: true, cambios: 0 });

      await enTransaccion(async conn => {
        for (const o of ops) {
          if (o.monto === null) await CuotaModel.quitarMonto(o.cfg.idcuotas_ciclos, o.g.idgrados, conn);
          else await CuotaModel.setMonto(o.cfg.idcuotas_ciclos, o.g.idgrados, o.monto, conn);
        }
      });

      // Una entrada de bitácora por cuota del ciclo, con el detalle por grado.
      const porConfig = new Map();
      for (const o of ops) {
        if (!porConfig.has(o.cfg.idcuotas_ciclos)) porConfig.set(o.cfg.idcuotas_ciclos, []);
        porConfig.get(o.cfg.idcuotas_ciclos).push(o);
      }
      for (const [idcc, lista] of porConfig) {
        const cfg = lista[0].cfg;
        const cont = { asignado: 0, modificado: 0, quitado: 0 };
        const antes = {}, despues = {};
        for (const o of lista) {
          cont[o.antes === null ? 'asignado' : o.monto === null ? 'quitado' : 'modificado']++;
          antes[nombreGrado(o.g)] = o.antes;
          despues[nombreGrado(o.g)] = o.monto;
        }
        const resumen = Object.entries(cont).filter(([, n]) => n).map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`).join(', ');
        await registrarBitacora({
          tabla: 'cuotas_ciclos', idregistro: idcc, accion: 'MODIFICAR',
          descripcion: `Montos por grado — ${cfg.cuota} ${ciclo}: ${resumen}`,
          valoresAntes: antes, valoresDespues: despues, req,
        });
      }
      res.json({ success: true, cambios: ops.length });
    } catch (err) { next(err); }
  },

  // POST /api/cuotas/ciclos/copiar   { origen, destino, ajuste?: %, redondeo?: 0|1|5|10 }
  // Copia las cuotas (fechas corridas a su año) y montos de los grados activos.
  // Las cuotas que ya existen en el destino no se tocan.
  async copiarCiclo(req, res, next) {
    try {
      const origen = leerCiclo(req.body.origen);
      const destino = leerCiclo(req.body.destino);
      if (origen === destino) return res.status(400).json({ message: 'El ciclo destino debe ser distinto al de origen' });
      const ajuste = req.body.ajuste === undefined || req.body.ajuste === null || req.body.ajuste === '' ? 0 : Number(req.body.ajuste);
      if (!Number.isFinite(ajuste) || ajuste < -90 || ajuste > 500) return res.status(400).json({ message: 'El ajuste debe estar entre -90% y 500%' });
      const redondeo = Number(req.body.redondeo) || 0;
      if (![0, 1, 5, 10].includes(redondeo)) return res.status(400).json({ message: 'Redondeo no válido' });

      const configsOrigen = await CuotaModel.configsDeCiclo(origen);
      if (!configsOrigen.length) return res.status(400).json({ message: `El ciclo ${origen} no tiene cuotas configuradas` });
      const existentes = new Set((await CuotaModel.configsDeCiclo(destino)).map(c => c.idcuotas));
      const gradosActivos = new Set((await CuotaModel.grados()).filter(g => g.activo).map(g => g.idgrados));

      const aCopiar = configsOrigen.filter(c => c.cuota_activa && !existentes.has(c.idcuotas));
      const omitidas = configsOrigen.filter(c => !aCopiar.includes(c)).map(c => ({
        cuota: c.cuota, motivo: existentes.has(c.idcuotas) ? `ya existe en ${destino}` : 'cuota inactiva',
      }));
      if (!aCopiar.length)
        return res.status(409).json({ message: `No hay nada que copiar: ${omitidas.map(o => `${o.cuota} (${o.motivo})`).join(', ')}` });

      const montosOrigen = await CuotaModel.montosDeConfigs(aCopiar.map(c => c.idcuotas_ciclos));
      const factor = 1 + ajuste / 100;
      const anios = destino - origen;

      const creados = await enTransaccion(async conn => {
        const out = [];
        for (const c of aCopiar) {
          const data = {
            idcuotas: c.idcuotas, ciclo: destino,
            fecha_inicio: sumarAnios(c.fecha_inicio, anios), fecha_fin: sumarAnios(c.fecha_fin, anios),
            dia_limite: c.dia_limite, mora_tipo: c.mora_tipo, mora_valor: Number(c.mora_valor),
          };
          const id = await CuotaModel.createConfig(data, conn);
          const filas = montosOrigen
            .filter(m => m.idcuotas_ciclos === c.idcuotas_ciclos && gradosActivos.has(m.idgrados))
            .map(m => [id, m.idgrados, Math.min(MONTO_MAX, redondear(Number(m.monto) * factor, redondeo))]);
          await CuotaModel.insertarMontos(filas, conn);
          out.push({ id, cuota: c.cuota, data, grados: filas.length });
        }
        return out;
      });

      const detalleAjuste = ajuste ? `, ajuste ${ajuste > 0 ? '+' : ''}${ajuste}%` : '';
      for (const c of creados) {
        await registrarBitacora({
          tabla: 'cuotas_ciclos', idregistro: c.id, accion: 'CREAR',
          descripcion: `Cuota copiada de ${origen} a ${destino}: ${c.cuota} (${c.grados} grado(s)${detalleAjuste})`,
          valoresDespues: { ...c.data, origen, ajuste, redondeo, grados: c.grados }, req,
        });
      }
      res.status(201).json({
        success: true,
        cuotas: creados.length,
        montos: creados.reduce((s, c) => s + c.grados, 0),
        omitidas,
      });
    } catch (err) { next(err); }
  },
};

module.exports = ctrl;

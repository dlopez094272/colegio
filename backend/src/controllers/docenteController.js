const { pool } = require('../config/database');
const DocenteModel            = require('../models/docenteModel');
const FormacionAcademicaModel = require('../models/formacionAcademicaModel');
const { registrarBitacora }   = require('../utils/bitacora');
const { CAMPOS_DOCENTE, normalizar, validar, nombreCompleto } = require('../utils/persona');

/**
 * Personal docente (maestros y coordinadores). Guarda los mismos datos que el
 * padre de familia, sin vínculo con estudiantes, más tipo de personal, correo,
 * fecha de ingreso, foto (fotoControllerFactory) y una o varias formaciones
 * académicas del catálogo. Datos y formaciones se guardan en una sola
 * transacción y el cambio de formaciones queda en la bitácora junto al resto.
 */
const ETIQUETA = 'docente';
const CAMPOS_AUDITABLES = [...CAMPOS_DOCENTE, 'activo'];

function http(status, message) {
  return Object.assign(new Error(message), { status });
}

function leerActivo(body, actual = 1) {
  if (body.activo === undefined || body.activo === null) return actual;
  return body.activo === true || body.activo === 1 || body.activo === '1' ? 1 : 0;
}

/**
 * Valida la lista de formaciones ([id, ...]). Las nuevas deben estar activas;
 * las que el docente ya tenía se conservan aunque se hayan inactivado.
 * Devuelve [{ idformaciones_academicas, formacion }] ordenado por nombre.
 */
async function prepararFormaciones(lista, actuales = []) {
  if (!Array.isArray(lista)) throw http(400, 'El listado de formaciones académicas no es válido');
  const ids = [...new Set(lista.map(Number))];
  if (ids.some(n => !Number.isInteger(n) || n <= 0)) throw http(400, 'Formación académica no válida');

  const encontradas = await FormacionAcademicaModel.findManyByIds(ids);
  if (encontradas.length !== ids.length) throw http(400, 'Una de las formaciones académicas seleccionadas ya no existe');
  const yaAsignadas = new Set(actuales.map(f => f.idformaciones_academicas));
  const inactiva = encontradas.find(f => !f.activo && !yaAsignadas.has(f.idformaciones_academicas));
  if (inactiva) throw http(400, `La formación "${inactiva.formacion}" está inactiva`);

  return encontradas
    .map(f => ({ idformaciones_academicas: f.idformaciones_academicas, formacion: f.formacion }))
    .sort((a, b) => a.formacion.localeCompare(b.formacion, 'es'));
}

async function validarDpi(dpi, excludeId = null) {
  if (!dpi) return;
  const dup = await DocenteModel.buscarPorDpi(dpi, excludeId);
  if (dup) throw http(409, `Ya existe un ${ETIQUETA} con el DPI ${dpi}: ${dup.nombre_completo}`);
}

async function enTransaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

function responderError(err, res, next) {
  if (err.status && err.status < 500) return res.status(err.status).json({ success: false, message: err.message });
  next(err);
}

// Valores para la bitácora: datos editables + activo + nombres de las formaciones
function auditables(registro, formaciones) {
  const v = CAMPOS_AUDITABLES.reduce((acc, c) => { acc[c] = registro[c] ?? null; return acc; }, {});
  v.formaciones = formaciones.map(f => f.formacion).join(', ') || null;
  return v;
}

async function detalle(id) {
  const registro = await DocenteModel.findById(id);
  if (!registro) return null;
  return { ...registro, formaciones: await DocenteModel.getFormaciones(id) };
}

const docenteController = {
  // GET /?page&pageSize&search&sortField&sortDir&activo&tipo_personal&idformaciones_academicas...
  async getAll(req, res, next) {
    try {
      const result = await DocenteModel.getAll(req.query);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  },

  async getById(req, res, next) {
    try {
      const data = await detalle(req.params.id);
      if (!data) return res.status(404).json({ message: 'Docente no encontrado' });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const data = normalizar(req.body, CAMPOS_DOCENTE);
      const error = validar(data, ETIQUETA);
      if (error) return res.status(400).json({ message: error });
      data.activo = leerActivo(req.body, 1);

      await validarDpi(data.dpi);
      const formaciones = await prepararFormaciones(req.body.formaciones || []);

      const id = await enTransaccion(async (conn) => {
        const id = await DocenteModel.create(conn, data, req.user?.id ?? null);
        await DocenteModel.setFormaciones(conn, id, formaciones.map(f => f.idformaciones_academicas));
        return id;
      });

      await registrarBitacora({
        tabla: 'docentes', idregistro: id, accion: 'CREAR',
        descripcion: `${data.tipo_personal} creado: ${nombreCompleto(data)}`,
        valoresDespues: auditables(data, formaciones), req,
      });
      res.status(201).json({ success: true, id, data: await detalle(id) });
    } catch (err) { responderError(err, res, next); }
  },

  async update(req, res, next) {
    try {
      const id = Number(req.params.id);
      const antes = await detalle(id);
      if (!antes) return res.status(404).json({ message: 'Docente no encontrado' });

      const data = normalizar(req.body, CAMPOS_DOCENTE);
      const error = validar(data, ETIQUETA);
      if (error) return res.status(400).json({ message: error });
      data.activo = leerActivo(req.body, antes.activo);

      await validarDpi(data.dpi, id);
      // Sin "formaciones" en el body se conservan las actuales
      const formaciones = req.body.formaciones === undefined
        ? antes.formaciones
        : await prepararFormaciones(req.body.formaciones, antes.formaciones);

      await enTransaccion(async (conn) => {
        await DocenteModel.update(conn, id, data);
        await DocenteModel.setFormaciones(conn, id, formaciones.map(f => f.idformaciones_academicas));
      });

      const valoresAntes = auditables(antes, antes.formaciones);
      const valoresDespues = auditables(data, formaciones);
      if (JSON.stringify(valoresAntes) !== JSON.stringify(valoresDespues)) {
        await registrarBitacora({
          tabla: 'docentes', idregistro: id, accion: 'MODIFICAR',
          descripcion: `${data.tipo_personal} modificado: ${nombreCompleto(data)}`,
          valoresAntes, valoresDespues, req,
        });
      }
      res.json({ success: true, data: await detalle(id) });
    } catch (err) { responderError(err, res, next); }
  },

  async toggleActive(req, res, next) {
    try {
      const id = Number(req.params.id);
      const registro = await DocenteModel.findById(id);
      if (!registro) return res.status(404).json({ message: 'Docente no encontrado' });
      const nuevoActivo = registro.activo ? 0 : 1;
      await DocenteModel.setActivo(id, nuevoActivo);
      await registrarBitacora({
        tabla: 'docentes', idregistro: id, accion: nuevoActivo ? 'ACTIVAR' : 'INACTIVAR',
        descripcion: `${registro.tipo_personal} ${nuevoActivo ? 'activado' : 'inactivado'}: ${registro.nombre_completo}`,
        valoresAntes: { activo: registro.activo }, valoresDespues: { activo: nuevoActivo }, req,
      });
      res.json({ success: true, activo: nuevoActivo });
    } catch (err) { next(err); }
  },
};

module.exports = docenteController;

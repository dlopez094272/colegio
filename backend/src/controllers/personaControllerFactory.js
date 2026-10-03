const { pool } = require('../config/database');
const { registrarBitacora } = require('../utils/bitacora');
const { tienePermiso } = require('../middleware/checkPermiso');
const { normalizar, validar, heredar, nombreCompleto, normalizarParentesco } = require('../utils/persona');

/**
 * Controlador compartido de Padres de familia y Estudiantes. Ambos módulos
 * funcionan igual, cada uno visto desde su lado del vínculo:
 *  - Al crear/editar se pueden asignar registros del otro lado, ya sea
 *    buscando uno existente ({ id, parentesco }) o creándolo en el mismo paso
 *    ({ nuevo: {...datos}, parentesco }).
 *  - Lo creado en el mismo paso hereda los datos en común (dirección y
 *    teléfonos) del registro principal cuando vienen vacíos.
 *  - Todo se guarda en una sola transacción y cada inserción, modificación y
 *    asignación queda en la bitácora de ambos lados.
 *
 * @param {object} cfg
 * @param {string} cfg.tabla / cfg.tablaOtro        - nombres de tabla (bitácora y permisos)
 * @param {string} cfg.pk                            - pk del lado principal
 * @param {string} cfg.etiqueta / cfg.etiquetaOtro   - textos legibles para mensajes
 * @param {object} cfg.Modelo / cfg.ModeloOtro       - modelos (personaModelFactory)
 * @param {string[]} cfg.campos / cfg.camposOtro     - campos editables de cada lado
 * @param {Function} cfg.getVinculos(id, conn)       - vínculos actuales del registro principal
 * @param {Function} cfg.vincular(conn, id, idOtro, parentesco)
 * @param {Function} cfg.desvincular(conn, id, idOtro)
 */
function crearControladorPersona(cfg) {
  const { tabla, tablaOtro, pk, etiqueta, etiquetaOtro, Modelo, ModeloOtro, campos, camposOtro, getVinculos, vincular, desvincular } = cfg;
  const camposAuditables = [...campos, 'activo'];

  function http(status, message, extra = {}) {
    return Object.assign(new Error(message), { status, extra });
  }

  function leerActivo(body, actual = 1) {
    if (body.activo === undefined || body.activo === null) return actual;
    return body.activo === true || body.activo === 1 || body.activo === '1' ? 1 : 0;
  }

  /**
   * Normaliza y valida la lista de vínculos que manda el formulario.
   * Devuelve { existentes: Map<idOtro, parentesco>, nuevos: [{ data, parentesco }] }.
   */
  async function prepararVinculos(lista, principal, req) {
    if (!Array.isArray(lista)) throw http(400, 'El listado de asignaciones no es válido');

    const existentes = new Map();
    const nuevos = [];
    const dpisNuevos = new Set();

    for (const item of lista) {
      const parentesco = normalizarParentesco(item?.parentesco);
      if (item?.nuevo) {
        const data = heredar(normalizar(item.nuevo, camposOtro), principal);
        const error = validar(data, `${etiquetaOtro} nuevo`);
        if (error) throw http(400, error);
        if (data.dpi) {
          if (dpisNuevos.has(data.dpi)) throw http(409, `El DPI ${data.dpi} está repetido entre los ${etiquetaOtro}s nuevos`);
          dpisNuevos.add(data.dpi);
          const dup = await ModeloOtro.buscarPorDpi(data.dpi);
          if (dup) throw http(409, `Ya existe un ${etiquetaOtro} con el DPI ${data.dpi}: ${dup.nombre_completo}. Búsquelo y asígnelo como existente.`);
        }
        nuevos.push({ data, parentesco });
      } else {
        const id = Number(item?.id);
        if (!Number.isInteger(id) || id <= 0) throw http(400, `Asignación de ${etiquetaOtro} no válida`);
        if (existentes.has(id)) throw http(400, `Un ${etiquetaOtro} está asignado más de una vez`);
        existentes.set(id, parentesco);
      }
    }

    if (existentes.size) {
      const encontrados = await ModeloOtro.findManyByIds([...existentes.keys()]);
      if (encontrados.length !== existentes.size) throw http(400, `Uno de los ${etiquetaOtro}s asignados ya no existe`);
    }

    // Crear registros del otro lado en el mismo paso requiere permiso de Añadir sobre ese módulo
    if (nuevos.length && !(await tienePermiso(req.user?.codigo, tablaOtro, 'A')))
      throw http(403, `No tiene permiso para crear ${etiquetaOtro}s nuevos. Asigne uno existente.`);

    return { existentes, nuevos };
  }

  async function validarDpiPrincipal(dpi, excludeId = null) {
    const dup = await Modelo.buscarPorDpi(dpi, excludeId);
    if (dup) throw http(409, `Ya existe un ${etiqueta} con el DPI ${dpi}: ${dup.nombre_completo}`);
  }

  /**
   * Aplica dentro de la transacción: crea los nuevos del otro lado, vincula,
   * actualiza parentescos y desvincula lo que ya no viene en la lista.
   * Devuelve los eventos para la bitácora (se registran tras el commit).
   */
  async function aplicarVinculos(conn, id, { existentes, nuevos }, actuales, idusuarios) {
    const eventos = { creados: [], asignados: [], desasignados: [], parentescos: [] };
    const actualesMap = new Map(actuales.map(v => [v.id, v]));

    for (const { data, parentesco } of nuevos) {
      const idOtro = await ModeloOtro.create(conn, { ...data, activo: 1 }, idusuarios);
      await vincular(conn, id, idOtro, parentesco);
      eventos.creados.push({ id: idOtro, data, parentesco });
      eventos.asignados.push({ id: idOtro, nombre: nombreCompleto(data), parentesco });
    }

    for (const [idOtro, parentesco] of existentes) {
      const actual = actualesMap.get(idOtro);
      if (!actual) {
        await vincular(conn, id, idOtro, parentesco);
        const otro = await ModeloOtro.findById(idOtro, conn);
        eventos.asignados.push({ id: idOtro, nombre: otro?.nombre_completo || `#${idOtro}`, parentesco });
      } else if ((actual.parentesco || null) !== parentesco) {
        await vincular(conn, id, idOtro, parentesco);
        eventos.parentescos.push({ id: idOtro, nombre: actual.nombre_completo, antes: actual.parentesco, despues: parentesco });
      }
    }

    for (const actual of actuales) {
      if (!existentes.has(actual.id)) {
        await desvincular(conn, id, actual.id);
        eventos.desasignados.push({ id: actual.id, nombre: actual.nombre_completo, parentesco: actual.parentesco });
      }
    }

    return eventos;
  }

  async function registrarEventosVinculos(req, id, nombre, eventos) {
    const tareas = [];
    const conParentesco = (p) => (p ? ` (${p})` : '');

    for (const c of eventos.creados) {
      tareas.push(registrarBitacora({
        tabla: tablaOtro, idregistro: c.id, accion: 'CREAR',
        descripcion: `${cap(etiquetaOtro)} creado desde la ficha del ${etiqueta}: ${nombre}`,
        valoresDespues: c.data, req,
      }));
    }
    for (const a of eventos.asignados) {
      tareas.push(registrarBitacora({ tabla, idregistro: id, accion: 'ASIGNAR', descripcion: `${cap(etiquetaOtro)} asignado: ${a.nombre}${conParentesco(a.parentesco)}`, valoresDespues: { [`id_${tablaOtro}`]: a.id, parentesco: a.parentesco }, req }));
      tareas.push(registrarBitacora({ tabla: tablaOtro, idregistro: a.id, accion: 'ASIGNAR', descripcion: `${cap(etiqueta)} asignado: ${nombre}${conParentesco(a.parentesco)}`, valoresDespues: { [`id_${tabla}`]: id, parentesco: a.parentesco }, req }));
    }
    for (const d of eventos.desasignados) {
      tareas.push(registrarBitacora({ tabla, idregistro: id, accion: 'DESASIGNAR', descripcion: `${cap(etiquetaOtro)} desasignado: ${d.nombre}${conParentesco(d.parentesco)}`, valoresAntes: { [`id_${tablaOtro}`]: d.id, parentesco: d.parentesco }, req }));
      tareas.push(registrarBitacora({ tabla: tablaOtro, idregistro: d.id, accion: 'DESASIGNAR', descripcion: `${cap(etiqueta)} desasignado: ${nombre}${conParentesco(d.parentesco)}`, valoresAntes: { [`id_${tabla}`]: id, parentesco: d.parentesco }, req }));
    }
    for (const p of eventos.parentescos) {
      tareas.push(registrarBitacora({ tabla, idregistro: id, accion: 'MODIFICAR', descripcion: `Parentesco actualizado con ${p.nombre}`, valoresAntes: { parentesco: p.antes }, valoresDespues: { parentesco: p.despues }, req }));
      tareas.push(registrarBitacora({ tabla: tablaOtro, idregistro: p.id, accion: 'MODIFICAR', descripcion: `Parentesco actualizado con ${nombre}`, valoresAntes: { parentesco: p.antes }, valoresDespues: { parentesco: p.despues }, req }));
    }
    await Promise.all(tareas);
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
    if (err.status && err.status < 500) return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
    next(err);
  }

  function auditables(registro) {
    return camposAuditables.reduce((acc, c) => { acc[c] = registro[c] ?? null; return acc; }, {});
  }

  return {
    // GET /?page&pageSize&search&sortField&sortDir&activo&...filtros
    async getAll(req, res, next) {
      try {
        const result = await Modelo.getAll(req.query);
        res.json({ success: true, ...result });
      } catch (err) { next(err); }
    },

    // GET /buscar?q=&excluir=1,2&limit=10&todos=1 — autocompletar para asignaciones
    async buscar(req, res, next) {
      try {
        const excluir = String(req.query.excluir || '').split(',').filter(Boolean);
        const data = await Modelo.buscar(req.query.q || '', {
          limit: req.query.limit,
          soloActivos: req.query.todos !== '1',
          excluir,
        });
        res.json({ success: true, data });
      } catch (err) { next(err); }
    },

    async getById(req, res, next) {
      try {
        const registro = await Modelo.findById(req.params.id);
        if (!registro) return res.status(404).json({ message: `${cap(etiqueta)} no encontrado` });
        const vinculos = await getVinculos(registro[pk]);
        res.json({ success: true, data: { ...registro, vinculos } });
      } catch (err) { next(err); }
    },

    async create(req, res, next) {
      try {
        const data = normalizar(req.body, campos);
        const error = validar(data, etiqueta);
        if (error) return res.status(400).json({ message: error });
        data.activo = leerActivo(req.body, 1);

        if (data.dpi) await validarDpiPrincipal(data.dpi);
        const vinculos = await prepararVinculos(req.body.vinculos || [], data, req);

        const idusuarios = req.user?.id ?? null;
        const { id, eventos } = await enTransaccion(async (conn) => {
          const id = await Modelo.create(conn, data, idusuarios);
          const eventos = await aplicarVinculos(conn, id, vinculos, [], idusuarios);
          return { id, eventos };
        });

        const nombre = nombreCompleto(data);
        await registrarBitacora({ tabla, idregistro: id, accion: 'CREAR', descripcion: `${cap(etiqueta)} creado: ${nombre}`, valoresDespues: data, req });
        await registrarEventosVinculos(req, id, nombre, eventos);

        const registro = await Modelo.findById(id);
        res.status(201).json({ success: true, id, data: { ...registro, vinculos: await getVinculos(id) } });
      } catch (err) { responderError(err, res, next); }
    },

    async update(req, res, next) {
      try {
        const id = Number(req.params.id);
        const antes = await Modelo.findById(id);
        if (!antes) return res.status(404).json({ message: `${cap(etiqueta)} no encontrado` });

        const data = normalizar(req.body, campos);
        const error = validar(data, etiqueta);
        if (error) return res.status(400).json({ message: error });
        data.activo = leerActivo(req.body, antes.activo);

        if (data.dpi) await validarDpiPrincipal(data.dpi, id);
        // Sin "vinculos" en el body se conservan las asignaciones actuales
        const vinculos = req.body.vinculos === undefined ? null : await prepararVinculos(req.body.vinculos, data, req);

        const idusuarios = req.user?.id ?? null;
        const eventos = await enTransaccion(async (conn) => {
          await Modelo.update(conn, id, data);
          if (!vinculos) return { creados: [], asignados: [], desasignados: [], parentescos: [] };
          return aplicarVinculos(conn, id, vinculos, await getVinculos(id, conn), idusuarios);
        });

        const nombre = nombreCompleto(data);
        const valoresAntes = auditables(antes);
        const valoresDespues = auditables(data);
        if (JSON.stringify(valoresAntes) !== JSON.stringify(valoresDespues)) {
          await registrarBitacora({ tabla, idregistro: id, accion: 'MODIFICAR', descripcion: `${cap(etiqueta)} modificado: ${nombre}`, valoresAntes, valoresDespues, req });
        }
        await registrarEventosVinculos(req, id, nombre, eventos);

        const registro = await Modelo.findById(id);
        res.json({ success: true, data: { ...registro, vinculos: await getVinculos(id) } });
      } catch (err) { responderError(err, res, next); }
    },

    async toggleActive(req, res, next) {
      try {
        const id = Number(req.params.id);
        const registro = await Modelo.findById(id);
        if (!registro) return res.status(404).json({ message: `${cap(etiqueta)} no encontrado` });
        const nuevoActivo = registro.activo ? 0 : 1;
        await Modelo.setActivo(id, nuevoActivo);
        await registrarBitacora({
          tabla, idregistro: id, accion: nuevoActivo ? 'ACTIVAR' : 'INACTIVAR',
          descripcion: `${cap(etiqueta)} ${nuevoActivo ? 'activado' : 'inactivado'}: ${registro.nombre_completo}`,
          valoresAntes: { activo: registro.activo }, valoresDespues: { activo: nuevoActivo }, req,
        });
        res.json({ success: true, activo: nuevoActivo });
      } catch (err) { next(err); }
    },
  };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { crearControladorPersona };

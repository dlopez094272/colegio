const { pool } = require('../config/database');
const { paginateQuery } = require('../utils/paginate');
const { buildFiltrosCondiciones, buildOrderBy, buildWordsLikeCondition } = require('../utils/queryFilters');
const { sqlNombre } = require('../utils/persona');

/**
 * Pagos (recibos). Cada línea de pagos_detalle liquida un cargo completo del
 * estado de cuenta, con la mora calculada a la fecha de pago.
 */
const SELECT = `
  SELECT pg.idpagos, pg.numero, DATE_FORMAT(pg.fecha_pago, '%Y-%m-%d') AS fecha_pago,
         pg.idpadres, pg.pagador_nombre, pg.pagador_nit, pg.forma_pago, pg.referencia, pg.observaciones,
         pg.subtotal, pg.mora, pg.total, pg.estado, pg.motivo_anulacion, pg.fecha_anulacion,
         pg.fecha_creacion, u.nombre_completo AS usuario_registro,
         (SELECT GROUP_CONCAT(DISTINCT ${sqlNombre('e')} SEPARATOR ', ')
            FROM pagos_detalle pd
            JOIN inscripciones_cargos ic ON ic.idinscripciones_cargos = pd.idinscripciones_cargos
            JOIN inscripciones i ON i.idinscripciones = ic.idinscripciones
            JOIN estudiantes e ON e.idestudiantes = i.idestudiantes
           WHERE pd.idpagos = pg.idpagos) AS estudiantes,
         (SELECT COUNT(*) FROM pagos_detalle pd WHERE pd.idpagos = pg.idpagos) AS lineas
    FROM pagos pg
    LEFT JOIN usuarios u ON u.idusuarios = pg.idusuarios`;

const SORT_FIELDS = {
  numero:     'pg.numero',
  fecha_pago: 'pg.fecha_pago',
  pagador:    'pg.pagador_nombre',
  total:      'pg.total',
  forma_pago: 'pg.forma_pago',
  estado:     'pg.estado',
};

const FILTER_FIELDS = {
  estado:     { column: 'pg.estado',     type: 'exact' },
  forma_pago: { column: 'pg.forma_pago', type: 'exact' },
  fecha_pago: { column: 'pg.fecha_pago', type: 'date' },
  idpadres:   { column: 'pg.idpadres',   type: 'exact' },
  idinscripciones: { type: 'sql', sql: `EXISTS(SELECT 1 FROM pagos_detalle pd
                                          JOIN inscripciones_cargos ic ON ic.idinscripciones_cargos = pd.idinscripciones_cargos
                                         WHERE pd.idpagos = pg.idpagos AND ic.idinscripciones = ?)` },
};

// Búsqueda por número de recibo, pagador, NIT, referencia o nombre del estudiante.
const BUSQUEDA_SQL = `CONCAT_WS(' ', pg.numero, pg.pagador_nombre, pg.pagador_nit, pg.referencia,
  (SELECT GROUP_CONCAT(CONCAT_WS(' ', e.primer_nombre, e.segundo_nombre, e.primer_apellido, e.segundo_apellido, i.codigo) SEPARATOR ' ')
     FROM pagos_detalle pd
     JOIN inscripciones_cargos ic ON ic.idinscripciones_cargos = pd.idinscripciones_cargos
     JOIN inscripciones i ON i.idinscripciones = ic.idinscripciones
     JOIN estudiantes e ON e.idestudiantes = i.idestudiantes
    WHERE pd.idpagos = pg.idpagos))`;

/** Columnas de un cargo junto con el estudiante y su grado (para cobrar y para el recibo). */
const CARGO_INSC_COLS = `
  ic.idinscripciones_cargos, ic.idinscripciones, ic.concepto, ic.numero_cobro,
  DATE_FORMAT(ic.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
  ic.monto, ic.mora_tipo, ic.mora_valor, ic.estado,
  i.codigo, i.ciclo, i.idestudiantes, ${sqlNombre('e')} AS estudiante,
  g.grado, n.nivel, c.carrera, s.seccion`;

const CARGO_INSC_FROM = `
    FROM inscripciones_cargos ic
    JOIN inscripciones i ON i.idinscripciones = ic.idinscripciones
    JOIN estudiantes e   ON e.idestudiantes = i.idestudiantes
    JOIN grados g        ON g.idgrados = i.idgrados
    JOIN niveles n       ON n.idniveles = g.idniveles
    LEFT JOIN carreras c  ON c.idcarreras = g.idcarreras
    LEFT JOIN secciones s ON s.idsecciones = i.idsecciones
    JOIN cuotas_ciclos cc ON cc.idcuotas_ciclos = ic.idcuotas_ciclos
    JOIN cuotas cu        ON cu.idcuotas = cc.idcuotas`;

const PagoModel = {
  async getAll(opts = {}) {
    const { page, pageSize, search, sortField, sortDir, ...filtros } = opts;
    const conditions = [];
    const params = [];
    const palabras = buildWordsLikeCondition(BUSQUEDA_SQL, search);
    if (palabras) { conditions.push(palabras.sql); params.push(...palabras.params); }
    buildFiltrosCondiciones(filtros, FILTER_FIELDS, conditions, params);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = buildOrderBy(sortField, sortDir, SORT_FIELDS, 'pg.numero', 'DESC');
    const [[totales]] = await pool.query(
      `SELECT COALESCE(SUM(IF(pg.estado = 'Activo', pg.total, 0)), 0) AS total_cobrado FROM pagos pg ${where}`, params
    );
    const r = await paginateQuery({
      baseQuery: `${SELECT} ${where} ${orderBy}`,
      countQuery: `SELECT COUNT(*) AS total FROM pagos pg ${where}`,
      params, page, pageSize,
    });
    r.meta.total_cobrado = Number(totales.total_cobrado);
    return r;
  },

  async findById(id, conn = pool) {
    const [rows] = await conn.query(`${SELECT} WHERE pg.idpagos = ?`, [id]);
    return rows[0] || null;
  },

  async detalle(idpagos, conn = pool) {
    const [rows] = await conn.query(
      `SELECT pd.idpagos_detalle, pd.monto AS monto_pagado, pd.mora AS mora_pagada, pd.mora_exonerada, pd.total AS total_linea,
              ${CARGO_INSC_COLS}
         FROM pagos_detalle pd
         JOIN inscripciones_cargos ic ON ic.idinscripciones_cargos = pd.idinscripciones_cargos
         JOIN inscripciones i ON i.idinscripciones = ic.idinscripciones
         JOIN estudiantes e   ON e.idestudiantes = i.idestudiantes
         JOIN grados g        ON g.idgrados = i.idgrados
         JOIN niveles n       ON n.idniveles = g.idniveles
         LEFT JOIN carreras c  ON c.idcarreras = g.idcarreras
         LEFT JOIN secciones s ON s.idsecciones = i.idsecciones
        WHERE pd.idpagos = ?
        ORDER BY e.primer_apellido, e.primer_nombre, ic.fecha_vencimiento, pd.idpagos_detalle`,
      [idpagos]
    );
    return rows;
  },

  // ─── Cobro ───────────────────────────────────────────────────
  /**
   * Búsqueda para cobrar: estudiantes con inscripción activa y padres con
   * algún hijo inscrito, que coincidan con el texto.
   */
  async buscarPagador(texto, limit = 8) {
    const est = buildWordsLikeCondition(
      `CONCAT_WS(' ', e.primer_nombre, e.segundo_nombre, e.primer_apellido, e.segundo_apellido, e.dpi, i.codigo)`, texto
    );
    const pad = buildWordsLikeCondition(
      `CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido, p.apellido_casada, p.dpi, p.nit)`, texto
    );
    if (!est || !pad) return [];
    const [[estudiantes], [padres]] = await Promise.all([
      pool.query(
        `SELECT e.idestudiantes AS id, ${sqlNombre('e')} AS nombre, e.dpi,
                GROUP_CONCAT(DISTINCT CONCAT(g.grado, IFNULL(CONCAT(' ', s.seccion), ''), ' · ', i.ciclo) SEPARATOR ', ') AS detalle,
                (SELECT COUNT(*) FROM inscripciones_cargos ic JOIN inscripciones i2 ON i2.idinscripciones = ic.idinscripciones
                  WHERE i2.idestudiantes = e.idestudiantes AND i2.estado = 'Activa' AND ic.estado = 'Pendiente') AS pendientes
           FROM estudiantes e
           JOIN inscripciones i ON i.idestudiantes = e.idestudiantes AND i.estado = 'Activa'
           JOIN grados g ON g.idgrados = i.idgrados
           LEFT JOIN secciones s ON s.idsecciones = i.idsecciones
          WHERE ${est.sql}
          GROUP BY e.idestudiantes
          ORDER BY e.primer_apellido, e.primer_nombre
          LIMIT ?`,
        [...est.params, limit]
      ),
      pool.query(
        `SELECT p.idpadres AS id, ${sqlNombre('p')} AS nombre, p.dpi, p.nit,
                GROUP_CONCAT(DISTINCT CONCAT(e.primer_nombre, ' ', e.primer_apellido) SEPARATOR ', ') AS detalle,
                (SELECT COUNT(*) FROM inscripciones_cargos ic
                   JOIN inscripciones i2 ON i2.idinscripciones = ic.idinscripciones
                   JOIN estudiantes_padres v2 ON v2.idestudiantes = i2.idestudiantes
                  WHERE v2.idpadres = p.idpadres AND i2.estado = 'Activa' AND ic.estado = 'Pendiente') AS pendientes
           FROM padres p
           JOIN estudiantes_padres v ON v.idpadres = p.idpadres
           JOIN estudiantes e ON e.idestudiantes = v.idestudiantes
           JOIN inscripciones i ON i.idestudiantes = e.idestudiantes AND i.estado = 'Activa'
          WHERE ${pad.sql}
          GROUP BY p.idpadres
          ORDER BY p.primer_apellido, p.primer_nombre
          LIMIT ?`,
        [...pad.params, limit]
      ),
    ]);
    return [
      ...padres.map(r => ({ tipo: 'padre', ...r })),
      ...estudiantes.map(r => ({ tipo: 'estudiante', ...r })),
    ];
  },

  /** Padre por id con sus datos de facturación. */
  async padre(idpadres) {
    const [rows] = await pool.query(
      `SELECT p.idpadres, ${sqlNombre('p')} AS nombre, p.nit, p.dpi FROM padres p WHERE p.idpadres = ?`, [idpadres]
    );
    return rows[0] || null;
  },

  /** Encargados del estudiante (para sugerir quién paga). */
  async padresDeEstudiantes(ids) {
    if (!ids.length) return [];
    const [rows] = await pool.query(
      `SELECT DISTINCT p.idpadres, ${sqlNombre('p')} AS nombre, p.nit, v.parentesco
         FROM estudiantes_padres v JOIN padres p ON p.idpadres = v.idpadres
        WHERE v.idestudiantes IN (?) AND p.activo = 1
        ORDER BY FIELD(v.parentesco, 'Padre', 'Madre', 'Tutor', 'Otro'), p.primer_apellido`,
      [ids]
    );
    return rows;
  },

  /** Cargos pendientes de las inscripciones activas de los estudiantes indicados. */
  async pendientes(idsEstudiantes) {
    if (!idsEstudiantes.length) return [];
    const [rows] = await pool.query(
      `SELECT ${CARGO_INSC_COLS}
         ${CARGO_INSC_FROM}
        WHERE i.idestudiantes IN (?) AND i.estado = 'Activa' AND ic.estado = 'Pendiente'
        ORDER BY e.primer_apellido, e.primer_nombre, i.ciclo, ic.fecha_vencimiento, cu.orden, ic.numero_cobro`,
      [idsEstudiantes]
    );
    return rows;
  },

  async estudiantesDePadre(idpadres) {
    const [rows] = await pool.query('SELECT idestudiantes FROM estudiantes_padres WHERE idpadres = ?', [idpadres]);
    return rows.map(r => r.idestudiantes);
  },

  /** Cargos a cobrar, bloqueados hasta el commit (evita cobrar dos veces el mismo cargo). */
  async cargosParaCobrar(conn, ids) {
    const [rows] = await conn.query(
      `SELECT ${CARGO_INSC_COLS}, i.estado AS estado_inscripcion
         ${CARGO_INSC_FROM}
        WHERE ic.idinscripciones_cargos IN (?)
        FOR UPDATE`,
      [ids]
    );
    return rows;
  },

  async create(conn, data) {
    const [r] = await conn.query('INSERT INTO pagos SET ?', [data]);
    return r.insertId;
  },

  async insertarDetalle(conn, idpagos, lineas) {
    await conn.query(
      `INSERT INTO pagos_detalle (idpagos, idinscripciones_cargos, monto, mora, mora_exonerada, total) VALUES ?`,
      [lineas.map(l => [idpagos, l.idinscripciones_cargos, l.monto, l.mora, l.mora_exonerada ? 1 : 0, l.total])]
    );
  },

  async marcarCargos(conn, ids, estado) {
    if (!ids.length) return;
    await conn.query('UPDATE inscripciones_cargos SET estado = ? WHERE idinscripciones_cargos IN (?)', [estado, ids]);
  },

  async anular(conn, id, motivo) {
    await conn.query(
      `UPDATE pagos SET estado = 'Anulado', motivo_anulacion = ?, fecha_anulacion = NOW() WHERE idpagos = ?`,
      [motivo, id]
    );
  },
};

module.exports = PagoModel;

const { pool } = require('../config/database');
const { paginateQuery } = require('../utils/paginate');
const { buildFiltrosCondiciones, buildOrderBy, buildWordsLikeCondition } = require('../utils/queryFilters');
const { sqlNombre } = require('../utils/persona');

/**
 * Inscripciones: estudiante + grado (+ sección) en un ciclo. Nivel y carrera
 * se derivan del grado. Los cargos (estado de cuenta) son copia de las cuotas
 * del ciclo al momento de inscribir.
 */
const FROM = `
    FROM inscripciones i
    JOIN estudiantes e ON e.idestudiantes = i.idestudiantes
    JOIN grados g      ON g.idgrados = i.idgrados
    JOIN niveles n     ON n.idniveles = g.idniveles
    LEFT JOIN carreras c  ON c.idcarreras = g.idcarreras
    LEFT JOIN secciones s ON s.idsecciones = i.idsecciones
    LEFT JOIN padres p    ON p.idpadres = i.idpadres
    LEFT JOIN estados_civiles ecp  ON ecp.idestados_civiles = p.idestados_civiles
    LEFT JOIN estudiantes_padres v ON v.idestudiantes = i.idestudiantes AND v.idpadres = i.idpadres
    LEFT JOIN usuarios u  ON u.idusuarios = i.idusuarios`;

const SELECT = `
  SELECT i.idinscripciones, i.codigo, i.ciclo, i.idestudiantes, i.idgrados, i.idsecciones, i.idpadres,
         DATE_FORMAT(i.fecha_inscripcion, '%Y-%m-%d') AS fecha_inscripcion,
         i.estado, i.observaciones, i.motivo_anulacion, i.fecha_anulacion,
         (i.contrato_archivo IS NOT NULL) AS contrato_firmado, i.contrato_nombre, i.contrato_mime, i.contrato_fecha,
         i.fecha_creacion, i.fecha_modificacion, u.nombre_completo AS usuario_registro,
         ${sqlNombre('e')} AS estudiante, e.dpi AS estudiante_dpi, e.foto AS estudiante_foto,
         DATE_FORMAT(e.fecha_nacimiento, '%Y-%m-%d') AS estudiante_fecha_nacimiento,
         e.direccion AS estudiante_direccion,
         g.grado, g.idniveles, n.nivel, g.idcarreras, c.carrera, s.seccion,
         ${sqlNombre('p')} AS encargado, p.dpi AS encargado_dpi, p.nit AS encargado_nit,
         p.telefono_celular AS encargado_telefono, p.telefono_casa AS encargado_telefono_casa,
         p.direccion AS encargado_direccion, p.email AS encargado_email, p.nacionalidad AS encargado_nacionalidad,
         TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, i.fecha_inscripcion) AS encargado_edad,
         ecp.estado_civil AS encargado_estado_civil, v.parentesco AS encargado_parentesco,
         (SELECT COUNT(*) FROM inscripciones_cargos ic
           WHERE ic.idinscripciones = i.idinscripciones AND ic.estado = 'Pendiente') AS cargos_pendientes,
         (SELECT COUNT(*) FROM inscripciones_cargos ic
           WHERE ic.idinscripciones = i.idinscripciones AND ic.estado = 'Pendiente' AND ic.fecha_vencimiento < CURDATE()) AS cargos_vencidos,
         (SELECT COALESCE(SUM(ic.monto), 0) FROM inscripciones_cargos ic
           WHERE ic.idinscripciones = i.idinscripciones AND ic.estado = 'Pendiente') AS saldo_pendiente
  ${FROM}`;

const SORT_FIELDS = {
  idinscripciones:   'i.idinscripciones',
  codigo:            'i.codigo',
  estudiante:        'e.primer_apellido, e.segundo_apellido, e.primer_nombre',
  grado:             'n.orden, c.orden, g.orden, s.seccion',
  fecha_inscripcion: 'i.fecha_inscripcion',
  saldo_pendiente:   'saldo_pendiente',
  estado:            'i.estado',
};

const FILTER_FIELDS = {
  ciclo:             { column: 'i.ciclo',        type: 'exact' },
  estado:            { column: 'i.estado',       type: 'exact' },
  idniveles:         { column: 'g.idniveles',    type: 'exact' },
  idcarreras:        { column: 'g.idcarreras',   type: 'exact' },
  idgrados:          { column: 'i.idgrados',     type: 'exact' },
  idsecciones:       { column: 'i.idsecciones',  type: 'exact' },
  idestudiantes:     { column: 'i.idestudiantes', type: 'exact' },
  fecha_inscripcion: { column: 'i.fecha_inscripcion', type: 'date' },
  contrato:          { type: 'sql', sql: '(i.contrato_archivo IS NOT NULL) = (? = \'firmado\')' },
  solvencia:         { type: 'sql', sql: `(? = 'mora') = EXISTS(SELECT 1 FROM inscripciones_cargos ic
                                          WHERE ic.idinscripciones = i.idinscripciones AND ic.estado = 'Pendiente'
                                            AND ic.fecha_vencimiento < CURDATE())` },
};

const BUSQUEDA_SQL = `CONCAT_WS(' ', i.codigo, e.primer_nombre, e.segundo_nombre, e.primer_apellido, e.segundo_apellido, e.dpi,
                               p.primer_nombre, p.primer_apellido, p.segundo_apellido)`;

const CARGO_COLS = `
  ic.idinscripciones_cargos, ic.idinscripciones, ic.idcuotas_ciclos, ic.numero_cobro, ic.concepto,
  DATE_FORMAT(ic.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
  ic.monto, ic.mora_tipo, ic.mora_valor, ic.estado, ic.motivo_anulacion,
  cu.idcuotas, cu.cuota, cu.obligatoria, cu.orden AS cuota_orden`;

const InscripcionModel = {
  async getAll(opts = {}) {
    const { page, pageSize, search, sortField, sortDir, ...filtros } = opts;
    const conditions = [];
    const params = [];
    const palabras = buildWordsLikeCondition(BUSQUEDA_SQL, search);
    if (palabras) { conditions.push(palabras.sql); params.push(...palabras.params); }
    buildFiltrosCondiciones(filtros, FILTER_FIELDS, conditions, params);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = buildOrderBy(sortField, sortDir, SORT_FIELDS, 'i.idinscripciones', 'DESC');
    return paginateQuery({
      baseQuery: `${SELECT} ${where} ${orderBy}`,
      countQuery: `SELECT COUNT(*) AS total ${FROM} ${where}`,
      params, page, pageSize,
    });
  },

  async findById(id, conn = pool) {
    const [rows] = await conn.query(`${SELECT} WHERE i.idinscripciones = ?`, [id]);
    return rows[0] || null;
  },

  /** Ruta del contrato firmado en storage (no se expone en los listados). */
  async contratoArchivo(id) {
    const [rows] = await pool.query(
      'SELECT contrato_archivo, contrato_nombre, contrato_mime FROM inscripciones WHERE idinscripciones = ?', [id]
    );
    return rows[0] || null;
  },

  async activaEnCiclo(idestudiantes, ciclo, conn = pool) {
    const [rows] = await conn.query(
      `SELECT idinscripciones, codigo FROM inscripciones WHERE idestudiantes = ? AND ciclo = ? AND estado = 'Activa' LIMIT 1`,
      [idestudiantes, ciclo]
    );
    return rows[0] || null;
  },

  /** Historial de inscripciones del estudiante (para el formulario). */
  async deEstudiante(idestudiantes) {
    const [rows] = await pool.query(
      `SELECT i.idinscripciones, i.codigo, i.ciclo, i.estado, g.grado, n.nivel, c.carrera, s.seccion
         ${FROM} WHERE i.idestudiantes = ? ORDER BY i.ciclo DESC, i.idinscripciones DESC`,
      [idestudiantes]
    );
    return rows;
  },

  async create(conn, data) {
    const [r] = await conn.query('INSERT INTO inscripciones SET ?', [data]);
    return r.insertId;
  },

  async update(id, data) {
    await pool.query('UPDATE inscripciones SET ? WHERE idinscripciones = ?', [data, id]);
  },

  async setContrato(id, c) {
    await pool.query(
      `UPDATE inscripciones SET contrato_archivo = ?, contrato_nombre = ?, contrato_mime = ?, contrato_fecha = ?
        WHERE idinscripciones = ?`,
      [c?.archivo ?? null, c?.nombre ?? null, c?.mime ?? null, c ? new Date() : null, id]
    );
  },

  async anular(conn, id, motivo) {
    await conn.query(
      `UPDATE inscripciones SET estado = 'Anulada', motivo_anulacion = ?, fecha_anulacion = NOW() WHERE idinscripciones = ?`,
      [motivo, id]
    );
    await conn.query(
      `UPDATE inscripciones_cargos SET estado = 'Anulado', motivo_anulacion = 'Inscripción anulada'
        WHERE idinscripciones = ? AND estado = 'Pendiente'`,
      [id]
    );
  },

  // ─── Estructura y cuotas disponibles ─────────────────────────
  /** Niveles, carreras, grados y secciones activos (para los selectores en cascada). */
  async estructuraActiva() {
    const [[niveles], [carreras], [grados], [secciones]] = await Promise.all([
      pool.query('SELECT idniveles, nivel, usa_carreras FROM niveles WHERE activo = 1 ORDER BY orden, nivel'),
      pool.query('SELECT idcarreras, idniveles, carrera FROM carreras WHERE activo = 1 ORDER BY orden, carrera'),
      pool.query('SELECT idgrados, idniveles, idcarreras, grado FROM grados WHERE activo = 1 ORDER BY orden, grado'),
      pool.query('SELECT idsecciones, idgrados, seccion FROM secciones WHERE activo = 1 ORDER BY seccion'),
    ]);
    return { niveles, carreras, grados, secciones };
  },

  /** Grado con su nivel/carrera; `activo` considera toda la cadena. */
  async findGrado(idgrados, conn = pool) {
    const [rows] = await conn.query(
      `SELECT g.idgrados, g.grado, n.nivel, c.carrera,
              (g.activo AND n.activo AND COALESCE(c.activo, 1)) AS activo
         FROM grados g
         JOIN niveles n ON n.idniveles = g.idniveles
         LEFT JOIN carreras c ON c.idcarreras = g.idcarreras
        WHERE g.idgrados = ?`,
      [idgrados]
    );
    return rows[0] || null;
  },

  async seccionesActivas(idgrados, conn = pool) {
    const [rows] = await conn.query(
      'SELECT idsecciones, seccion FROM secciones WHERE idgrados = ? AND activo = 1 ORDER BY seccion', [idgrados]
    );
    return rows;
  },

  /** Cuotas activas del ciclo que aplican al grado, con su monto. */
  async cuotasDelGrado(ciclo, idgrados, conn = pool) {
    const [rows] = await conn.query(
      `SELECT cc.idcuotas_ciclos, cc.idcuotas, cc.ciclo,
              DATE_FORMAT(cc.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
              DATE_FORMAT(cc.fecha_fin, '%Y-%m-%d') AS fecha_fin,
              cc.dia_limite, cc.mora_tipo, cc.mora_valor,
              cu.cuota, cu.periodicidad, cu.obligatoria, cg.monto
         FROM cuotas_ciclos cc
         JOIN cuotas cu        ON cu.idcuotas = cc.idcuotas AND cu.activo = 1
         JOIN cuotas_grados cg ON cg.idcuotas_ciclos = cc.idcuotas_ciclos AND cg.idgrados = ?
        WHERE cc.ciclo = ?
        ORDER BY cu.orden, cu.cuota`,
      [idgrados, ciclo]
    );
    return rows;
  },

  // ─── Cargos ──────────────────────────────────────────────────
  /** Cargos de la inscripción con los datos del pago activo que los liquidó. */
  async cargos(idinscripciones, conn = pool) {
    const [rows] = await conn.query(
      `SELECT ${CARGO_COLS},
              pg.idpagos, pg.numero AS recibo, DATE_FORMAT(pg.fecha_pago, '%Y-%m-%d') AS fecha_pago,
              pd.mora AS mora_pagada, pd.mora_exonerada, pd.total AS total_pagado
         FROM inscripciones_cargos ic
         JOIN cuotas_ciclos cc ON cc.idcuotas_ciclos = ic.idcuotas_ciclos
         JOIN cuotas cu        ON cu.idcuotas = cc.idcuotas
         LEFT JOIN (pagos_detalle pd JOIN pagos pg ON pg.idpagos = pd.idpagos AND pg.estado = 'Activo')
                ON pd.idinscripciones_cargos = ic.idinscripciones_cargos
        WHERE ic.idinscripciones = ?
        ORDER BY ic.fecha_vencimiento, cu.orden, ic.numero_cobro`,
      [idinscripciones]
    );
    return rows;
  },

  async findCargo(id, conn = pool) {
    const [rows] = await conn.query(
      `SELECT ${CARGO_COLS}
         FROM inscripciones_cargos ic
         JOIN cuotas_ciclos cc ON cc.idcuotas_ciclos = ic.idcuotas_ciclos
         JOIN cuotas cu        ON cu.idcuotas = cc.idcuotas
        WHERE ic.idinscripciones_cargos = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async insertarCargos(conn, idinscripciones, cargos) {
    if (!cargos.length) return;
    await conn.query(
      `INSERT INTO inscripciones_cargos
         (idinscripciones, idcuotas_ciclos, numero_cobro, concepto, fecha_vencimiento, monto, mora_tipo, mora_valor)
       VALUES ?`,
      [cargos.map(c => [idinscripciones, c.idcuotas_ciclos, c.numero_cobro, c.concepto, c.fecha_vencimiento, c.monto, c.mora_tipo, c.mora_valor])]
    );
  },

  async anularCargo(id, motivo) {
    await pool.query(
      `UPDATE inscripciones_cargos SET estado = 'Anulado', motivo_anulacion = ? WHERE idinscripciones_cargos = ? AND estado = 'Pendiente'`,
      [motivo, id]
    );
  },

  async restaurarCargo(id) {
    await pool.query(
      `UPDATE inscripciones_cargos SET estado = 'Pendiente', motivo_anulacion = NULL WHERE idinscripciones_cargos = ? AND estado = 'Anulado'`,
      [id]
    );
  },

  async tienePagos(idinscripciones, conn = pool) {
    const [rows] = await conn.query(
      `SELECT 1 FROM inscripciones_cargos WHERE idinscripciones = ? AND estado = 'Pagado' LIMIT 1`,
      [idinscripciones]
    );
    return rows.length > 0;
  },
};

module.exports = InscripcionModel;

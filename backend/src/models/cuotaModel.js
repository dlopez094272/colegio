const { pool } = require('../config/database');

/**
 * Cuotas:
 *   cuotas          → catálogo global (Inscripción, Mensualidad, Bus...).
 *   cuotas_ciclos   → configuración de la cuota en un ciclo (fechas, día límite, mora).
 *   cuotas_grados   → monto de esa configuración en cada grado. Sin fila = no aplica.
 */
// Fechas como 'YYYY-MM-DD' (sin pasar por Date/zona horaria).
const CC_COLS = `cc.idcuotas_ciclos, cc.idcuotas, cc.ciclo,
  DATE_FORMAT(cc.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
  DATE_FORMAT(cc.fecha_fin, '%Y-%m-%d') AS fecha_fin,
  cc.dia_limite, cc.mora_tipo, cc.mora_valor`;

const CuotaModel = {
  // ─── Catálogo ──────────────────────────────────────────────
  async getAll(soloActivos = false) {
    const [rows] = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM cuotas_ciclos cc WHERE cc.idcuotas = c.idcuotas) AS total_ciclos
         FROM cuotas c
        ${soloActivos ? 'WHERE c.activo = 1' : ''}
        ORDER BY c.orden, c.cuota`
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM cuotas WHERE idcuotas = ?', [id]);
    return rows[0] || null;
  },

  async existeNombre(cuota, excludeId = null) {
    const [rows] = await pool.query(
      `SELECT 1 FROM cuotas WHERE cuota = ? ${excludeId ? 'AND idcuotas <> ?' : ''} LIMIT 1`,
      excludeId ? [cuota, excludeId] : [cuota]
    );
    return rows.length > 0;
  },

  async enUso(id) {
    const [rows] = await pool.query('SELECT 1 FROM cuotas_ciclos WHERE idcuotas = ? LIMIT 1', [id]);
    return rows.length > 0;
  },

  async siguienteOrden() {
    const [[r]] = await pool.query('SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM cuotas');
    return r.n;
  },

  async create(data) {
    const [r] = await pool.query('INSERT INTO cuotas SET ?', [data]);
    return r.insertId;
  },

  async update(id, data) {
    await pool.query('UPDATE cuotas SET ? WHERE idcuotas = ?', [data, id]);
  },

  async delete(id) {
    await pool.query('DELETE FROM cuotas WHERE idcuotas = ?', [id]);
  },

  // ─── Ciclos ────────────────────────────────────────────────
  /** Ciclos que tienen cuotas configuradas, con cuántas cuotas tiene cada uno. */
  async ciclos() {
    const [rows] = await pool.query(
      'SELECT ciclo, COUNT(*) AS cuotas FROM cuotas_ciclos GROUP BY ciclo ORDER BY ciclo DESC'
    );
    return rows;
  },

  /** Configuración de cuotas del ciclo (con datos del catálogo) y sus montos por grado. */
  async ciclo(ciclo) {
    const [[config], [montos]] = await Promise.all([
      pool.query(
        `SELECT ${CC_COLS}, c.cuota, c.periodicidad, c.obligatoria, c.activo AS cuota_activa,
                (SELECT COUNT(*) FROM cuotas_grados cg WHERE cg.idcuotas_ciclos = cc.idcuotas_ciclos) AS total_grados
           FROM cuotas_ciclos cc
           JOIN cuotas c ON c.idcuotas = cc.idcuotas
          WHERE cc.ciclo = ?
          ORDER BY c.orden, c.cuota`,
        [ciclo]
      ),
      pool.query(
        `SELECT cg.idcuotas_ciclos, cg.idgrados, cg.monto
           FROM cuotas_grados cg
           JOIN cuotas_ciclos cc ON cc.idcuotas_ciclos = cg.idcuotas_ciclos
          WHERE cc.ciclo = ?`,
        [ciclo]
      ),
    ]);
    return { cuotas: config, montos };
  },

  /** Grados con su nivel/carrera en el orden de la estructura académica. */
  async grados() {
    const [rows] = await pool.query(
      `SELECT g.idgrados, g.grado, g.idniveles, n.nivel, g.idcarreras, c.carrera,
              (g.activo AND n.activo AND COALESCE(c.activo, 1)) AS activo
         FROM grados g
         JOIN niveles n ON n.idniveles = g.idniveles
         LEFT JOIN carreras c ON c.idcarreras = g.idcarreras
        ORDER BY n.orden, n.nivel, c.orden, c.carrera, g.orden, g.grado`
    );
    return rows;
  },

  async findConfig(id, conn = pool) {
    const [rows] = await conn.query(
      `SELECT ${CC_COLS}, c.cuota, c.periodicidad
         FROM cuotas_ciclos cc JOIN cuotas c ON c.idcuotas = cc.idcuotas
        WHERE cc.idcuotas_ciclos = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async configsDeCiclo(ciclo, conn = pool) {
    const [rows] = await conn.query(
      `SELECT ${CC_COLS}, c.cuota, c.activo AS cuota_activa
         FROM cuotas_ciclos cc JOIN cuotas c ON c.idcuotas = cc.idcuotas
        WHERE cc.ciclo = ?`,
      [ciclo]
    );
    return rows;
  },

  async createConfig(data, conn = pool) {
    const [r] = await conn.query('INSERT INTO cuotas_ciclos SET ?', [data]);
    return r.insertId;
  },

  async updateConfig(id, data) {
    await pool.query('UPDATE cuotas_ciclos SET ? WHERE idcuotas_ciclos = ?', [data, id]);
  },

  /** Estudiantes inscritos con cobros de esta configuración (impide quitarla del ciclo). */
  async configEnUso(id) {
    const [[r]] = await pool.query('SELECT COUNT(DISTINCT idinscripciones) AS n FROM inscripciones_cargos WHERE idcuotas_ciclos = ?', [id]);
    return Number(r.n);
  },

  /** Borra la configuración; sus montos por grado se van por ON DELETE CASCADE. */
  async deleteConfig(id) {
    await pool.query('DELETE FROM cuotas_ciclos WHERE idcuotas_ciclos = ?', [id]);
  },

  // ─── Montos por grado ──────────────────────────────────────
  async montosDeConfigs(ids, conn = pool) {
    if (!ids.length) return [];
    const [rows] = await conn.query(
      'SELECT idcuotas_ciclos, idgrados, monto FROM cuotas_grados WHERE idcuotas_ciclos IN (?)',
      [ids]
    );
    return rows;
  },

  async setMonto(idcuotasCiclos, idgrados, monto, conn) {
    await conn.query(
      `INSERT INTO cuotas_grados (idcuotas_ciclos, idgrados, monto) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE monto = VALUES(monto)`,
      [idcuotasCiclos, idgrados, monto]
    );
  },

  async quitarMonto(idcuotasCiclos, idgrados, conn) {
    await conn.query('DELETE FROM cuotas_grados WHERE idcuotas_ciclos = ? AND idgrados = ?', [idcuotasCiclos, idgrados]);
  },

  async insertarMontos(filas, conn) {
    if (!filas.length) return;
    await conn.query('INSERT INTO cuotas_grados (idcuotas_ciclos, idgrados, monto) VALUES ?', [filas]);
  },
};

module.exports = CuotaModel;

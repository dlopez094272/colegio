const { pool } = require('../config/database');

const EstadoCivilModel = {
  async getAll({ incluirInactivos = false } = {}) {
    const [rows] = await pool.query(
      `SELECT ec.idestados_civiles, ec.estado_civil, ec.activo,
              (SELECT COUNT(*) FROM padres p WHERE p.idestados_civiles = ec.idestados_civiles) AS total_padres,
              (SELECT COUNT(*) FROM docentes d WHERE d.idestados_civiles = ec.idestados_civiles) AS total_docentes
         FROM estados_civiles ec
        ${incluirInactivos ? '' : 'WHERE ec.activo = 1'}
        ORDER BY ec.estado_civil`
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM estados_civiles WHERE idestados_civiles = ?', [id]);
    return rows[0] || null;
  },

  async nombreExiste(estado_civil, excludeId = null) {
    const [rows] = await pool.query(
      `SELECT 1 FROM estados_civiles WHERE estado_civil = ? ${excludeId ? 'AND idestados_civiles <> ?' : ''} LIMIT 1`,
      excludeId ? [estado_civil, excludeId] : [estado_civil]
    );
    return rows.length > 0;
  },

  async enUso(id) {
    const [rows] = await pool.query(
      `SELECT 1 FROM padres WHERE idestados_civiles = ?
        UNION ALL SELECT 1 FROM docentes WHERE idestados_civiles = ? LIMIT 1`,
      [id, id]
    );
    return rows.length > 0;
  },

  async create({ estado_civil, activo = 1 }) {
    const [r] = await pool.query(
      'INSERT INTO estados_civiles (estado_civil, activo) VALUES (?, ?)',
      [estado_civil, activo ? 1 : 0]
    );
    return r.insertId;
  },

  async update(id, { estado_civil, activo }) {
    await pool.query(
      'UPDATE estados_civiles SET estado_civil = ?, activo = ? WHERE idestados_civiles = ?',
      [estado_civil, activo ? 1 : 0, id]
    );
  },

  async delete(id) {
    await pool.query('DELETE FROM estados_civiles WHERE idestados_civiles = ?', [id]);
  },
};

module.exports = EstadoCivilModel;

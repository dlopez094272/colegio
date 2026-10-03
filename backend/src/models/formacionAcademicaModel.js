const { pool } = require('../config/database');

const FormacionAcademicaModel = {
  async getAll({ incluirInactivos = false } = {}) {
    const [rows] = await pool.query(
      `SELECT fa.idformaciones_academicas, fa.formacion, fa.activo,
              (SELECT COUNT(*) FROM docentes_formaciones df WHERE df.idformaciones_academicas = fa.idformaciones_academicas) AS total_docentes
         FROM formaciones_academicas fa
        ${incluirInactivos ? '' : 'WHERE fa.activo = 1'}
        ORDER BY fa.formacion`
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM formaciones_academicas WHERE idformaciones_academicas = ?', [id]);
    return rows[0] || null;
  },

  async findManyByIds(ids) {
    if (!ids.length) return [];
    const [rows] = await pool.query(
      `SELECT * FROM formaciones_academicas WHERE idformaciones_academicas IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    return rows;
  },

  async nombreExiste(formacion, excludeId = null) {
    const [rows] = await pool.query(
      `SELECT 1 FROM formaciones_academicas WHERE formacion = ? ${excludeId ? 'AND idformaciones_academicas <> ?' : ''} LIMIT 1`,
      excludeId ? [formacion, excludeId] : [formacion]
    );
    return rows.length > 0;
  },

  async enUso(id) {
    const [rows] = await pool.query('SELECT 1 FROM docentes_formaciones WHERE idformaciones_academicas = ? LIMIT 1', [id]);
    return rows.length > 0;
  },

  async create({ formacion, activo = 1 }) {
    const [r] = await pool.query(
      'INSERT INTO formaciones_academicas (formacion, activo) VALUES (?, ?)',
      [formacion, activo ? 1 : 0]
    );
    return r.insertId;
  },

  async update(id, { formacion, activo }) {
    await pool.query(
      'UPDATE formaciones_academicas SET formacion = ?, activo = ? WHERE idformaciones_academicas = ?',
      [formacion, activo ? 1 : 0, id]
    );
  },

  async delete(id) {
    await pool.query('DELETE FROM formaciones_academicas WHERE idformaciones_academicas = ?', [id]);
  },
};

module.exports = FormacionAcademicaModel;

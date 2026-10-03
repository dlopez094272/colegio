const { pool } = require('../config/database');

const CategoriaArchivoModel = {
  async getAll({ incluirInactivos = false } = {}) {
    const [rows] = await pool.query(
      `SELECT ca.idcategorias_archivos, ca.categoria, ca.activo,
              (SELECT COUNT(*) FROM estudiantes_archivos ea WHERE ea.idcategorias_archivos = ca.idcategorias_archivos) AS total_archivos
         FROM categorias_archivos ca
        ${incluirInactivos ? '' : 'WHERE ca.activo = 1'}
        ORDER BY ca.categoria`
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM categorias_archivos WHERE idcategorias_archivos = ?', [id]);
    return rows[0] || null;
  },

  async nombreExiste(categoria, excludeId = null) {
    const [rows] = await pool.query(
      `SELECT 1 FROM categorias_archivos WHERE categoria = ? ${excludeId ? 'AND idcategorias_archivos <> ?' : ''} LIMIT 1`,
      excludeId ? [categoria, excludeId] : [categoria]
    );
    return rows.length > 0;
  },

  async enUso(id) {
    const [rows] = await pool.query('SELECT 1 FROM estudiantes_archivos WHERE idcategorias_archivos = ? LIMIT 1', [id]);
    return rows.length > 0;
  },

  async create({ categoria, activo = 1 }) {
    const [r] = await pool.query(
      'INSERT INTO categorias_archivos (categoria, activo) VALUES (?, ?)',
      [categoria, activo ? 1 : 0]
    );
    return r.insertId;
  },

  async update(id, { categoria, activo }) {
    await pool.query(
      'UPDATE categorias_archivos SET categoria = ?, activo = ? WHERE idcategorias_archivos = ?',
      [categoria, activo ? 1 : 0, id]
    );
  },

  async delete(id) {
    await pool.query('DELETE FROM categorias_archivos WHERE idcategorias_archivos = ?', [id]);
  },
};

module.exports = CategoriaArchivoModel;

const { pool } = require('../config/database');

const SELECT = `
  SELECT ea.idestudiantes_archivos, ea.idestudiantes, ea.idcategorias_archivos, ca.categoria,
         ea.nombre_original, ea.archivo, ea.mime, ea.tamano, ea.observaciones,
         ea.fecha_creacion, u.nombre_completo AS usuario_registro
    FROM estudiantes_archivos ea
    JOIN categorias_archivos ca ON ca.idcategorias_archivos = ea.idcategorias_archivos
    LEFT JOIN usuarios u ON u.idusuarios = ea.idusuarios`;

const EstudianteArchivoModel = {
  async getByEstudiante(idestudiantes) {
    const [rows] = await pool.query(
      `${SELECT} WHERE ea.idestudiantes = ? ORDER BY ca.categoria, ea.fecha_creacion DESC`,
      [idestudiantes]
    );
    return rows;
  },

  async findById(idestudiantes, id) {
    const [rows] = await pool.query(
      `${SELECT} WHERE ea.idestudiantes = ? AND ea.idestudiantes_archivos = ?`,
      [idestudiantes, id]
    );
    return rows[0] || null;
  },

  async create({ idestudiantes, idcategorias_archivos, nombre_original, archivo, mime, tamano, observaciones }, idusuarios) {
    const [r] = await pool.query(
      `INSERT INTO estudiantes_archivos
         (idestudiantes, idcategorias_archivos, nombre_original, archivo, mime, tamano, observaciones, idusuarios)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [idestudiantes, idcategorias_archivos, nombre_original, archivo, mime, tamano, observaciones || null, idusuarios ?? null]
    );
    return r.insertId;
  },

  async delete(id) {
    await pool.query('DELETE FROM estudiantes_archivos WHERE idestudiantes_archivos = ?', [id]);
  },
};

module.exports = EstudianteArchivoModel;

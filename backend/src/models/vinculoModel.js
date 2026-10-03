const { pool } = require('../config/database');
const { sqlNombre } = require('../utils/persona');

// Relación N:M estudiantes ↔ padres de familia (tabla estudiantes_padres).
const VinculoModel = {
  /** Estudiantes vinculados a un padre, con su parentesco. */
  async getEstudiantesDePadre(idpadres, conn = pool) {
    const [rows] = await conn.query(
      `SELECT e.idestudiantes AS id, e.idestudiantes, ${sqlNombre('e')} AS nombre_completo,
              e.primer_nombre, e.segundo_nombre, e.primer_apellido, e.segundo_apellido,
              e.dpi, DATE_FORMAT(e.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
              TIMESTAMPDIFF(YEAR, e.fecha_nacimiento, CURDATE()) AS edad,
              e.telefono_celular, e.foto, e.activo, v.parentesco
         FROM estudiantes_padres v
         JOIN estudiantes e ON e.idestudiantes = v.idestudiantes
        WHERE v.idpadres = ?
        ORDER BY e.primer_apellido, e.primer_nombre`,
      [idpadres]
    );
    return rows;
  },

  /** Padres vinculados a un estudiante, con su parentesco. */
  async getPadresDeEstudiante(idestudiantes, conn = pool) {
    const [rows] = await conn.query(
      `SELECT p.idpadres AS id, p.idpadres, ${sqlNombre('p')} AS nombre_completo,
              p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido,
              p.dpi, p.nit, p.telefono_celular, p.telefono_casa, p.activo, v.parentesco
         FROM estudiantes_padres v
         JOIN padres p ON p.idpadres = v.idpadres
        WHERE v.idestudiantes = ?
        ORDER BY FIELD(v.parentesco, 'Padre', 'Madre', 'Tutor', 'Otro'), p.primer_apellido`,
      [idestudiantes]
    );
    return rows;
  },

  async vincular(conn, idestudiantes, idpadres, parentesco) {
    await conn.query(
      `INSERT INTO estudiantes_padres (idestudiantes, idpadres, parentesco) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE parentesco = VALUES(parentesco)`,
      [idestudiantes, idpadres, parentesco]
    );
  },

  async desvincular(conn, idestudiantes, idpadres) {
    await conn.query('DELETE FROM estudiantes_padres WHERE idestudiantes = ? AND idpadres = ?', [idestudiantes, idpadres]);
  },
};

module.exports = VinculoModel;

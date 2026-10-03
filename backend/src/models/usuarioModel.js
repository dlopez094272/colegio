const { pool } = require('../config/database');

const UsuarioModel = {
  // Clave primaria es idusuarios, campo de login es codigo
  async findByCodigo(codigo) {
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE codigo = ?', [codigo]);
    return rows[0];
  },
  // Login: el usuario puede identificarse con su código o su correo electrónico
  async findByCodigoOrEmail(identificador) {
    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE codigo = ? OR email = ? LIMIT 1',
      [identificador, identificador]
    );
    return rows[0];
  },
  async findById(idusuarios) {
    const [rows] = await pool.query(
      `SELECT idusuarios,
              codigo,
              nombre_completo,
              COALESCE(activo, 1) AS activo,
              COALESCE(primer, 0) AS primer
       FROM usuarios
       WHERE idusuarios = ?`,
      [idusuarios]
    );
    return rows[0];
  },
};

module.exports = UsuarioModel;

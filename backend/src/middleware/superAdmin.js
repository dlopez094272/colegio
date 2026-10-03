const { pool } = require('../config/database');

async function superAdminMiddleware(req, res, next) {
  try {
    const codigo = req.user?.codigo;
    if (!codigo) return res.status(403).json({ message: 'Acceso denegado: token inválido' });

    const [rows] = await pool.query(
      'SELECT 1 FROM seguridad_ugmembers WHERE UserName = ? AND GroupID = -1 LIMIT 1',
      [codigo]
    );

    if (rows.length === 0) {
      return res.status(403).json({
        message: `Acceso denegado: el usuario "${codigo}" no pertenece al grupo Super Administrador (GroupID = -1). Ejecuta el SQL: INSERT INTO seguridad_ugmembers (UserName, GroupID) VALUES ('${codigo}', -1);`,
      });
    }
    next();
  } catch (err) {
    // La tabla seguridad_ugmembers puede no existir si el SQL de migración no se ejecutó
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        message: 'Las tablas de seguridad no existen. Ejecuta el script: database/security_schema.sql en tu base de datos.',
      });
    }
    next(err);
  }
}

module.exports = superAdminMiddleware;

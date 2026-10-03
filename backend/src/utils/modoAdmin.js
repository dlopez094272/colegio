const SeguridadModel = require('../models/seguridadModel');
const { pool } = require('../config/database');

// Verifica si el usuario tiene el bit 'M' (modo admin) sobre la tabla indicada.
// Con modo admin, el usuario ve todos los registros del módulo; sin él, solo
// los que él mismo creó (filtro aplicado en el modelo correspondiente).
async function tieneModoAdmin(req, tabla) {
  if (req.user?.isSuperAdmin) return true;
  const codigo = req.user?.codigo;
  if (!codigo) return false;
  const groupIds = await SeguridadModel.getMembersByUser(codigo);
  if (!groupIds.length) return false;
  const placeholders = groupIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT 1 FROM seguridad_ugrights
     WHERE TableName = ? AND GroupID IN (${placeholders})
       AND AccessMask LIKE '%M%' LIMIT 1`,
    [tabla, ...groupIds]
  );
  return rows.length > 0;
}

module.exports = { tieneModoAdmin };

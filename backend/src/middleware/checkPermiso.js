const { pool } = require('../config/database');
const SeguridadModel = require('../models/seguridadModel');

/**
 * Verifica si un usuario (por código) tiene el acceso requerido sobre una
 * tabla. SuperAdmin (GroupID = -1) siempre tiene acceso total. Reutilizable
 * fuera del pipeline de middleware (ej. validar una acción dentro de un
 * controlador, no solo al entrar a una ruta).
 * @param {string} codigo     - código del usuario autenticado
 * @param {string} tableName  - nombre de la tabla en seguridad_ugrights
 * @param {string} access     - letra de acceso requerida: S, A, E, D, P, I, M
 */
async function tienePermiso(codigo, tableName, access = 'S') {
  if (!codigo) return false;

  const isSA = await SeguridadModel.isSuperAdmin(codigo);
  if (isSA) return true;

  const groupIds = await SeguridadModel.getMembersByUser(codigo);
  if (!groupIds.length) return false;

  const placeholders = groupIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT 1 FROM seguridad_ugrights
     WHERE TableName = ? AND GroupID IN (${placeholders})
       AND AccessMask LIKE CONCAT('%', ?, '%')
     LIMIT 1`,
    [tableName, ...groupIds, access]
  );
  return rows.length > 0;
}

/**
 * Middleware factory: verifica que el usuario tenga el acceso requerido
 * sobre una tabla. SuperAdmin (GroupID = -1) siempre tiene acceso total.
 * @param {string} tableName  - nombre de la tabla en seguridad_ugrights
 * @param {string} access     - letra de acceso requerida: S, A, E, D, P, I, M
 */
function checkPermiso(tableName, access = 'S') {
  return async (req, res, next) => {
    try {
      const codigo = req.user?.codigo;
      if (!codigo) return res.status(401).json({ message: 'Token inválido' });

      const ok = await tienePermiso(codigo, tableName, access);
      if (!ok) {
        return res.status(403).json({ message: `Sin permiso "${access}" sobre "${tableName}".` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware factory: aprueba si el usuario tiene el acceso requerido sobre
 * CUALQUIERA de las tablas indicadas. Útil cuando una misma acción puede
 * ejecutarla más de un rol con permisos independientes (ej. marcar un ítem
 * de Comandas como "Listo/Entregado" lo hace tanto el mesero como cocina,
 * sin que uno dependa del permiso del otro).
 * @param {[string, string][]} pares - lista de [tableName, access]
 */
function cpAny(pares) {
  return async (req, res, next) => {
    try {
      const codigo = req.user?.codigo;
      if (!codigo) return res.status(401).json({ message: 'Token inválido' });

      for (const [tableName, access] of pares) {
        if (await tienePermiso(codigo, tableName, access)) return next();
      }
      return res.status(403).json({ message: `Sin permiso sobre ${pares.map(([t, a]) => `"${t}" (${a})`).join(' o ')}.` });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = checkPermiso;
module.exports.tienePermiso = tienePermiso;
module.exports.cpAny = cpAny;

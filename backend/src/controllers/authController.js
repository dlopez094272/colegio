const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const UsuarioModel         = require('../models/usuarioModel');
const SeguridadModel       = require('../models/seguridadModel');
const { getCurrentTenant } = require('../config/tenantContext');
const { pool }             = require('../config/database');

// La PK de usuarios siempre es idusuarios (nunca "id").
// El secreto es por tenant: evita que un token de un colegio sea válido en otro
// cuando coinciden ids de usuario (ej. ambos con idusuarios=1 de administrador).
function buildToken(usuario, isSuperAdmin = false) {
  return jwt.sign(
    {
      id:     usuario.idusuarios,
      codigo: usuario.codigo,
      nombre: usuario.nombre_completo || usuario.codigo,
      primer: !!(usuario.primer),
      isSuperAdmin,
    },
    getCurrentTenant().jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

function safeUsuario(u, isSuperAdmin = false) {
  return {
    id:     u.idusuarios,
    codigo: u.codigo,
    nombre: u.nombre_completo || u.codigo,
    primer: !!(u.primer),
    isSuperAdmin,
  };
}

async function esSuperAdmin(codigo) {
  try {
    return await SeguridadModel.isSuperAdmin(codigo);
  } catch (_) {
    return false; // tablas de seguridad aún no creadas
  }
}

// Valida credenciales; devuelve { usuario } o { status, message } si falla.
async function validarCredenciales(codigo, password) {
  if (!codigo || !password) return { status: 400, message: 'Usuario y contraseña requeridos' };

  // "codigo" acepta tanto el código de usuario como su correo electrónico
  const usuario = await UsuarioModel.findByCodigoOrEmail(codigo);
  if (!usuario) return { status: 401, message: 'Credenciales inválidas' };

  const estaActivo = usuario.activo === 1 || usuario.activo === true || usuario.activo === '1';
  if (!estaActivo) return { status: 401, message: 'Usuario inactivo. Contacte al administrador.' };

  const valid = await bcrypt.compare(password, usuario.password);
  if (!valid) return { status: 401, message: 'Credenciales inválidas' };

  return { usuario };
}

const authController = {
  async login(req, res, next) {
    try {
      const { codigo, password } = req.body;
      const r = await validarCredenciales(codigo, password);
      if (!r.usuario) return res.status(r.status).json({ message: r.message });

      const isSuperAdmin = await esSuperAdmin(r.usuario.codigo);
      res.json({
        success: true,
        token:   buildToken(r.usuario, isSuperAdmin),
        usuario: safeUsuario(r.usuario, isSuperAdmin),
      });
    } catch (err) {
      next(err);
    }
  },

  async me(req, res, next) {
    try {
      const usuario = await UsuarioModel.findById(req.user.id);
      if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
      res.json({ success: true, usuario: safeUsuario(usuario, !!req.user.isSuperAdmin) });
    } catch (err) {
      next(err);
    }
  },

  // Devuelve los permisos agregados del usuario actual por tabla
  async myPermissions(req, res, next) {
    try {
      const codigo = req.user?.codigo;

      if (await SeguridadModel.isSuperAdmin(codigo)) {
        return res.json({ success: true, isSuperAdmin: true, permissions: {} });
      }

      const groupIds = await SeguridadModel.getMembersByUser(codigo);
      if (!groupIds.length) {
        return res.json({ success: true, isSuperAdmin: false, permissions: {} });
      }

      const placeholders = groupIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT TableName, GROUP_CONCAT(AccessMask SEPARATOR '') AS mask
         FROM seguridad_ugrights
         WHERE GroupID IN (${placeholders})
         GROUP BY TableName`,
        groupIds
      );

      const permissions = {};
      rows.forEach(r => {
        permissions[r.TableName] = [...new Set((r.mask || '').split(''))].join('');
      });

      res.json({ success: true, isSuperAdmin: false, permissions });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = authController;
module.exports.buildToken = buildToken;

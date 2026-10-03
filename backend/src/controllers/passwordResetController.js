const crypto             = require('crypto');
const UsuarioCrudModel   = require('../models/usuarioCrudModel');
const UsuarioModel       = require('../models/usuarioModel');
const SeguridadModel     = require('../models/seguridadModel');
const { pool }           = require('../config/database');
const { sendMail }       = require('../config/mailer');
const { getCurrentTenant } = require('../config/tenantContext');
const { buildToken }     = require('./authController');

const passwordResetController = {
  // Solicitar restablecimiento (envía email). Acepta correo o código de usuario.
  async requestReset(req, res, next) {
    try {
      const identificador = (req.body.identificador || req.body.email || req.body.codigo || '').trim();
      if (!identificador) return res.status(400).json({ message: 'Correo o código de usuario requerido' });

      const [rows] = await pool.query(
        'SELECT idusuarios, codigo, nombre_completo, email FROM usuarios WHERE (email=? OR codigo=?) AND activo=1 LIMIT 1',
        [identificador, identificador]
      );
      // Respuesta ambigua por seguridad (no revelar si el usuario/correo existe)
      const ok = { success: true, message: 'Si el usuario existe, recibirás instrucciones en su correo registrado' };
      if (!rows[0] || !rows[0].email) return res.json(ok);

      const token = crypto.randomBytes(32).toString('hex');
      await UsuarioCrudModel.setToken(rows[0].codigo, token);

      // Enlace construido a partir del dominio real desde el que llegó la
      // solicitud: cada colegio (tenant) tiene su propio dominio en producción.
      // El build de Angular en producción se sirve bajo /app/; en local
      // (tenant "dev") el frontend corre en ng serve sobre la raíz.
      const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
      const basePath = getCurrentTenant()?.slug === 'dev' ? '' : '/app';
      const link = `${origin}${basePath}/reset-password?token=${token}`;

      await sendMail({
        to:      rows[0].email,
        subject: 'Gestión Escolar — Restablecer contraseña',
        html:    resetEmailHtml(rows[0].nombre_completo || rows[0].codigo, link, rows[0].codigo),
      });
      res.json(ok);
    } catch (err) { next(err); }
  },

  // Verificar que el token es válido
  async verifyToken(req, res, next) {
    try {
      const usuario = await UsuarioCrudModel.findByToken(req.params.token);
      if (!usuario) return res.status(400).json({ valid: false, message: 'El enlace ha expirado o no es válido' });
      res.json({ valid: true, codigo: usuario.codigo, nombre: usuario.nombre_completo });
    } catch (err) { next(err); }
  },

  // Establecer nueva contraseña con el token
  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: 'Datos requeridos' });
      if (password.length < 4) return res.status(400).json({ message: 'Contraseña muy corta (mínimo 4 caracteres)' });

      const usuario = await UsuarioCrudModel.findByToken(token);
      if (!usuario) return res.status(400).json({ message: 'El enlace ha expirado. Solicita uno nuevo.' });

      await UsuarioCrudModel.changePassword(usuario.idusuarios, password, true);
      await UsuarioCrudModel.clearToken(usuario.idusuarios);
      res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    } catch (err) { next(err); }
  },

  // Cambio de contraseña obligatorio cuando primer=1 (usuario autenticado)
  async changePrimer(req, res, next) {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 4)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 4 caracteres' });

      await UsuarioCrudModel.changePassword(req.user.id, newPassword, true);

      // Nuevo token con primer=false (conserva el flag de super admin)
      const u = await UsuarioModel.findById(req.user.id);
      const isSuperAdmin = await SeguridadModel.isSuperAdmin(u.codigo);
      res.json({ success: true, token: buildToken(u, isSuperAdmin) });
    } catch (err) { next(err); }
  },
};

function resetEmailHtml(nombre, link, codigo) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background:#F4F2EC; padding:40px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1);">
    <div style="background:linear-gradient(135deg,#2B2A27,#1C1B19);padding:28px 32px;text-align:center;border-bottom:4px solid #D4B24C;">
      <h1 style="color:#E6C766;margin:0;letter-spacing:4px;font-size:22px;">GESTIÓN ESCOLAR</h1>
      <p style="color:rgba(255,255,255,.65);margin:4px 0 0;font-size:11px;letter-spacing:2px;">CONTROL ADMINISTRATIVO</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#22211E;margin-bottom:16px;">Restablecer contraseña</h2>
      <p style="color:#6E6A5E;line-height:1.6;">Hola <strong style="color:#22211E">${nombre}</strong>,<br>
      Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar:</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#D4B24C;color:#22211E;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
          Restablecer contraseña
        </a>
      </div>
      <p style="color:#22211E;background:#F4F2EC;border-radius:8px;padding:12px 16px;font-size:13px;">
        Recuerda que tu código de usuario es: <strong>${codigo}</strong>
      </p>
      <p style="color:#6E6A5E;font-size:12px;line-height:1.6;">
        Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este correo.
      </p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = passwordResetController;

const nodemailer = require('nodemailer');
const ConfiguracionModel = require('../models/configuracionModel');
const { descifrar } = require('../utils/secreto');

// Correo saliente. Cada colegio configura su SMTP en Configuración (tabla
// configuracion, contraseña cifrada); si no lo ha hecho se usa el SMTP del
// .env (el mismo de "olvidé mi contraseña").

const TIEMPOS = { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 };

/** Opciones de transporte desde la configuración del colegio, o null si no está completa. */
function opcionesDesdeConfig(c) {
  if (!c?.smtp_host || !c.smtp_usuario) return null;
  const pass = descifrar(c.smtp_password);
  if (!pass) return null;
  const correo = c.smtp_remitente_email || c.smtp_usuario;
  const nombre = (c.smtp_remitente_nombre || c.nombre || '').replace(/["<>]/g, '');
  return {
    transporte: {
      host: c.smtp_host,
      port: Number(c.smtp_puerto) || (c.smtp_seguro ? 465 : 587),
      secure: !!c.smtp_seguro,
      auth: { user: c.smtp_usuario, pass },
      tls: { rejectUnauthorized: false },
      ...TIEMPOS,
    },
    from: nombre ? `"${nombre}" <${correo}>` : correo,
  };
}

function opcionesDesdeEnv() {
  if (!process.env.SMTP_HOST) return null;
  return {
    transporte: {
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { rejectUnauthorized: false },
      ...TIEMPOS,
    },
    from: process.env.SMTP_FROM,
  };
}

/** ¿Hay un SMTP utilizable (del colegio o del .env)? */
async function correoDisponible() {
  return !!(opcionesDesdeConfig(await ConfiguracionModel.get()) || opcionesDesdeEnv());
}

/**
 * Envía un correo con el SMTP del colegio (o el del .env).
 * `config` permite probar una configuración concreta.
 */
async function sendMail({ to, subject, html, attachments }, config = null) {
  const op = config ? opcionesDesdeConfig(config) : (opcionesDesdeConfig(await ConfiguracionModel.get()) || opcionesDesdeEnv());
  if (!op) throw Object.assign(new Error('El correo saliente no está configurado (Configuración › Correo saliente)'), { status: 409 });
  const transporter = nodemailer.createTransport(op.transporte);
  return transporter.sendMail({ from: op.from, to, subject, html, attachments });
}

module.exports = { sendMail, correoDisponible };

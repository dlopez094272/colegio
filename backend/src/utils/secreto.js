const crypto = require('crypto');
const { getCurrentTenant } = require('../config/tenantContext');

// Cifrado simétrico para secretos guardados en la BD (contraseña SMTP).
// La clave se deriva del jwtSecret del tenant: un respaldo de la BD por sí
// solo no expone la contraseña. Si se cambia el jwtSecret hay que volver a
// ingresar la contraseña en Configuración.

function clave() {
  const base = getCurrentTenant()?.jwtSecret;
  if (!base) throw new Error('El tenant no tiene jwtSecret configurado');
  return crypto.createHash('sha256').update(`smtp:${base}`).digest();
}

/** texto → "iv.tag.cifrado" (base64) */
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const enc = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}

/** Devuelve null si el valor no se puede descifrar (otra clave o dato corrupto). */
function descifrar(valor) {
  if (!valor) return null;
  try {
    const [iv, tag, enc] = valor.split('.').map(s => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', clave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { cifrar, descifrar };

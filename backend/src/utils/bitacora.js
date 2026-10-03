const { pool } = require('../config/database');

/**
 * Registra un evento en la bitácora del sistema.
 * @param {object} opts
 * @param {string}  opts.tabla          - Nombre lógico de la entidad ('productos', 'asociados', ...)
 * @param {number}  opts.idregistro     - PK del registro afectado
 * @param {string}  opts.accion         - CREAR | MODIFICAR | ACTIVAR | INACTIVAR | ELIMINAR | ANULAR
 * @param {string}  [opts.descripcion]  - Texto libre legible
 * @param {object}  [opts.valoresAntes] - Estado anterior (solo en MODIFICAR / INACTIVAR / ACTIVAR)
 * @param {object}  [opts.valoresDespues] - Estado posterior (solo en CREAR / MODIFICAR)
 * @param {object}  opts.req            - Objeto request de Express (para extraer usuario e IP)
 */
async function registrarBitacora({ tabla, idregistro, accion, descripcion = null, valoresAntes = null, valoresDespues = null, req }) {
  try {
    const idusuarios    = req?.user?.id    ?? null;
    const usuarioNombre = req?.user?.nombre ?? null;
    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
             || req?.socket?.remoteAddress
             || req?.connection?.remoteAddress
             || null;

    await pool.query(
      `INSERT INTO sistema_bitacora
         (tabla, idregistro, accion, descripcion, valores_antes, valores_despues, idusuarios, usuario_nombre, ip, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        tabla,
        idregistro,
        accion,
        descripcion ? String(descripcion).substring(0, 255) : null,
        valoresAntes    ? JSON.stringify(valoresAntes)    : null,
        valoresDespues  ? JSON.stringify(valoresDespues)  : null,
        idusuarios,
        usuarioNombre,
        ip,
      ]
    );
  } catch (_) {
    // La bitácora nunca debe bloquear la operación principal
  }
}

module.exports = { registrarBitacora };

const { resolveTenantByHost, runWithTenant } = require('../config/tenantContext');

/**
 * Resuelve el cliente (tenant) según el header Host y deja el resto del
 * request corriendo dentro de su contexto (BD, carpeta de uploads, claves).
 * Debe montarse antes que cualquier ruta o archivo estático.
 */
module.exports = function tenantMiddleware(req, res, next) {
  const tenant = resolveTenantByHost(req.headers.host);
  if (!tenant) {
    return res.status(404).json({ message: `Cliente no configurado para el dominio "${req.headers.host}"` });
  }
  req.tenant = tenant;
  runWithTenant(tenant, next);
};

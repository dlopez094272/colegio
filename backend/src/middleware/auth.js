const jwt = require('jsonwebtoken');
const { getCurrentTenant } = require('../config/tenantContext');

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token requerido' });

  try {
    // Verifica con el secreto del tenant actual: un token emitido para otro
    // cliente nunca valida aquí, aunque comparta id de usuario.
    req.user = jwt.verify(token, getCurrentTenant().jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

module.exports = authMiddleware;

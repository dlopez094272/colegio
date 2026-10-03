const { getStore, getAllTenants, getPoolForTenant } = require('./tenantContext');

// `pool` es un Proxy: cada llamada (pool.query, pool.getConnection, etc.)
// se resuelve en el momento contra el pool del tenant activo (AsyncLocalStorage).
// El middleware de tenant garantiza que siempre haya un contexto activo antes
// de llegar a cualquier modelo, así que nunca se llega aquí sin uno.
const pool = new Proxy(
  {},
  {
    get(_target, prop) {
      const activePool = getStore()?.pool;
      if (!activePool) throw new Error('pool llamado sin contexto de tenant — verifica que tenantMiddleware esté montado');
      const value = activePool[prop];
      return typeof value === 'function' ? value.bind(activePool) : value;
    },
  }
);

// Prueba la conexión de cada tenant definido en tenants.json.
// No depende del .env — las credenciales viven en tenants.json.
async function testConnection() {
  const tenants = getAllTenants();
  if (tenants.length === 0) {
    console.warn('⚠️  tenants.json vacío o no encontrado — sin bases de datos configuradas');
    return;
  }
  for (const tenant of tenants) {
    try {
      const tenantPool = getPoolForTenant(tenant);
      const conn = await tenantPool.getConnection();
      console.log(`✅ MySQL [${tenant.slug}]: OK`);
      conn.release();
    } catch (err) {
      // Solo loguear — no salir del proceso para que los otros tenants sigan funcionando
      console.error(`❌ MySQL [${tenant.slug}]: ${err.message}`);
    }
  }
}

module.exports = { pool, testConnection };

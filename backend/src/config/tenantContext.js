/**
 * Multi-tenant: resuelve qué cliente (BD, carpeta de uploads, claves) le
 * corresponde a cada request según el header Host, y mantiene ese contexto
 * disponible durante toda la vida del request vía AsyncLocalStorage. Esto
 * permite que los modelos sigan usando `pool.query(...)` sin cambios: el
 * `pool` exportado por database.js es un Proxy que lee de este contexto.
 */
const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('fs');
const path = require('path');
const { createMysqlPool } = require('./createMysqlPool');

const TENANTS_FILE = path.join(__dirname, '../../tenants.json');

const als = new AsyncLocalStorage();
const poolCache = new Map(); // slug -> pool mysql2

let tenantsBySlug = {};
let hostToSlug = {};

function loadTenants() {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(TENANTS_FILE, 'utf8'));
  } catch (err) {
    console.warn(`⚠️  No se pudo leer ${TENANTS_FILE}: ${err.message}`);
  }

  tenantsBySlug = {};
  hostToSlug = {};
  for (const [slug, def] of Object.entries(data)) {
    if (slug.startsWith('_') || !Array.isArray(def.hosts)) continue;
    tenantsBySlug[slug] = { slug, ...def };
    for (const host of def.hosts) hostToSlug[host.toLowerCase()] = slug;
  }
}

loadTenants();

function resolveTenantByHost(hostHeader) {
  if (!hostHeader) return null;
  // Quitar puerto (ej. "tecnocell.smabigt.com:443" → "tecnocell.smabigt.com")
  const host = hostHeader.toLowerCase().split(':')[0];
  const slug = hostToSlug[host];
  return slug ? tenantsBySlug[slug] : null;
}

function getPoolForTenant(tenant) {
  let pool = poolCache.get(tenant.slug);
  if (!pool) {
    pool = createMysqlPool(tenant.db);
    poolCache.set(tenant.slug, pool);
  }
  return pool;
}

function runWithTenant(tenant, fn) {
  return als.run({ tenant, pool: getPoolForTenant(tenant) }, fn);
}

function getStore() {
  return als.getStore();
}

function getCurrentTenant() {
  return als.getStore()?.tenant ?? null;
}

function getAllTenants() {
  return Object.values(tenantsBySlug);
}

module.exports = {
  loadTenants,
  resolveTenantByHost,
  runWithTenant,
  getStore,
  getCurrentTenant,
  getAllTenants,
  getPoolForTenant,
};

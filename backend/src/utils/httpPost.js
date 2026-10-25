const https = require('https');
const http  = require('http');

// Peticiones a servicios externos (certificador FEL, consulta de NIT).
// Responde el JSON ya interpretado o el texto tal cual si no es JSON.

const TIMEOUT_MS = 30000;

function buildMultipart(fields) {
  const boundary = '----ColegioFELBoundary' + Date.now();
  const parts = Object.entries(fields).map(([name, value]) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value ?? '')}`);
  const body = Buffer.from(parts.join('\r\n') + `\r\n--${boundary}--\r\n`, 'utf8');
  return { contentType: `multipart/form-data; boundary=${boundary}`, body };
}

function request(method, url, reqHeaders, body = null) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error(`URL inválida: ${url}`)); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method,
      headers:  body ? { ...reqHeaders, 'Content-Length': body.length } : reqHeaders,
      timeout:  TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Sin respuesta de ${u.hostname} (${TIMEOUT_MS / 1000}s)`)); });
    if (body) req.write(body);
    req.end();
  });
}

async function postJson(url, data, extraHeaders = {}) {
  const r = await request('POST', url, { 'Content-Type': 'application/json', 'Accept': 'application/json', ...extraHeaders },
    Buffer.from(JSON.stringify(data), 'utf8'));
  return r.data;
}

async function postForm(url, fields, extraHeaders = {}) {
  const { contentType, body } = buildMultipart(fields);
  const r = await request('POST', url, { 'Content-Type': contentType, ...extraHeaders }, body);
  return r.data;
}

/** GET → { status, data } */
function getJson(url, headers = {}) {
  return request('GET', url, { 'Accept': 'application/json', ...headers });
}

module.exports = { postJson, postForm, getJson };

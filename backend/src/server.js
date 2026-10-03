// Fijar zona horaria de Guatemala ANTES de cualquier operación de fecha.
// Guatemala usa UTC-6 sin horario de verano (America/Guatemala).
process.env.TZ = 'America/Guatemala';

// Evitar que errores async no capturados maten el proceso.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { testConnection } = require('./config/database');
const tenantMiddleware = require('./middleware/tenant');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Producción: backend/public/browser (copiado del build Angular).
// Dev local: sobreescribir en .env → ANGULAR_DIST_DIR=../../frontend/dist/frontend/browser
const ANGULAR_DIST_DIR = process.env.ANGULAR_DIST_DIR
  ? path.resolve(__dirname, process.env.ANGULAR_DIST_DIR)
  : path.join(__dirname, '../public/browser');

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:4200').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    // Permite: sin origin (Postman / mismo origen) y orígenes configurados.
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error('CORS: origin no permitido'));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());

// Multi-tenant: resuelve el colegio según el header Host y deja el resto del
// request corriendo dentro de su contexto (BD propia vía el pool Proxy en
// config/database.js). Debe ir antes de cualquier estático o ruta.
app.use(tenantMiddleware);

// Archivos subidos (fotos de estudiantes) — aislados por carpeta de tenant.
// Los nombres son aleatorios (no derivables del id del estudiante).
const UPLOADS_ROOT = path.join(__dirname, '../public/files');
const filesStatic = new Map();
app.use('/files', (req, res, next) => {
  const dir = path.join(UPLOADS_ROOT, req.tenant.uploadsDir || '');
  if (!filesStatic.has(dir)) filesStatic.set(dir, express.static(dir, { maxAge: '30d', index: false }));
  filesStatic.get(dir)(req, res, next);
});

// App Angular — un solo build compartido por todos los colegios, servido en /app
// (build con `ng build --base-href /app/`).
// index.html → no-cache; bundles con hash → 1 año inmutable.
const angularStatic = express.static(ANGULAR_DIST_DIR, {
  setHeaders(res, filePath) {
    if (path.basename(filePath) === 'index.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
});
app.use('/app', angularStatic);
app.get('/app/*', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(ANGULAR_DIST_DIR, 'index.html'), (err) => { if (err) next(err); });
});

// Seguridad / autenticación
app.use('/api/auth',             require('./routes/auth'));
app.use('/api/auth',             require('./routes/passwordReset'));
app.use('/api/admin/usuarios',   require('./routes/usuariosCrud'));
app.use('/api/seguridad',        require('./routes/seguridad'));
app.use('/api/bitacora',         require('./routes/bitacora'));

// Catálogos
app.use('/api/estados-civiles',  require('./routes/estadosCiviles'));
app.use('/api/categorias-archivos', require('./routes/categoriasArchivos'));
app.use('/api/formaciones-academicas', require('./routes/formacionesAcademicas'));

// Módulos escolares
app.use('/api/estructura-academica', require('./routes/estructuraAcademica'));
app.use('/api/padres',           require('./routes/padres'));
app.use('/api/estudiantes',      require('./routes/estudiantes'));
app.use('/api/docentes',         require('./routes/docentes'));
app.use('/api/cuotas',           require('./routes/cuotas'));
app.use('/api/inscripciones',    require('./routes/inscripciones'));
app.use('/api/pagos',            require('./routes/pagos'));
app.use('/api/dashboard',        require('./routes/dashboard'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Gestión Escolar', tenant: req.tenant.slug }));

// Rutas /api/* que no calzaron en ningún router -> 404 JSON.
app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint no encontrado' }));

app.get('/', (req, res) => res.redirect('/app/'));

app.use(errorHandler);

const PORT = process.env.PORT || 3100;

app.listen(PORT, () => {
  console.log(`🎓 Gestión Escolar Backend corriendo en http://localhost:${PORT}`);
  testConnection().catch(err => {
    console.error('❌ Error en testConnection:', err.message);
  });
});

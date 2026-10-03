const { pool } = require('../config/database');
const bcrypt   = require('bcryptjs');
const { paginateQuery } = require('../utils/paginate');
const { buildFiltrosCondiciones, buildOrderBy } = require('../utils/queryFilters');

// Whitelist de columnas ordenables/filtrables desde el encabezado de los listados
// que consumen este modelo (Seguridad > Usuarios y Seguridad > Usuarios / Grupos).
const SORT_FIELDS = {
  idusuarios:      'u.idusuarios',
  codigo:          'u.codigo',
  nombre_completo: 'u.nombre_completo',
  email:           'u.email',
  activo:          'u.activo',
  primer:          'u.primer',
};

const FILTER_FIELDS = {
  idusuarios:      { column: 'u.idusuarios',      type: 'number' },
  codigo:          { column: 'u.codigo',          type: 'text' },
  nombre_completo: { column: 'u.nombre_completo', type: 'text' },
  email:           { column: 'u.email',           type: 'text' },
  activo:          { column: 'u.activo',          type: 'exact', coalesce: true },
  primer:          { column: 'u.primer',          type: 'exact', coalesce: true },
};

const UsuarioCrudModel = {
  SAFE_COLS: `
    u.idusuarios,
    u.codigo,
    u.nombre_completo,
    u.email,
    COALESCE(u.activo, 1) AS activo,
    u.fecha_creacion,
    COALESCE(u.primer, 0) AS primer
  `,

  async getAll(opts = {}) {
    const { page, pageSize, search = '', sortField, sortDir, ...filters } = opts;
    const params = [];
    const conditions = [];
    if (search) {
      conditions.push("(u.codigo LIKE ? OR u.nombre_completo LIKE ? OR COALESCE(u.email,'') LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    buildFiltrosCondiciones(filters, FILTER_FIELDS, conditions, params);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = buildOrderBy(sortField, sortDir, SORT_FIELDS, 'u.nombre_completo', 'ASC');
    return paginateQuery({
      baseQuery:  `SELECT ${this.SAFE_COLS} FROM usuarios u ${where} ${orderBy}`,
      countQuery: `SELECT COUNT(*) AS total FROM usuarios u ${where}`,
      params,
      page,
      pageSize,
    });
  },

  async findById(id) {
    const [rows] = await pool.query(`SELECT ${this.SAFE_COLS} FROM usuarios u WHERE u.idusuarios = ?`, [id]);
    return rows[0];
  },

  async findByCodigo(codigo) {
    const [rows] = await pool.query(`SELECT ${this.SAFE_COLS} FROM usuarios u WHERE u.codigo = ?`, [codigo]);
    return rows[0];
  },

  async codigoExiste(codigo, excludeId = null) {
    const q = excludeId
      ? 'SELECT 1 FROM usuarios WHERE codigo = ? AND idusuarios != ? LIMIT 1'
      : 'SELECT 1 FROM usuarios WHERE codigo = ? LIMIT 1';
    const params = excludeId ? [codigo, excludeId] : [codigo];
    const [rows] = await pool.query(q, params);
    return rows.length > 0;
  },

  async create({ codigo, password, nombre_completo, email, primer = 1 }) {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      `INSERT INTO usuarios (codigo, password, nombre_completo, email, activo, fecha_creacion, primer)
       VALUES (?,?,?,?,1,NOW(),?)`,
      [codigo, hash, nombre_completo, email || null, primer ? 1 : 0]
    );
    return r.insertId;
  },

  // Campos omitidos (undefined) conservan su valor actual.
  async update(id, { codigo, nombre_completo, email, activo, primer }) {
    await pool.query(
      `UPDATE usuarios SET
         codigo          = COALESCE(?, codigo),
         nombre_completo = ?,
         email           = ?,
         activo          = COALESCE(?, activo),
         primer          = COALESCE(?, primer)
       WHERE idusuarios = ?`,
      [codigo || null, nombre_completo, email || null,
       activo === undefined ? null : (activo ? 1 : 0),
       primer === undefined ? null : (primer ? 1 : 0), id]
    );
  },

  async changePassword(id, newPassword, resetPrimer = false) {
    const hash = await bcrypt.hash(newPassword, 10);
    const sql = resetPrimer
      ? 'UPDATE usuarios SET password=?, primer=0 WHERE idusuarios=?'
      : 'UPDATE usuarios SET password=? WHERE idusuarios=?';
    await pool.query(sql, [hash, id]);
  },

  async setToken(codigo, token) {
    await pool.query(
      'UPDATE usuarios SET token=?, fecha_restauracion=DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE codigo=?',
      [token, codigo]
    );
  },

  async findByToken(token) {
    const [rows] = await pool.query(
      `SELECT idusuarios, codigo, nombre_completo, email
       FROM usuarios
       WHERE token=? AND fecha_restauracion > NOW() AND activo=1
       LIMIT 1`,
      [token]
    );
    return rows[0];
  },

  async clearToken(id) {
    await pool.query('UPDATE usuarios SET token=NULL, fecha_restauracion=NULL WHERE idusuarios=?', [id]);
  },
};

module.exports = UsuarioCrudModel;

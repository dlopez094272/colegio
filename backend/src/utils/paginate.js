const { pool } = require('../config/database');

/**
 * Ejecuta una consulta paginada.
 * @param {string} baseQuery  - SELECT … FROM … WHERE … ORDER BY … (sin LIMIT/OFFSET)
 * @param {string} countQuery - SELECT COUNT(*) AS total FROM … WHERE …
 * @param {Array}  params     - parámetros compartidos entre baseQuery y countQuery
 * @param {number|string} page
 * @param {number|string} pageSize
 */
async function paginateQuery({ baseQuery, countQuery, params = [], page, pageSize }) {
  const p  = Math.max(1, parseInt(page)     || 1);
  const ps = Math.min(200, Math.max(5, parseInt(pageSize) || 25));
  const offset = (p - 1) * ps;

  const [rows]        = await pool.query(`${baseQuery} LIMIT ? OFFSET ?`, [...params, ps, offset]);
  const [[{ total }]] = await pool.query(countQuery, params);

  return {
    data: rows,
    meta: {
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.max(1, Math.ceil(total / ps)),
    },
  };
}

module.exports = { paginateQuery };

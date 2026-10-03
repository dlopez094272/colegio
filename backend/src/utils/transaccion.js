const { pool } = require('../config/database');

/** Ejecuta fn(conn) dentro de una transacción; rollback ante cualquier error. */
async function enTransaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const fail = (status, message) => Object.assign(new Error(message), { status });

module.exports = { enTransaccion, fail };

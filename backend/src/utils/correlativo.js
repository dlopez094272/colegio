/**
 * Siguiente número de una serie (tabla correlativos). Debe llamarse dentro de
 * una transacción: el UPDATE bloquea la fila de la serie hasta el commit, así
 * dos inscripciones/recibos simultáneos nunca reciben el mismo número.
 * LAST_INSERT_ID(expr) hace que el insertId del OK packet sea el nuevo valor;
 * en el primer uso de la serie (INSERT) el insertId es 0 → 1.
 */
async function siguienteCorrelativo(conn, serie) {
  const [r] = await conn.query(
    `INSERT INTO correlativos (serie, ultimo) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE ultimo = LAST_INSERT_ID(ultimo + 1)`,
    [serie]
  );
  return r.insertId || 1;
}

module.exports = { siguienteCorrelativo };

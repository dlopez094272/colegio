const mysql = require('mysql2/promise');

// Guatemala = UTC-6 sin horario de verano. 'local' hace que mysql2 use la zona
// del proceso Node (America/Guatemala, fijada en server.js); se refuerza por
// si el MySQL del hosting está en otra zona.
function createMysqlPool({ host, port, database, user, password }) {
  const pool = mysql.createPool({
    host,
    port,
    database,
    user,
    password,
    waitForConnections: true,
    connectionLimit: 5,   // 3 tenants × 5 = 15, dentro del límite de cPanel compartido
    queueLimit: 0,
    timezone: 'local',
    enableKeepAlive: true,      // mantiene conexiones vivas contra wait_timeout del hosting
    keepAliveInitialDelay: 10000,
  });

  pool.on('connection', (connection) => {
    connection.query("SET time_zone = '-06:00'");
  });

  return pool;
}

module.exports = { createMysqlPool };

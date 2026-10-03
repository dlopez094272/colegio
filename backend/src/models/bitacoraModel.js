const { pool } = require('../config/database');
const { paginateQuery } = require('../utils/paginate');

const BitacoraModel = {

  async getByRegistro(tabla, idregistro, opts = {}) {
    const { page, pageSize } = opts;
    const base = `
      SELECT idbitacora, tabla, idregistro, accion, descripcion,
             valores_antes, valores_despues,
             idusuarios, usuario_nombre, ip, fecha
        FROM sistema_bitacora
       WHERE tabla = ? AND idregistro = ?
       ORDER BY fecha DESC, idbitacora DESC`;

    return paginateQuery({
      baseQuery:  base,
      countQuery: 'SELECT COUNT(*) AS total FROM sistema_bitacora WHERE tabla = ? AND idregistro = ?',
      params:     [tabla, idregistro],
      page,
      pageSize,
    });
  },

  async getAll(opts = {}) {
    const { page, pageSize, tabla, accion, idusuarios, fecha_desde, fecha_hasta, search } = opts;
    const conditions = [];
    const params     = [];

    if (tabla)        { conditions.push('tabla = ?');      params.push(tabla); }
    if (accion)       { conditions.push('accion = ?');     params.push(accion); }
    if (idusuarios)   { conditions.push('idusuarios = ?'); params.push(idusuarios); }
    if (fecha_desde)  { conditions.push('fecha >= ?');     params.push(fecha_desde); }
    if (fecha_hasta)  { conditions.push('fecha <= ?');     params.push(fecha_hasta + ' 23:59:59'); }
    if (search) {
      conditions.push("(descripcion LIKE ? OR COALESCE(usuario_nombre,'') LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const base  = `SELECT idbitacora, tabla, idregistro, accion, descripcion,
                          valores_antes, valores_despues,
                          idusuarios, usuario_nombre, ip, fecha
                     FROM sistema_bitacora ${where}
                    ORDER BY fecha DESC, idbitacora DESC`;

    return paginateQuery({
      baseQuery:  base,
      countQuery: `SELECT COUNT(*) AS total FROM sistema_bitacora ${where}`,
      params,
      page,
      pageSize,
    });
  },
};

module.exports = BitacoraModel;

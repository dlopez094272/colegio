const { pool } = require('../config/database');
const { paginateQuery } = require('../utils/paginate');
const { buildFiltrosCondiciones, buildOrderBy, buildWordsLikeCondition } = require('../utils/queryFilters');
const { sqlNombre } = require('../utils/persona');

/**
 * Padres de familia, Estudiantes y Personal docente comparten estructura
 * (datos personales + activo + auditoría); padres y estudiantes además se
 * vinculan entre sí por estudiantes_padres. Este factory arma el modelo de
 * cada uno a partir de su configuración para no duplicar listados, búsquedas
 * y CRUD.
 *
 * @param {object} cfg
 * @param {string} cfg.tabla        - 'padres' | 'estudiantes' | 'docentes'
 * @param {string} cfg.pk           - 'idpadres' | 'idestudiantes' | 'iddocentes'
 * @param {string} [cfg.otraTabla]  - tabla del otro lado del vínculo (sin ella no hay vínculos)
 * @param {string} [cfg.otroPk]     - pk del otro lado del vínculo
 * @param {string[]} cfg.campos     - columnas editables
 * @param {string[]} cfg.buscables  - columnas extra (documentos) para la búsqueda libre
 * @param {string} [cfg.joins]      - JOINs adicionales para listados/detalle
 * @param {string} [cfg.selectExtra]- columnas adicionales (con coma inicial)
 * @param {object} [cfg.sortExtra]  - campos ordenables adicionales
 * @param {object} [cfg.filterExtra]- campos filtrables adicionales
 */
function crearModeloPersona(cfg) {
  const { tabla, pk, otraTabla, otroPk, campos, buscables = [], joins = '', selectExtra = '', sortExtra = {}, filterExtra = {} } = cfg;
  const nombreSql     = sqlNombre('t');
  const nombreOtroSql = sqlNombre('o');
  // Columnas DATE: se devuelven como texto 'YYYY-MM-DD' para no arrastrar zona horaria
  const columna = (c) => (c.startsWith('fecha_') ? `DATE_FORMAT(t.${c}, '%Y-%m-%d') AS ${c}` : `t.${c}`);

  const SELECT_VINCULOS = otraTabla ? `,
           (SELECT COUNT(*) FROM estudiantes_padres v WHERE v.${pk} = t.${pk}) AS total_vinculos,
           (SELECT GROUP_CONCAT(${nombreOtroSql} ORDER BY o.primer_apellido, o.primer_nombre SEPARATOR ', ')
              FROM estudiantes_padres v JOIN ${otraTabla} o ON o.${otroPk} = v.${otroPk}
             WHERE v.${pk} = t.${pk}) AS vinculos_nombres` : '';

  const SELECT = `
    SELECT t.${pk},
           ${campos.map(columna).join(', ')},
           TIMESTAMPDIFF(YEAR, t.fecha_nacimiento, CURDATE()) AS edad,
           ${nombreSql} AS nombre_completo,
           t.activo, t.idusuarios, u.nombre_completo AS usuario_registro,
           t.fecha_creacion, t.fecha_modificacion
           ${SELECT_VINCULOS}
           ${selectExtra}
      FROM ${tabla} t
      LEFT JOIN usuarios u ON u.idusuarios = t.idusuarios
      ${joins}`;

  const SORT_FIELDS = {
    [pk]:              `t.${pk}`,
    nombre_completo:   't.primer_apellido, t.segundo_apellido, t.primer_nombre',
    primer_nombre:     't.primer_nombre',
    primer_apellido:   't.primer_apellido',
    fecha_nacimiento:  't.fecha_nacimiento',
    dpi:               't.dpi',
    telefono_celular:  't.telefono_celular',
    telefono_casa:     't.telefono_casa',
    activo:            't.activo',
    ...(otraTabla ? { total_vinculos: 'total_vinculos' } : {}),
    fecha_creacion:    't.fecha_creacion',
    ...sortExtra,
  };

  const FILTER_FIELDS = {
    [pk]:             { column: `t.${pk}`,            type: 'number' },
    primer_nombre:    { column: 't.primer_nombre',    type: 'text' },
    primer_apellido:  { column: 't.primer_apellido',  type: 'text' },
    dpi:              { column: 't.dpi',              type: 'text' },
    telefono_celular: { column: 't.telefono_celular', type: 'text' },
    direccion:        { column: 't.direccion',        type: 'text' },
    activo:           { column: 't.activo',           type: 'exact' },
    fecha_nacimiento: { column: 't.fecha_nacimiento', type: 'date' },
    fecha_creacion:   { column: 't.fecha_creacion',   type: 'date' },
    ...filterExtra,
  };

  // Búsqueda libre "por palabras" sobre nombre completo + documentos + teléfonos
  const BUSQUEDA_SQL = `CONCAT_WS(' ', t.primer_nombre, t.segundo_nombre, t.primer_apellido, t.segundo_apellido,
                                   t.apellido_casada, t.dpi, t.telefono_casa, t.telefono_celular${buscables.map(c => `, t.${c}`).join('')})`;

  return {
    async getAll(opts = {}) {
      const { page, pageSize, search, sortField, sortDir, ...filtros } = opts;
      const conditions = [];
      const params = [];
      const palabras = buildWordsLikeCondition(BUSQUEDA_SQL, search);
      if (palabras) { conditions.push(palabras.sql); params.push(...palabras.params); }
      buildFiltrosCondiciones(filtros, FILTER_FIELDS, conditions, params);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderBy = buildOrderBy(sortField, sortDir, SORT_FIELDS, 't.primer_apellido, t.segundo_apellido, t.primer_nombre', 'ASC');

      return paginateQuery({
        baseQuery:  `${SELECT} ${where} ${orderBy}`,
        countQuery: `SELECT COUNT(*) AS total FROM ${tabla} t ${joins} ${where}`,
        params,
        page,
        pageSize,
      });
    },

    /** Búsqueda rápida para asignar desde la ficha del otro lado (autocompletar). */
    async buscar(texto, { limit = 10, soloActivos = true, excluir = [] } = {}) {
      const conditions = [];
      const params = [];
      const palabras = buildWordsLikeCondition(BUSQUEDA_SQL, texto);
      if (palabras) { conditions.push(palabras.sql); params.push(...palabras.params); }
      if (soloActivos) conditions.push('t.activo = 1');
      const ids = excluir.map(Number).filter(n => Number.isInteger(n) && n > 0);
      if (ids.length) { conditions.push(`t.${pk} NOT IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await pool.query(
        `${SELECT} ${where} ORDER BY t.primer_apellido, t.segundo_apellido, t.primer_nombre LIMIT ?`,
        [...params, Math.min(50, Math.max(1, Number(limit) || 10))]
      );
      return rows;
    },

    async findById(id, conn = pool) {
      const [rows] = await conn.query(`${SELECT} WHERE t.${pk} = ?`, [id]);
      return rows[0] || null;
    },

    async findManyByIds(ids, conn = pool) {
      if (!ids.length) return [];
      const [rows] = await conn.query(`${SELECT} WHERE t.${pk} IN (${ids.map(() => '?').join(',')})`, ids);
      return rows;
    },

    /** Busca otro registro con el mismo DPI (los DPI son únicos por persona). */
    async buscarPorDpi(dpi, excludeId = null, conn = pool) {
      if (!dpi) return null;
      const [rows] = await conn.query(
        `SELECT ${pk} AS id, ${sqlNombre(tabla)} AS nombre_completo FROM ${tabla}
          WHERE dpi = ? ${excludeId ? `AND ${pk} <> ?` : ''} LIMIT 1`,
        excludeId ? [dpi, excludeId] : [dpi]
      );
      return rows[0] || null;
    },

    async create(conn, data, idusuarios) {
      const cols = [...campos, 'activo', 'idusuarios'];
      const vals = [...campos.map(c => data[c] ?? null), data.activo === 0 ? 0 : 1, idusuarios ?? null];
      const [r] = await conn.query(
        `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
      );
      return r.insertId;
    },

    async update(conn, id, data) {
      const cols = [...campos, 'activo'];
      await conn.query(
        `UPDATE ${tabla} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE ${pk} = ?`,
        [...campos.map(c => data[c] ?? null), data.activo ? 1 : 0, id]
      );
    },

    async setActivo(id, activo) {
      await pool.query(`UPDATE ${tabla} SET activo = ? WHERE ${pk} = ?`, [activo ? 1 : 0, id]);
    },

    async resumen() {
      const [[r]] = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(activo = 1), 0) AS activos, COALESCE(SUM(activo = 0), 0) AS inactivos,
                COALESCE(SUM(DATE(fecha_creacion) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0) AS nuevos_30d
           FROM ${tabla}`
      );
      return r;
    },
  };
}

module.exports = { crearModeloPersona };

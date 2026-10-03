const { pool } = require('../config/database');

/**
 * Estructura académica: Nivel → (Carrera) → Grado → Sección.
 * Las cuatro entidades comparten la misma forma (nombre + activo + padre), así
 * que se describen en TIPOS y el modelo trabaja sobre esa descripción.
 *   - scope: columnas que delimitan la unicidad del nombre y el orden.
 */
const TIPOS = {
  nivel:   { tabla: 'niveles',   pk: 'idniveles',   campo: 'nivel',   etiqueta: 'Nivel',   scope: [],                          orden: true },
  carrera: { tabla: 'carreras',  pk: 'idcarreras',  campo: 'carrera', etiqueta: 'Carrera', fem: true, scope: ['idniveles'],               orden: true },
  grado:   { tabla: 'grados',    pk: 'idgrados',    campo: 'grado',   etiqueta: 'Grado',   scope: ['idniveles', 'idcarreras'], orden: true },
  seccion: { tabla: 'secciones', pk: 'idsecciones', campo: 'seccion', etiqueta: 'Sección', fem: true, scope: ['idgrados'],                orden: false },
};

// `<=>` compara NULL = NULL como verdadero (grados sin carrera).
const scopeWhere = (t, row) => ({
  sql: t.scope.map(c => `${c} <=> ?`).join(' AND '),
  params: t.scope.map(c => row[c] ?? null),
});

const EstructuraAcademicaModel = {
  TIPOS,

  /** Árbol completo (activos e inactivos) con los grados agrupados por carrera cuando el nivel las usa. */
  async arbol() {
    const [[niveles], [carreras], [grados], [secciones]] = await Promise.all([
      pool.query('SELECT idniveles, nivel, usa_carreras, orden, activo FROM niveles ORDER BY orden, nivel'),
      pool.query('SELECT idcarreras, idniveles, carrera, orden, activo FROM carreras ORDER BY orden, carrera'),
      pool.query('SELECT idgrados, idniveles, idcarreras, grado, orden, activo FROM grados ORDER BY orden, grado'),
      pool.query('SELECT idsecciones, idgrados, seccion, activo FROM secciones ORDER BY seccion'),
    ]);

    const seccionesPorGrado = new Map();
    for (const s of secciones) {
      if (!seccionesPorGrado.has(s.idgrados)) seccionesPorGrado.set(s.idgrados, []);
      seccionesPorGrado.get(s.idgrados).push(s);
    }
    const gradosCon = g => ({ ...g, secciones: seccionesPorGrado.get(g.idgrados) || [] });

    return niveles.map(n => ({
      ...n,
      carreras: carreras
        .filter(c => c.idniveles === n.idniveles)
        .map(c => ({ ...c, grados: grados.filter(g => g.idcarreras === c.idcarreras).map(gradosCon) })),
      grados: grados.filter(g => g.idniveles === n.idniveles && g.idcarreras === null).map(gradosCon),
    }));
  },

  async findById(tipo, id, conn = pool) {
    const t = TIPOS[tipo];
    const [rows] = await conn.query(`SELECT * FROM ${t.tabla} WHERE ${t.pk} = ?`, [id]);
    return rows[0] || null;
  },

  /** Nombres (de la lista) que ya existen dentro del mismo padre. */
  async nombresExistentes(tipo, nombres, scopeRow, excludeId = null, conn = pool) {
    if (!nombres.length) return [];
    const t = TIPOS[tipo];
    const w = scopeWhere(t, scopeRow);
    const [rows] = await conn.query(
      `SELECT ${t.campo} AS nombre FROM ${t.tabla}
        WHERE ${t.campo} IN (?) ${w.sql ? `AND ${w.sql}` : ''} ${excludeId ? `AND ${t.pk} <> ?` : ''}`,
      [nombres, ...w.params, ...(excludeId ? [excludeId] : [])]
    );
    return rows.map(r => r.nombre);
  },

  async siguienteOrden(tipo, scopeRow, conn = pool) {
    const t = TIPOS[tipo];
    const w = scopeWhere(t, scopeRow);
    const [[r]] = await conn.query(
      `SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM ${t.tabla} ${w.sql ? `WHERE ${w.sql}` : ''}`,
      w.params
    );
    return r.n;
  },

  /** Inserta un registro. `data` trae el nombre y las columnas de padre/orden que apliquen. */
  async create(tipo, data, conn = pool) {
    const t = TIPOS[tipo];
    const cols = { [t.campo]: data.nombre, activo: data.activo ? 1 : 0 };
    for (const c of t.scope) cols[c] = data[c] ?? null;
    if (t.orden) cols.orden = data.orden;
    if (tipo === 'nivel') cols.usa_carreras = data.usa_carreras ? 1 : 0;
    const [r] = await conn.query(`INSERT INTO ${t.tabla} SET ?`, [cols]);
    return r.insertId;
  },

  async update(tipo, id, data, conn = pool) {
    const t = TIPOS[tipo];
    const cols = { [t.campo]: data.nombre };
    if (t.orden) cols.orden = data.orden;
    if (tipo === 'nivel') cols.usa_carreras = data.usa_carreras ? 1 : 0;
    await conn.query(`UPDATE ${t.tabla} SET ? WHERE ${t.pk} = ?`, [cols, id]);
  },

  /**
   * Activa / inactiva el registro y TODOS sus descendientes.
   * Devuelve cuántos registros cambiaron por entidad.
   */
  async setActivoCascada(tipo, id, activo, conn) {
    const a = activo ? 1 : 0;
    const cambios = {};
    const run = async (clave, sql) => {
      const [r] = await conn.query(sql, [a, id]);
      if (r.changedRows) cambios[clave] = r.changedRows;
    };

    if (tipo === 'nivel') {
      await run('niveles',   'UPDATE niveles SET activo = ? WHERE idniveles = ?');
      await run('carreras',  'UPDATE carreras SET activo = ? WHERE idniveles = ?');
      await run('grados',    'UPDATE grados SET activo = ? WHERE idniveles = ?');
      await run('secciones', 'UPDATE secciones s JOIN grados g ON g.idgrados = s.idgrados SET s.activo = ? WHERE g.idniveles = ?');
    } else if (tipo === 'carrera') {
      await run('carreras',  'UPDATE carreras SET activo = ? WHERE idcarreras = ?');
      await run('grados',    'UPDATE grados SET activo = ? WHERE idcarreras = ?');
      await run('secciones', 'UPDATE secciones s JOIN grados g ON g.idgrados = s.idgrados SET s.activo = ? WHERE g.idcarreras = ?');
    } else if (tipo === 'grado') {
      await run('grados',    'UPDATE grados SET activo = ? WHERE idgrados = ?');
      await run('secciones', 'UPDATE secciones SET activo = ? WHERE idgrados = ?');
    } else {
      await run('secciones', 'UPDATE secciones SET activo = ? WHERE idsecciones = ?');
    }
    return cambios;
  },

  /** Primer ancestro inactivo del registro (para impedir activar un hijo bajo un padre inactivo). */
  async ancestroInactivo(tipo, row, conn = pool) {
    const cadena = [];
    if (tipo === 'seccion') {
      const g = await this.findById('grado', row.idgrados, conn);
      cadena.push(['grado', g]);
      row = g;
    }
    if (tipo === 'seccion' || tipo === 'grado') {
      if (row.idcarreras) cadena.push(['carrera', await this.findById('carrera', row.idcarreras, conn)]);
    }
    if (tipo !== 'nivel') cadena.push(['nivel', await this.findById('nivel', row.idniveles, conn)]);

    const hit = cadena.find(([, r]) => r && !r.activo);
    return hit ? { tipo: hit[0], nombre: hit[1][TIPOS[hit[0]].campo] } : null;
  },

  /** Cantidad de hijos directos (para impedir eliminar un registro con descendencia). */
  async contarHijos(tipo, id) {
    const q = {
      nivel:   'SELECT (SELECT COUNT(*) FROM carreras WHERE idniveles = ?) + (SELECT COUNT(*) FROM grados WHERE idniveles = ?) AS n',
      carrera: 'SELECT COUNT(*) AS n FROM grados WHERE idcarreras = ?',
      grado:   'SELECT (SELECT COUNT(*) FROM secciones WHERE idgrados = ?) + (SELECT COUNT(*) FROM cuotas_grados WHERE idgrados = ?) + (SELECT COUNT(*) FROM inscripciones WHERE idgrados = ?) AS n',
      seccion: 'SELECT COUNT(*) AS n FROM inscripciones WHERE idsecciones = ?',
    }[tipo];
    if (!q) return 0;
    const [[r]] = await pool.query(q, [id, id, id]);
    return Number(r.n);
  },

  async contar(sql, params) {
    const [[r]] = await pool.query(sql, params);
    return Number(r.n);
  },

  async delete(tipo, id) {
    const t = TIPOS[tipo];
    await pool.query(`DELETE FROM ${t.tabla} WHERE ${t.pk} = ?`, [id]);
  },
};

module.exports = EstructuraAcademicaModel;

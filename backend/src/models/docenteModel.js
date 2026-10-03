const { pool } = require('../config/database');
const { crearModeloPersona } = require('./personaModelFactory');
const { CAMPOS_DOCENTE } = require('../utils/persona');

// Personal docente (maestros y coordinadores): mismos datos que el padre de
// familia, sin vínculo con estudiantes, con foto y formación académica (N:M).
const DocenteModel = crearModeloPersona({
  tabla:       'docentes',
  pk:          'iddocentes',
  campos:      CAMPOS_DOCENTE,
  buscables:   ['nit', 'pasaporte', 'email'],
  joins:       'LEFT JOIN estados_civiles ec ON ec.idestados_civiles = t.idestados_civiles',
  selectExtra: `, ec.estado_civil, t.foto,
    (SELECT GROUP_CONCAT(fa.formacion ORDER BY fa.formacion SEPARATOR '||')
       FROM docentes_formaciones df
       JOIN formaciones_academicas fa ON fa.idformaciones_academicas = df.idformaciones_academicas
      WHERE df.iddocentes = t.iddocentes) AS formaciones_nombres`,
  sortExtra: {
    tipo_personal: 't.tipo_personal',
    nit:           't.nit',
    email:         't.email',
    estado_civil:  'ec.estado_civil',
    fecha_ingreso: 't.fecha_ingreso',
  },
  filterExtra: {
    tipo_personal:     { column: 't.tipo_personal',     type: 'exact' },
    nit:               { column: 't.nit',               type: 'text' },
    email:             { column: 't.email',             type: 'text' },
    idestados_civiles: { column: 't.idestados_civiles', type: 'exact' },
    fecha_ingreso:     { column: 't.fecha_ingreso',     type: 'date' },
    idformaciones_academicas: {
      type: 'sql',
      sql:  'EXISTS (SELECT 1 FROM docentes_formaciones df WHERE df.iddocentes = t.iddocentes AND df.idformaciones_academicas = ?)',
    },
  },
});

DocenteModel.setFoto = async function setFoto(id, foto) {
  await pool.query('UPDATE docentes SET foto = ? WHERE iddocentes = ?', [foto, id]);
};

/** Formaciones académicas asignadas a un docente. */
DocenteModel.getFormaciones = async function getFormaciones(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT fa.idformaciones_academicas, fa.formacion, fa.activo
       FROM docentes_formaciones df
       JOIN formaciones_academicas fa ON fa.idformaciones_academicas = df.idformaciones_academicas
      WHERE df.iddocentes = ?
      ORDER BY fa.formacion`,
    [id]
  );
  return rows;
};

/** Reemplaza las formaciones del docente por las indicadas (dentro de la transacción). */
DocenteModel.setFormaciones = async function setFormaciones(conn, id, ids) {
  await conn.query('DELETE FROM docentes_formaciones WHERE iddocentes = ?', [id]);
  if (!ids.length) return;
  await conn.query(
    `INSERT INTO docentes_formaciones (iddocentes, idformaciones_academicas) VALUES ${ids.map(() => '(?, ?)').join(', ')}`,
    ids.flatMap(f => [id, f])
  );
};

module.exports = DocenteModel;

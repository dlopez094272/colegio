const { pool } = require('../config/database');
const { crearModeloPersona } = require('./personaModelFactory');
const { CAMPOS_ESTUDIANTE } = require('../utils/persona');

const EstudianteModel = crearModeloPersona({
  tabla:     'estudiantes',
  pk:        'idestudiantes',
  otraTabla: 'padres',
  otroPk:    'idpadres',
  campos:    CAMPOS_ESTUDIANTE,
  selectExtra: `, t.foto,
    (SELECT COUNT(*) FROM estudiantes_archivos ea WHERE ea.idestudiantes = t.idestudiantes) AS total_archivos`,
  sortExtra: { lugar_nacimiento: 't.lugar_nacimiento', total_archivos: 'total_archivos' },
  filterExtra: { lugar_nacimiento: { column: 't.lugar_nacimiento', type: 'text' } },
});

EstudianteModel.setFoto = async function setFoto(id, foto) {
  await pool.query('UPDATE estudiantes SET foto = ? WHERE idestudiantes = ?', [foto, id]);
};

module.exports = EstudianteModel;

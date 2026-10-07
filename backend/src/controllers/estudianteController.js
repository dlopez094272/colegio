const EstudianteModel = require('../models/estudianteModel');
const PadreModel      = require('../models/padreModel');
const VinculoModel    = require('../models/vinculoModel');
const { CAMPOS_ESTUDIANTE, CAMPOS_PADRE } = require('../utils/persona');
const { crearControladorPersona } = require('./personaControllerFactory');

module.exports = crearControladorPersona({
  tabla:        'estudiantes',
  tablaOtro:    'padres',
  pk:           'idestudiantes',
  etiqueta:     'estudiante',
  etiquetaOtro: 'padre de familia',
  Modelo:       EstudianteModel,
  ModeloOtro:   PadreModel,
  campos:       CAMPOS_ESTUDIANTE,
  camposOtro:   CAMPOS_PADRE,
  dpiRequerido: true,
  getVinculos:  (idestudiantes, conn) => VinculoModel.getPadresDeEstudiante(idestudiantes, conn),
  vincular:     (conn, idestudiantes, idpadres, parentesco) => VinculoModel.vincular(conn, idestudiantes, idpadres, parentesco),
  desvincular:  (conn, idestudiantes, idpadres) => VinculoModel.desvincular(conn, idestudiantes, idpadres),
});

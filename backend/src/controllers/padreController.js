const PadreModel      = require('../models/padreModel');
const EstudianteModel = require('../models/estudianteModel');
const VinculoModel    = require('../models/vinculoModel');
const { CAMPOS_PADRE, CAMPOS_ESTUDIANTE } = require('../utils/persona');
const { crearControladorPersona } = require('./personaControllerFactory');

module.exports = crearControladorPersona({
  tabla:        'padres',
  tablaOtro:    'estudiantes',
  pk:           'idpadres',
  etiqueta:     'padre de familia',
  etiquetaOtro: 'estudiante',
  Modelo:       PadreModel,
  ModeloOtro:   EstudianteModel,
  campos:       CAMPOS_PADRE,
  camposOtro:   CAMPOS_ESTUDIANTE,
  getVinculos:  (idpadres, conn) => VinculoModel.getEstudiantesDePadre(idpadres, conn),
  vincular:     (conn, idpadres, idestudiantes, parentesco) => VinculoModel.vincular(conn, idestudiantes, idpadres, parentesco),
  desvincular:  (conn, idpadres, idestudiantes) => VinculoModel.desvincular(conn, idestudiantes, idpadres),
});

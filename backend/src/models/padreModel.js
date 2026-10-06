const { crearModeloPersona } = require('./personaModelFactory');
const { CAMPOS_PADRE } = require('../utils/persona');

const PadreModel = crearModeloPersona({
  tabla:       'padres',
  pk:          'idpadres',
  otraTabla:   'estudiantes',
  otroPk:      'idestudiantes',
  campos:      CAMPOS_PADRE,
  buscables:   ['nit', 'pasaporte', 'email'],
  joins:       'LEFT JOIN estados_civiles ec ON ec.idestados_civiles = t.idestados_civiles',
  selectExtra: ', ec.estado_civil',
  sortExtra: {
    nit:          't.nit',
    pasaporte:    't.pasaporte',
    estado_civil: 'ec.estado_civil',
  },
  filterExtra: {
    nit:               { column: 't.nit',               type: 'text' },
    pasaporte:         { column: 't.pasaporte',         type: 'text' },
    email:             { column: 't.email',             type: 'text' },
    idestados_civiles: { column: 't.idestados_civiles', type: 'exact' },
  },
});

module.exports = PadreModel;

// Utilidades compartidas por Padres de familia, Estudiantes y Personal docente:
// todos guardan los mismos datos personales (padres y docentes agregan NIT,
// pasaporte, estado civil, nacionalidad y correo; los docentes además tipo y
// fecha de ingreso).

const CAMPOS_BASE = [
  'primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido', 'apellido_casada',
  'fecha_nacimiento', 'dpi', 'direccion', 'telefono_casa', 'telefono_celular',
];

const CAMPOS_PADRE      = [...CAMPOS_BASE, 'idestados_civiles', 'nacionalidad', 'nit', 'pasaporte', 'email'];
const CAMPOS_ESTUDIANTE = [...CAMPOS_BASE, 'lugar_nacimiento'];
const CAMPOS_DOCENTE    = [...CAMPOS_PADRE, 'tipo_personal', 'fecha_ingreso'];

const TIPOS_PERSONAL = ['Maestro', 'Coordinador'];

// Datos que se heredan al crear en el mismo paso un registro vinculado
// (ej. estudiante nuevo → padre nuevo): domicilio y teléfonos en común.
const CAMPOS_HEREDABLES = ['direccion', 'telefono_casa', 'telefono_celular'];

const PARENTESCOS = ['Padre', 'Madre', 'Tutor', 'Otro'];

function limpiarTexto(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s;
}

/** Toma solo los campos permitidos del body, recortados; vacío → null. */
function normalizar(body, campos) {
  const data = {};
  for (const c of campos) {
    if (c === 'idestados_civiles') {
      const n = Number(body[c]);
      data[c] = Number.isInteger(n) && n > 0 ? n : null;
    } else if (c === 'fecha_nacimiento' || c === 'fecha_ingreso') {
      data[c] = limpiarTexto(body[c])?.substring(0, 10) ?? null;
    } else {
      data[c] = limpiarTexto(body[c]);
    }
  }
  if (data.nit) data.nit = data.nit.toUpperCase().replace(/\s/g, '');
  if (data.dpi) data.dpi = data.dpi.replace(/[\s-]/g, '');
  if (data.pasaporte) data.pasaporte = data.pasaporte.toUpperCase();
  if (data.email) data.email = data.email.toLowerCase();
  if ('tipo_personal' in data)
    data.tipo_personal = TIPOS_PERSONAL.find(t => t.toLowerCase() === (data.tipo_personal || '').toLowerCase()) || null;
  return data;
}

/** Devuelve el primer error de validación encontrado, o null si todo está bien. */
function validar(data, etiqueta = 'registro') {
  if (!data.primer_nombre)   return `El primer nombre del ${etiqueta} es requerido`;
  if (!data.primer_apellido) return `El primer apellido del ${etiqueta} es requerido`;

  if (data.fecha_nacimiento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_nacimiento) || isNaN(Date.parse(data.fecha_nacimiento)))
      return `La fecha de nacimiento del ${etiqueta} no es válida`;
    const hoy = new Date().toISOString().substring(0, 10);
    if (data.fecha_nacimiento > hoy) return `La fecha de nacimiento del ${etiqueta} no puede ser futura`;
  }
  if (data.fecha_ingreso && (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_ingreso) || isNaN(Date.parse(data.fecha_ingreso))))
    return `La fecha de ingreso del ${etiqueta} no es válida`;
  if ('tipo_personal' in data && !data.tipo_personal)
    return `Indique si el ${etiqueta} es ${TIPOS_PERSONAL.join(' o ').toLowerCase()}`;
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    return `El correo electrónico del ${etiqueta} no es válido`;
  if (data.dpi && !/^\d{13}$/.test(data.dpi))
    return `El DPI/CUI del ${etiqueta} debe tener 13 dígitos`;
  if (data.nit && data.nit !== 'CF' && !/^\d{1,12}-?[\dK]$/.test(data.nit))
    return `El NIT del ${etiqueta} no tiene un formato válido`;
  for (const tel of ['telefono_casa', 'telefono_celular']) {
    if (data[tel] && !/^[\d+\-\s()]{7,20}$/.test(data[tel]))
      return `El ${tel === 'telefono_casa' ? 'teléfono de casa' : 'teléfono celular'} del ${etiqueta} no es válido`;
  }
  for (const [campo, max] of Object.entries({ primer_nombre: 60, segundo_nombre: 60, primer_apellido: 60, segundo_apellido: 60, apellido_casada: 60, direccion: 300, pasaporte: 30, lugar_nacimiento: 150, nacionalidad: 60, email: 145 })) {
    if (data[campo] && data[campo].length > max) return `El campo ${campo.replace('_', ' ')} del ${etiqueta} excede ${max} caracteres`;
  }
  return null;
}

/** Completa los campos heredables vacíos de `destino` con los de `origen`. */
function heredar(destino, origen) {
  for (const c of CAMPOS_HEREDABLES) {
    if (!destino[c] && origen[c]) destino[c] = origen[c];
  }
  return destino;
}

function nombreCompleto(p) {
  if (!p) return '';
  const apellidos = [p.primer_apellido, p.segundo_apellido].filter(Boolean).join(' ');
  const casada = p.apellido_casada ? ` de ${p.apellido_casada}` : '';
  return [p.primer_nombre, p.segundo_nombre, apellidos + casada].filter(Boolean).join(' ').trim();
}

function normalizarParentesco(v) {
  const p = limpiarTexto(v);
  if (!p) return null;
  return PARENTESCOS.find(x => x.toLowerCase() === p.toLowerCase()) || 'Otro';
}

// Expresión SQL del nombre completo (para listados, búsqueda y orden).
function sqlNombre(alias) {
  return `TRIM(CONCAT_WS(' ', ${alias}.primer_nombre, ${alias}.segundo_nombre, ${alias}.primer_apellido, ${alias}.segundo_apellido,
          IF(${alias}.apellido_casada IS NULL OR ${alias}.apellido_casada = '', NULL, CONCAT('de ', ${alias}.apellido_casada))))`;
}

module.exports = {
  CAMPOS_BASE,
  CAMPOS_PADRE,
  CAMPOS_ESTUDIANTE,
  CAMPOS_DOCENTE,
  CAMPOS_HEREDABLES,
  TIPOS_PERSONAL,
  PARENTESCOS,
  normalizar,
  validar,
  heredar,
  nombreCompleto,
  normalizarParentesco,
  sqlNombre,
};

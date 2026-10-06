const B = require('./base');

// Contrato de adhesión por prestación de servicios educativos — formato
// oficial registrado ante la DIACO. La primera hoja se llena con los datos
// del colegio (Configuración), del encargado y del estudiante; las cláusulas
// de las hojas 2 y 3 son el texto aprobado y no cambian.

const nombreGrado = i => [i.nivel, i.carrera, i.grado].filter(Boolean).join(' › ') + (i.seccion ? `, sección ${i.seccion}` : '');

const F = { n: 'Times-Roman', b: 'Times-Bold', i: 'Times-Italic' };
const TAM = 9.5;
const ROJO = '#C00000';

/** Edad cumplida a una fecha (YYYY-MM-DD). */
function edadA(nacimiento, fecha) {
  if (!nacimiento) return null;
  const [y1, m1, d1] = String(nacimiento).substring(0, 10).split('-').map(Number);
  const [y2, m2, d2] = String(fecha).substring(0, 10).split('-').map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

/** "Padre" → "padre"; Tutor/Otro → "encargado". */
function calidad(parentesco) {
  if (parentesco === 'Padre' || parentesco === 'Madre') return parentesco.toLowerCase();
  return parentesco ? 'encargado' : null;
}

/**
 * Párrafo con texto normal, negritas y espacios por llenar.
 * segmentos: 'texto' | { b: 'negrita' } | { v: valor, w: guiones si está vacío }
 * Los valores llenos se escriben en negrita subrayada; los vacíos quedan como línea.
 */
function parrafo(doc, segmentos, opts = {}) {
  const segs = segmentos.filter(s => s !== null && s !== undefined && s !== '');
  const base = { align: 'justify', lineGap: 0.6, ...opts };
  segs.forEach((s, i) => {
    let texto = s, font = F.n, underline = false;
    if (typeof s === 'object' && 'b' in s) { texto = s.b; font = F.b; }
    else if (typeof s === 'object') {
      const v = s.v === null || s.v === undefined ? '' : String(s.v).trim();
      if (v) { texto = v; font = F.b; underline = true; }
      else texto = '_'.repeat(s.w || 14);
    }
    doc.font(font).fontSize(opts.size || TAM).fillColor('#000000')
      .text(texto, { ...base, underline, continued: i < segs.length - 1 });
  });
  doc.moveDown(opts.despues ?? 0.45);
}

/** Línea centrada para un nombre (lleno: subrayado; vacío: línea larga) con leyenda pequeña debajo. */
function lineaNombre(doc, valor, leyenda) {
  const v = (valor || '').trim();
  doc.font(F.b).fontSize(11).fillColor('#000000')
    .text(v || '_'.repeat(62), { align: 'center', underline: !!v });
  if (leyenda) doc.font(F.n).fontSize(8).text(leyenda, { align: 'center', underline: false });
  doc.moveDown(0.7);
}

/** Literal a., b., c. con sangría francesa (sin texto: el título es la oración completa). */
function literal(doc, letra, titulo, texto = '') {
  const x = doc.page.margins.left, w = B.anchoUtil(doc);
  const y = doc.y;
  doc.font(F.b).fontSize(TAM).fillColor('#000000').text(`${letra}.`, x + 18, y, { width: 18, lineBreak: false });
  // Un solo bloque de texto: partirlo en fragmentos "continued" descuadra el justificado
  doc.font(F.n).text(texto ? `${titulo}: ${texto}` : `${titulo}.`, x + 36, y, { width: w - 36, align: 'justify', lineGap: 0.6 });
  doc.x = x;
  doc.moveDown(0.45);
}

/** Cláusula: TÍTULO en negrita seguido del texto. */
function clausula(doc, titulo, texto) {
  parrafo(doc, [{ b: `${titulo}` }, `: ${texto}`]);
}

/** Tabla con bordes (cuadros de cuotas de la cláusula QUINTA). filas: [[{ t, b, size }]] */
function cuadro(doc, anchos, filas, { encabezado = true } = {}) {
  const x0 = doc.page.margins.left, w = B.anchoUtil(doc), pad = 2.5;
  const cols = anchos.map(a => a * w);
  filas.forEach((fila, n) => {
    const celdas = fila.map(c => (typeof c === 'string' ? { t: c } : c));
    const altos = celdas.map((c, i) => doc.font(c.b ? F.b : F.n).fontSize(c.size || 7.5).heightOfString(c.t, { width: cols[i] - pad * 2 }));
    const alto = Math.max(11, ...altos) + pad * 2;
    const y = doc.y;
    let x = x0;
    celdas.forEach((c, i) => {
      if (encabezado && n === 0) doc.rect(x, y, cols[i], alto).fill('#D9D9D9');
      doc.rect(x, y, cols[i], alto).lineWidth(0.6).strokeColor('#000000').stroke();
      doc.font(c.b ? F.b : F.n).fontSize(c.size || 7.5).fillColor('#000000')
        .text(c.t, x + pad, y + (alto - altos[i]) / 2, { width: cols[i] - pad * 2, lineGap: 0 });
      x += cols[i];
    });
    doc.x = x0;
    doc.y = y + alto;
  });
  doc.moveDown(0.5);
}

/** Línea de firma "f.______" con el nombre debajo; la firma escaneada (si hay) va sobre la línea. */
function firma(doc, x, y, ancho, nombre, imagenRuta = null) {
  if (imagenRuta) B.imagen(doc, imagenRuta, x + 14, y - 46, { fit: [ancho - 20, 50], align: 'center', valign: 'bottom' });
  doc.font(F.b).fontSize(TAM).fillColor('#000000').text('f.', x, y - 9, { lineBreak: false });
  doc.moveTo(x + 9, y).lineTo(x + ancho, y).lineWidth(0.8).strokeColor('#000000').stroke();
  doc.font(F.b).fontSize(TAM).text(nombre, x - 25, y + 3, { width: ancho + 50, align: 'center' });
}

// ─── Hoja 1 ──────────────────────────────────────────────────
function hojaUno(doc, insc, col) {
  const x = doc.page.margins.left, w = B.anchoUtil(doc), top = doc.page.margins.top;
  const [anio, mes, dia] = String(insc.fecha_inscripcion).substring(0, 10).split('-').map(Number);

  // Encabezado: logotipo a la izquierda, títulos centrados
  B.imagen(doc, col.logoRuta, x - 6, top - 4, { fit: [64, 64], align: 'center', valign: 'center' });
  const lugar = [col.direccion, col.municipio, col.departamento].filter(Boolean).join(', ');
  doc.font(F.b).fontSize(10).fillColor('#000000');
  [
    'Ministerio de Educación Dirección Departamental de Educación',
    'CONTRATO DE ADHESIÓN POR PRESTACIÓN DE SERVICIOS EDUCATIVOS DEL',
    col.nombre,
    lugar ? `${lugar}.` : null,
    col.telefonos ? `Tel. ${col.telefonos}` : null,
  ].filter(Boolean).forEach((l, i) => {
    // Cada renglón en una sola línea: reducir la letra si no cabe
    let tam = 10;
    while (tam > 7 && doc.fontSize(tam).widthOfString(l) > w - 116) tam -= 0.25;
    doc.fontSize(tam).text(l, x + 58, i === 0 ? top : doc.y, { width: w - 116, align: 'center' });
  });
  doc.y = Math.max(doc.y, top + 62) + 10;

  // Correlativo interno (año-número de la inscripción)
  const correlativo = String(insc.codigo).replace(/^INS-/, '');
  const etiqueta = 'Correlativo interno Contrato No. ';
  doc.font(F.b).fontSize(11);
  const anchoEt = doc.widthOfString(etiqueta), anchoNum = doc.widthOfString(correlativo);
  const xEt = x + w - anchoEt - anchoNum, yCorr = doc.y;
  doc.fillColor('#000000').text(etiqueta, xEt, yCorr, { lineBreak: false });
  doc.fillColor(ROJO).text(correlativo, xEt + anchoEt, yCorr, { lineBreak: false });
  doc.fillColor('#000000');
  doc.x = x;
  doc.y = yCorr + 22;

  parrafo(doc, ['Aprobado y Registrado según Resolución DIACO: ', { v: col.resolucion_diaco, w: 60 }]);

  parrafo(doc, [
    'En el municipio de ', { v: col.municipio, w: 16 }, ', departamento de ', { v: col.departamento, w: 16 },
    ', el día ', { v: String(dia), w: 4 }, ' del mes de ', { v: B.MESES[mes - 1], w: 12 }, ' del año ', { v: String(anio), w: 5 },
  ]);

  const edadRep = col.representante_fecha_nacimiento ? edadA(col.representante_fecha_nacimiento, insc.fecha_inscripcion) : null;
  parrafo(doc, [
    { b: 'NOSOTROS' }, ': ', { v: col.representante_nombre, w: 30 }, ', de ', { v: edadRep, w: 4 }, ' años de edad, estado civil ',
    { v: col.representante_estado_civil, w: 10 }, ', de nacionalidad ', { v: col.representante_nacionalidad, w: 12 },
    ', con profesión, ', { v: col.representante_profesion, w: 20 }, '. Me identifico con documento personal, ',
    { b: 'DPI No. ' }, { v: col.representante_dpi, w: 14 }, ', extendido por el Registro Nacional de las Personas. ',
    { b: `Y actúo en mi calidad de representante legal del: ${col.nombre}` }, '. Lo cual acredito de conformidad con: ',
    { v: col.acreditacion, w: 40 }, '. Emitida por el Ministerio de Educación, a través de la Dirección Departamental de Educación de ',
    { v: col.departamento, w: 14 }, '. Y,',
  ]);

  // Datos del padre de familia o encargado
  doc.font(F.n).fontSize(8.5).text('(Datos del padre de familia o representante legal del educando)', { align: 'center' });
  doc.moveDown(0.9);
  lineaNombre(doc, insc.encargado);

  parrafo(doc, [
    'De ', { v: insc.encargado ? insc.encargado_edad : null, w: 4 }, ' años de edad, estado civil ', { v: insc.encargado_estado_civil, w: 14 },
    ', de nacionalidad ', { v: insc.encargado_nacionalidad, w: 20 }, ', Me identifico con documento personal DPI No. ',
    { v: insc.encargado_dpi, w: 18 }, ' Y con residencia en la ', { v: insc.encargado_direccion, w: 52 },
    ' Con números de teléfono ', { v: insc.encargado_telefono, w: 12 }, ' y ', { v: insc.encargado_telefono_casa, w: 12 }, '.',
  ]);

  parrafo(doc, [
    'Actúo en mi calidad de (padre, madre, o encargado) ', { v: calidad(insc.encargado_parentesco) || (insc.encargado ? 'encargado' : null), w: 14 },
    ' del estudiante,',
  ], { despues: 1 });

  lineaNombre(doc, insc.estudiante, '(Nombres) y (Apellidos)');

  parrafo(doc, [
    'Quien cursará el ', { v: insc.grado, w: 9 }, ' grado del Nivel de Educación ',
    { v: [insc.nivel, insc.carrera].filter(Boolean).join(', '), w: 14 }, ' Jornada ', { v: col.jornada, w: 10 }, '.',
  ]);

  parrafo(doc, [
    'Servicio educativo que está debidamente autorizado por el Ministerio de Educación, de conformidad con el ',
    { v: col.autorizacion_servicio, w: 40 }, ' mismos que se ponen a la vista del público.',
  ]);

  parrafo(doc, ['Declarando que la información personal proporcionada, es de carácter confidencial. Los comparecientes, aseguramos ser de ' +
    'los datos de identificación anotados, estar en el libre ejercicio de nuestros derechos civiles y celebramos CONTRATO DE ' +
    'ADHESIÓN POR PRESTACIÓN DE SERVICIOS EDUCATIVOS, de conformidad con las siguientes cláusulas:']);

  clausula(doc, 'PRIMERA', 'Durante su vigencia, no puede ser modificada ninguna de sus cláusulas, las que se deberán cumplir a cabalidad; ' +
    'así como, con todo lo ofrecido a los padres de familia, tanto en la publicidad efectuada en los medios de comunicación, ' +
    'información escrita o cualquier otro documento publicitario.');

  clausula(doc, 'SEGUNDA', 'Derechos Del Educando Y Padre De Familia: El Educando y el Padre de Familia o Representante Legal del ' +
    'mismo, como usuarios del servicio educativo contratado, en armonía con el Artículo 4 de la Ley de Protección al ' +
    'Consumidor y Usuario, tendrá derecho a:');

  literal(doc, 'a', 'La protección a la vida, salud y seguridad en la adquisición, consumo y uso de bienes y servicios',
    'Las instalaciones del centro educativo, están adecuadas para que los educandos no corran ninguna clase de riesgo que ponga en ' +
    'peligro su integridad física, también están dotadas de todos los servicios básicos ofrecidos a los padres de familia. ' +
    'En el caso que la prestación del servicio de transporte sea brindado por una entidad ajena al centro educativo, este ' +
    'proporcionará todas las medidas de seguridad necesarias, para la debida protección de los educandos; así mismo, ' +
    'propondrán medidas de seguridad a los padres a través de un seguro escolar, el cual no será obligatorio, pero debe ' +
    'quedar en acta, la decisión del padre de la adquisición o no del mismo, se debe de velar por la seguridad de los ' +
    'educandos, en cualquier actividad propuesta y hacerlo siempre del conocimiento de los padres, para su respectivo ' +
    'consentimiento de participación.');

  literal(doc, 'b', 'La libertad de elección del bien o servicio',
    'Los padres de familia tienen el derecho de poder adquirir, tanto los útiles ' +
    'escolares, como los uniformes, transporte, seguro y otros servicios adicionales, en el establecimiento comercial que ' +
    'se adecúe mejor a su capacidad económica; sin embargo, el centro educativo puede facilitar la compra o prestación ' +
    'de servicios, siempre y cuando medie convenio por escrito, en el cual lo solicitan los padres de familia, debiendo ' +
    'en tal caso, cumplir con las obligaciones tributarias correspondientes.');
}

// ─── Hoja 2 ──────────────────────────────────────────────────
function hojaDos(doc) {
  literal(doc, 'c', 'La libertad de contratación',
    'El padre de familia o representante legal del educando, tiene el derecho a la libre ' +
    'contratación, por lo que para los bienes o servicios que sean necesarios para la educación de su (s) hijo (s), puede ' +
    'contratar o adquirir los bienes o servicios (Transporte, Seguro Escolar y otros), que más se adecúen a su capacidad ' +
    'económica. Si el proveedor propietario del centro educativo desea autenticar las firmas del contrato, se deja ' +
    'constancia que los honorarios del Notario autorizante serán a su cargo y sin costo alguno para el padre de familia.');

  literal(doc, 'd', 'La información veraz, suficiente, clara y oportuna sobre los bienes y servicios',
    'El centro educativo se compromete ' +
    'a proporcionar a los padres de familia, la información completa sobre el servicio contratado y especialmente los ' +
    'horarios de clases, los grados y las carreras autorizadas que se imparten, los sistemas de evaluación, cursos ' +
    'adicionales que imparten, el monto de las cuotas que cobran, tanto de inscripción como de cuota mensual; así como, ' +
    'de las actividades extraescolares de carácter voluntario u optativas, que se puedan realizar durante el ciclo escolar ' +
    'respectivo y este caso las autoridades del centro educativo, tienen la obligación de cumplir con el Acuerdo ' +
    'Ministerial 483-2010, el que regula las actividades técnicas y administrativas de las academias que imparten cursos ' +
    'libres, las cuales funcionarán bajo la rectoría del Ministerio de Educación, el mismo Acuerdo Ministerial en su ' +
    'Artículo 3, define que las academias de cursos libres son instituciones que ofrecen servicios educativos de formación ' +
    'y capacitación; y el Acuerdo Ministerial 1345 de fecha 2 de septiembre de 1965 que contiene el Reglamento de ' +
    'Excursiones Escolares.');

  literal(doc, 'e', 'Utilizar el Libro de Quejas o el medio legalmente autorizado por la Dirección de Atención y Asistencia al ' +
    'Consumidor, para dejar registro de su disconformidad con respecto a un bien adquirido o servicio contratado',
    'Al hacer constar su inconformidad en el libro de quejas, el padre de familia o representante legal del educando, debe ' +
    'de esperar un período prudencial de ocho días, para que la misma sea resuelta por las autoridades del centro ' +
    'educativo, transcurrido ese tiempo, sin que exista una solución satisfactoria, deberá interponer la queja ' +
    'correspondiente ante la DIACO, para proceder con el procedimiento administrativo respectivo.');

  clausula(doc, 'TERCERA', 'Del Derecho De Retracto: El padre de familia o representante legal del educando, que hubiere firmado el ' +
    'presente contrato, tendrá derecho a retractarse dentro de un plazo no mayor de cinco días hábiles, contados a partir de la ' +
    'firma del contrato. Si ejercita oportunamente este derecho, le serán restituidos en su totalidad los valores pagados.');

  clausula(doc, 'CUARTA', 'Obligaciones Del Padre De Familia O Representante Legal Del Educando: El Padre de Familia o Representante ' +
    'Legal del Educando, en armonía con el Artículo 5 de la Ley de Protección al Consumidor y Usuario, tendrá las siguientes ' +
    'obligaciones:');

  literal(doc, 'a', 'Pagar por los bienes o servicios en el tiempo, modo y condiciones establecidas mediante el presente contrato');
  literal(doc, 'b', 'Utilizar los bienes y servicios, en observancia a su uso normal, de conformidad con las especificaciones ' +
    'proporcionadas por el proveedor y cumplir con las condiciones pactadas en el presente contrato, debiendo para tal ' +
    'efecto, instruir al educando sobre el cuidado, tanto de las instalaciones, como del mobiliario y equipo del centro ' +
    'educativo. En caso daños y perjuicios ocasionados por el alumno, el padre de familia será el responsable, siempre ' +
    'y cuando sean debidamente comprobados y atribuidos al mismo');

  clausula(doc, 'QUINTA', 'De Las Cuotas: Como padre de familia me comprometo a efectuar los pagos, sin necesidad de cobro, ni ' +
    'requerimiento alguno:');

  cuadro(doc, [0.62, 0.38], [
    [{ t: 'EN CONCEPTO DE:', b: true }, { t: 'LA CANTIDAD DE:', b: true }],
    [{ t: 'a) INSCRIPCIÓN POR EDUCANDO: (UN\nSÓLO PAGO ANUAL)', size: 7 }, { t: 'Q 600.00', b: true, size: 10 }],
    [{ t: 'b) COLEGIATURA MENSUAL:\n(10 CUOTAS EN LOS MESES DE ENERO A OCTUBRE)', size: 7 }, { t: 'Q.325.00 / Q.350.00', b: true, size: 10 }],
  ]);

  parrafo(doc, ['Cuotas debidamente autorizadas por el Ministerio de Educación, por medio de la Resolución Administrativa No. 837-2022 ' +
    'DIRECCIÓN DEPARTAMENTAL DE EDUCACIÓN DE SAN MARCOS, de fecha 5 de Septiembre de 2022'], { align: 'left' });

  cuadro(doc, [0.62, 0.19, 0.19], [
    [{ t: 'NIVEL DE EDUCACIÓN', b: true, size: 7 }, { t: 'INSCRIPCIÓN', b: true, size: 7 }, { t: 'COLEGIATURA\nMENSUAL', b: true, size: 7 }],
    [{ t: 'PRE-PRIMARIA: (Párvulos I. II. III.)', size: 7 }, { t: 'Q. 608.35', b: true, size: 9.5 }, { t: 'Q. 342.70', b: true, size: 9.5 }],
    [{ t: 'PRIMARIA: (1º. 2º. 3º. 4º. 5º. y 6º. Grados)', size: 7 }, { t: 'Q. 608.35', b: true, size: 9.5 }, { t: 'Q. 342.70', b: true, size: 9.5 }],
    [{ t: 'NIVEL MEDIO. Ciclo Básico: (1º 2º. y 3º. Grados)', size: 7 }, { t: 'Q. 608.35', b: true, size: 9.5 }, { t: 'Q. 380.21', b: true, size: 9.5 }],
    [{ t: 'Diversificado. (Nombre de la carrera)', size: 7 }, { t: 'Q 0.00', b: true, size: 7 }, { t: 'Q 0.00', b: true, size: 7 }],
  ]);

  parrafo(doc, ['Para el pago de las cuotas, ambas partes acordamos que sea en forma vencida, debiendo efectuar el pago a más tardar, el ' +
    'día cinco del mes siguiente al que corresponde el pago.']);

  clausula(doc, 'SEXTA', 'Del Incumplimiento Del Pago: En caso que el padre de familia o representante legal del educando, se atrase o ' +
    'incumpla en los pagos normados en la cláusula anterior, dará lugar al cobro de intereses por mora, los que serán fijados de ' +
    'conformidad con la tasa de interés legal. El cobro de interés moratorio, será permitido, siempre y cuando se hayan dejado ' +
    'de efectuar los pagos convenidos por uno o dos meses y no será motivo para establecer una cuota diaria o mensual por mora, ' +
    'de conformidad con el Decreto Ley 116-85, sujetándose las autoridades del centro educativo a las sanciones que ' +
    'correspondan.');
}

// ─── Hoja 3 ──────────────────────────────────────────────────
function hojaTres(doc, col) {
  clausula(doc, 'SEPTIMA', 'De Los Cheques Rechazados: Por concepto de cheques rechazados, el centro educativo podrá cobrar, como ' +
    'máximo el valor que por tal motivo debita o cobra el Banco que rechazó el pago del mismo. El monto a cobrar no puede ser ' +
    'desproporcionado.');

  clausula(doc, 'OCTAVA', 'Del Retiro Del Educando: El padre de familia o el representante legal del educando; en todo caso, quien haya ' +
    'sido el firmante del presente contrato, puede retirar al alumno voluntariamente en forma definitiva y para tal efecto deberá:');
  literal(doc, 'a', 'Enviar aviso por escrito a las autoridades del centro educativo');
  literal(doc, 'b', 'Pagar la cuota mensual hasta el mes, en que efectivamente sea retirado el educando del plantel educativo. Sin que ' +
    'esto sea motivo o justificación para retener el expediente educativo');

  clausula(doc, 'NOVENA', 'De Los Derechos Y Obligaciones Del Proveedor Del Servicio Educativo: La autoridad del centro educativo, ' +
    'tendrá derecho a percibir las ganancias o utilidades, que por la prestación del servicio educativo le correspondan; así mismo, ' +
    'exigir al padre de familia o representante legal del educando, el cumplimiento del presente contrato y también podrá, cuando ' +
    'sea necesario, acudir a los órganos administrativos o judiciales para la solución de conflictos que surjan por la prestación ' +
    'del servicio contratado.');

  clausula(doc, 'DÉCIMA', 'De La Copia Del Contrato: Del presente contrato queda el original en poder de la autoridad del centro educativo ' +
    'y se le entregará una copia fiel al padre de familia o representante legal del educando, esto con el propósito de que cada ' +
    'parte esté enterado de sus derechos y obligaciones, para que las ejercite y cumpla de conformidad con lo establecido en el ' +
    'presente contrato. La copia será entregada al padre de familia o representante legal del educando, al momento de firmar el ' +
    'contrato.');

  parrafo(doc, ['Aceptación del Contrato: Nosotros, los comparecientes, damos lectura integra al presente contrato, enterados de su ' +
    'contenido, objeto, validez y demás efectos legales, lo ratificamos, aceptamos y firmamos.']);

  // Firmas
  const x = doc.page.margins.left, w = B.anchoUtil(doc);
  const yFirmas = doc.y + 70, ancho = w * 0.4;
  const representante = [col.representante_titulo, col.representante_nombre].filter(Boolean).join(' ') || 'Representante legal';
  firma(doc, x + 10, yFirmas, ancho, 'Padre de familia y/o Representante Legal del educando');
  firma(doc, x + w - ancho - 10, yFirmas, ancho, representante, col.firmaRuta);
  firma(doc, x + (w - ancho * 0.8) / 2, yFirmas + 90, ancho * 0.8, 'Auténtica');

  doc.x = x;
  doc.y = yFirmas + 150;
  doc.font(F.b).fontSize(7.5).text('CC. al padre de familia o encargado.', x, doc.y);
  doc.moveDown(1.2);

  // Observación importante (recuadro)
  const yObs = doc.y, pad = 5;
  doc.font(F.b).fontSize(7.5);
  const obs = 'Si el proveedor propietario del centro educativo desea autenticar las firmas del contrato, se deja constancia que los ' +
    'honorarios del Notario autorizante serán a su cargo y sin costo alguno para el padre de familia, según la literal c. de la ' +
    'cláusula 2 del presente contrato.';
  doc.text('Observación Importante:', x + pad, yObs + pad, { width: w - pad * 2, underline: true, continued: true })
    .font(F.n).text(` ${obs}`, { underline: false });
  doc.rect(x, yObs, w, doc.y - yObs + pad).lineWidth(0.6).strokeColor('#000000').stroke();
}

/**
 * @param {object} insc    - fila de InscripcionModel.findById
 * @param {object} colegio - ConfiguracionModel.datosColegio()
 */
function generarContrato(insc, colegio) {
  const doc = B.crearDoc(`Contrato ${insc.codigo}`, colegio, { top: 38, bottom: 34, left: 62, right: 62 });
  const col = B.datosColegio(doc);
  hojaUno(doc, insc, col);
  doc.addPage();
  hojaDos(doc);
  doc.addPage();
  hojaTres(doc, col);
  if (insc.estado === 'Anulada') B.marcaAgua(doc, 'ANULADO');
  return doc;
}

module.exports = { generarContrato, nombreGrado };

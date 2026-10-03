const B = require('./base');

// Contrato de prestación de servicios educativos — FORMATO ESTÁNDAR PROVISIONAL.
// Se reemplazará por el formato oficial del colegio; los datos que recibe
// (inscripción, encargado, cuotas pactadas) no cambian.

const nombreGrado = i => [i.nivel, i.carrera, i.grado].filter(Boolean).join(' › ') + (i.seccion ? `, sección ${i.seccion}` : '');

/** Agrupa los cargos por cuota: un renglón por cuota con cobros, monto y vencimientos. */
function resumenCuotas(cargos) {
  const m = new Map();
  for (const c of cargos) {
    if (c.estado === 'Anulado') continue;
    if (!m.has(c.idcuotas_ciclos)) m.set(c.idcuotas_ciclos, { cuota: c.cuota, orden: c.cuota_orden, obligatoria: c.obligatoria, cobros: [], mora_tipo: c.mora_tipo, mora_valor: Number(c.mora_valor) });
    m.get(c.idcuotas_ciclos).cobros.push(c);
  }
  return [...m.values()].sort((a, b) => a.orden - b.orden).map(r => {
    const montos = r.cobros.map(c => Number(c.monto));
    const min = Math.min(...montos), max = Math.max(...montos);
    const primero = r.cobros[0].fecha_vencimiento, ultimo = r.cobros[r.cobros.length - 1].fecha_vencimiento;
    return {
      ...r,
      monto: min === max ? B.q(min) : `${B.q(min)} – ${B.q(max)}`,
      total: montos.reduce((s, n) => s + n, 0),
      vence: r.cobros.length === 1 ? B.fecha(primero) : `Del ${B.fecha(primero)} al ${B.fecha(ultimo)} (día ${Number(primero.substring(8))} de cada mes)`,
      mora: r.mora_tipo === 'Monto' ? B.q(r.mora_valor) : r.mora_tipo === 'Porcentaje' ? `${r.mora_valor}%` : 'Sin mora',
    };
  });
}

function parrafo(doc, titulo, texto) {
  B.asegurarEspacio(doc, 40);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(B.COLOR.oscuro).text(`${titulo}: `, { continued: true })
    .font('Helvetica').fillColor(B.COLOR.texto).text(texto, { align: 'justify', lineGap: 1.5 });
  doc.moveDown(0.5);
}

/**
 * @param {object} insc   - fila de InscripcionModel.findById
 * @param {object[]} cargos - InscripcionModel.cargos
 */
function generarContrato(insc, cargos) {
  const col = B.datosColegio();
  const doc = B.crearDoc(`Contrato ${insc.codigo}`);
  B.encabezado(doc, { titulo: 'Contrato de servicios educativos', numero: insc.codigo, subtitulo: `Ciclo escolar ${insc.ciclo}` });

  const encargado = insc.encargado || '______________________________________';
  const dpiEnc = insc.encargado_dpi || '____________________';

  doc.font('Helvetica').fontSize(9.5).fillColor(B.COLOR.texto).text(
    `En la fecha ${B.fechaLarga(insc.fecha_inscripcion)}, comparecen por una parte ${col.nombre}, en adelante "EL COLEGIO", ` +
    `y por la otra ${encargado}, con Documento Personal de Identificación (DPI) ${dpiEnc}, en calidad de padre, madre o encargado ` +
    `del estudiante, en adelante "EL ENCARGADO", quienes convienen en celebrar el presente contrato de prestación de servicios ` +
    `educativos, conforme a las cláusulas siguientes:`,
    { align: 'justify', lineGap: 1.5 }
  );
  doc.moveDown(0.6);

  B.seccion(doc, 'Datos del estudiante');
  B.campos(doc, [
    ['Estudiante', insc.estudiante],
    ['Código de inscripción', insc.codigo],
    ['CUI / DPI', insc.estudiante_dpi],
    ['Fecha de nacimiento', B.fecha(insc.estudiante_fecha_nacimiento)],
    ['Grado', nombreGrado(insc)],
    ['Ciclo escolar', String(insc.ciclo)],
  ]);

  B.seccion(doc, 'Datos del encargado');
  B.campos(doc, [
    ['Nombre', insc.encargado],
    ['DPI', insc.encargado_dpi],
    ['Teléfono', insc.encargado_telefono],
    ['NIT', insc.encargado_nit],
    ['Dirección', insc.encargado_direccion || insc.estudiante_direccion],
  ]);

  B.seccion(doc, 'Cláusulas');
  parrafo(doc, 'PRIMERA. Objeto',
    `EL COLEGIO se compromete a prestar al estudiante los servicios educativos correspondientes al grado ${nombreGrado(insc)} ` +
    `durante el ciclo escolar ${insc.ciclo}, de acuerdo con los programas autorizados por el Ministerio de Educación.`);
  parrafo(doc, 'SEGUNDA. Cuotas',
    'EL ENCARGADO se obliga a pagar las cuotas detalladas en el cuadro siguiente, en las fechas indicadas. Los montos ' +
    'pactados en este contrato no variarán durante el ciclo escolar.');

  const resumen = resumenCuotas(cargos);
  if (resumen.length) {
    B.tabla(doc, [
      { titulo: 'Cuota', ancho: 0.24 },
      { titulo: 'Cobros', ancho: 0.08, align: 'center' },
      { titulo: 'Monto por cobro', ancho: 0.17, align: 'right' },
      { titulo: 'Vencimiento', ancho: 0.29 },
      { titulo: 'Mora', ancho: 0.09, align: 'right' },
      { titulo: 'Total', ancho: 0.13, align: 'right' },
    ], [
      ...resumen.map(r => [r.cuota + (r.obligatoria ? '' : ' (opcional)'), r.cobros.length, r.monto, r.vence, r.mora, B.q(r.total)]),
      { celdas: ['Total del ciclo', '', '', '', '', B.q(resumen.reduce((s, r) => s + r.total, 0))], negrita: true, fondo: '#EFE6C8' },
    ]);
  } else {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(B.COLOR.gris).text('Las cuotas del ciclo aún no han sido definidas para este grado.');
    doc.moveDown(0.6);
  }

  parrafo(doc, 'TERCERA. Mora',
    'Cada cuota pagada después de su fecha de vencimiento generará el recargo por mora indicado en el cuadro anterior, ' +
    'el cual se cobrará una sola vez por cuota vencida.');
  parrafo(doc, 'CUARTA. Obligaciones del colegio',
    'Impartir la enseñanza con personal calificado, entregar los informes de rendimiento académico en cada unidad y ' +
    'mantener comunicación oportuna con EL ENCARGADO sobre el desempeño y la conducta del estudiante.');
  parrafo(doc, 'QUINTA. Obligaciones del encargado',
    'Velar por la asistencia puntual del estudiante, cumplir el reglamento interno del colegio, asistir a las reuniones ' +
    'a las que sea convocado y mantener al día el pago de las cuotas pactadas.');
  parrafo(doc, 'SEXTA. Retiro',
    'En caso de retiro del estudiante, EL ENCARGADO deberá notificarlo por escrito a la dirección. Las cuotas vencidas ' +
    'a la fecha del retiro deberán cancelarse en su totalidad; la cuota de inscripción no es reembolsable.');
  parrafo(doc, 'SÉPTIMA. Aceptación',
    'Ambas partes, enteradas del contenido, objeto, validez y efectos legales del presente contrato, lo aceptan, ratifican y firman.');

  B.firmas(doc, [
    { nombre: insc.encargado || 'Padre, madre o encargado', detalle: insc.encargado_dpi ? `DPI ${insc.encargado_dpi}` : 'Padre, madre o encargado' },
    { nombre: 'Dirección', detalle: col.nombre },
  ]);

  B.pie(doc, `${insc.codigo} · ${insc.estudiante}`);
  if (insc.estado === 'Anulada') B.marcaAgua(doc, 'ANULADO');
  return doc;
}

module.exports = { generarContrato, nombreGrado };

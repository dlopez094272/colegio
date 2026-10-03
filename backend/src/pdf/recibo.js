const B = require('./base');

const numeroRecibo = n => String(n).padStart(6, '0');

/**
 * Recibo de pago — FORMATO ESTÁNDAR PROVISIONAL.
 * @param {object} pago    - PagoModel.findById
 * @param {object[]} detalle - PagoModel.detalle
 */
function generarRecibo(pago, detalle) {
  const doc = B.crearDoc(`Recibo ${numeroRecibo(pago.numero)}`);
  B.encabezado(doc, { titulo: 'Recibo de pago', numero: `No. ${numeroRecibo(pago.numero)}`, subtitulo: `Fecha: ${B.fecha(pago.fecha_pago)}` });

  B.campos(doc, [
    ['Recibimos de', pago.pagador_nombre],
    ['NIT', pago.pagador_nit],
    ['Forma de pago', pago.forma_pago + (pago.referencia ? ` · Ref. ${pago.referencia}` : '')],
    ['Fecha de pago', B.fechaLarga(pago.fecha_pago)],
  ]);

  B.seccion(doc, 'Detalle');
  const hayMora = detalle.some(d => Number(d.mora_pagada) > 0 || d.mora_exonerada);
  const columnas = hayMora
    ? [
        { titulo: 'Estudiante', ancho: 0.25 }, { titulo: 'Concepto', ancho: 0.27 }, { titulo: 'Vence', ancho: 0.11, align: 'center' },
        { titulo: 'Monto', ancho: 0.12, align: 'right' }, { titulo: 'Mora', ancho: 0.12, align: 'right' }, { titulo: 'Total', ancho: 0.13, align: 'right' },
      ]
    : [
        { titulo: 'Estudiante', ancho: 0.32 }, { titulo: 'Concepto', ancho: 0.36 }, { titulo: 'Vence', ancho: 0.14, align: 'center' },
        { titulo: 'Total', ancho: 0.18, align: 'right' },
      ];
  const filas = detalle.map(d => {
    const est = `${d.estudiante}\n${[d.grado, d.seccion].filter(Boolean).join(' ')} · ${d.codigo}`;
    const mora = d.mora_exonerada ? 'Exonerada' : B.q(d.mora_pagada);
    return hayMora
      ? [est, d.concepto, B.fecha(d.fecha_vencimiento), B.q(d.monto_pagado), mora, B.q(d.total_linea)]
      : [est, d.concepto, B.fecha(d.fecha_vencimiento), B.q(d.total_linea)];
  });
  const vacias = hayMora ? ['', '', '', ''] : ['', ''];
  if (hayMora) {
    filas.push({ celdas: ['Subtotal', '', '', '', '', B.q(pago.subtotal)], fondo: '#FFFFFF' });
    filas.push({ celdas: ['Mora', '', '', '', '', B.q(pago.mora)], fondo: '#FFFFFF' });
  }
  filas.push({ celdas: ['TOTAL', ...vacias, B.q(pago.total)], negrita: true, fondo: '#EFE6C8' });
  B.tabla(doc, columnas, filas);

  doc.font('Helvetica').fontSize(8.5).fillColor(B.COLOR.gris).text('Cantidad en letras:');
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(B.COLOR.texto).text(B.montoEnLetras(pago.total));
  if (pago.observaciones) {
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8.5).fillColor(B.COLOR.gris).text('Observaciones:');
    doc.font('Helvetica').fontSize(9).fillColor(B.COLOR.texto).text(pago.observaciones);
  }
  if (pago.estado === 'Anulado') {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#B23B3B').text(`RECIBO ANULADO${pago.motivo_anulacion ? `: ${pago.motivo_anulacion}` : ''}`);
  }

  B.firmas(doc, [{ nombre: pago.usuario_registro || 'Recibido por', detalle: 'Recibido por' }]);
  B.pie(doc, `Recibo No. ${numeroRecibo(pago.numero)}`);
  if (pago.estado === 'Anulado') B.marcaAgua(doc, 'ANULADO');
  return doc;
}

module.exports = { generarRecibo, numeroRecibo };

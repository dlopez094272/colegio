const B = require('./base');

const numeroRecibo = n => String(n).padStart(6, '0');

/** DATETIME de MySQL (Date) → dd/mm/aaaa hh:mm */
function fechaHora(d) {
  const f = d instanceof Date ? d : new Date(d);
  if (isNaN(f)) return String(d);
  const p = n => String(n).padStart(2, '0');
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

/**
 * Recibo de pago — FORMATO ESTÁNDAR PROVISIONAL.
 * @param {object} pago    - PagoModel.findById
 * @param {object[]} detalle - PagoModel.detalle
 * @param {object} [colegio] - ConfiguracionModel.datosColegio()
 */
function generarRecibo(pago, detalle, colegio = null) {
  const doc = B.crearDoc(`Recibo ${numeroRecibo(pago.numero)}`, colegio);
  B.encabezado(doc, { titulo: 'Recibo de pago', numero: `No. ${numeroRecibo(pago.numero)}`, subtitulo: `Fecha: ${B.fecha(pago.fecha_pago)}` });

  B.campos(doc, [
    ['Recibimos de', pago.pagador_nombre],
    ['NIT', pago.pagador_nit],
    ['Forma de pago', pago.forma_pago + (pago.referencia ? ` · Ref. ${pago.referencia}` : '')],
    ['Fecha de pago', B.fechaLarga(pago.fecha_pago)],
  ]);

  // Recibo electrónico SAT: datos de la certificación (representación gráfica del DTE)
  if (pago.fel_uuid) {
    B.seccion(doc, 'Documento tributario electrónico — Recibo');
    const c = colegio || {};
    B.campos(doc, [
      ['Serie', pago.fel_serie],
      ['Número', pago.fel_numero],
      ['Número de autorización', pago.fel_uuid],
      ['Fecha de certificación', pago.fel_fecha_certificacion ? fechaHora(pago.fel_fecha_certificacion) : ''],
      ['Emisor', `${c.fel_nombre_emisor || c.nombre || ''} · NIT ${c.fel_nit_emisor || c.nit || ''}`],
      ['NIT del receptor', pago.fel_id_receptor],
      ['Certificador', [c.fel_certificador, c.fel_certificador_nit && `NIT ${c.fel_certificador_nit}`].filter(Boolean).join(' · ')],
    ]);
    if (pago.fel_estado === 'Anulado') {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#B23B3B').text('DOCUMENTO ELECTRÓNICO ANULADO ANTE SAT');
      doc.moveDown(0.3);
    }
  }

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

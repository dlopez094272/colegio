const B = require('./base');
const { nombreGrado } = require('./contrato');
const { calcularMora, hoy } = require('../utils/cargos');

/**
 * Estado de cuenta de una inscripción — FORMATO ESTÁNDAR PROVISIONAL.
 * Los cargos pendientes muestran la mora calculada a la fecha de emisión.
 * @param {object} [colegio] - ConfiguracionModel.datosColegio()
 */
function generarEstadoCuenta(insc, cargos, colegio = null) {
  const doc = B.crearDoc(`Estado de cuenta ${insc.codigo}`, colegio);
  const fechaCorte = hoy();
  B.encabezado(doc, { titulo: 'Estado de cuenta', numero: insc.codigo, subtitulo: `Al ${B.fechaLarga(fechaCorte)}` });

  B.campos(doc, [
    ['Estudiante', insc.estudiante],
    ['Grado', nombreGrado(insc)],
    ['Encargado', insc.encargado],
    ['Ciclo escolar', String(insc.ciclo)],
  ]);

  let pagado = 0, pendiente = 0, moraPend = 0, vencido = 0;
  const filas = cargos.map(c => {
    const monto = Number(c.monto);
    if (c.estado === 'Pagado') {
      pagado += Number(c.total_pagado ?? monto);
      return [c.concepto, B.fecha(c.fecha_vencimiento), B.q(monto), B.q(c.mora_pagada || 0), 'Pagado', B.fecha(c.fecha_pago), c.recibo ? String(c.recibo).padStart(6, '0') : ''];
    }
    if (c.estado === 'Anulado') {
      return { celdas: [c.concepto, B.fecha(c.fecha_vencimiento), B.q(monto), '', 'Anulado', '', ''], color: B.COLOR.gris };
    }
    const mora = calcularMora(c, fechaCorte);
    const venc = c.fecha_vencimiento < fechaCorte;
    pendiente += monto; moraPend += mora;
    if (venc) vencido += monto + mora;
    return { celdas: [c.concepto, B.fecha(c.fecha_vencimiento), B.q(monto), mora ? B.q(mora) : '', venc ? 'Vencido' : 'Pendiente', '', ''], color: venc ? '#B23B3B' : undefined };
  });

  B.seccion(doc, 'Detalle de cuotas');
  if (filas.length) {
    B.tabla(doc, [
      { titulo: 'Concepto', ancho: 0.30 },
      { titulo: 'Vence', ancho: 0.11, align: 'center' },
      { titulo: 'Monto', ancho: 0.13, align: 'right' },
      { titulo: 'Mora', ancho: 0.10, align: 'right' },
      { titulo: 'Estado', ancho: 0.11, align: 'center' },
      { titulo: 'Fecha de pago', ancho: 0.13, align: 'center' },
      { titulo: 'Recibo', ancho: 0.12, align: 'center' },
    ], filas);
  } else {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(B.COLOR.gris).text('La inscripción no tiene cuotas asignadas.');
    doc.moveDown();
  }

  B.seccion(doc, 'Resumen');
  B.tabla(doc, [{ titulo: 'Concepto', ancho: 0.7 }, { titulo: 'Monto', ancho: 0.3, align: 'right' }], [
    ['Total pagado', B.q(pagado)],
    ['Cuotas pendientes', B.q(pendiente)],
    ['Mora a la fecha', B.q(moraPend)],
    { celdas: ['Saldo vencido (incluye mora)', B.q(vencido)], color: vencido ? '#B23B3B' : undefined },
    { celdas: ['Saldo total a la fecha', B.q(pendiente + moraPend)], negrita: true, fondo: '#EFE6C8' },
  ]);

  B.pie(doc, `${insc.codigo} · ${insc.estudiante}`);
  if (insc.estado === 'Anulada') B.marcaAgua(doc, 'ANULADA');
  return doc;
}

module.exports = { generarEstadoCuenta };

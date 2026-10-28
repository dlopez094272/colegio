const B = require('./base');
const { lineasDocumento, calcularLineas, tipoDte } = require('../utils/fel');

const numeroRecibo = n => String(n).padStart(6, '0');

/** DATETIME de MySQL (Date) → dd/mm/aaaa hh:mm */
function fechaHora(d) {
  const f = d instanceof Date ? d : new Date(d);
  if (isNaN(f)) return String(d);
  const p = n => String(n).padStart(2, '0');
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

const documento = (pago, tipo) => (pago.documentos || []).find(d => d.tipo === tipo) || null;

/**
 * Con FEL (habilitado, o el pago ya tiene algún documento certificado) el pago
 * se imprime en dos formatos: el recibo con las cuotas que emiten recibo y la
 * factura con la mora y las demás cuotas. Sin FEL, el recibo lleva todo.
 */
const separaDocumentos = (pago, colegio) => !!colegio?.fel_habilitado || (pago.documentos || []).some(d => d.uuid);

/** Recuadro con los datos de certificación FEL en cuadrícula. */
function datosFel(doc, d, c) {
  const x0 = doc.page.margins.left, w = B.anchoUtil(doc), pad = 10, altoFila = 26;
  const certificador = [c.fel_certificador, c.fel_certificador_nit && `NIT ${c.fel_certificador_nit}`].filter(Boolean).join(' · ');
  const anulado = d.estado === 'Anulado';
  const alto = pad * 2 + altoFila * 2 + (certificador ? 14 : 0) + (anulado ? 14 : 0);
  B.asegurarEspacio(doc, alto + 8);

  const y0 = doc.y, wi = w - pad * 2;
  doc.roundedRect(x0, y0, w, alto, 3).fillAndStroke(B.COLOR.fondo, B.COLOR.linea);

  const celda = (label, valor, x, y, ancho) => {
    doc.font('Helvetica').fontSize(7.5).fillColor(B.COLOR.gris).text(label.toUpperCase(), x, y, { width: ancho - 8, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(B.COLOR.texto).text(valor || '—', x, y + 10, { width: ancho - 8, lineBreak: false, ellipsis: true });
  };
  const xi = x0 + pad;
  let y = y0 + pad;
  celda('Serie', d.serie, xi, y, wi * 0.3);
  celda('Número', d.numero, xi + wi * 0.3, y, wi * 0.3);
  celda('Fecha de certificación', d.fecha_certificacion ? fechaHora(d.fecha_certificacion) : '', xi + wi * 0.6, y, wi * 0.4);
  y += altoFila;
  celda('Número de autorización', d.uuid, xi, y, wi * 0.6);
  celda('NIT del receptor', d.id_receptor, xi + wi * 0.6, y, wi * 0.4);
  y += altoFila;
  if (certificador) {
    doc.font('Helvetica').fontSize(8).fillColor(B.COLOR.gris).text(`Certificador: ${certificador}`, xi, y, { width: wi, lineBreak: false });
    y += 14;
  }
  if (anulado) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#B23B3B').text('DOCUMENTO ELECTRÓNICO ANULADO ANTE SAT', xi, y, { width: wi, lineBreak: false });
  }

  doc.x = x0;
  doc.y = y0 + alto + 8;
  doc.fillColor(B.COLOR.texto);
}

/** Aviso en texto pequeño (ej. "pendiente de certificación"). */
function aviso(doc, texto, color = B.COLOR.gris) {
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(color).text(texto);
  doc.moveDown(0.4);
  doc.fillColor(B.COLOR.texto);
}

function datosPago(doc, pago, etiquetaNombre) {
  B.campos(doc, [
    [etiquetaNombre, pago.pagador_nombre],
    ['NIT', pago.pagador_nit],
    ['Forma de pago', pago.forma_pago + (pago.referencia ? ` · Ref. ${pago.referencia}` : '')],
    ['Fecha de pago', B.fechaLarga(pago.fecha_pago)],
  ]);
}

function cierre(doc, pago, total) {
  doc.font('Helvetica').fontSize(8.5).fillColor(B.COLOR.gris).text('Cantidad en letras:');
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(B.COLOR.texto).text(B.montoEnLetras(total));
  if (pago.observaciones) {
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8.5).fillColor(B.COLOR.gris).text('Observaciones:');
    doc.font('Helvetica').fontSize(9).fillColor(B.COLOR.texto).text(pago.observaciones);
  }
  if (pago.estado === 'Anulado') {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#B23B3B').text(`PAGO ANULADO${pago.motivo_anulacion ? `: ${pago.motivo_anulacion}` : ''}`);
  }
}

const estudianteCelda = d => `${d.estudiante}\n${[d.grado, d.seccion].filter(Boolean).join(' ')} · ${d.codigo}`;

/**
 * Recibo de pago — FORMATO ESTÁNDAR PROVISIONAL.
 * Con FEL solo lleva las cuotas que emiten recibo (sin mora); sin FEL, todo el pago.
 * @param {object} pago    - PagoModel.findById
 * @param {object[]} detalle - PagoModel.detalle
 * @param {object} [colegio] - ConfiguracionModel.datosColegio()
 */
function generarRecibo(pago, detalle, colegio = null) {
  const separa = separaDocumentos(pago, colegio);
  const lineas = separa ? detalle.filter(d => Number(d.emite_recibo)) : detalle;
  const doc = B.crearDoc(`Recibo ${numeroRecibo(pago.numero)}`, colegio);
  B.encabezado(doc, { titulo: 'Recibo de pago', numero: `No. ${numeroRecibo(pago.numero)}`, subtitulo: `Fecha: ${B.fecha(pago.fecha_pago)}` });
  datosPago(doc, pago, 'Recibimos de');

  // Recibo electrónico SAT: datos de la certificación (representación gráfica del DTE).
  // El emisor ya figura en el membrete, no se repite aquí.
  const reci = documento(pago, 'RECI');
  if (reci?.uuid) {
    B.seccion(doc, 'Documento tributario electrónico — Recibo');
    datosFel(doc, reci, colegio || {});
  }

  B.seccion(doc, 'Detalle');
  const hayMora = !separa && lineas.some(d => Number(d.mora_pagada) > 0 || d.mora_exonerada);
  const columnas = hayMora
    ? [
        { titulo: 'Estudiante', ancho: 0.25 }, { titulo: 'Concepto', ancho: 0.27 }, { titulo: 'Vence', ancho: 0.11, align: 'center' },
        { titulo: 'Monto', ancho: 0.12, align: 'right' }, { titulo: 'Mora', ancho: 0.12, align: 'right' }, { titulo: 'Total', ancho: 0.13, align: 'right' },
      ]
    : [
        { titulo: 'Estudiante', ancho: 0.32 }, { titulo: 'Concepto', ancho: 0.36 }, { titulo: 'Vence', ancho: 0.14, align: 'center' },
        { titulo: 'Total', ancho: 0.18, align: 'right' },
      ];
  const filas = lineas.map(d => {
    const mora = d.mora_exonerada ? 'Exonerada' : B.q(d.mora_pagada);
    return hayMora
      ? [estudianteCelda(d), d.concepto, B.fecha(d.fecha_vencimiento), B.q(d.monto_pagado), mora, B.q(d.total_linea)]
      : [estudianteCelda(d), d.concepto, B.fecha(d.fecha_vencimiento), B.q(separa ? d.monto_pagado : d.total_linea)];
  });
  const total = separa ? Number(pago.total_recibo) : Number(pago.total);
  const vacias = hayMora ? ['', '', '', ''] : ['', ''];
  if (hayMora) {
    filas.push({ celdas: ['Subtotal', '', '', '', '', B.q(pago.subtotal)], fondo: '#FFFFFF' });
    filas.push({ celdas: ['Mora', '', '', '', '', B.q(pago.mora)], fondo: '#FFFFFF' });
  }
  filas.push({ celdas: ['TOTAL', ...vacias, B.q(total)], negrita: true, fondo: '#EFE6C8' });
  B.tabla(doc, columnas, filas);

  // La mora y las cuotas que no emiten recibo van en la factura del mismo pago
  const fact = separa && Number(pago.total_factura) > 0 ? documento(pago, 'FACT') : null;
  if (fact) {
    const ref = fact.uuid ? ` (serie ${fact.serie}, No. ${fact.numero})` : '';
    aviso(doc, `La mora y otros cargos de este pago (${B.q(fact.total)}) se documentan en la factura${ref}. Total pagado: ${B.q(pago.total)}.`);
  }

  cierre(doc, pago, total);
  B.firmas(doc, [{ nombre: pago.usuario_registro || 'Recibido por', detalle: 'Recibido por' }]);
  B.pie(doc, `Recibo No. ${numeroRecibo(pago.numero)}`);
  if (pago.estado === 'Anulado') B.marcaAgua(doc, 'ANULADO');
  return doc;
}

/**
 * Factura del pago (mora y cuotas que no emiten recibo) — FORMATO ESTÁNDAR PROVISIONAL.
 * Si ya se certificó toma el total e IVA certificados; si no, los calcula con
 * la configuración FEL actual y se marca como pendiente de certificación.
 */
function generarFactura(pago, detalle, colegio = null) {
  const c = colegio || {};
  const fact = documento(pago, 'FACT') || { tipo: 'FACT', estado: null };
  const dte = fact.dte || tipoDte(c, 'FACT');
  const lineas = calcularLineas(c, dte, lineasDocumento(detalle, 'FACT'));
  const total = fact.total ?? lineas.reduce((s, l) => s + l.total, 0);
  const iva = fact.iva ?? Math.round(lineas.reduce((s, l) => s + (l.impuesto?.monto || 0), 0) * 100) / 100;

  const numero = fact.uuid ? `Serie ${fact.serie} · No. ${fact.numero}` : `Pago No. ${numeroRecibo(pago.numero)}`;
  const doc = B.crearDoc(`Factura ${fact.uuid ? fact.numero : numeroRecibo(pago.numero)}`, colegio);
  B.encabezado(doc, {
    titulo: dte === 'FPEQ' ? 'Factura pequeño contribuyente' : 'Factura',
    numero,
    subtitulo: `${fact.uuid ? `Pago No. ${numeroRecibo(pago.numero)} · ` : ''}Fecha: ${B.fecha(pago.fecha_pago)}`,
  });
  datosPago(doc, pago, 'Nombre');

  if (fact.uuid) {
    B.seccion(doc, 'Documento tributario electrónico — Factura');
    datosFel(doc, fact, c);
  } else if (pago.estado === 'Activo') {
    aviso(doc, 'Factura pendiente de certificación ante SAT: este documento no tiene validez tributaria hasta certificarse.', '#B23B3B');
  }

  B.seccion(doc, 'Detalle');
  const columnas = [{ titulo: 'Descripción', ancho: 0.8 }, { titulo: 'Total', ancho: 0.2, align: 'right' }];
  const filas = lineas.map(l => [l.descripcion, B.q(l.total)]);
  if (dte === 'FACT' && iva > 0) {
    filas.push({ celdas: ['Subtotal sin IVA', B.q(total - iva)], fondo: '#FFFFFF' });
    filas.push({ celdas: ['IVA (12%)', B.q(iva)], fondo: '#FFFFFF' });
  }
  filas.push({ celdas: ['TOTAL', B.q(total)], negrita: true, fondo: '#EFE6C8' });
  B.tabla(doc, columnas, filas);

  if (Number(pago.total_recibo) > 0) {
    const reci = documento(pago, 'RECI');
    const ref = reci?.uuid ? ` electrónico (serie ${reci.serie}, No. ${reci.numero})` : ` No. ${numeroRecibo(pago.numero)}`;
    aviso(doc, `Las cuotas de inscripción y colegiatura de este pago (${B.q(pago.total_recibo)}) se documentan en el recibo${ref}. Total pagado: ${B.q(pago.total)}.`);
  }

  cierre(doc, pago, total);
  B.pie(doc, `Factura del pago No. ${numeroRecibo(pago.numero)}`);
  if (pago.estado === 'Anulado' || fact.estado === 'Anulado') B.marcaAgua(doc, 'ANULADA');
  return doc;
}

module.exports = { generarRecibo, generarFactura, separaDocumentos, numeroRecibo };

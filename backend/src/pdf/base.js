const fs = require('fs');
const PDFDocument = require('pdfkit');
const { getCurrentTenant } = require('../config/tenantContext');

// Utilidades comunes a los PDF (contrato, recibo, estado de cuenta).
// Formato: carta, encabezado con los datos y el logotipo del colegio
// (ConfiguracionModel.datosColegio, que el controlador pasa a crearDoc) y
// paleta del sistema (amarillo apagado + carbón).

const COLOR = { acento: '#D4B24C', oscuro: '#1E1D1B', texto: '#2A2926', gris: '#6B6862', linea: '#D9D5CC', fondo: '#F6F4EF' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Datos del colegio con que se creó el documento (o los de tenants.json si no se pasaron). */
function datosColegio(doc) {
  if (doc?._colegio) return doc._colegio;
  const c = getCurrentTenant()?.colegio || {};
  return { nombre: c.nombre || 'Colegio', direccion: c.direccion || '', telefonos: c.telefono || '', nit: c.nit || '' };
}

/** @param {object} [colegio] - ConfiguracionModel.datosColegio() */
function crearDoc(titulo, colegio = null, margins = { top: 48, bottom: 56, left: 54, right: 54 }) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins,
    bufferPages: true,
    info: { Title: titulo, Author: colegio?.nombre || datosColegio().nombre },
  });
  doc._colegio = colegio || datosColegio();
  return doc;
}

/** Dibuja una imagen (logo, firma) si existe y es PNG/JPG; no interrumpe el PDF si falla. */
function imagen(doc, ruta, x, y, opts) {
  if (!ruta || !fs.existsSync(ruta)) return false;
  try { doc.image(ruta, x, y, opts); return true; } catch { return false; }
}

/** Genera el PDF completo en memoria (para adjuntarlo a un correo). */
function aBuffer(doc) {
  return new Promise((resolve, reject) => {
    const partes = [];
    doc.on('data', d => partes.push(d));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    doc.end();
  });
}

/** Escribe el PDF en la respuesta (inline para verlo, attachment para descargarlo). */
function enviar(res, doc, nombreArchivo, descargar = false) {
  const seguro = nombreArchivo.replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename="${seguro}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
  doc.end();
}

// ─── Formato ─────────────────────────────────────────────────
function q(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}Q ${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

function fecha(f) {
  if (!f) return '';
  const s = typeof f === 'string' ? f : `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  const [y, m, d] = s.substring(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function fechaLarga(f) {
  const [y, m, d] = String(f).substring(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
  'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorMil(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  let t = CENTENAS[c];
  if (r) {
    const dr = r < 30 ? UNIDADES[r] : DECENAS[Math.floor(r / 10)] + (r % 10 ? ` Y ${UNIDADES[r % 10]}` : '');
    t = t ? `${t} ${dr}` : dr;
  }
  return t;
}

/** 1250.5 → "MIL DOSCIENTOS CINCUENTA QUETZALES CON 50/100" */
function montoEnLetras(monto) {
  const v = Math.round(Number(monto || 0) * 100);
  const ent = Math.floor(v / 100), cent = v % 100;
  let txt;
  if (ent === 0) txt = 'CERO';
  else {
    const millones = Math.floor(ent / 1e6), miles = Math.floor((ent % 1e6) / 1000), resto = ent % 1000;
    const partes = [];
    if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${menorMil(millones)} MILLONES`);
    if (miles) partes.push(miles === 1 ? 'MIL' : `${menorMil(miles)} MIL`);
    if (resto) partes.push(menorMil(resto));
    txt = partes.join(' ');
  }
  return `${txt} ${ent === 1 ? 'QUETZAL' : 'QUETZALES'} CON ${String(cent).padStart(2, '0')}/100`;
}

// ─── Bloques de dibujo ───────────────────────────────────────
const anchoUtil = doc => doc.page.width - doc.page.margins.left - doc.page.margins.right;

/** Encabezado: colegio a la izquierda, título del documento y número a la derecha. */
function encabezado(doc, { titulo, numero, subtitulo }) {
  const col = datosColegio(doc);
  const x = doc.page.margins.left, y = doc.page.margins.top, w = anchoUtil(doc);

  // Logotipo (si está configurado) en lugar de la barra de acento
  const conLogo = imagen(doc, col.logoRuta, x, y, { fit: [46, 46], align: 'center', valign: 'center' });
  if (!conLogo) doc.rect(x, y, 6, 46).fill(COLOR.acento);
  const xt = x + (conLogo ? 54 : 14), wt = w * 0.58 - (conLogo ? 40 : 0);
  doc.fillColor(COLOR.oscuro).font('Helvetica-Bold').fontSize(15).text(col.nombre, xt, y, { width: wt });
  const lugar = [col.direccion, [col.municipio, col.departamento].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const lineas = [lugar, [col.telefonos && `Tel. ${col.telefonos}`, col.nit && `NIT ${col.nit}`].filter(Boolean).join('  ·  ')].filter(Boolean);
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.gris).text(lineas.join('\n') || ' ', xt, doc.y + 2, { width: wt });
  const finIzq = doc.y;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR.oscuro).text(titulo.toUpperCase(), x + w * 0.55, y, { width: w * 0.45, align: 'right' });
  if (numero) doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.acento).text(numero, { width: w * 0.45, align: 'right' });
  if (subtitulo) doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.gris).text(subtitulo, { width: w * 0.45, align: 'right' });

  const fin = Math.max(y + 52, doc.y + 6, finIzq + 6);
  doc.moveTo(x, fin).lineTo(x + w, fin).lineWidth(1).strokeColor(COLOR.linea).stroke();
  doc.x = x;
  doc.y = fin + 12;
  doc.fillColor(COLOR.texto);
}

/** Título de sección con línea de acento. */
function seccion(doc, texto) {
  asegurarEspacio(doc, 40);
  const x = doc.page.margins.left;
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.oscuro).text(texto.toUpperCase(), x, doc.y, { characterSpacing: 0.6 });
  doc.moveTo(x, doc.y + 2).lineTo(x + 28, doc.y + 2).lineWidth(2).strokeColor(COLOR.acento).stroke();
  doc.y += 8;
  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.texto);
}

/** Pares etiqueta/valor en dos columnas. */
function campos(doc, pares, columnas = 2) {
  const x0 = doc.page.margins.left, w = anchoUtil(doc), colW = w / columnas;
  const filas = [];
  for (let i = 0; i < pares.length; i += columnas) filas.push(pares.slice(i, i + columnas));
  for (const fila of filas) {
    asegurarEspacio(doc, 26);
    const y = doc.y;
    let alto = 0;
    fila.forEach(([label, valor], i) => {
      const x = x0 + i * colW;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.gris).text(label.toUpperCase(), x, y, { width: colW - 10 });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.texto).text(valor || '—', x, doc.y + 1, { width: colW - 10 });
      alto = Math.max(alto, doc.y - y);
    });
    doc.x = x0;
    doc.y = y + alto + 6;
  }
}

function asegurarEspacio(doc, alto) {
  if (doc.y + alto > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

/**
 * Tabla simple con salto de página (repite el encabezado).
 * columnas: [{ titulo, ancho (fracción), align }]; filas: arrays de texto
 * (una fila puede ser { celdas, negrita, fondo, color } para totales/estados).
 */
function tabla(doc, columnas, filas) {
  const x0 = doc.page.margins.left, w = anchoUtil(doc), pad = 5;
  const anchos = columnas.map(c => c.ancho * w);

  const dibujarEncabezado = () => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(8);
    const alto = Math.max(...columnas.map((c, i) => doc.heightOfString(c.titulo, { width: anchos[i] - pad * 2 }))) + pad * 2;
    doc.rect(x0, y, w, alto).fill(COLOR.oscuro);
    let x = x0;
    columnas.forEach((c, i) => {
      doc.fillColor('#FFFFFF').text(c.titulo, x + pad, y + pad, { width: anchos[i] - pad * 2, align: c.align || 'left' });
      x += anchos[i];
    });
    doc.y = y + alto;
  };

  dibujarEncabezado();
  filas.forEach((f, n) => {
    const fila = Array.isArray(f) ? { celdas: f } : f;
    doc.font(fila.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    const alto = Math.max(...fila.celdas.map((t, i) => doc.heightOfString(String(t ?? ''), { width: anchos[i] - pad * 2 }))) + pad * 2;
    if (doc.y + alto > doc.page.height - doc.page.margins.bottom) { doc.addPage(); dibujarEncabezado(); }
    const y = doc.y;
    const fondo = fila.fondo ?? (n % 2 ? COLOR.fondo : null);
    if (fondo) doc.rect(x0, y, w, alto).fill(fondo);
    let x = x0;
    fila.celdas.forEach((t, i) => {
      doc.font(fila.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(fila.color || COLOR.texto)
        .text(String(t ?? ''), x + pad, y + pad, { width: anchos[i] - pad * 2, align: columnas[i].align || 'left' });
      x += anchos[i];
    });
    doc.moveTo(x0, y + alto).lineTo(x0 + w, y + alto).lineWidth(0.5).strokeColor(COLOR.linea).stroke();
    doc.y = y + alto;
  });
  doc.x = x0;
  doc.moveDown(0.6);
}

/** Líneas de firma lado a lado. firmas: [{ nombre, detalle }] */
function firmas(doc, lista) {
  asegurarEspacio(doc, 90);
  const x0 = doc.page.margins.left, w = anchoUtil(doc);
  const colW = w / lista.length;
  const y = doc.y + 48;
  lista.forEach((f, i) => {
    const x = x0 + i * colW + 20, lw = colW - 40;
    doc.moveTo(x, y).lineTo(x + lw, y).lineWidth(0.8).strokeColor(COLOR.texto).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.texto).text(f.nombre || ' ', x, y + 4, { width: lw, align: 'center' });
    if (f.detalle) doc.font('Helvetica').fontSize(8).fillColor(COLOR.gris).text(f.detalle, x, doc.y + 1, { width: lw, align: 'center' });
  });
  doc.x = x0;
  doc.y = y + 40;
}

/** Pie con fecha de emisión y "Página x de y" en todas las páginas. */
function pie(doc, texto = '') {
  const rango = doc.bufferedPageRange();
  const emitido = `Emitido el ${fecha(new Date())}`;
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // escribir dentro del margen sin provocar un salto de página
    const y = doc.page.height - 36, x = doc.page.margins.left, w = anchoUtil(doc);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.gris);
    doc.text([texto, emitido].filter(Boolean).join('  ·  '), x, y, { width: w * 0.7, lineBreak: false });
    doc.text(`Página ${i - rango.start + 1} de ${rango.count}`, x + w * 0.7, y, { width: w * 0.3, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

/** Marca de agua diagonal (ej. ANULADO). */
function marcaAgua(doc, texto) {
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font('Helvetica-Bold').fontSize(90).fillColor('#C62828').opacity(0.12)
      .text(texto, 0, doc.page.height / 2 - 50, { width: doc.page.width, align: 'center', lineBreak: false });
    doc.restore();
    doc.opacity(1);
  }
}

module.exports = {
  COLOR, MESES, datosColegio, crearDoc, enviar, imagen, aBuffer,
  q, fecha, fechaLarga, montoEnLetras,
  anchoUtil, encabezado, seccion, campos, tabla, firmas, pie, marcaAgua, asegurarEspacio,
};

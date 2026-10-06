const InscripcionModel   = require('../models/inscripcionModel');
const PagoModel          = require('../models/pagoModel');
const ConfiguracionModel = require('../models/configuracionModel');
const { sendMail } = require('../config/mailer');
const { registrarBitacora } = require('./bitacora');
const { fail } = require('./transaccion');
const B = require('../pdf/base');
const { generarContrato, nombreGrado } = require('../pdf/contrato');
const { generarRecibo, numeroRecibo } = require('../pdf/recibo');

// Correos al padre de familia: aviso de inscripción (con el contrato en PDF)
// y comprobante de cada pago (con el recibo en PDF).

const RE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "a@x.com, b@y.com" | ['a@x.com'] → lista válida sin repetidos; lanza 400 si alguna no es válida. */
function leerCorreos(valor) {
  const lista = (Array.isArray(valor) ? valor : String(valor ?? '').split(/[,;\s]+/))
    .map(c => String(c).trim().toLowerCase()).filter(Boolean);
  const malo = lista.find(c => !RE_EMAIL.test(c) || c.length > 145);
  if (malo) throw fail(400, `El correo "${malo}" no es válido`);
  return [...new Set(lista)].slice(0, 5);
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Correo con el encabezado del colegio y pie con sus datos de contacto. */
function plantilla(col, titulo, cuerpo) {
  const contacto = [
    [col.direccion, col.municipio, col.departamento].filter(Boolean).join(', '),
    col.telefonos && `Tel. ${col.telefonos}`,
    col.email,
  ].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html><html><body style="margin:0;background:#F6F4EF;font-family:Segoe UI,Arial,sans-serif;color:#2A2926">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4EF;padding:24px 0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E4E0D6">
      <tr><td style="background:#1E1D1B;padding:18px 24px;border-bottom:4px solid #D4B24C">
        <div style="color:#D4B24C;font-size:18px;font-weight:700">${esc(col.nombre)}</div>
        <div style="color:#E8E4DA;font-size:13px;margin-top:2px">${esc(titulo)}</div>
      </td></tr>
      <tr><td style="padding:22px 24px;font-size:14px;line-height:1.55">${cuerpo}</td></tr>
      <tr><td style="padding:14px 24px;background:#FAF8F3;border-top:1px solid #E4E0D6;font-size:11.5px;color:#6B6862">
        ${contacto || esc(col.nombre)}<br>Este es un mensaje automático; si tiene dudas comuníquese con la administración del colegio.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** Tabla simple para el cuerpo del correo. filas: [[celda, ...]] (la última columna alineada a la derecha). */
function tablaHtml(titulos, filas, pie = null) {
  const th = titulos.map((t, i) => `<th style="text-align:${i === titulos.length - 1 ? 'right' : 'left'};padding:7px 8px;background:#1E1D1B;color:#fff;font-size:12px;font-weight:600">${esc(t)}</th>`).join('');
  const tr = filas.map((f, n) => `<tr style="background:${n % 2 ? '#FAF8F3' : '#fff'}">${f.map((c, i) =>
    `<td style="padding:6px 8px;border-bottom:1px solid #ECE8DF;font-size:13px;${i === f.length - 1 ? 'text-align:right;white-space:nowrap' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('');
  const tf = pie ? `<tr style="background:#EFE6C8;font-weight:700">${pie.map((c, i) =>
    `<td style="padding:7px 8px;font-size:13px;${i === pie.length - 1 ? 'text-align:right;white-space:nowrap' : ''}">${esc(c)}</td>`).join('')}</tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0">${th ? `<tr>${th}</tr>` : ''}${tr}${tf}</table>`;
}

/** Una fila por cuota del estado de cuenta: cobros, monto por cobro y primer vencimiento. */
function resumenCuotas(cargos) {
  const m = new Map();
  for (const c of cargos) {
    if (c.estado === 'Anulado') continue;
    if (!m.has(c.idcuotas_ciclos)) m.set(c.idcuotas_ciclos, { cuota: c.cuota, orden: c.cuota_orden, cobros: [] });
    m.get(c.idcuotas_ciclos).cobros.push(c);
  }
  return [...m.values()].sort((a, b) => a.orden - b.orden).map(r => {
    const total = r.cobros.reduce((s, c) => s + Number(c.monto), 0);
    const primero = r.cobros[0];
    return {
      fila: [
        r.cuota,
        r.cobros.length === 1 ? `Vence ${B.fecha(primero.fecha_vencimiento)}` : `${r.cobros.length} cobros de ${B.q(primero.monto)} desde ${B.fecha(primero.fecha_vencimiento)}`,
        B.q(total),
      ],
      total,
    };
  });
}

/**
 * Aviso de inscripción al encargado, con el contrato en PDF.
 * @param {number} id
 * @param {object} opts - { correos?: destinatarios (si no, el correo del encargado), req }
 */
async function notificarInscripcion(id, { correos = null, req } = {}) {
  const i = await InscripcionModel.findById(id);
  if (!i) throw fail(404, 'Inscripción no encontrada');
  if (i.estado !== 'Activa') throw fail(409, 'La inscripción está anulada');
  const para = correos && leerCorreos(correos).length ? leerCorreos(correos) : leerCorreos(i.encargado_email);
  if (!para.length) throw fail(400, i.encargado ? `${i.encargado} no tiene correo electrónico registrado` : 'La inscripción no tiene encargado con correo electrónico');

  const [col, cargos] = await Promise.all([ConfiguracionModel.datosColegio(), InscripcionModel.cargos(id)]);
  const cuotas = resumenCuotas(cargos);
  const cuerpo = `
    <p>Estimado(a) <strong>${esc(i.encargado || 'padre de familia')}</strong>:</p>
    <p>Le confirmamos que <strong>${esc(i.estudiante)}</strong> quedó inscrito(a) en <strong>${esc(nombreGrado(i))}</strong>
       para el ciclo escolar <strong>${esc(i.ciclo)}</strong>.</p>
    ${tablaHtml([], [
      ['Código de inscripción', i.codigo],
      ['Fecha de inscripción', B.fechaLarga(i.fecha_inscripcion)],
    ])}
    ${cuotas.length ? `<p style="margin-bottom:0"><strong>Cuotas del ciclo</strong></p>
      ${tablaHtml(['Cuota', 'Cobro', 'Total'], cuotas.map(c => c.fila), ['Total del ciclo', '', B.q(cuotas.reduce((s, c) => s + c.total, 0))])}` : ''}
    <p>Adjuntamos el contrato de prestación de servicios educativos para su lectura. Le agradeceremos presentarse a firmarlo
       si aún no lo ha hecho.</p>
    <p>Atentamente,<br><strong>${esc(col.nombre)}</strong></p>`;

  const pdf = await B.aBuffer(generarContrato(i, col));
  await sendMail({
    to: para.join(', '),
    subject: `Inscripción ${i.codigo} — ${i.estudiante}`,
    html: plantilla(col, `Confirmación de inscripción · Ciclo ${i.ciclo}`, cuerpo),
    attachments: [{ filename: `Contrato ${i.codigo}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  await registrarBitacora({
    tabla: 'inscripciones', idregistro: id, accion: 'NOTIFICAR',
    descripcion: `Notificación de inscripción ${i.codigo} enviada a ${para.join(', ')}`,
    valoresDespues: { para }, req,
  });
  return { destinatarios: para };
}

/**
 * Comprobante de pago (recibo en PDF) al padre que pagó o a los encargados.
 * @param {number} id
 * @param {object} opts - { correos?: destinatarios, req }
 */
async function notificarPago(id, { correos = null, req } = {}) {
  const p = await PagoModel.findById(id);
  if (!p) throw fail(404, 'Pago no encontrado');
  if (p.estado !== 'Activo') throw fail(409, 'El recibo está anulado');
  const para = correos && leerCorreos(correos).length ? leerCorreos(correos) : leerCorreos(await PagoModel.correosComprobante(id));
  if (!para.length) throw fail(400, 'Ni el pagador ni los encargados tienen correo electrónico registrado');

  const [col, detalle] = await Promise.all([ConfiguracionModel.datosColegio(), PagoModel.detalle(id)]);
  const num = numeroRecibo(p.numero);
  const cuerpo = `
    <p>Estimado(a) <strong>${esc(p.pagador_nombre)}</strong>:</p>
    <p>Hemos recibido su pago. Este es el comprobante:</p>
    ${tablaHtml([], [
      ['Recibo No.', num],
      ['Fecha de pago', B.fechaLarga(p.fecha_pago)],
      ['Forma de pago', p.forma_pago + (p.referencia ? ` · Ref. ${p.referencia}` : '')],
    ])}
    ${tablaHtml(['Estudiante', 'Concepto', 'Total'],
      detalle.map(d => [d.estudiante, d.concepto + (Number(d.mora_pagada) > 0 ? ` (incluye mora ${B.q(d.mora_pagada)})` : ''), B.q(d.total_linea)]),
      ['Total pagado', '', B.q(p.total)])}
    <p style="font-size:12.5px;color:#6B6862">${esc(B.montoEnLetras(p.total))}</p>
    <p>Adjuntamos el recibo en PDF. ¡Gracias por su pago!</p>
    <p>Atentamente,<br><strong>${esc(col.nombre)}</strong></p>`;

  const pdf = await B.aBuffer(generarRecibo(p, detalle, col));
  await sendMail({
    to: para.join(', '),
    subject: `Comprobante de pago — Recibo No. ${num}`,
    html: plantilla(col, `Comprobante de pago · Recibo No. ${num}`, cuerpo),
    attachments: [{ filename: `Recibo ${num}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  await registrarBitacora({
    tabla: 'pagos', idregistro: id, accion: 'NOTIFICAR',
    descripcion: `Comprobante del recibo ${num} enviado a ${para.join(', ')}`,
    valoresDespues: { para }, req,
  });
  return { destinatarios: para };
}

/** Ejecuta un envío sin propagar el error (al crear: la inscripción/el pago ya quedó guardado). */
async function intentar(fn) {
  try {
    return { enviado: true, ...(await fn()) };
  } catch (err) {
    console.error('[correo]', err.message);
    return { enviado: false, error: err.message };
  }
}

/** Prueba de la configuración SMTP. */
async function correoPrueba(para, config) {
  const col = await ConfiguracionModel.datosColegio();
  await sendMail({
    to: para.join(', '),
    subject: `Prueba de correo — ${col.nombre}`,
    html: plantilla(col, 'Prueba de correo saliente', `<p>La configuración del correo saliente funciona correctamente.</p>
      <p>Desde este servidor se enviarán las notificaciones de inscripción y los comprobantes de pago a los padres de familia.</p>`),
  }, config);
}

module.exports = { notificarInscripcion, notificarPago, intentar, correoPrueba, leerCorreos, plantilla };

const { pool } = require('../config/database');
const PagoModel = require('../models/pagoModel');
const ConfiguracionModel = require('../models/configuracionModel');
const { descifrar } = require('./secreto');
const { fail } = require('./transaccion');
const { postJson, postForm, getJson } = require('./httpPost');

/**
 * Documentos electrónicos SAT (FEL) de un pago. Un pago puede llevar dos:
 *   RECI → recibo: solo cuotas con emite_recibo (inscripción y colegiatura,
 *          lo único que SAT permite documentar con recibo a un centro educativo).
 *          No lleva impuestos: cada línea viaja solo con su total.
 *   FACT → factura: la mora (recargo calculado por el sistema) de todas las
 *          líneas y las cuotas sin emite_recibo. Con afiliación GEN lleva el
 *          IVA incluido en el precio; un pequeño contribuyente (PEQ) emite FPEQ.
 *
 * Mismo mecanismo que la factura de SMABI: se arma el XML del DTE, el
 * certificador lo firma y luego lo certifica. Certificadores soportados:
 *   INFILE    → firma: multipart (llave = token, alias)
 *               certificación/anulación: JSON con headers Usuario + Llave
 *   GRUPO CDS → firma y certificación: JSON con header apiKey (token)
 */

const CERTIFICADORES = ['INFILE', 'GRUPO CDS'];
const TIPOS = ['RECI', 'FACT'];
const NOMBRE = { RECI: 'el recibo electrónico', FACT: 'la factura electrónica' };
const TASA_IVA = 0.12;

// ─── Configuración ───────────────────────────────────────────

/** Configuración FEL con las credenciales descifradas. Lanza 400 si falta algo. */
async function configuracion({ anulacion = false } = {}) {
  const c = await ConfiguracionModel.get();
  if (!c.fel_habilitado) throw fail(400, 'Los documentos electrónicos (FEL) no están habilitados en Configuración');
  if (!CERTIFICADORES.includes(c.fel_certificador)) throw fail(400, 'Seleccione el certificador FEL en Configuración');
  const cfg = {
    ...c,
    token: descifrar(c.fel_token),
    llave: descifrar(c.fel_llave),
    nit_emisor: limpiarNit(c.fel_nit_emisor || c.nit),
    nombre_emisor: c.fel_nombre_emisor || c.nombre,
    nombre_comercial: c.fel_nombre_comercial || c.nombre,
  };
  const infile = cfg.fel_certificador === 'INFILE';
  const faltan = [
    !cfg.nit_emisor && 'NIT del emisor',
    !cfg.token && (infile ? 'llave de firma' : 'API key'),
    infile && !cfg.llave && 'llave de certificación',
    infile && !cfg.fel_usuario && 'usuario',
    infile && !cfg.fel_alias && 'alias',
    !cfg.fel_url_firma && !(anulacion && !infile) && 'URL de firma',
    !anulacion && !cfg.fel_url_certificacion && 'URL de certificación',
    anulacion && !cfg.fel_url_anulacion && 'URL de anulación',
    anulacion && !infile && !cfg.fel_url_firma_anulacion && 'URL de firma de anulación',
  ].filter(Boolean);
  if (faltan.length) throw fail(400, `Complete la configuración FEL: ${faltan.join(', ')}`);
  return cfg;
}

// ─── Utilidades ──────────────────────────────────────────────

const limpiarNit = v => String(v ?? '').toUpperCase().replace(/[\s-]/g, '');

/** NIT o CUI del receptor: 13 dígitos se envía como CUI; vacío = CF. */
function receptor(nit) {
  const id = limpiarNit(nit) || 'CF';
  return { id, cui: /^\d{13}$/.test(id) };
}

/** Fecha y hora de Guatemala (UTC-6, sin horario de verano) en formato FEL. */
function fechaHoraGT(d = new Date()) {
  return new Date(d.getTime() - 6 * 3600 * 1000).toISOString().replace('Z', '-06:00');
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

const monto = n => Number(n || 0).toFixed(2);
const redondear = (n, d = 2) => Math.round(Number(n) * 10 ** d) / 10 ** d;
const mayuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Mensaje legible de una respuesta del firmador o del certificador. */
function mensajeRespuesta(r, porDefecto) {
  if (!r) return porDefecto;
  if (typeof r !== 'object') return String(r).substring(0, 400) || porDefecto;
  const errores = Array.isArray(r.descripcion_errores)
    ? r.descripcion_errores.map(e => e?.mensaje_error).filter(Boolean) : [];
  return [r.descripcion, r.message, ...errores].filter(Boolean).join(' · ') || porDefecto;
}

/** Respuesta de firma sin el XML firmado (es largo y no aporta al log). */
function sinXml(r) {
  if (!r || typeof r !== 'object') return r;
  const { archivo, xmlSigned, ...resto } = r;
  return resto;
}

/** tipo: RECI | FACT | ANUL-RECI | ANUL-FACT */
async function log({ idusuarios, idpagos, tipo, exito, xml, firma, respuesta }) {
  const s = v => (v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
  try {
    await pool.query('INSERT INTO fel_log SET ?', [{
      idusuarios: idusuarios ?? null, idpagos, tipo, exito: exito ? 1 : 0, xml: s(xml), firma: s(sinXml(firma)), respuesta: s(respuesta),
    }]);
  } catch (e) {
    console.warn('[FEL] No se pudo guardar el log:', e.message);
  }
}

// ─── XML ─────────────────────────────────────────────────────

function frasesXml(frases) {
  const items = String(frases || '').split(';').map(s => s.split(',').map(x => x.trim())).filter(([t, e]) => t && e);
  if (!items.length) return '';
  return `
        <dte:Frases>${items.map(([t, e]) => `
          <dte:Frase CodigoEscenario="${esc(e)}" TipoFrase="${esc(t)}"/>`).join('')}
        </dte:Frases>`;
}

/**
 * Líneas del documento a partir del detalle del pago:
 *   RECI → el monto de cada cuota con emite_recibo
 *   FACT → el monto de cada cuota sin emite_recibo y la mora cobrada de todas
 */
function lineasDocumento(detalle, tipo) {
  const out = [];
  for (const d of detalle) {
    const quien = `${d.estudiante} (${[d.grado, d.seccion].filter(Boolean).join(' ')}, ${d.codigo})`;
    const recibo = !!Number(d.emite_recibo);
    if (tipo === 'RECI' ? recibo : !recibo) out.push({ descripcion: `${d.concepto} — ${quien}`, total: Number(d.monto_pagado) });
    if (tipo === 'FACT' && Number(d.mora_pagada) > 0) out.push({ descripcion: `Mora por pago tardío: ${d.concepto} — ${quien}`, total: Number(d.mora_pagada) });
  }
  return out;
}

/** Tipo de DTE con que se emite el documento: la factura de un pequeño contribuyente es FPEQ. */
const tipoDte = (cfg, tipo) => (tipo === 'RECI' ? 'RECI' : cfg.fel_afiliacion_iva === 'PEQ' ? 'FPEQ' : 'FACT');

/**
 * Montos de cada línea. Solo la factura (FACT) lleva impuestos: con afiliación
 * GEN el IVA va incluido en el precio; exenta (EXE) se declara con IVA 0.
 */
function calcularLineas(cfg, dte, lineas) {
  const conImpuesto = dte === 'FACT';
  const gravada = conImpuesto && cfg.fel_afiliacion_iva !== 'EXE';
  return lineas.map(l => {
    const total = redondear(l.total);
    if (!conImpuesto) return { ...l, total };
    const gravable = gravada ? redondear(total / (1 + TASA_IVA), 6) : total;
    return { ...l, total, impuesto: { codigo: gravada ? 1 : 2, gravable, monto: redondear(total - gravable, 6) } };
  });
}

function direccionXml(etiqueta, { direccion, postal, municipio, departamento }) {
  return `<dte:${etiqueta}>
            <dte:Direccion>${esc(direccion || 'Ciudad')}</dte:Direccion>
            <dte:CodigoPostal>${esc(postal || '01001')}</dte:CodigoPostal>
            <dte:Municipio>${esc(municipio || 'Guatemala')}</dte:Municipio>
            <dte:Departamento>${esc(departamento || 'Guatemala')}</dte:Departamento>
            <dte:Pais>GT</dte:Pais>
          </dte:${etiqueta}>`;
}

/** XML del DTE (esquema FEL 0.2.0): recibo (RECI) o factura (FACT / FPEQ). Las líneas vienen de calcularLineas. */
function xmlDocumento(cfg, pago, lineas, { dte, emision, receptor: rec, correoReceptor }) {
  const total = lineas.reduce((s, l) => s + Math.round(l.total * 100), 0) / 100;
  const iva = redondear(lineas.reduce((s, l) => s + (l.impuesto?.monto || 0), 0), 6);
  const items = lineas.map((l, i) => `
          <dte:Item BienOServicio="S" NumeroLinea="${i + 1}">
            <dte:Cantidad>1</dte:Cantidad>
            <dte:UnidadMedida>UND</dte:UnidadMedida>
            <dte:Descripcion>${esc(l.descripcion)}</dte:Descripcion>
            <dte:PrecioUnitario>${monto(l.total)}</dte:PrecioUnitario>
            <dte:Precio>${monto(l.total)}</dte:Precio>
            <dte:Descuento>0.00</dte:Descuento>${l.impuesto ? `
            <dte:Impuestos>
              <dte:Impuesto>
                <dte:NombreCorto>IVA</dte:NombreCorto>
                <dte:CodigoUnidadGravable>${l.impuesto.codigo}</dte:CodigoUnidadGravable>
                <dte:MontoGravable>${l.impuesto.gravable.toFixed(6)}</dte:MontoGravable>
                <dte:MontoImpuesto>${l.impuesto.monto.toFixed(6)}</dte:MontoImpuesto>
              </dte:Impuesto>
            </dte:Impuestos>` : ''}
            <dte:Total>${monto(l.total)}</dte:Total>
          </dte:Item>`).join('');
  const totalImpuestos = dte === 'FACT' ? `
          <dte:TotalImpuestos>
            <dte:TotalImpuesto NombreCorto="IVA" TotalMontoImpuesto="${iva.toFixed(6)}"/>
          </dte:TotalImpuestos>` : '';
  const correoEmisor = cfg.email ? ` CorreoEmisor="${esc(cfg.email)}"` : '';
  const correoRec = correoReceptor ? ` CorreoReceptor="${esc(correoReceptor)}"` : '';
  const nombreReceptor = rec.id === 'CF' && !pago.pagador_nombre ? 'Consumidor Final' : pago.pagador_nombre;
  const frases = dte === 'RECI' ? cfg.fel_frases : cfg.fel_frases_factura;

  return `<?xml version="1.0" encoding="UTF-8"?>
<dte:GTDocumento xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="0.1" xsi:schemaLocation="http://www.sat.gob.gt/dte/fel/0.2.0">
  <dte:SAT ClaseDocumento="dte">
    <dte:DTE ID="DatosCertificados">
      <dte:DatosEmision ID="DatosEmision">
        <dte:DatosGenerales CodigoMoneda="GTQ" FechaHoraEmision="${emision}" Tipo="${dte}"/>
        <dte:Emisor AfiliacionIVA="${esc(cfg.fel_afiliacion_iva || 'GEN')}" CodigoEstablecimiento="${esc(cfg.fel_codigo_establecimiento || '1')}"${correoEmisor} NITEmisor="${esc(cfg.nit_emisor)}" NombreComercial="${esc(cfg.nombre_comercial)}" NombreEmisor="${esc(cfg.nombre_emisor)}">
          ${direccionXml('DireccionEmisor', { direccion: cfg.direccion, postal: cfg.fel_codigo_postal, municipio: cfg.municipio, departamento: cfg.departamento })}
        </dte:Emisor>
        <dte:Receptor${correoRec} IDReceptor="${esc(rec.id)}" NombreReceptor="${esc(nombreReceptor)}"${rec.cui ? ' TipoEspecial="CUI"' : ''}>
          ${direccionXml('DireccionReceptor', { direccion: 'Ciudad' })}
        </dte:Receptor>${frasesXml(frases)}
        <dte:Items>${items}
        </dte:Items>
        <dte:Totales>${totalImpuestos}
          <dte:GranTotal>${monto(total)}</dte:GranTotal>
        </dte:Totales>
      </dte:DatosEmision>
    </dte:DTE>
    <dte:Adenda>
      <NumeroRecibo>${String(pago.numero).padStart(6, '0')}</NumeroRecibo>
      <FormaPago>${esc(pago.forma_pago)}${pago.referencia ? ` · Ref. ${esc(pago.referencia)}` : ''}</FormaPago>
    </dte:Adenda>
  </dte:SAT>
</dte:GTDocumento>`;
}

function xmlAnulacion(cfg, pago, doc, fechaAnulacion) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<dte:GTAnulacionDocumento xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:dte="http://www.sat.gob.gt/dte/fel/0.1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="0.1">
  <dte:SAT>
    <dte:AnulacionDTE ID="DatosCertificados">
      <dte:DatosGenerales ID="DatosAnulacion"
        NumeroDocumentoAAnular="${esc(doc.uuid)}"
        NITEmisor="${esc(cfg.nit_emisor)}"
        IDReceptor="${esc(doc.id_receptor || 'CF')}"
        FechaEmisionDocumentoAnular="${esc(doc.fecha_emision)}"
        FechaHoraAnulacion="${fechaAnulacion}"
        MotivoAnulacion="${esc((pago.motivo_anulacion || 'Anulación del pago').substring(0, 255))}"/>
    </dte:AnulacionDTE>
  </dte:SAT>
</dte:GTAnulacionDocumento>`;
}

// ─── Envío al certificador ───────────────────────────────────

/** Firma el XML. Devuelve { firmado, respuesta }; firmado = null si el firmador lo rechazó. */
async function firmar(cfg, xml, identificador, esAnulacion) {
  const base64 = Buffer.from(xml, 'utf8').toString('base64');
  if (cfg.fel_certificador === 'INFILE') {
    const r = await postForm(cfg.fel_url_firma, {
      llave: cfg.token, archivo: base64, codigo: identificador, alias: cfg.fel_alias, es_anulacion: esAnulacion ? 'Y' : 'N',
    });
    return { firmado: r?.archivo || null, respuesta: r };
  }
  const r = await postJson(esAnulacion ? cfg.fel_url_firma_anulacion : cfg.fel_url_firma,
    { dte: { nit_transmitter: cfg.nit_emisor, xml_dte: base64 } }, { apiKey: cfg.token });
  return { firmado: r?.xmlSigned || null, respuesta: r };
}

/** `numero`: referencia interna del documento para GRUPO CDS (idpagos_fel, única por documento). */
async function enviarCertificacion(cfg, firmado, identificador, numero) {
  if (cfg.fel_certificador === 'INFILE') {
    const r = await postJson(cfg.fel_url_certificacion,
      { nit_emisor: cfg.nit_emisor, correo_copia: cfg.email || '', xml_dte: firmado },
      { Usuario: cfg.fel_usuario, Llave: cfg.llave, Identificador: identificador, Tipotransaccion: 'CERTIFICACION' });
    return { respuesta: r, ok: Number(r?.numero) > 0, serie: r?.serie, numero: r?.numero, uuid: r?.uuid };
  }
  const r = await postJson(cfg.fel_url_certificacion,
    { dte: { nit_transmitter: cfg.nit_emisor, serie: cfg.nit_emisor, number: numero, xml_dte: firmado } }, { apiKey: cfg.token });
  return { respuesta: r, ok: Number(r?.number) > 0, serie: r?.serie, numero: r?.number, uuid: r?.uuid };
}

async function enviarAnulacion(cfg, firmado, identificador) {
  if (cfg.fel_certificador === 'INFILE') {
    const r = await postJson(cfg.fel_url_anulacion,
      { nit_emisor: cfg.nit_emisor, correo_copia: cfg.email || '', xml_dte: firmado },
      { Usuario: cfg.fel_usuario, Llave: cfg.llave, Identificador: identificador, Tipotransaccion: 'ANULACION' });
    return { respuesta: r, ok: Number(r?.numero) > 0 || r?.resultado === true };
  }
  const r = await postJson(cfg.fel_url_anulacion,
    { dte: { nit_transmitter: cfg.nit_emisor, xml_dte: firmado } }, { apiKey: cfg.token, nit: cfg.nit_emisor });
  return { respuesta: r, ok: !!r?.uuid };
}

// ─── Operaciones ─────────────────────────────────────────────

const documento = (pago, tipo) => pago.documentos.find(d => d.tipo === tipo) || null;

/**
 * Certifica un documento (RECI o FACT) de un pago vigente. Si falla queda con
 * estado 'Error' y el mensaje del certificador, y se puede reintentar.
 * @returns {{ tipo, dte, serie, numero, uuid, total, iva }}
 */
async function certificarDocumento(idpagos, tipo, idusuarios) {
  if (!TIPOS.includes(tipo)) throw fail(400, 'Tipo de documento no válido');
  const cfg = await configuracion();
  const pago = await PagoModel.findById(idpagos);
  if (!pago) throw fail(404, 'Pago no encontrado');
  if (pago.estado !== 'Activo') throw fail(409, 'El pago está anulado');
  const doc = documento(pago, tipo);
  if (!doc) throw fail(409, `El pago no lleva ${NOMBRE[tipo]}`);
  if (doc.estado === 'Certificado') throw fail(409, `Ya se certificó ${NOMBRE[tipo]} de este pago`);

  // Bloqueo: evita certificar dos veces el mismo documento si se pide a la vez
  // (un 'Procesando' de más de 2 minutos se considera interrumpido).
  const idpagosFel = await PagoModel.felTomar(idpagos, tipo);
  if (!idpagosFel) throw fail(409, `${mayuscula(NOMBRE[tipo])} se está certificando en este momento`);

  const identificador = `${tipo}-${idpagos}`;
  const dte = tipoDte(cfg, tipo);
  const rec = receptor(pago.pagador_nit);
  const emision = fechaHoraGT();
  let xml = null, firma = null, cert = null, lineas = [];
  const error = async (mensaje) => {
    await PagoModel.felEstado(idpagos, tipo, 'Error', mensaje);
    await log({ idusuarios, idpagos, tipo, exito: false, xml, firma, respuesta: cert?.respuesta ?? null });
    return fail(502, mensaje);
  };

  try {
    const [detalle, padre] = await Promise.all([PagoModel.detalle(idpagos), pago.idpadres ? PagoModel.padre(pago.idpadres) : null]);
    lineas = calcularLineas(cfg, dte, lineasDocumento(detalle, tipo));
    if (!lineas.length) throw await error(`El pago no tiene líneas para ${NOMBRE[tipo]}`);
    xml = xmlDocumento(cfg, pago, lineas, { dte, emision, receptor: rec, correoReceptor: padre?.email || null });
    const f = await firmar(cfg, xml, identificador, false);
    firma = f.respuesta;
    if (!f.firmado) throw await error(`Error de firma: ${mensajeRespuesta(firma, 'sin respuesta del firmador')}`);
    cert = await enviarCertificacion(cfg, f.firmado, identificador, idpagosFel);
  } catch (e) {
    if (e.status) throw e;
    throw await error(`No se pudo comunicar con el certificador: ${e.message}`);
  }

  if (!cert.ok) throw await error(mensajeRespuesta(cert.respuesta, 'El certificador rechazó el documento'));

  const r = {
    tipo, dte, serie: String(cert.serie ?? ''), numero: String(cert.numero ?? ''), uuid: String(cert.uuid ?? ''),
    total: redondear(lineas.reduce((s, l) => s + l.total, 0)),
    iva: redondear(lineas.reduce((s, l) => s + (l.impuesto?.monto || 0), 0)),
  };
  await PagoModel.felCertificado(idpagos, tipo, {
    ...r, fecha_emision: emision, id_receptor: rec.id,
    mensaje: mensajeRespuesta(cert.respuesta, 'Certificado').substring(0, 499),
  });
  if (cfg.fel_activar_log) await log({ idusuarios, idpagos, tipo, exito: true, xml, firma, respuesta: cert.respuesta });
  return r;
}

/**
 * Anula ante SAT un documento certificado de un pago ya anulado en el sistema.
 * Si falla queda 'Error al anular' para reintentarlo.
 */
async function anularDocumento(idpagos, tipo, idusuarios) {
  const pago = await PagoModel.findById(idpagos);
  if (!pago) throw fail(404, 'Pago no encontrado');
  if (pago.estado !== 'Anulado') throw fail(409, 'Primero anule el pago');
  const doc = documento(pago, tipo);
  if (!doc || !['Certificado', 'Error al anular'].includes(doc.estado) || !doc.uuid)
    throw fail(409, `No hay ${NOMBRE[tipo]} certificado que anular`);
  const cfg = await configuracion({ anulacion: true });

  const identificador = `ANUL-${tipo}-${idpagos}`;
  const tipoLog = `ANUL-${tipo}`;
  // La anulación no puede tener fecha anterior a la emisión
  let fecha = fechaHoraGT();
  if (doc.fecha_emision && fecha < doc.fecha_emision) fecha = doc.fecha_emision;

  let xml = null, firma = null, resp = null;
  const error = async (mensaje) => {
    await PagoModel.felEstado(idpagos, tipo, 'Error al anular', mensaje);
    await log({ idusuarios, idpagos, tipo: tipoLog, exito: false, xml, firma, respuesta: resp });
    return fail(502, mensaje);
  };

  try {
    xml = xmlAnulacion(cfg, pago, doc, fecha);
    const f = await firmar(cfg, xml, identificador, true);
    firma = f.respuesta;
    if (!f.firmado) throw await error(`Error de firma de la anulación: ${mensajeRespuesta(firma, 'sin respuesta del firmador')}`);
    const a = await enviarAnulacion(cfg, f.firmado, identificador);
    resp = a.respuesta;
    if (!a.ok) throw await error(mensajeRespuesta(resp, 'El certificador rechazó la anulación'));
  } catch (e) {
    if (e.status) throw e;
    throw await error(`No se pudo comunicar con el certificador: ${e.message}`);
  }

  await PagoModel.felEstado(idpagos, tipo, 'Anulado', mensajeRespuesta(resp, 'Documento anulado'));
  if (cfg.fel_activar_log) await log({ idusuarios, idpagos, tipo: tipoLog, exito: true, xml, firma, respuesta: resp });
  return { anulado: true };
}

/** Nombre y dirección registrados para un NIT (servicio configurado en Configuración › FEL). */
async function consultarNit(nit) {
  const c = await ConfiguracionModel.get();
  const key = descifrar(c.nit_consulta_key);
  if (!c.nit_consulta_url || !key) throw fail(400, 'La consulta de NIT no está configurada');
  const n = limpiarNit(nit);
  if (!n || n === 'CF') throw fail(400, 'Indique un NIT');
  const url = c.nit_consulta_url.includes('{nit}')
    ? c.nit_consulta_url.replace('{nit}', encodeURIComponent(n))
    : c.nit_consulta_url.replace(/\/?$/, '/') + encodeURIComponent(n);
  let r;
  try {
    r = await getJson(url, { appKey: key });
  } catch (e) {
    throw fail(502, `No se pudo consultar el NIT: ${e.message}`);
  }
  const nombre = r.status === 200 && (r.data?.name || r.data?.nombre);
  if (!nombre) return null;
  return { nit: n, nombre: String(nombre).trim(), direccion: String(r.data.address || r.data.direccion || '').trim() };
}

module.exports = {
  CERTIFICADORES, TIPOS, NOMBRE, TASA_IVA, certificarDocumento, anularDocumento, consultarNit,
  lineasDocumento, calcularLineas, tipoDte, xmlDocumento, fechaHoraGT,
};

const PagoModel = require('../models/pagoModel');
const ConfiguracionModel = require('../models/configuracionModel');
const { tienePermiso } = require('../middleware/checkPermiso');
const { registrarBitacora } = require('../utils/bitacora');
const { enTransaccion, fail } = require('../utils/transaccion');
const { calcularMora, hoy, redondear } = require('../utils/cargos');
const { siguienteCorrelativo } = require('../utils/correlativo');
const { enviar } = require('../pdf/base');
const { generarRecibo, generarFactura, separaDocumentos, numeroRecibo } = require('../pdf/recibo');
const { notificarPago, intentar } = require('../utils/notificaciones');
const fel = require('../utils/fel');

const FORMAS_PAGO = ['Efectivo', 'Depósito', 'Transferencia', 'Tarjeta', 'Cheque'];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const idPositivo = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').substring(0, max) || null;

function leerFechaPago(v) {
  const s = String(v ?? '').substring(0, 10);
  if (!RE_FECHA.test(s) || isNaN(Date.parse(s))) throw fail(400, 'La fecha de pago no es válida');
  if (s > hoy()) throw fail(400, 'La fecha de pago no puede ser futura');
  return s;
}

const numericoPago = p => ({
  ...p, subtotal: Number(p.subtotal), mora: Number(p.mora), total: Number(p.total),
  total_recibo: Number(p.total_recibo), total_factura: Number(p.total_factura),
});

/** Certifica un documento (RECI | FACT) y lo registra en bitácora. → { tipo, certificado, serie, numero, uuid, ... } | { tipo, certificado: false, error } */
async function emitirFel(idpagos, numero, tipo, req) {
  try {
    const r = await fel.certificarDocumento(idpagos, tipo, req.user?.id ?? null);
    await registrarBitacora({
      tabla: 'pagos', idregistro: idpagos, accion: 'MODIFICAR',
      descripcion: `Recibo ${numeroRecibo(numero)}: se certificó ante SAT ${fel.NOMBRE[tipo]} (serie ${r.serie}, No. ${r.numero}, Q${r.total.toFixed(2)})`,
      valoresDespues: { documento: tipo, estado: 'Certificado', ...r }, req,
    });
    return { certificado: true, ...r };
  } catch (err) {
    if (!err.status) throw err;
    return { tipo, certificado: false, error: err.message };
  }
}

/** Anula ante SAT un documento y lo registra en bitácora. → { tipo, anulado: true } | { tipo, anulado: false, error } */
async function anularEnSat(idpagos, numero, doc, req) {
  try {
    await fel.anularDocumento(idpagos, doc.tipo, req.user?.id ?? null);
    await registrarBitacora({
      tabla: 'pagos', idregistro: idpagos, accion: 'ANULAR',
      descripcion: `Recibo ${numeroRecibo(numero)}: se anuló ante SAT ${fel.NOMBRE[doc.tipo]} (autorización ${doc.uuid})`,
      valoresDespues: { documento: doc.tipo, estado: 'Anulado' }, req,
    });
    return { tipo: doc.tipo, anulado: true };
  } catch (err) {
    if (!err.status) throw err;
    return { tipo: doc.tipo, anulado: false, error: err.message };
  }
}

/** Documentos del pago que aún se pueden certificar (sin intentar o con error). */
const porCertificar = p => p.documentos.filter(d => !d.estado || d.estado === 'Pendiente' || d.estado === 'Error');

const ctrl = {
  // GET /api/pagos
  async getAll(req, res, next) {
    try {
      const r = await PagoModel.getAll(req.query);
      res.json({ success: true, data: r.data.map(numericoPago), meta: r.meta });
    } catch (err) { next(err); }
  },

  // GET /api/pagos/buscar?q=   → padres y estudiantes con inscripción activa
  async buscar(req, res, next) {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) return res.json({ success: true, data: [] });
      res.json({ success: true, data: await PagoModel.buscarPagador(q, 8) });
    } catch (err) { next(err); }
  },

  // GET /api/pagos/pendientes?idpadres= | ?idestudiantes=  [&fecha=YYYY-MM-DD]
  // Cargos pendientes con la mora calculada a la fecha de pago, y a quién sugerir como pagador.
  async pendientes(req, res, next) {
    try {
      const fecha = req.query.fecha ? leerFechaPago(req.query.fecha) : hoy();
      const idpadres = idPositivo(req.query.idpadres);
      const idestudiantes = idPositivo(req.query.idestudiantes);
      let ids, pagadores;
      if (idpadres) {
        const p = await PagoModel.padre(idpadres);
        if (!p) return res.status(404).json({ message: 'Padre de familia no encontrado' });
        ids = await PagoModel.estudiantesDePadre(idpadres);
        pagadores = [{ ...p, parentesco: null }];
      } else if (idestudiantes) {
        ids = [idestudiantes];
        pagadores = await PagoModel.padresDeEstudiantes(ids);
      } else {
        return res.status(400).json({ message: 'Indique el padre de familia o el estudiante' });
      }
      const cargos = (await PagoModel.pendientes(ids)).map(c => {
        const r = { ...c, monto: Number(c.monto), mora_valor: Number(c.mora_valor) };
        r.mora = calcularMora(r, fecha);
        r.vencido = r.fecha_vencimiento < fecha ? 1 : 0;
        return r;
      });
      res.json({ success: true, data: { fecha, pagadores, cargos } });
    } catch (err) { next(err); }
  },

  // GET /api/pagos/:id   → recibo con su detalle
  async getById(req, res, next) {
    try {
      const p = await PagoModel.findById(req.params.id);
      if (!p) return res.status(404).json({ message: 'Pago no encontrado' });
      const detalle = (await PagoModel.detalle(p.idpagos)).map(d => ({
        ...d, monto: Number(d.monto), monto_pagado: Number(d.monto_pagado), mora_pagada: Number(d.mora_pagada), total_linea: Number(d.total_linea),
      }));
      res.json({ success: true, data: { ...numericoPago(p), detalle } });
    } catch (err) { next(err); }
  },

  // POST /api/pagos
  //   { fecha_pago, idpadres?, pagador_nombre, pagador_nit?, forma_pago, referencia?, observaciones?,
  //     cargos: [{ idinscripciones_cargos, exonerar_mora? }], notificar?: true → envía el comprobante por correo }
  // Los documentos electrónicos se certifican después (POST /:id/fel), desde la confirmación del pago.
  // Montos y mora se recalculan aquí: nunca se toman del cliente.
  async create(req, res, next) {
    try {
      const fecha_pago = leerFechaPago(req.body.fecha_pago);
      const forma_pago = FORMAS_PAGO.includes(req.body.forma_pago) ? req.body.forma_pago : null;
      if (!forma_pago) return res.status(400).json({ message: 'Seleccione la forma de pago' });
      const pagador_nombre = texto(req.body.pagador_nombre, 150);
      if (!pagador_nombre) return res.status(400).json({ message: 'Indique el nombre de quien paga' });
      const pagador_nit = (texto(req.body.pagador_nit, 20) || 'CF').toUpperCase().replace(/\s/g, '');
      const referencia = texto(req.body.referencia, 60);
      if (forma_pago !== 'Efectivo' && !referencia)
        return res.status(400).json({ message: `Indique el número de ${forma_pago === 'Cheque' ? 'cheque' : forma_pago === 'Tarjeta' ? 'autorización' : 'boleta o referencia'}` });
      const observaciones = texto(req.body.observaciones, 255);
      const idpadres = idPositivo(req.body.idpadres);
      if (idpadres && !(await PagoModel.padre(idpadres))) return res.status(400).json({ message: 'El padre de familia no existe' });

      const pedidos = new Map();
      for (const c of Array.isArray(req.body.cargos) ? req.body.cargos : []) {
        const id = idPositivo(c?.idinscripciones_cargos);
        if (id) pedidos.set(id, !!c.exonerar_mora);
      }
      if (!pedidos.size) return res.status(400).json({ message: 'Seleccione al menos una cuota a pagar' });
      const exonera = [...pedidos.values()].some(Boolean);
      if (exonera && !(await tienePermiso(req.user?.codigo, 'pagos', 'E')))
        return res.status(403).json({ message: 'No tiene permiso para exonerar mora' });

      const { idpagos, numero, pago, lineas } = await enTransaccion(async conn => {
        const cargos = await PagoModel.cargosParaCobrar(conn, [...pedidos.keys()]);
        if (cargos.length !== pedidos.size) throw fail(400, 'Una de las cuotas no existe');
        for (const c of cargos) {
          if (c.estado_inscripcion !== 'Activa') throw fail(409, `La inscripción ${c.codigo} está anulada`);
          if (c.estado !== 'Pendiente') throw fail(409, `"${c.concepto}" de ${c.estudiante} ya está ${c.estado.toLowerCase()}`);
        }
        const lineas = cargos.map(c => {
          const moraCalc = calcularMora(c, fecha_pago);
          const exonerada = pedidos.get(c.idinscripciones_cargos) && moraCalc > 0;
          const mora = exonerada ? 0 : moraCalc;
          const monto = Number(c.monto);
          return {
            idinscripciones_cargos: c.idinscripciones_cargos, monto, mora, mora_exonerada: exonerada, emite_recibo: !!c.emite_recibo,
            total: redondear(monto + mora), c, moraCalc,
          };
        });
        const subtotal = redondear(lineas.reduce((s, l) => s + l.monto, 0));
        const mora = redondear(lineas.reduce((s, l) => s + l.mora, 0));
        const numero = await siguienteCorrelativo(conn, 'RECIBO');
        const pago = {
          numero, fecha_pago, idpadres, pagador_nombre, pagador_nit, forma_pago, referencia, observaciones,
          subtotal, mora, total: redondear(subtotal + mora), idusuarios: req.user?.id ?? null,
        };
        const idpagos = await PagoModel.create(conn, pago);
        await PagoModel.insertarDetalle(conn, idpagos, lineas);
        await PagoModel.marcarCargos(conn, lineas.map(l => l.idinscripciones_cargos), 'Pagado');
        return { idpagos, numero, pago, lineas };
      });

      const estudiantes = [...new Set(lineas.map(l => l.c.estudiante))].join(', ');
      await registrarBitacora({
        tabla: 'pagos', idregistro: idpagos, accion: 'CREAR',
        descripcion: `Recibo ${numeroRecibo(numero)}: Q${pago.total.toFixed(2)} — ${estudiantes}`,
        valoresDespues: {
          ...pago,
          detalle: lineas.map(l => ({
            inscripcion: l.c.codigo, estudiante: l.c.estudiante, concepto: l.c.concepto, monto: l.monto, mora: l.mora,
            ...(l.mora_exonerada ? { mora_exonerada: l.moraCalc } : {}),
          })),
        },
        req,
      });
      const correo = req.body.notificar ? await intentar(() => notificarPago(idpagos, { req })) : null;
      const creado = await PagoModel.findById(idpagos);
      res.status(201).json({ success: true, id: idpagos, numero, total: pago.total, documentos: creado.documentos, correo });
    } catch (err) { next(err); }
  },

  // POST /api/pagos/:id/anular   { motivo }  → las cuotas vuelven a quedar pendientes
  async anular(req, res, next) {
    try {
      const id = Number(req.params.id);
      const p = await PagoModel.findById(id);
      if (!p) return res.status(404).json({ message: 'Pago no encontrado' });
      if (p.estado !== 'Activo') return res.status(409).json({ message: 'El recibo ya está anulado' });
      if (p.documentos.some(d => d.estado === 'Procesando'))
        return res.status(409).json({ message: 'Hay un documento electrónico certificándose; intente en un momento' });
      const motivo = texto(req.body.motivo, 255);
      if (!motivo) return res.status(400).json({ message: 'Indique el motivo de la anulación' });

      const detalle = await PagoModel.detalle(id);
      await enTransaccion(async conn => {
        await PagoModel.anular(conn, id, motivo);
        await PagoModel.marcarCargos(conn, detalle.map(d => d.idinscripciones_cargos), 'Pendiente');
      });
      await registrarBitacora({
        tabla: 'pagos', idregistro: id, accion: 'ANULAR',
        descripcion: `Recibo ${numeroRecibo(p.numero)} anulado (Q${Number(p.total).toFixed(2)}). Motivo: ${motivo}`,
        valoresAntes: { estado: 'Activo', total: Number(p.total), cuotas: detalle.map(d => `${d.estudiante}: ${d.concepto}`) },
        valoresDespues: { estado: 'Anulado', motivo }, req,
      });
      // Los documentos electrónicos se anulan ante SAT después de anular el pago en el sistema
      const resultados = [];
      for (const d of p.documentos.filter(x => x.estado === 'Certificado')) resultados.push(await anularEnSat(id, p.numero, d, req));
      res.json({ success: true, fel: resultados });
    } catch (err) { next(err); }
  },

  // POST /api/pagos/:id/fel   { tipo?: 'RECI'|'FACT' }
  // Certifica (o reintenta) los documentos electrónicos pendientes del pago: recibo y factura,
  // uno tras otro (si uno falla se intenta el otro). → { resultados: [...] }
  async certificarFel(req, res, next) {
    try {
      const p = await PagoModel.findById(req.params.id);
      if (!p) return res.status(404).json({ message: 'Pago no encontrado' });
      if (p.estado !== 'Activo') return res.status(409).json({ message: 'El pago está anulado' });
      const tipo = req.body?.tipo;
      if (tipo && !fel.TIPOS.includes(tipo)) return res.status(400).json({ message: 'Tipo de documento no válido' });
      const pendientes = porCertificar(p).filter(d => !tipo || d.tipo === tipo);
      if (!pendientes.length) return res.status(409).json({ message: 'No hay documentos electrónicos pendientes de certificar' });
      const resultados = [];
      for (const d of pendientes) resultados.push(await emitirFel(p.idpagos, p.numero, d.tipo, req));
      res.json({ success: true, resultados });
    } catch (err) { next(err); }
  },

  // POST /api/pagos/:id/fel/anular   → reintenta la anulación ante SAT de los documentos de un pago ya anulado
  async anularFel(req, res, next) {
    try {
      const p = await PagoModel.findById(req.params.id);
      if (!p) return res.status(404).json({ message: 'Pago no encontrado' });
      const docs = p.documentos.filter(d => d.estado === 'Error al anular' || (p.estado === 'Anulado' && d.estado === 'Certificado'));
      if (!docs.length) return res.status(409).json({ message: 'No hay documentos electrónicos pendientes de anular' });
      const resultados = [];
      for (const d of docs) resultados.push(await anularEnSat(p.idpagos, p.numero, d, req));
      const fallidos = resultados.filter(r => !r.anulado);
      if (fallidos.length === resultados.length) return res.status(502).json({ message: fallidos.map(r => r.error).join(' · ') });
      res.json({ success: true, resultados });
    } catch (err) { next(err); }
  },

  // GET /api/pagos/nit/:nit   → nombre registrado del NIT (para llenar el pagador)
  async consultarNit(req, res, next) {
    try {
      const r = await fel.consultarNit(req.params.nit);
      if (!r) return res.json({ success: false, message: 'NIT no encontrado' });
      res.json({ success: true, data: r });
    } catch (err) { next(err); }
  },

  // POST /api/pagos/:id/notificar   { correos? }  → (re)envía el comprobante (por defecto al pagador o encargados)
  async notificar(req, res, next) {
    try {
      const r = await notificarPago(Number(req.params.id), { correos: req.body.correos, req });
      res.json({ success: true, ...r });
    } catch (err) { next(err); }
  },

  // GET /api/pagos/:id/recibo[?descargar=1]
  // Con FEL, un pago que solo lleva factura (sin cuotas de recibo) imprime la factura.
  async reciboPdf(req, res, next) {
    try {
      const p = await PagoModel.findById(req.params.id);
      if (!p) return res.status(404).json({ message: 'Pago no encontrado' });
      const [detalle, colegio] = await Promise.all([PagoModel.detalle(p.idpagos), ConfiguracionModel.datosColegio()]);
      if (separaDocumentos(p, colegio) && !(Number(p.total_recibo) > 0))
        return enviar(res, generarFactura(p, detalle, colegio), `Factura ${numeroRecibo(p.numero)}.pdf`, req.query.descargar === '1');
      enviar(res, generarRecibo(p, detalle, colegio), `Recibo ${numeroRecibo(p.numero)}.pdf`, req.query.descargar === '1');
    } catch (err) { next(err); }
  },

  // GET /api/pagos/:id/factura[?descargar=1]   → mora y cuotas que no emiten recibo
  async facturaPdf(req, res, next) {
    try {
      const p = await PagoModel.findById(req.params.id);
      if (!p) return res.status(404).json({ message: 'Pago no encontrado' });
      if (!p.documentos.some(d => d.tipo === 'FACT')) return res.status(404).json({ message: 'Este pago no lleva factura' });
      const [detalle, colegio] = await Promise.all([PagoModel.detalle(p.idpagos), ConfiguracionModel.datosColegio()]);
      enviar(res, generarFactura(p, detalle, colegio), `Factura ${numeroRecibo(p.numero)}.pdf`, req.query.descargar === '1');
    } catch (err) { next(err); }
  },
};

module.exports = ctrl;

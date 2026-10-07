// Cargos del estado de cuenta: se generan a partir de la configuración de
// cuotas del ciclo (cuotas_ciclos + cuotas_grados) y se guardan como copia en
// inscripciones_cargos. Fechas siempre como texto 'YYYY-MM-DD'.

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const diasDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = n => String(n).padStart(2, '0');
const redondear = n => Math.round(n * 100) / 100;

/** Fecha local de hoy (el servidor corre con TZ America/Guatemala). */
function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Cobros de una cuota del ciclo para un grado.
 *   Mensual: uno por mes entre fecha_inicio y fecha_fin; vence el dia_limite
 *            (o el último día si el mes es más corto). Con mes_vencido vence el
 *            dia_limite del mes siguiente (Enero, día 5 → 05 de febrero).
 *   Única:   un solo cobro que vence en fecha_fin.
 * @param {object} cfg - fila de cuotas_ciclos + cuota, periodicidad y monto del grado
 */
function cobrosDeCuota(cfg) {
  const base = {
    idcuotas_ciclos: cfg.idcuotas_ciclos,
    monto: redondear(Number(cfg.monto)),
    mora_tipo: cfg.mora_tipo,
    mora_valor: Number(cfg.mora_valor) || 0,
  };
  if (cfg.periodicidad !== 'Mensual') {
    return [{ ...base, numero_cobro: 1, concepto: cfg.cuota, fecha_vencimiento: cfg.fecha_fin }];
  }
  const [y1, m1] = cfg.fecha_inicio.split('-').map(Number);
  const [y2, m2] = cfg.fecha_fin.split('-').map(Number);
  const out = [];
  let y = y1, m = m1, n = 1;
  while ((y < y2 || (y === y2 && m <= m2)) && n <= 12) {
    let [vy, vm] = [y, m];
    if (Number(cfg.mes_vencido) && ++vm > 12) { vm = 1; vy++; }
    const d = Math.min(cfg.dia_limite, diasDelMes(vy, vm));
    out.push({
      ...base,
      numero_cobro: n,
      periodo: `${y}-${pad(m)}`,
      concepto: `${cfg.cuota} — ${MESES[m - 1]} ${y}`,
      fecha_vencimiento: `${vy}-${pad(vm)}-${pad(d)}`,
    });
    n++;
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** Todos los cobros de las cuotas indicadas, ordenados por vencimiento. */
function generarCargos(configs) {
  return configs
    .flatMap(cobrosDeCuota)
    .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.idcuotas_ciclos - b.idcuotas_ciclos);
}

/** Mora de un cobro pagado (o por pagar) en `fecha`: se suma una sola vez si ya venció. */
function calcularMora(cargo, fecha = hoy()) {
  if (!cargo || fecha <= cargo.fecha_vencimiento) return 0;
  const valor = Number(cargo.mora_valor) || 0;
  if (cargo.mora_tipo === 'Monto') return redondear(valor);
  if (cargo.mora_tipo === 'Porcentaje') return redondear(Number(cargo.monto) * valor / 100);
  return 0;
}

/** Mes que cobra un cargo mensual ('YYYY-MM'), leído de su concepto ("Mensualidad — Febrero 2026"). */
function periodoDeConcepto(concepto) {
  const m = /—\s*(\S+)\s+(\d{4})\s*$/.exec(concepto || '');
  const mes = m ? MESES.indexOf(m[1]) + 1 : 0;
  return mes ? `${m[2]}-${pad(mes)}` : null;
}

/**
 * Qué cambiaría en el estado de cuenta de una inscripción si sus cobros
 * pendientes de una cuota se recalculan con la configuración nueva.
 * Pagados y anulados no se tocan.
 *   actualizar: pendientes cuyo vencimiento o mora cambia
 *   anular:     pendientes de meses que quedaron fuera del rango
 *   agregar:    meses nuevos del rango que la inscripción no tenía (en ningún estado),
 *               con el mismo monto que ya tenía esa cuota en la inscripción
 * @param {object[]} cargos - cargos de la inscripción para esa cuota (todos los estados)
 * @param {object} cfg      - configuración nueva (cuotas_ciclos + cuota y periodicidad)
 */
function planRecalculo(cargos, cfg) {
  const plan = { actualizar: [], anular: [], agregar: [] };
  if (!cargos.length) return plan;
  const nuevos = cobrosDeCuota({ ...cfg, monto: cargos[0].monto });
  const cambia = (c, n) => c.fecha_vencimiento !== n.fecha_vencimiento
    || c.mora_tipo !== n.mora_tipo || Number(c.mora_valor) !== Number(n.mora_valor);

  if (cfg.periodicidad !== 'Mensual') {
    for (const c of cargos) if (c.estado === 'Pendiente' && cambia(c, nuevos[0])) plan.actualizar.push({ cargo: c, nuevo: nuevos[0] });
    return plan;
  }

  const porPeriodo = new Map(nuevos.map(n => [n.periodo, n]));
  const existentes = new Set();
  for (const c of cargos) {
    const periodo = periodoDeConcepto(c.concepto);
    if (!periodo) continue; // concepto no reconocible: se deja como está
    existentes.add(periodo);
    if (c.estado !== 'Pendiente') continue;
    const n = porPeriodo.get(periodo);
    if (!n) plan.anular.push({ cargo: c });
    else if (cambia(c, n)) plan.actualizar.push({ cargo: c, nuevo: n });
  }
  // Los agregados no reutilizan números de cobro ya usados (uq_cargo)
  let numero = Math.max(...cargos.map(c => c.numero_cobro));
  for (const n of nuevos) {
    if (!existentes.has(n.periodo)) plan.agregar.push({ ...n, numero_cobro: ++numero });
  }
  return plan;
}

module.exports = { MESES, hoy, redondear, generarCargos, calcularMora, planRecalculo };

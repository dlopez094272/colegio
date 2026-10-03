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
 *            (o el último día si el mes es más corto).
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
    const d = Math.min(cfg.dia_limite, diasDelMes(y, m));
    out.push({
      ...base,
      numero_cobro: n,
      concepto: `${cfg.cuota} — ${MESES[m - 1]} ${y}`,
      fecha_vencimiento: `${y}-${pad(m)}-${pad(d)}`,
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

module.exports = { MESES, hoy, redondear, generarCargos, calcularMora };

import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CicloCuotas, Cuota, CuotaCiclo, GradoCuota, MoraTipo, Periodicidad } from '../../../models';
import { CambioMonto, CopiarCicloPayload, CuotaConfigPayload, CuotasService, ImpactoConfig } from '../../../services/cuotas.service';
import { PermisosService } from '../../../services/permisos.service';
import { confirmDialog, confirmDosOpciones, showError, showSuccess, showWarning } from '../../../services/confirm';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';
import { readStateFromUrl, syncStateToUrl } from '../../../shared/utils/url-state.util';

type Tab = 'ciclo' | 'montos' | 'catalogo';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Grados agrupados por nivel (› carrera) para la matriz de montos. */
interface GrupoGrados {
  titulo: string;
  grados: GradoCuota[];
}

interface ConfigForm {
  modo: 'nuevo' | 'editar';
  cfg: CuotaCiclo | null;
  idcuotas: number | null;
  fecha_inicio: string;
  fecha_fin: string;
  dia_limite: number;
  mes_vencido: number;
  mora_tipo: MoraTipo;
  mora_valor: number | null;
}

interface CuotaForm {
  idcuotas?: number;
  cuota: string;
  descripcion: string;
  periodicidad: Periodicidad;
  obligatoria: number;
  orden: number | null;
  activo: number;
}

interface CopiarForm extends Omit<CopiarCicloPayload, 'ajuste'> {
  ajuste: number | null;
}

/** Monto aplicado a toda una columna (o a un grupo de grados). */
interface LlenarForm {
  cfg: CuotaCiclo;
  monto: number | null;
  grupo: string; // '' = todos los grados
}

/** Copiar los montos de un grado (fila) a otros. */
interface CopiarFilaForm {
  origen: GradoCuota;
  destinos: Set<number>;
}

const key = (idcc: number, idgrados: number) => `${idcc}-${idgrados}`;
const nombreGrado = (g: GradoCuota) => [g.nivel, g.carrera, g.grado].filter(Boolean).join(' › ');

@Component({
  selector: 'app-cuotas',
  standalone: true,
  imports: [FormsModule, RowMenuComponent, BitacoraTabComponent],
  templateUrl: './cuotas.html',
  styleUrl: './cuotas.scss',
})
export class CuotasPage implements OnInit {
  readonly anioActual = new Date().getFullYear();
  readonly nombreGrado = nombreGrado;

  tab: Tab = 'ciclo';
  ciclo = this.anioActual;
  ciclosConDatos: { ciclo: number; cuotas: number }[] = [];

  loading = false;
  data: CicloCuotas | null = null;
  catalogo: Cuota[] = [];

  /** Montos de la matriz: valor editado y valor guardado (null = no aplica). */
  valores: Record<string, number | null> = {};
  private originales: Record<string, number | null> = {};
  guardandoMontos = false;

  configForm: ConfigForm | null = null;
  cuotaForm: CuotaForm | null = null;
  copiarForm: CopiarForm | null = null;
  llenarForm: LlenarForm | null = null;
  copiarFilaForm: CopiarFilaForm | null = null;
  saving = false;
  error = '';

  bitacora: { tabla: string; id: number; titulo: string } | null = null;

  constructor(
    private svc: CuotasService,
    public permisos: PermisosService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    const st = readStateFromUrl(this.route);
    if (st['tab'] === 'montos' || st['tab'] === 'catalogo') this.tab = st['tab'];
    const c = Number(st['ciclo']);
    if (Number.isInteger(c) && c >= 2000 && c <= 2100) this.ciclo = c;
    this.loadCatalogo();
    this.loadCiclos();
    this.loadCiclo();
  }

  get puedeA() { return this.permisos.tiene('cuotas', 'A'); }
  get puedeE() { return this.permisos.tiene('cuotas', 'E'); }
  get puedeD() { return this.permisos.tiene('cuotas', 'D'); }

  // ─── Navegación ──────────────────────────────────────────────
  private syncUrl() {
    syncStateToUrl(this.router, this.route, { tab: this.tab, ciclo: this.ciclo }, { defaults: { tab: 'ciclo', ciclo: this.anioActual } });
  }

  async setTab(t: Tab) {
    if (t === this.tab || !(await this.descartarPendientes())) return;
    this.tab = t;
    this.restaurarMontos();
    this.syncUrl();
  }

  async cambiarCiclo(c: number) {
    if (c === this.ciclo) return;
    if (!(await this.descartarPendientes())) {
      // El <select> ya muestra el ciclo nuevo: se fuerza a volver al que se estaba editando.
      const actual = this.ciclo;
      this.ciclo = c;
      setTimeout(() => this.ciclo = actual);
      return;
    }
    this.ciclo = c;
    this.syncUrl();
    this.loadCiclo();
  }

  /** Ciclos para el selector: los que tienen datos + el actual y el siguiente. */
  get opcionesCiclo(): { ciclo: number; cuotas: number }[] {
    const m = new Map(this.ciclosConDatos.map(c => [c.ciclo, c.cuotas]));
    for (const c of [this.anioActual, this.anioActual + 1, this.ciclo]) if (!m.has(c)) m.set(c, 0);
    return [...m.entries()].map(([ciclo, cuotas]) => ({ ciclo, cuotas })).sort((a, b) => b.ciclo - a.ciclo);
  }

  /** Ciclo más reciente con cuotas, distinto al actual (sugerido como origen de la copia). */
  get cicloSugeridoOrigen(): number | null {
    const otros = this.ciclosConDatos.filter(c => c.ciclo !== this.ciclo && c.cuotas > 0).map(c => c.ciclo);
    if (!otros.length) return null;
    const anteriores = otros.filter(c => c < this.ciclo);
    return anteriores.length ? Math.max(...anteriores) : Math.min(...otros);
  }

  // ─── Carga ───────────────────────────────────────────────────
  loadCatalogo() {
    this.svc.getAll().subscribe({ next: r => this.catalogo = r.data ?? [] });
  }

  loadCiclos() {
    this.svc.ciclos().subscribe({ next: r => this.ciclosConDatos = r.data ?? [] });
  }

  loadCiclo() {
    this.loading = true;
    const ciclo = this.ciclo;
    this.svc.ciclo(ciclo).subscribe({
      next: r => {
        if (ciclo !== this.ciclo) return;
        this.loading = false;
        this.data = r.data ?? null;
        this.originales = {};
        for (const m of this.data?.montos ?? []) this.originales[key(m.idcuotas_ciclos, m.idgrados)] = m.monto;
        this.restaurarMontos();
      },
      error: () => { this.loading = false; },
    });
  }

  private recargar() {
    this.loadCiclos();
    this.loadCatalogo();
    this.loadCiclo();
  }

  // ─── Formato ─────────────────────────────────────────────────
  q(n: number | null | undefined): string {
    if (n === null || n === undefined) return '';
    return 'Q' + Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fecha(f: string): string {
    const [y, m, d] = f.split('-');
    return `${d}/${m}/${y}`;
  }

  /** Cobros que genera la configuración (1 si es única, un cobro por mes si es mensual). */
  cobros(c: { periodicidad: Periodicidad; fecha_inicio: string; fecha_fin: string }): number {
    if (c.periodicidad !== 'Mensual') return 1;
    if (!c.fecha_inicio || !c.fecha_fin || c.fecha_fin < c.fecha_inicio) return 0;
    const [y1, m1] = c.fecha_inicio.split('-').map(Number);
    const [y2, m2] = c.fecha_fin.split('-').map(Number);
    return (y2 - y1) * 12 + (m2 - m1) + 1;
  }

  rangoMeses(c: { fecha_inicio: string; fecha_fin: string }): string {
    const [y1, m1] = c.fecha_inicio.split('-').map(Number);
    const [y2, m2] = c.fecha_fin.split('-').map(Number);
    const ini = MESES[m1 - 1], fin = MESES[m2 - 1];
    if (y1 === y2) return m1 === m2 ? `${ini} ${y1}` : `${ini} a ${fin} ${y1}`;
    return `${ini} ${y1} a ${fin} ${y2}`;
  }

  textoMora(c: { mora_tipo: MoraTipo; mora_valor: number | null }): string {
    if (c.mora_tipo === 'Monto') return `${this.q(c.mora_valor ?? 0)} por cobro vencido`;
    if (c.mora_tipo === 'Porcentaje') return `${c.mora_valor ?? 0}% del cobro vencido`;
    return 'Sin mora';
  }

  textoVence(c: CuotaCiclo): string {
    if (c.periodicidad !== 'Mensual') return this.fecha(c.fecha_fin);
    return c.mes_vencido ? `Día ${c.dia_limite} del mes siguiente (mes vencido)` : `Día ${c.dia_limite} de cada mes`;
  }

  // ═════════════ Pestaña: cuotas del ciclo ═════════════
  accionesConfig(c: CuotaCiclo): RowAction[] {
    const a: RowAction[] = [];
    if (this.puedeE) a.push({ label: 'Editar fechas y mora', icon: 'edit', action: () => this.editarConfig(c) });
    a.push({ label: 'Montos por grado', icon: 'receipt', action: () => this.setTab('montos') });
    a.push({ label: 'Bitácora', icon: 'bitacora', action: () => this.bitacora = { tabla: 'cuotas_ciclos', id: c.idcuotas_ciclos, titulo: `${c.cuota} ${c.ciclo}` } });
    if (this.puedeD) a.push({ label: `Quitar del ciclo ${c.ciclo}`, icon: 'trash', variant: 'danger', action: () => this.quitarConfig(c) });
    return a;
  }

  /** Cuotas activas del catálogo que aún no están en el ciclo. */
  get cuotasDisponibles(): Cuota[] {
    const usadas = new Set((this.data?.cuotas ?? []).map(c => c.idcuotas));
    return this.catalogo.filter(c => c.activo && !usadas.has(c.idcuotas));
  }

  nuevaConfig() {
    this.error = '';
    this.configForm = {
      modo: 'nuevo', cfg: null, idcuotas: null,
      fecha_inicio: '', fecha_fin: '', dia_limite: 5, mes_vencido: 0, mora_tipo: 'Ninguna', mora_valor: null,
    };
    const disp = this.cuotasDisponibles;
    if (disp.length === 1) this.elegirCuota(disp[0].idcuotas);
  }

  editarConfig(c: CuotaCiclo) {
    this.error = '';
    this.configForm = {
      modo: 'editar', cfg: c, idcuotas: c.idcuotas,
      fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin, dia_limite: c.dia_limite, mes_vencido: c.mes_vencido ? 1 : 0,
      mora_tipo: c.mora_tipo, mora_valor: c.mora_tipo === 'Ninguna' ? null : c.mora_valor,
    };
  }

  /** Al elegir la cuota sugiere fechas según su periodicidad (enero–octubre si es mensual). */
  elegirCuota(id: number | null) {
    const f = this.configForm;
    if (!f) return;
    f.idcuotas = id;
    const cuota = this.catalogo.find(c => c.idcuotas === id);
    if (!cuota) return;
    f.fecha_inicio = `${this.ciclo}-01-01`;
    f.fecha_fin = cuota.periodicidad === 'Mensual' ? `${this.ciclo}-10-31` : `${this.ciclo}-01-31`;
  }

  get periodicidadForm(): Periodicidad | null {
    const f = this.configForm;
    if (!f) return null;
    return f.cfg?.periodicidad ?? this.catalogo.find(c => c.idcuotas === f.idcuotas)?.periodicidad ?? null;
  }

  /** Explicación en lenguaje natural de cómo se cobrará la cuota. */
  get resumenConfig(): string {
    const f = this.configForm;
    const p = this.periodicidadForm;
    if (!f || !p || !f.fecha_inicio || !f.fecha_fin || f.fecha_fin < f.fecha_inicio) return '';
    let txt = p === 'Mensual'
      ? `${this.cobros({ periodicidad: p, ...f })} cobros mensuales (${this.rangoMeses(f)}), cada uno vence el día ${f.dia_limite || '?'} ${f.mes_vencido ? `del mes siguiente (mes vencido: ${this.ejemploMesVencido(f)})` : 'del mes'}.`
      : `Un solo cobro, se puede pagar del ${this.fecha(f.fecha_inicio)} al ${this.fecha(f.fecha_fin)} (fecha límite).`;
    if (f.mora_tipo !== 'Ninguna') txt += ` Pagado después del vencimiento se suma ${f.mora_tipo === 'Monto' ? this.q(f.mora_valor ?? 0) : `${f.mora_valor ?? 0}%`} de mora.`;
    return txt;
  }

  /** Ejemplo con el primer cobro: "Enero se paga a más tardar el 05 de febrero". */
  private ejemploMesVencido(f: ConfigForm): string {
    const [y, m] = f.fecha_inicio.split('-').map(Number);
    const [vy, vm] = m === 12 ? [y + 1, 1] : [y, m + 1];
    const d = Math.min(f.dia_limite || 1, new Date(vy, vm, 0).getDate());
    return `${MESES[m - 1]} se paga a más tardar el ${String(d).padStart(2, '0')} de ${MESES[vm - 1]}`;
  }

  guardarConfig() {
    const f = this.configForm;
    if (!f) return;
    if (!f.idcuotas) { this.error = 'Seleccione la cuota.'; return; }
    if (!f.fecha_inicio || !f.fecha_fin) { this.error = 'Indique las fechas de inicio y fin.'; return; }
    if (f.fecha_fin < f.fecha_inicio) { this.error = 'La fecha de fin no puede ser anterior a la de inicio.'; return; }
    if (f.mora_tipo !== 'Ninguna' && !f.mora_valor) { this.error = 'Indique el valor de la mora.'; return; }

    const payload: CuotaConfigPayload = {
      fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin, dia_limite: f.dia_limite,
      mes_vencido: this.periodicidadForm === 'Mensual' ? f.mes_vencido : 0,
      mora_tipo: f.mora_tipo, mora_valor: f.mora_tipo === 'Ninguna' ? 0 : (f.mora_valor ?? 0),
    };
    this.saving = true;
    if (f.modo === 'nuevo') {
      this.svc.agregarAlCiclo(this.ciclo, { idcuotas: f.idcuotas, ...payload }).subscribe({
        next: () => this.configGuardada('Cuota agregada al ciclo. Ahora asigne los montos por grado.'),
        error: e => this.errorGuardar(e),
      });
      return;
    }
    // Edición: si hay estudiantes con cobros pendientes que cambiarían, se pregunta si actualizarlos
    const id = f.cfg!.idcuotas_ciclos;
    this.svc.impactoConfig(id, payload).subscribe({
      next: async r => {
        const imp = r.data!;
        let actualizar_pendientes = false;
        if (imp.inscripciones) {
          const opcion = await confirmDosOpciones('Estudiantes con cuotas pendientes', this.textoImpacto(imp),
            'Actualizar pendientes', 'Solo inscripciones nuevas');
          if (!opcion) { this.saving = false; return; }
          actualizar_pendientes = opcion === 'primera';
        }
        this.svc.updateConfig(id, { ...payload, actualizar_pendientes }).subscribe({
          next: res => this.configGuardada(res.recalculo
            ? `Configuración guardada. Se actualizaron las cuotas pendientes de ${res.recalculo.inscripciones} estudiante(s).`
            : 'Configuración guardada'),
          error: e => this.errorGuardar(e),
        });
      },
      error: e => this.errorGuardar(e),
    });
  }

  private configGuardada(mensaje: string) {
    this.saving = false;
    this.configForm = null;
    showSuccess(mensaje);
    this.recargar();
  }

  private errorGuardar(e: any) {
    this.saving = false;
    this.error = e?.error?.message || 'Error al guardar.';
  }

  private textoImpacto(imp: ImpactoConfig): string {
    const cambios = [
      imp.actualizar ? `<li>${imp.actualizar} cobro(s) cambian de fecha de vencimiento o mora</li>` : '',
      imp.anular ? `<li>${imp.anular} cobro(s) de meses fuera del nuevo período se anulan</li>` : '',
      imp.agregar ? `<li>${imp.agregar} cobro(s) de meses nuevos se agregan</li>` : '',
    ].join('');
    return `<p>${imp.inscripciones} estudiante(s) inscrito(s) tienen cuotas pendientes de pago con la configuración anterior.
      ¿Desea actualizarlas?</p>
      <ul style="text-align:left;margin:10px 0 10px 18px">${cambios}</ul>
      <p style="font-size:.88em;opacity:.8">Las cuotas pagadas o anuladas no se modifican.
      Si elige <b>Solo inscripciones nuevas</b>, los estudiantes ya inscritos conservan sus cuotas como están.</p>`;
  }

  async quitarConfig(c: CuotaCiclo) {
    const extra = c.total_grados ? ` Se borrarán también sus montos en ${c.total_grados} grado(s).` : '';
    if (!(await confirmDialog(`¿Quitar "${c.cuota}" del ciclo ${c.ciclo}?${extra}`, 'Quitar cuota del ciclo', 'Quitar'))) return;
    this.svc.deleteConfig(c.idcuotas_ciclos).subscribe({
      next: () => { showSuccess(`"${c.cuota}" quitada del ciclo ${c.ciclo}`); this.recargar(); },
      error: e => showError(e?.error?.message || 'No se pudo quitar'),
    });
  }

  // ─── Copiar ciclo ────────────────────────────────────────────
  /** Si el ciclo en pantalla ya tiene cuotas se propone copiarlo al siguiente; si está vacío, llenarlo desde otro. */
  abrirCopiar() {
    this.error = '';
    if (this.data?.cuotas.length) {
      const destino = this.siguienteCicloLibre(this.ciclo);
      this.copiarForm = { origen: this.ciclo, destino, ajuste: null, redondeo: 0 };
      return;
    }
    const origen = this.cicloSugeridoOrigen ?? this.ciclosConDatos[0]?.ciclo ?? this.anioActual;
    this.copiarForm = { origen, destino: this.ciclo, ajuste: null, redondeo: 0 };
  }

  private siguienteCicloLibre(desde: number): number {
    const conDatos = new Set(this.ciclosConDatos.filter(c => c.cuotas).map(c => c.ciclo));
    let c = desde + 1;
    while (conDatos.has(c)) c++;
    return c;
  }

  get cuotasEnOrigen(): number {
    return this.ciclosConDatos.find(c => c.ciclo === this.copiarForm?.origen)?.cuotas ?? 0;
  }

  copiar() {
    const f = this.copiarForm;
    if (!f) return;
    if (!f.destino || f.destino < 2000 || f.destino > 2100) { this.error = 'Indique un ciclo destino válido.'; return; }
    if (f.origen === f.destino) { this.error = 'El ciclo destino debe ser distinto al de origen.'; return; }
    this.saving = true;
    this.svc.copiarCiclo({ origen: Number(f.origen), destino: Number(f.destino), ajuste: f.ajuste ?? 0, redondeo: Number(f.redondeo) as CopiarCicloPayload['redondeo'] }).subscribe({
      next: r => {
        this.saving = false;
        this.copiarForm = null;
        showSuccess(`Se copiaron ${r.cuotas} cuota(s) y ${r.montos} monto(s) al ciclo ${f.destino}`);
        if (r.omitidas?.length) showWarning(`No se copiaron: ${r.omitidas.map(o => `${o.cuota} (${o.motivo})`).join(', ')}`);
        this.ciclo = Number(f.destino);
        this.syncUrl();
        this.recargar();
      },
      error: e => { this.saving = false; this.error = e?.error?.message || 'No se pudo copiar.'; },
    });
  }

  // ═════════════ Pestaña: montos por grado ═════════════
  /** Grados activos, más los inactivos que conservan algún monto en el ciclo. */
  get grupos(): GrupoGrados[] {
    const d = this.data;
    if (!d) return [];
    const conMonto = new Set(d.montos.map(m => m.idgrados));
    const out: GrupoGrados[] = [];
    for (const g of d.grados) {
      if (!g.activo && !conMonto.has(g.idgrados)) continue;
      const titulo = [g.nivel, g.carrera].filter(Boolean).join(' › ');
      let grupo = out[out.length - 1];
      if (!grupo || grupo.titulo !== titulo) out.push(grupo = { titulo, grados: [] });
      grupo.grados.push(g);
    }
    return out;
  }

  k(cfg: CuotaCiclo, g: GradoCuota) { return key(cfg.idcuotas_ciclos, g.idgrados); }

  esCambio(cfg: CuotaCiclo, g: GradoCuota): boolean {
    const k = this.k(cfg, g);
    return this.norm(this.valores[k]) !== this.norm(this.originales[k]);
  }

  private norm(v: number | null | undefined): number | null {
    return v === null || v === undefined || (v as unknown) === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100;
  }

  get cambiosPendientes(): CambioMonto[] {
    const d = this.data;
    if (!d) return [];
    const out: CambioMonto[] = [];
    for (const cfg of d.cuotas) for (const g of d.grados) {
      if (this.esCambio(cfg, g)) out.push({ idcuotas_ciclos: cfg.idcuotas_ciclos, idgrados: g.idgrados, monto: this.norm(this.valores[this.k(cfg, g)]) });
    }
    return out;
  }

  /** Total del año para un grado: suma de cuotas obligatorias × número de cobros. */
  totalAnual(g: GradoCuota, obligatoria = 1): number {
    let t = 0;
    for (const cfg of this.data?.cuotas ?? []) {
      if (cfg.obligatoria !== obligatoria) continue;
      const v = this.norm(this.valores[this.k(cfg, g)]);
      if (v !== null) t += v * this.cobros(cfg);
    }
    return t;
  }

  gradosConCuota(cfg: CuotaCiclo): number {
    return (this.data?.grados ?? []).filter(g => this.norm(this.valores[this.k(cfg, g)]) !== null).length;
  }

  restaurarMontos() {
    this.valores = { ...this.originales };
  }

  guardarMontos() {
    const cambios = this.cambiosPendientes;
    if (!cambios.length) return;
    if (cambios.some(c => c.monto !== null && c.monto < 0)) { showError('Los montos no pueden ser negativos'); return; }
    this.guardandoMontos = true;
    this.svc.guardarMontos(this.ciclo, cambios).subscribe({
      next: r => {
        this.guardandoMontos = false;
        showSuccess(`${r.cambios} monto(s) guardado(s)`);
        this.loadCiclo();
      },
      error: e => { this.guardandoMontos = false; showError(e?.error?.message || 'No se pudieron guardar los montos'); },
    });
  }

  /** Confirma descartar cambios sin guardar en la matriz. */
  private async descartarPendientes(): Promise<boolean> {
    const n = this.cambiosPendientes.length;
    if (!n) return true;
    return confirmDialog(`Hay ${n} monto(s) sin guardar. ¿Descartar los cambios?`, 'Cambios sin guardar', 'Descartar');
  }

  // ─── Llenar columna ──────────────────────────────────────────
  abrirLlenar(cfg: CuotaCiclo) {
    this.llenarForm = { cfg, monto: null, grupo: '' };
  }

  aplicarLlenar() {
    const f = this.llenarForm;
    if (!f) return;
    const monto = this.norm(f.monto);
    if (monto !== null && monto < 0) { showError('El monto no puede ser negativo'); return; }
    const grados = this.grupos.filter(gr => !f.grupo || gr.titulo === f.grupo).flatMap(gr => gr.grados).filter(g => g.activo || monto === null);
    for (const g of grados) this.valores[this.k(f.cfg, g)] = monto;
    this.llenarForm = null;
    showSuccess(`${monto === null ? 'Quitado de' : 'Monto aplicado a'} ${grados.length} grado(s). Recuerde guardar los cambios.`);
  }

  // ─── Copiar fila ─────────────────────────────────────────────
  abrirCopiarFila(g: GradoCuota) {
    this.copiarFilaForm = { origen: g, destinos: new Set() };
  }

  toggleDestino(id: number) {
    const s = this.copiarFilaForm?.destinos;
    if (!s) return;
    if (s.has(id)) s.delete(id); else s.add(id);
  }

  toggleGrupoDestino(gr: GrupoGrados) {
    const f = this.copiarFilaForm;
    if (!f) return;
    const ids = gr.grados.filter(g => g.activo && g.idgrados !== f.origen.idgrados).map(g => g.idgrados);
    const todos = ids.every(id => f.destinos.has(id));
    for (const id of ids) if (todos) f.destinos.delete(id); else f.destinos.add(id);
  }

  grupoCompleto(gr: GrupoGrados): boolean {
    const f = this.copiarFilaForm;
    if (!f) return false;
    const ids = gr.grados.filter(g => g.activo && g.idgrados !== f.origen.idgrados).map(g => g.idgrados);
    return ids.length > 0 && ids.every(id => f.destinos.has(id));
  }

  aplicarCopiarFila() {
    const f = this.copiarFilaForm;
    if (!f || !f.destinos.size) return;
    const destinos = (this.data?.grados ?? []).filter(g => f.destinos.has(g.idgrados));
    for (const cfg of this.data?.cuotas ?? []) {
      const v = this.valores[this.k(cfg, f.origen)] ?? null;
      for (const g of destinos) this.valores[this.k(cfg, g)] = v;
    }
    this.copiarFilaForm = null;
    showSuccess(`Montos de ${f.origen.grado} copiados a ${destinos.length} grado(s). Recuerde guardar los cambios.`);
  }

  // ═════════════ Pestaña: catálogo ═════════════
  accionesCuota(c: Cuota): RowAction[] {
    const a: RowAction[] = [];
    if (this.puedeE) a.push({ label: 'Editar', icon: 'edit', action: () => this.editarCuota(c) });
    a.push({ label: 'Bitácora', icon: 'bitacora', action: () => this.bitacora = { tabla: 'cuotas', id: c.idcuotas, titulo: c.cuota } });
    if (this.puedeD) a.push({
      label: 'Eliminar', icon: 'trash', variant: 'danger',
      disabled: !!c.total_ciclos, tooltip: c.total_ciclos ? 'Está configurada en uno o más ciclos; inactívela en su lugar' : 'Eliminar',
      action: () => this.eliminarCuota(c),
    });
    return a;
  }

  nuevaCuota() {
    this.error = '';
    this.cuotaForm = { cuota: '', descripcion: '', periodicidad: 'Unica', obligatoria: 1, orden: null, activo: 1 };
  }

  editarCuota(c: Cuota) {
    this.error = '';
    this.cuotaForm = {
      idcuotas: c.idcuotas, cuota: c.cuota, descripcion: c.descripcion ?? '', periodicidad: c.periodicidad,
      obligatoria: c.obligatoria ? 1 : 0, orden: c.orden, activo: c.activo ? 1 : 0,
    };
  }

  guardarCuota() {
    const f = this.cuotaForm;
    if (!f) return;
    if (!f.cuota.trim()) { this.error = 'El nombre es requerido.'; return; }
    this.saving = true;
    const req$ = f.idcuotas ? this.svc.update(f.idcuotas, f) : this.svc.create(f);
    req$.subscribe({
      next: () => { this.saving = false; this.cuotaForm = null; showSuccess('Cuota guardada'); this.recargar(); },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
    });
  }

  async eliminarCuota(c: Cuota) {
    if (!(await confirmDialog(`¿Eliminar la cuota "${c.cuota}"?`, 'Eliminar cuota', 'Eliminar'))) return;
    this.svc.delete(c.idcuotas).subscribe({
      next: () => { showSuccess('Cuota eliminada'); this.cuotaForm = null; this.recargar(); },
      error: e => showError(e?.error?.message || 'No se pudo eliminar'),
    });
  }
}

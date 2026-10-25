import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CargoPendiente, FORMAS_PAGO, FormaPago, PagadorBusqueda, Pago, PendientesPago, ResultadoFel } from '../../../models';
import { PagosService } from '../../../services/pagos.service';
import { PermisosService } from '../../../services/permisos.service';
import { confirmDialog, confirmSuccessChoice, promptCorreo, promptMotivo, showAlert, showError, showSuccess } from '../../../services/confirm';
import { ConfiguracionService } from '../../../services/configuracion.service';
import { PaginatorComponent } from '../../../shared/paginator/paginator';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';
import { ThSortComponent, ThSortChangeEvent, SortDir } from '../../../shared/th-sort/th-sort';
import { readStateFromUrl, syncStateToUrl } from '../../../shared/utils/url-state.util';
import { abrirBlob } from '../../../shared/utils/blob.util';

/** Cuotas pendientes de una inscripción (agrupadas para la tabla de cobro). */
interface GrupoCobro {
  idinscripciones: number;
  titulo: string;
  sub: string;
  cargos: CargoPendiente[];
}

interface CobroForm {
  seleccion: { tipo: 'padre' | 'estudiante'; id: number; nombre: string } | null;
  fecha_pago: string;
  pendientes: PendientesPago | null;
  cargando: boolean;
  marcados: Set<number>;
  exonerar: Set<number>;
  idpadres: number | null;
  pagador_nombre: string;
  pagador_nit: string;
  forma_pago: FormaPago;
  referencia: string;
  observaciones: string;
  /** Enviar el comprobante (recibo en PDF) por correo. */
  notificar: boolean;
  /** Certificar el recibo electrónico SAT al registrar el pago. */
  emitir_fel: boolean;
}

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const primeroDelMes = () => hoyIso().substring(0, 8) + '01';

/**
 * Pagos: cobro de cuotas del estado de cuenta. Se busca al padre (cobra todas
 * las cuotas de sus hijos) o al estudiante, se marcan las cuotas pendientes
 * (con su mora a la fecha de pago) y se genera el recibo en PDF. Si está
 * habilitado en Configuración, el recibo se certifica ante SAT (FEL, tipo RECI)
 * al cobrar o después desde el listado.
 */
@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [FormsModule, DatePipe, PaginatorComponent, RowMenuComponent, BitacoraTabComponent, ThSortComponent],
  templateUrl: './pagos.html',
  styleUrls: ['../../../shared/personas-modulo/personas-modulo.scss', './pagos.scss'],
})
export class PagosPage implements OnInit, OnDestroy {
  readonly formas = FORMAS_PAGO;
  readonly hoy = hoyIso();

  // ── Listado ──
  rows: Pago[] = [];
  loading = false;
  search = '';
  desde = primeroDelMes();
  hasta = hoyIso();
  estado: 'Activo' | 'Anulado' | '' = 'Activo';
  forma: FormaPago | '' = '';
  page = 1; pageSize = 25; total = 0; totalCobrado = 0;
  sortField = '';
  sortDir: SortDir = 'desc';
  private searchTimer: any;

  // ── Cobro ──
  cobro: CobroForm | null = null;
  busqueda = '';
  resultados: PagadorBusqueda[] = [];
  buscando = false;
  private buscarTimer: any;
  saving = false;
  error = '';
  consultandoNit = false;
  private nitConsultado = '';
  /** Pagos con una certificación o anulación FEL en curso. */
  felEnCurso = new Set<number>();

  // ── Detalle ──
  detalle: Pago | null = null;
  detalleTab: 'detalle' | 'bitacora' = 'detalle';

  constructor(
    private svc: PagosService,
    public permisos: PermisosService,
    private router: Router,
    private route: ActivatedRoute,
    private config: ConfiguracionService,
  ) {}

  /** Hay correo saliente configurado (Configuración › Correo saliente). */
  get correoHabilitado() { return !!this.config.colegio()?.correo_habilitado; }

  /** Correo del pagador elegido (si es un padre registrado con correo). */
  get correoPagador(): string | null {
    const c = this.cobro;
    return c?.idpadres ? c.pendientes?.pagadores.find(p => p.idpadres === c.idpadres)?.email ?? null : null;
  }

  /** Recibo electrónico SAT habilitado (Configuración › Recibo electrónico). */
  get felHabilitado() { return !!this.config.colegio()?.fel_habilitado; }
  get nitConsulta() { return !!this.config.colegio()?.nit_consulta; }

  get puedeA() { return this.permisos.tiene('pagos', 'A'); }
  get puedeD() { return this.permisos.tiene('pagos', 'D'); }
  get puedeExonerar() { return this.permisos.tiene('pagos', 'E'); }

  ngOnInit() {
    const qp = readStateFromUrl(this.route);
    if (qp['page']) this.page = +qp['page'];
    if (qp['pageSize']) this.pageSize = +qp['pageSize'];
    if (qp['search']) this.search = qp['search'];
    if (qp['desde'] !== undefined) this.desde = qp['desde'];
    if (qp['hasta'] !== undefined) this.hasta = qp['hasta'];
    if (qp['estado'] !== undefined) this.estado = qp['estado'] === 'todos' ? '' : qp['estado'] as any;
    if (FORMAS_PAGO.includes(qp['forma'] as FormaPago)) this.forma = qp['forma'] as FormaPago;
    if (qp['sortField']) this.sortField = qp['sortField'];
    if (qp['sortDir']) this.sortDir = qp['sortDir'] === 'asc' ? 'asc' : 'desc';
    // Desde el estado de cuenta: /finanzas/pagos?cobrar=<idestudiantes>
    const cobrar = Number(qp['cobrar']);
    this.load();
    if (cobrar && this.puedeA) this.nuevoCobro({ tipo: 'estudiante', id: cobrar, nombre: '' });
  }

  ngOnDestroy() { clearTimeout(this.searchTimer); clearTimeout(this.buscarTimer); }

  // ═════════════ Listado ═════════════
  private syncUrl() {
    syncStateToUrl(this.router, this.route, {
      page: this.page, pageSize: this.pageSize, search: this.search,
      desde: this.desde, hasta: this.hasta, estado: this.estado === '' ? 'todos' : this.estado, forma: this.forma,
      sortField: this.sortField, sortDir: this.sortField ? this.sortDir : undefined,
    }, { defaults: { page: 1, pageSize: 25, estado: 'Activo', desde: primeroDelMes(), hasta: hoyIso() } });
  }

  load() {
    this.syncUrl();
    this.loading = true;
    this.svc.getAll({
      page: this.page, pageSize: this.pageSize, search: this.search,
      fecha_pago_desde: this.desde, fecha_pago_hasta: this.hasta, estado: this.estado, forma_pago: this.forma,
      sortField: this.sortField || undefined, sortDir: this.sortField ? this.sortDir.toUpperCase() : undefined,
    }).subscribe({
      next: r => {
        this.loading = false;
        this.rows = r.data ?? [];
        this.total = r.meta?.total ?? 0;
        this.totalCobrado = r.meta?.total_cobrado ?? 0;
      },
      error: e => { this.loading = false; showError(e?.error?.message || 'No se pudo cargar el listado'); },
    });
  }

  reload() { this.page = 1; this.load(); }
  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.reload(), 350); }
  onSort(e: ThSortChangeEvent) { this.sortField = e.field; this.sortDir = e.dir; this.reload(); }
  onPageChange(p: number) { this.page = p; this.load(); }
  onPageSizeChange(ps: number) { this.pageSize = ps; this.reload(); }

  getRowActions(p: Pago): RowAction[] {
    const a: RowAction[] = [
      { label: 'Ver recibo (PDF)', icon: 'print', action: () => this.verRecibo(p.idpagos) },
      { label: 'Detalle', icon: 'view', action: () => this.abrirDetalle(p, 'detalle') },
      { label: 'Bitácora', icon: 'bitacora', action: () => this.abrirDetalle(p, 'bitacora') },
    ];
    if (this.puedeA && this.puedeEmitirFel(p))
      a.push({ label: p.fel_estado === 'Error' ? 'Reintentar recibo electrónico SAT' : 'Emitir recibo electrónico SAT', icon: 'receipt', action: () => this.certificarFel(p) });
    if (this.puedeD && p.estado === 'Anulado' && p.fel_estado === 'Error al anular')
      a.push({ label: 'Reintentar anulación ante SAT', icon: 'anular', action: () => this.reintentarAnulacionFel(p) });
    if (this.puedeA && p.estado === 'Activo' && this.correoHabilitado)
      a.push({ label: 'Enviar comprobante por correo', icon: 'mail', action: () => this.enviarComprobante(p) });
    if (this.puedeD && p.estado === 'Activo') a.push({ label: 'Anular recibo', icon: 'anular', variant: 'danger', action: () => this.anular(p) });
    return a;
  }

  // ─── Formato ───
  q(n: number | null | undefined) {
    return 'Q' + Number(n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  numero(n: number) { return String(n).padStart(6, '0'); }
  fecha(f: string) {
    const [y, m, d] = f.substring(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  verRecibo(id: number) {
    this.svc.reciboPdf(id).subscribe({ next: abrirBlob, error: () => showError('No se pudo generar el recibo') });
  }

  abrirDetalle(p: Pago, tab: 'detalle' | 'bitacora') {
    this.detalleTab = tab;
    this.detalle = p;
    this.svc.getById(p.idpagos).subscribe({ next: r => { if (this.detalle?.idpagos === p.idpagos) this.detalle = r.data!; } });
  }

  async anular(p: Pago) {
    const sat = p.fel_estado === 'Certificado' ? ' También se anulará ante SAT el recibo electrónico.' : '';
    const motivo = await promptMotivo(
      `Anular recibo ${this.numero(p.numero)}`,
      `${this.q(p.total)} — ${p.pagador_nombre}. Las cuotas del recibo volverán a quedar pendientes de pago.${sat}`,
      'Anular recibo',
    );
    if (!motivo) return;
    this.svc.anular(p.idpagos, motivo).subscribe({
      next: r => {
        this.detalle = null;
        this.load();
        if (r.fel && !r.fel.anulado)
          showAlert('Recibo anulado', `El recibo se anuló en el sistema, pero no ante SAT: ${r.fel.error}. Puede reintentarlo desde el listado.`);
        else showSuccess(r.fel ? 'Recibo anulado (también ante SAT)' : 'Recibo anulado');
      },
      error: e => showError(e?.error?.message || 'No se pudo anular'),
    });
  }

  // ─── Recibo electrónico SAT (FEL) ───
  puedeEmitirFel(p: Pago) {
    return this.felHabilitado && p.estado === 'Activo' && (!p.fel_estado || p.fel_estado === 'Error');
  }

  felEtiqueta(p: Pago): { texto: string; clase: string } | null {
    switch (p.fel_estado) {
      case 'Certificado': return { texto: 'FEL', clase: 'info' };
      case 'Procesando': return { texto: 'FEL en proceso', clase: 'warning' };
      case 'Error': return { texto: 'FEL con error', clase: 'danger' };
      case 'Anulado': return { texto: 'FEL anulado', clase: 'neutral' };
      case 'Error al anular': return { texto: 'FEL sin anular', clase: 'danger' };
      default: return null;
    }
  }

  async certificarFel(p: Pago) {
    if (this.felEnCurso.has(p.idpagos)) return;
    const ok = await confirmDialog(
      `Se certificará ante SAT un recibo electrónico por ${this.q(p.total)} a nombre de ${p.pagador_nombre} (NIT ${p.pagador_nit}).`,
      `Recibo electrónico — recibo No. ${this.numero(p.numero)}`, 'Certificar', false,
    );
    if (!ok) return;
    this.felEnCurso.add(p.idpagos);
    this.svc.certificarFel(p.idpagos).subscribe({
      next: r => {
        this.felEnCurso.delete(p.idpagos);
        showSuccess(`Recibo electrónico certificado: serie ${r.serie}, No. ${r.numero}`);
        this.refrescar(p.idpagos);
      },
      error: e => {
        this.felEnCurso.delete(p.idpagos);
        showAlert('No se certificó el recibo electrónico', e?.error?.message || 'Error al comunicarse con el certificador', 'error');
        this.refrescar(p.idpagos);
      },
    });
  }

  reintentarAnulacionFel(p: Pago) {
    if (this.felEnCurso.has(p.idpagos)) return;
    this.felEnCurso.add(p.idpagos);
    this.svc.anularFel(p.idpagos).subscribe({
      next: () => { this.felEnCurso.delete(p.idpagos); showSuccess('Recibo electrónico anulado ante SAT'); this.refrescar(p.idpagos); },
      error: e => {
        this.felEnCurso.delete(p.idpagos);
        showAlert('No se anuló ante SAT', e?.error?.message || 'Error al comunicarse con el certificador', 'error');
        this.refrescar(p.idpagos);
      },
    });
  }

  /** Recarga el listado y, si está abierto, el detalle del pago. */
  private refrescar(idpagos: number) {
    this.load();
    if (this.detalle?.idpagos === idpagos) this.abrirDetalle(this.detalle, this.detalleTab);
  }

  private mensajeFel(f: ResultadoFel | null): string {
    if (!f) return '';
    return f.certificado
      ? ` Recibo electrónico SAT certificado: serie ${f.serie}, No. ${f.numero}.`
      : ` No se certificó el recibo electrónico: ${f.error}. Puede reintentarlo desde el listado.`;
  }

  // ═════════════ Cobro ═════════════
  nuevoCobro(sel: CobroForm['seleccion'] = null) {
    this.error = '';
    this.busqueda = '';
    this.resultados = [];
    this.cobro = {
      seleccion: null, fecha_pago: hoyIso(), pendientes: null, cargando: false,
      marcados: new Set(), exonerar: new Set(),
      idpadres: null, pagador_nombre: '', pagador_nit: 'CF', forma_pago: 'Efectivo', referencia: '', observaciones: '',
      notificar: this.correoHabilitado && !!this.config.colegio()?.notificar_pago,
      emitir_fel: this.felHabilitado && !!this.config.colegio()?.fel_emitir_pago,
    };
    this.nitConsultado = '';
    if (sel) this.elegir(sel);
  }

  cerrarCobro() {
    this.cobro = null;
    // Quita ?cobrar= de la URL para que al recargar no se vuelva a abrir
    this.syncUrl();
  }

  onBuscar() {
    clearTimeout(this.buscarTimer);
    const q = this.busqueda.trim();
    if (q.length < 2) { this.resultados = []; return; }
    this.buscarTimer = setTimeout(() => {
      this.buscando = true;
      this.svc.buscar(q).subscribe({
        next: r => { this.buscando = false; this.resultados = r.data ?? []; },
        error: () => { this.buscando = false; },
      });
    }, 300);
  }

  elegir(r: Pick<PagadorBusqueda, 'tipo' | 'id' | 'nombre'>) {
    const c = this.cobro;
    if (!c) return;
    this.resultados = [];
    this.busqueda = '';
    c.seleccion = { tipo: r.tipo, id: r.id, nombre: r.nombre };
    c.idpadres = null;
    c.pagador_nombre = '';
    c.pagador_nit = 'CF';
    this.cargarPendientes(true);
  }

  cambiarSeleccion() {
    if (!this.cobro) return;
    this.cobro.seleccion = null;
    this.cobro.pendientes = null;
    this.cobro.marcados = new Set();
    this.cobro.exonerar = new Set();
  }

  /** Trae las cuotas pendientes con la mora a la fecha de pago. `inicial` sugiere pagador y marca las vencidas. */
  cargarPendientes(inicial = false) {
    const c = this.cobro;
    if (!c?.seleccion || !c.fecha_pago) return;
    c.cargando = true;
    const sel = c.seleccion.tipo === 'padre' ? { idpadres: c.seleccion.id } : { idestudiantes: c.seleccion.id };
    this.svc.pendientes(sel, c.fecha_pago).subscribe({
      next: r => {
        c.cargando = false;
        const d = r.data!;
        c.pendientes = d;
        // Conservar solo las marcas que siguen pendientes
        const ids = new Set(d.cargos.map(x => x.idinscripciones_cargos));
        c.marcados = new Set([...c.marcados].filter(id => ids.has(id)));
        c.exonerar = new Set([...c.exonerar].filter(id => ids.has(id)));
        if (inicial) {
          if (!c.seleccion!.nombre) c.seleccion!.nombre = d.cargos[0]?.estudiante ?? 'Estudiante';
          const p = d.pagadores[0];
          if (p) this.elegirPagador(p);
          this.marcar('vencidas');
        }
      },
      error: e => { c.cargando = false; showError(e?.error?.message || 'No se pudieron cargar las cuotas pendientes'); },
    });
  }

  elegirPagador(p: PendientesPago['pagadores'][number] | null) {
    const c = this.cobro;
    if (!c) return;
    c.idpadres = p?.idpadres ?? null;
    c.pagador_nombre = p?.nombre ?? '';
    c.pagador_nit = p?.nit || 'CF';
    this.nitConsultado = c.pagador_nit.toUpperCase().replace(/[\s-]/g, '');
  }

  /** Al cambiar el NIT busca el nombre registrado y lo pone como nombre de quien paga. */
  consultarNit() {
    const c = this.cobro;
    if (!c || !this.nitConsulta) return;
    const nit = c.pagador_nit.trim().toUpperCase().replace(/[\s-]/g, '');
    if (!nit || nit === 'CF' || nit === this.nitConsultado) return;
    this.nitConsultado = nit;
    this.consultandoNit = true;
    this.svc.consultarNit(nit).subscribe({
      next: r => {
        this.consultandoNit = false;
        if (this.cobro !== c) return;
        if (r.success && r.data) c.pagador_nombre = r.data.nombre;
        else showError('NIT no encontrado; verifique el número o escriba el nombre');
      },
      error: e => { this.consultandoNit = false; showError(e?.error?.message || 'No se pudo consultar el NIT'); },
    });
  }

  get grupos(): GrupoCobro[] {
    const out: GrupoCobro[] = [];
    for (const x of this.cobro?.pendientes?.cargos ?? []) {
      let g = out.find(o => o.idinscripciones === x.idinscripciones);
      if (!g) out.push(g = {
        idinscripciones: x.idinscripciones,
        titulo: x.estudiante,
        sub: `${[x.nivel, x.carrera, x.grado].filter(Boolean).join(' › ')}${x.seccion ? ' ' + x.seccion : ''} · ${x.codigo}`,
        cargos: [],
      });
      g.cargos.push(x);
    }
    return out;
  }

  toggle(id: number) {
    const s = this.cobro?.marcados;
    if (!s) return;
    if (s.has(id)) { s.delete(id); this.cobro!.exonerar.delete(id); } else s.add(id);
  }

  toggleExonerar(id: number) {
    const s = this.cobro?.exonerar;
    if (!s) return;
    if (s.has(id)) s.delete(id); else s.add(id);
  }

  toggleGrupo(g: GrupoCobro) {
    const s = this.cobro!.marcados;
    const todos = g.cargos.every(x => s.has(x.idinscripciones_cargos));
    for (const x of g.cargos) if (todos) this.cobro!.marcados.delete(x.idinscripciones_cargos); else s.add(x.idinscripciones_cargos);
  }
  grupoCompleto(g: GrupoCobro) { return g.cargos.every(x => this.cobro!.marcados.has(x.idinscripciones_cargos)); }

  /** Selección rápida: vencidas, hasta fin del mes de pago, todas o ninguna. */
  marcar(modo: 'vencidas' | 'mes' | 'todas' | 'ninguna') {
    const c = this.cobro;
    if (!c?.pendientes) return;
    const finMes = (() => {
      const [y, m] = c.fecha_pago.split('-').map(Number);
      return `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    })();
    const sel = c.pendientes.cargos.filter(x =>
      modo === 'todas' ? true : modo === 'ninguna' ? false : modo === 'vencidas' ? x.vencido : x.fecha_vencimiento <= finMes);
    c.marcados = new Set(sel.map(x => x.idinscripciones_cargos));
    c.exonerar = new Set([...c.exonerar].filter(id => c.marcados.has(id)));
  }

  moraLinea(x: CargoPendiente) { return this.cobro?.exonerar.has(x.idinscripciones_cargos) ? 0 : x.mora; }

  get resumen() {
    const c = this.cobro;
    const sel = (c?.pendientes?.cargos ?? []).filter(x => c!.marcados.has(x.idinscripciones_cargos));
    const subtotal = sel.reduce((s, x) => s + x.monto, 0);
    const mora = sel.reduce((s, x) => s + this.moraLinea(x), 0);
    return { cuotas: sel.length, subtotal, mora, total: subtotal + mora };
  }

  get pideReferencia() { return this.cobro?.forma_pago !== 'Efectivo'; }
  get etiquetaReferencia() {
    const f = this.cobro?.forma_pago;
    return f === 'Cheque' ? 'No. de cheque' : f === 'Tarjeta' ? 'No. de autorización' : 'No. de boleta / referencia';
  }

  cobrar() {
    const c = this.cobro;
    if (!c) return;
    this.error = '';
    if (!c.marcados.size) { this.error = 'Seleccione al menos una cuota.'; return; }
    if (!c.pagador_nombre.trim()) { this.error = 'Indique el nombre de quien paga.'; return; }
    if (this.pideReferencia && !c.referencia.trim()) { this.error = `Indique el ${this.etiquetaReferencia.toLowerCase()}.`; return; }
    if (!c.fecha_pago || c.fecha_pago > this.hoy) { this.error = 'La fecha de pago no puede ser futura.'; return; }

    this.saving = true;
    this.svc.create({
      fecha_pago: c.fecha_pago, idpadres: c.idpadres, pagador_nombre: c.pagador_nombre, pagador_nit: c.pagador_nit,
      forma_pago: c.forma_pago, referencia: c.referencia, observaciones: c.observaciones,
      cargos: [...c.marcados].map(id => ({ idinscripciones_cargos: id, exonerar_mora: c.exonerar.has(id) })),
      notificar: this.correoHabilitado && c.notificar,
      emitir_fel: this.felHabilitado && c.emitir_fel,
    }).subscribe({
      next: async r => {
        this.saving = false;
        this.cerrarCobro();
        this.load();
        const aviso = !r.correo ? ''
          : r.correo.enviado ? ` Comprobante enviado a ${r.correo.destinatarios?.join(', ')}.`
          : ` No se envió el comprobante por correo: ${r.correo.error}`;
        const ver = await confirmSuccessChoice(
          `Recibo No. ${this.numero(r.numero)}`,
          `Pago registrado por ${this.q(r.total)}.${this.mensajeFel(r.fel)}${aviso}`,
          'Imprimir recibo', 'Cerrar',
        );
        if (ver) this.verRecibo(r.id);
      },
      error: e => {
        this.saving = false;
        this.error = e?.error?.message || 'No se pudo registrar el pago.';
        // Si otra persona cobró una cuota mientras tanto, refrescar la lista
        if (e?.status === 409) this.cargarPendientes();
      },
    });
  }

  /** (Re)envía el comprobante; vacío = al pagador o a los encargados con correo. */
  async enviarComprobante(p: Pago) {
    const correos = await promptCorreo(
      `Comprobante del recibo No. ${this.numero(p.numero)}`,
      'Deje el campo vacío para enviarlo al correo del padre que pagó (o de los encargados que firmaron la inscripción), o escriba otro(s) correo(s) separados por coma.',
      '', 'Enviar', true,
    );
    if (correos === null) return;
    this.svc.notificar(p.idpagos, correos || undefined).subscribe({
      next: r => showSuccess(`Comprobante enviado a ${r.destinatarios.join(', ')}`),
      error: e => showError(e?.error?.message || 'No se pudo enviar el comprobante'),
    });
  }
}

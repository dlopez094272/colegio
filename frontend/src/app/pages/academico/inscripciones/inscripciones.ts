import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ContextoEstudiante, CuotaGrado, Inscripcion, OpcionesInscripcion, PersonaRegistro } from '../../../models';
import { InscripcionesService } from '../../../services/inscripciones.service';
import { PersonasService, urlArchivo } from '../../../services/personas.service';
import { PermisosService } from '../../../services/permisos.service';
import { confirmDialog, confirmSuccessChoice, promptMotivo, showError, showSuccess, showWarning } from '../../../services/confirm';
import { PaginatorComponent } from '../../../shared/paginator/paginator';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';
import { ThSortComponent, ThSortChangeEvent, SortDir } from '../../../shared/th-sort/th-sort';
import { EstadoCuentaComponent } from '../../../shared/estado-cuenta/estado-cuenta';
import { readStateFromUrl, syncStateToUrl } from '../../../shared/utils/url-state.util';
import { abrirBlob, descargarBlob } from '../../../shared/utils/blob.util';

type Tab = 'resumen' | 'cuenta' | 'contrato' | 'bitacora';

interface InscripcionForm {
  modo: 'nuevo' | 'editar';
  insc: Inscripcion | null;
  estudiante: ContextoEstudiante['estudiante'] | null;
  padres: ContextoEstudiante['padres'];
  historial: ContextoEstudiante['inscripciones'];
  ciclo: number;
  fecha_inscripcion: string;
  idniveles: number | null;
  idcarreras: number | null;
  idgrados: number | null;
  idsecciones: number | null;
  idpadres: number | null;
  observaciones: string;
  cuotas: CuotaGrado[];
  cargandoCuotas: boolean;
  opcionales: Set<number>;
}

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Inscripciones: asocia un estudiante a un grado (y sección, y carrera si el
 * nivel las usa) en un ciclo, genera su estado de cuenta con las cuotas del
 * grado y el contrato en PDF para firmar; el contrato firmado se sube aquí.
 */
@Component({
  selector: 'app-inscripciones',
  standalone: true,
  imports: [FormsModule, DatePipe, PaginatorComponent, RowMenuComponent, BitacoraTabComponent, ThSortComponent, EstadoCuentaComponent],
  templateUrl: './inscripciones.html',
  styleUrls: ['../../../shared/personas-modulo/personas-modulo.scss', './inscripciones.scss'],
})
export class InscripcionesPage implements OnInit, OnDestroy {
  readonly anioActual = new Date().getFullYear();
  readonly urlFoto = urlArchivo;

  // ── Listado ──
  rows: Inscripcion[] = [];
  loading = false;
  search = '';
  ciclo: number = this.anioActual;
  estado: 'Activa' | 'Anulada' | '' = 'Activa';
  nivelFiltro: number | null = null;
  gradoFiltro: number | null = null;
  seccionFiltro: number | null = null;
  solvencia: '' | 'mora' | 'aldia' = '';
  contrato: '' | 'firmado' | 'pendiente' = '';
  page = 1; pageSize = 25; total = 0;
  sortField = '';
  sortDir: SortDir = 'asc';
  private searchTimer: any;

  opciones: OpcionesInscripcion = { niveles: [], carreras: [], grados: [], secciones: [] };

  // ── Formulario ──
  form: InscripcionForm | null = null;
  busqueda = '';
  resultados: PersonaRegistro[] = [];
  buscando = false;
  private buscarTimer: any;
  saving = false;
  error = '';

  // ── Detalle ──
  detalle: Inscripcion | null = null;
  tab: Tab = 'resumen';
  subiendo = false;
  abriendo = '';

  constructor(
    private svc: InscripcionesService,
    private personas: PersonasService,
    public permisos: PermisosService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  get puedeA() { return this.permisos.tiene('inscripciones', 'A'); }
  get puedeE() { return this.permisos.tiene('inscripciones', 'E'); }
  get puedeD() { return this.permisos.tiene('inscripciones', 'D'); }

  ngOnInit() {
    this.restoreFromUrl();
    this.load();
    this.svc.opciones().subscribe({ next: r => this.opciones = r.data ?? this.opciones, error: () => {} });
  }

  ngOnDestroy() { clearTimeout(this.searchTimer); clearTimeout(this.buscarTimer); }

  // ═════════════ Listado ═════════════
  private restoreFromUrl() {
    const qp = readStateFromUrl(this.route);
    if (qp['page']) this.page = +qp['page'];
    if (qp['pageSize']) this.pageSize = +qp['pageSize'];
    if (qp['search']) this.search = qp['search'];
    const c = Number(qp['ciclo']);
    if (Number.isInteger(c) && c >= 2000 && c <= 2100) this.ciclo = c;
    if (qp['estado'] !== undefined) this.estado = qp['estado'] === 'todas' ? '' : qp['estado'] as any;
    if (qp['nivel']) this.nivelFiltro = +qp['nivel'] || null;
    if (qp['grado']) this.gradoFiltro = +qp['grado'] || null;
    if (qp['seccion']) this.seccionFiltro = +qp['seccion'] || null;
    if (qp['solvencia'] === 'mora' || qp['solvencia'] === 'aldia') this.solvencia = qp['solvencia'];
    if (qp['contrato'] === 'firmado' || qp['contrato'] === 'pendiente') this.contrato = qp['contrato'];
    if (qp['sortField']) this.sortField = qp['sortField'];
    if (qp['sortDir']) this.sortDir = qp['sortDir'] === 'desc' ? 'desc' : 'asc';
  }

  private syncUrl() {
    syncStateToUrl(this.router, this.route, {
      page: this.page, pageSize: this.pageSize, search: this.search, ciclo: this.ciclo,
      estado: this.estado === '' ? 'todas' : this.estado,
      nivel: this.nivelFiltro ?? undefined, grado: this.gradoFiltro ?? undefined, seccion: this.seccionFiltro ?? undefined,
      solvencia: this.solvencia, contrato: this.contrato,
      sortField: this.sortField, sortDir: this.sortField ? this.sortDir : undefined,
    }, { defaults: { page: 1, pageSize: 25, estado: 'Activa', ciclo: this.anioActual } });
  }

  load() {
    this.syncUrl();
    this.loading = true;
    this.svc.getAll({
      page: this.page, pageSize: this.pageSize, search: this.search, ciclo: this.ciclo, estado: this.estado,
      idniveles: this.nivelFiltro, idgrados: this.gradoFiltro, idsecciones: this.seccionFiltro,
      solvencia: this.solvencia, contrato: this.contrato,
      sortField: this.sortField || undefined, sortDir: this.sortField ? this.sortDir.toUpperCase() : undefined,
    }).subscribe({
      next: r => { this.loading = false; this.rows = r.data ?? []; this.total = r.meta?.total ?? 0; },
      error: e => { this.loading = false; showError(e?.error?.message || 'No se pudo cargar el listado'); },
    });
  }

  reload() { this.page = 1; this.load(); }

  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 350);
  }
  onNivelFiltro() { this.gradoFiltro = null; this.seccionFiltro = null; this.reload(); }
  onGradoFiltro() { this.seccionFiltro = null; this.reload(); }
  onSort(e: ThSortChangeEvent) { this.sortField = e.field; this.sortDir = e.dir; this.reload(); }
  onPageChange(p: number) { this.page = p; this.load(); }
  onPageSizeChange(ps: number) { this.pageSize = ps; this.reload(); }

  get ciclosFiltro(): number[] {
    const s = new Set([this.anioActual - 1, this.anioActual, this.anioActual + 1, this.ciclo]);
    return [...s].sort((a, b) => b - a);
  }

  get gradosFiltro() {
    return this.nivelFiltro ? this.opciones.grados.filter(g => g.idniveles === this.nivelFiltro) : [];
  }
  get seccionesFiltro() {
    return this.gradoFiltro ? this.opciones.secciones.filter(s => s.idgrados === this.gradoFiltro) : [];
  }
  /** Grados del filtro con el nombre de la carrera (Diversificado). */
  nombreGradoOpcion(g: OpcionesInscripcion['grados'][number]) {
    const c = g.idcarreras ? this.opciones.carreras.find(x => x.idcarreras === g.idcarreras)?.carrera : null;
    return c ? `${c} › ${g.grado}` : g.grado;
  }

  getRowActions(r: Inscripcion): RowAction[] {
    const a: RowAction[] = [
      { label: 'Ver inscripción', icon: 'view', action: () => this.abrirDetalle(r, 'resumen') },
      { label: 'Estado de cuenta', icon: 'receipt', action: () => this.abrirDetalle(r, 'cuenta') },
      { label: 'Contrato (PDF)', icon: 'print', action: () => this.verContrato(r) },
    ];
    if (r.estado === 'Activa' && (this.puedeA || this.puedeE))
      a.push({ label: r.contrato_firmado ? 'Contrato firmado' : 'Subir contrato firmado', icon: 'plus', action: () => this.abrirDetalle(r, 'contrato') });
    if (this.puedeE && r.estado === 'Activa') a.push({ label: 'Editar', icon: 'edit', action: () => this.editar(r) });
    a.push({ label: 'Bitácora', icon: 'bitacora', action: () => this.abrirDetalle(r, 'bitacora') });
    if (this.puedeD && r.estado === 'Activa') a.push({ label: 'Anular inscripción', icon: 'anular', variant: 'danger', action: () => this.anular(r) });
    return a;
  }

  // ─── Formato ───
  q(n: number | null | undefined) {
    return 'Q' + Number(n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  gradoTexto(i: { nivel: string; carrera: string | null; grado: string; seccion: string | null }) {
    return [i.nivel, i.carrera, i.grado].filter(Boolean).join(' › ') + (i.seccion ? ` — ${i.seccion}` : '');
  }
  iniciales(nombre: string) {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  // ═════════════ Formulario ═════════════
  nueva() {
    this.error = '';
    this.busqueda = '';
    this.resultados = [];
    this.form = {
      modo: 'nuevo', insc: null, estudiante: null, padres: [], historial: [],
      ciclo: this.ciclo, fecha_inscripcion: hoyIso(),
      idniveles: null, idcarreras: null, idgrados: null, idsecciones: null, idpadres: null,
      observaciones: '', cuotas: [], cargandoCuotas: false, opcionales: new Set(),
    };
  }

  editar(r: Inscripcion) {
    this.error = '';
    this.detalle = null;
    this.form = {
      modo: 'editar', insc: r, estudiante: null, padres: [], historial: [],
      ciclo: r.ciclo, fecha_inscripcion: r.fecha_inscripcion,
      idniveles: r.idniveles, idcarreras: r.idcarreras, idgrados: r.idgrados, idsecciones: r.idsecciones, idpadres: r.idpadres,
      observaciones: r.observaciones ?? '', cuotas: [], cargandoCuotas: false, opcionales: new Set(),
    };
    this.svc.contextoEstudiante(r.idestudiantes).subscribe({
      next: res => { if (this.form?.insc === r) { this.form.estudiante = res.data!.estudiante; this.form.padres = res.data!.padres; } },
    });
  }

  cerrarForm() { this.form = null; }

  // ─── Estudiante ───
  onBuscarEstudiante() {
    clearTimeout(this.buscarTimer);
    const q = this.busqueda.trim();
    if (q.length < 2) { this.resultados = []; return; }
    this.buscarTimer = setTimeout(() => {
      this.buscando = true;
      this.personas.buscar('estudiantes', q, [], 8).subscribe({
        next: r => { this.buscando = false; this.resultados = r.data ?? []; },
        error: () => { this.buscando = false; },
      });
    }, 300);
  }

  elegirEstudiante(e: PersonaRegistro) {
    const f = this.form;
    if (!f) return;
    this.resultados = [];
    this.busqueda = '';
    this.svc.contextoEstudiante(e.idestudiantes!).subscribe({
      next: r => {
        const d = r.data!;
        f.estudiante = d.estudiante;
        f.padres = d.padres;
        f.historial = d.inscripciones;
        // Encargado sugerido: el primero vinculado (vienen ordenados Padre, Madre, Tutor...)
        f.idpadres = d.padres.find(p => p.activo)?.id ?? d.padres[0]?.id ?? null;
        // Sugerir el siguiente grado según la última inscripción no es confiable: solo se avisa.
      },
      error: err => showError(err?.error?.message || 'No se pudo cargar el estudiante'),
    });
  }

  quitarEstudiante() {
    if (!this.form) return;
    this.form.estudiante = null;
    this.form.padres = [];
    this.form.historial = [];
    this.form.idpadres = null;
  }

  get yaInscrito() {
    const f = this.form;
    return f?.modo === 'nuevo' ? f.historial.find(h => h.ciclo === Number(f.ciclo) && h.estado === 'Activa') ?? null : null;
  }

  // ─── Cascada nivel → carrera → grado → sección ───
  get nivelSel() { return this.opciones.niveles.find(n => n.idniveles === this.form?.idniveles) ?? null; }
  get carrerasForm() { return this.opciones.carreras.filter(c => c.idniveles === this.form?.idniveles); }
  get gradosForm() {
    const f = this.form;
    if (!f?.idniveles) return [];
    const n = this.nivelSel;
    return this.opciones.grados.filter(g => g.idniveles === f.idniveles && (n?.usa_carreras ? g.idcarreras === f.idcarreras : !g.idcarreras));
  }
  get seccionesForm() { return this.opciones.secciones.filter(s => s.idgrados === this.form?.idgrados); }

  onNivel() {
    const f = this.form!;
    f.idcarreras = null; f.idgrados = null; f.idsecciones = null; f.cuotas = [];
    const grados = this.gradosForm;
    if (!this.nivelSel?.usa_carreras && grados.length === 1) { f.idgrados = grados[0].idgrados; this.onGrado(); }
  }
  onCarrera() {
    const f = this.form!;
    f.idgrados = null; f.idsecciones = null; f.cuotas = [];
  }
  onGrado() {
    const f = this.form!;
    f.idsecciones = null;
    const secs = this.seccionesForm;
    if (secs.length === 1) f.idsecciones = secs[0].idsecciones;
    this.cargarCuotas();
  }
  onCiclo() { if (this.form?.idgrados) this.cargarCuotas(); }

  cargarCuotas() {
    const f = this.form;
    if (!f || f.modo !== 'nuevo' || !f.idgrados) return;
    f.cargandoCuotas = true;
    f.opcionales = new Set();
    this.svc.cuotasGrado(Number(f.ciclo), f.idgrados).subscribe({
      next: r => { f.cargandoCuotas = false; f.cuotas = r.data ?? []; },
      error: () => { f.cargandoCuotas = false; f.cuotas = []; },
    });
  }

  toggleOpcional(id: number) {
    const s = this.form?.opcionales;
    if (!s) return;
    if (s.has(id)) s.delete(id); else s.add(id);
  }

  get totalCiclo(): number {
    const f = this.form;
    if (!f) return 0;
    return f.cuotas.filter(c => c.obligatoria || f.opcionales.has(c.idcuotas_ciclos)).reduce((s, c) => s + c.monto * c.cobros, 0);
  }

  guardar() {
    const f = this.form;
    if (!f) return;
    this.error = '';
    if (f.modo === 'nuevo') {
      if (!f.estudiante) { this.error = 'Seleccione el estudiante.'; return; }
      if (this.yaInscrito) { this.error = `Ya está inscrito en el ciclo ${f.ciclo} (${this.yaInscrito.codigo}).`; return; }
      if (!f.idgrados) { this.error = 'Seleccione el grado.'; return; }
    }
    if (this.seccionesForm.length && !f.idsecciones) { this.error = 'Seleccione la sección.'; return; }
    if (!f.fecha_inscripcion) { this.error = 'Indique la fecha de inscripción.'; return; }

    this.saving = true;
    if (f.modo === 'editar') {
      this.svc.update(f.insc!.idinscripciones, {
        idsecciones: f.idsecciones, idpadres: f.idpadres, fecha_inscripcion: f.fecha_inscripcion, observaciones: f.observaciones,
      }).subscribe({
        next: () => { this.saving = false; this.form = null; showSuccess('Inscripción actualizada'); this.load(); },
        error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
      });
      return;
    }

    this.svc.create({
      idestudiantes: f.estudiante!.idestudiantes, ciclo: Number(f.ciclo), idgrados: f.idgrados!, idsecciones: f.idsecciones,
      idpadres: f.idpadres, fecha_inscripcion: f.fecha_inscripcion, observaciones: f.observaciones, opcionales: [...f.opcionales],
    }).subscribe({
      next: async r => {
        this.saving = false;
        this.form = null;
        if (Number(f.ciclo) !== this.ciclo) this.ciclo = Number(f.ciclo);
        this.load();
        if (r.sinCuotas) showWarning('El grado no tiene cuotas configuradas en este ciclo: el estado de cuenta quedó vacío.');
        const ver = await confirmSuccessChoice(
          `Inscripción ${r.codigo}`,
          `${f.estudiante!.nombre_completo} quedó inscrito con ${r.cargos} cuota(s) en su estado de cuenta. ¿Descargar el contrato para firmar?`,
          'Descargar contrato', 'Ahora no',
        );
        if (ver) this.descargarContrato({ idinscripciones: r.id, codigo: r.codigo } as Inscripcion);
      },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al inscribir.'; },
    });
  }

  // ═════════════ Detalle ═════════════
  abrirDetalle(r: Inscripcion, tab: Tab) {
    this.detalle = r;
    this.tab = tab;
  }

  cerrarDetalle() { this.detalle = null; }

  /** Recarga la inscripción abierta (contrato, saldo) y el listado. */
  refrescarDetalle() {
    const d = this.detalle;
    if (!d) return;
    this.svc.getById(d.idinscripciones).subscribe({ next: r => { if (this.detalle?.idinscripciones === d.idinscripciones) this.detalle = r.data!; } });
    this.load();
  }

  async anular(r: Inscripcion) {
    const motivo = await promptMotivo(
      `Anular ${r.codigo}`,
      `${r.estudiante} — las cuotas pendientes se anulan. Si tiene cuotas pagadas, anule primero los recibos.`,
      'Anular inscripción',
    );
    if (!motivo) return;
    this.svc.anular(r.idinscripciones, motivo).subscribe({
      next: () => { showSuccess('Inscripción anulada'); this.detalle = null; this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo anular'),
    });
  }

  // ─── Contrato ───
  verContrato(r: Inscripcion) {
    this.abriendo = 'contrato';
    this.svc.contratoPdf(r.idinscripciones).subscribe({
      next: b => { this.abriendo = ''; abrirBlob(b); },
      error: () => { this.abriendo = ''; showError('No se pudo generar el contrato'); },
    });
  }

  descargarContrato(r: Pick<Inscripcion, 'idinscripciones' | 'codigo'>) {
    this.abriendo = 'contrato';
    this.svc.contratoPdf(r.idinscripciones).subscribe({
      next: b => { this.abriendo = ''; descargarBlob(b, `Contrato ${r.codigo}.pdf`); },
      error: () => { this.abriendo = ''; showError('No se pudo generar el contrato'); },
    });
  }

  verFirmado(r: Inscripcion, descargar = false) {
    this.abriendo = 'firmado';
    this.svc.contratoFirmado(r.idinscripciones).subscribe({
      next: b => { this.abriendo = ''; descargar ? descargarBlob(b, r.contrato_nombre || `Contrato firmado ${r.codigo}`) : abrirBlob(b); },
      error: () => { this.abriendo = ''; showError('No se pudo abrir el contrato firmado'); },
    });
  }

  subirFirmado(r: Inscripcion, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type)) { showError('El contrato debe ser PDF o imagen (JPG, PNG, WEBP)'); return; }
    if (file.size > 15 * 1024 * 1024) { showError('El archivo excede 15 MB'); return; }
    this.subiendo = true;
    this.svc.subirContrato(r.idinscripciones, file).subscribe({
      next: () => { this.subiendo = false; showSuccess('Contrato firmado cargado'); this.refrescarDetalle(); },
      error: e => { this.subiendo = false; showError(e?.error?.message || 'No se pudo subir el contrato'); },
    });
  }

  async quitarFirmado(r: Inscripcion) {
    if (!(await confirmDialog('Se eliminará el contrato firmado cargado. Podrá subirlo de nuevo.', 'Quitar contrato firmado', 'Quitar'))) return;
    this.svc.quitarContrato(r.idinscripciones).subscribe({
      next: () => { showSuccess('Contrato firmado eliminado'); this.refrescarDetalle(); },
      error: e => showError(e?.error?.message || 'No se pudo quitar'),
    });
  }
}

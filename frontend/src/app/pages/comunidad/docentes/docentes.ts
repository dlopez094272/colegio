import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Docente, EstadoCivil, FormacionAcademica, TIPOS_PERSONAL, TipoPersonal } from '../../../models';
import { DocentePayload, DocentesService } from '../../../services/docentes.service';
import { FormacionesAcademicasService } from '../../../services/formaciones-academicas.service';
import { EstadosCivilesService } from '../../../services/estados-civiles.service';
import { PermisosService } from '../../../services/permisos.service';
import { urlArchivo } from '../../../services/personas.service';
import { confirmDialog, showError, showSuccess } from '../../../services/confirm';
import { PaginatorComponent } from '../../../shared/paginator/paginator';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';
import { ThSortComponent, ThSortChangeEvent, SortDir } from '../../../shared/th-sort/th-sort';
import { PersonaCamposComponent, PersonaForm, personaFormVacio } from '../../../shared/persona-campos/persona-campos';
import { FotoCambio, FotoCapturaComponent } from '../../../shared/foto-captura/foto-captura';
import { FormacionesSelectComponent } from '../../../shared/formaciones-select/formaciones-select';
import { readStateFromUrl, syncStateToUrl } from '../../../shared/utils/url-state.util';

type EstadoFiltro = '1' | '0' | '';

/**
 * Personal docente: maestros y coordinadores. Mismos datos personales que el
 * padre de familia (sin vínculo con estudiantes), más fotografía, tipo de
 * personal, correo, fecha de ingreso y una o varias formaciones académicas.
 */
@Component({
  selector: 'app-docentes',
  standalone: true,
  imports: [FormsModule, DatePipe, PaginatorComponent, RowMenuComponent, BitacoraTabComponent, ThSortComponent, PersonaCamposComponent, FotoCapturaComponent, FormacionesSelectComponent],
  templateUrl: './docentes.html',
  styleUrls: ['../../../shared/personas-modulo/personas-modulo.scss', './docentes.scss'],
})
export class DocentesPage implements OnInit, OnDestroy {
  readonly tipos = TIPOS_PERSONAL;
  readonly urlFoto = urlArchivo;

  // ── Listado ──
  rows: Docente[] = [];
  loading = false;
  search = '';
  estado: EstadoFiltro = '1';
  tipoFiltro: TipoPersonal | '' = '';
  formacionFiltro: number | null = null;
  page = 1; pageSize = 25; total = 0;
  sortField = '';
  sortDir: SortDir = 'asc';
  private searchTimer: any;

  estadosCiviles: EstadoCivil[] = [];
  formaciones: FormacionAcademica[] = [];

  // ── Formulario ──
  showForm = false;
  isEdit = false;
  editId: number | null = null;
  form: PersonaForm = personaFormVacio();
  tipoPersonal: TipoPersonal = 'Maestro';
  email = '';
  fechaIngreso = '';
  formacionesSel: FormacionAcademica[] = [];
  activo = 1;
  saving = false;
  loadingForm = false;
  error = '';

  // Foto: la actual (ya guardada) y el cambio pendiente, que se envía después
  // de guardar el registro (la subida necesita su id)
  fotoActual: string | null = null;
  fotoCambio: FotoCambio | null = null;

  // ── Ficha ──
  showView = false;
  viewItem: Docente | null = null;
  viewTab: 'info' | 'bitacora' = 'info';

  constructor(
    private svc: DocentesService,
    private faSvc: FormacionesAcademicasService,
    private ecSvc: EstadosCivilesService,
    public permisos: PermisosService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  get puedeAgregar(): boolean { return this.permisos.tiene('docentes', 'A'); }
  get puedeEditar(): boolean { return this.permisos.tiene('docentes', 'E'); }

  ngOnInit() {
    this.restoreFromUrl();
    this.load();
    this.ecSvc.getAll().subscribe({ next: r => this.estadosCiviles = r.data ?? [], error: () => {} });
    this.cargarFormaciones();
  }

  ngOnDestroy() { clearTimeout(this.searchTimer); }

  private cargarFormaciones() {
    this.faSvc.getAll().subscribe({ next: r => this.formaciones = r.data ?? [], error: () => {} });
  }

  // ── Estado del listado en la URL ──
  private restoreFromUrl() {
    const qp = readStateFromUrl(this.route);
    if (qp['page'])      this.page      = +qp['page'];
    if (qp['pageSize'])  this.pageSize  = +qp['pageSize'];
    if (qp['search'])    this.search    = qp['search'];
    if (qp['estado'] !== undefined) this.estado = (qp['estado'] === 'todos' ? '' : qp['estado']) as EstadoFiltro;
    if (TIPOS_PERSONAL.includes(qp['tipo'] as TipoPersonal)) this.tipoFiltro = qp['tipo'] as TipoPersonal;
    if (qp['formacion']) this.formacionFiltro = +qp['formacion'] || null;
    if (qp['sortField']) this.sortField = qp['sortField'];
    if (qp['sortDir'])   this.sortDir   = qp['sortDir'] === 'desc' ? 'desc' : 'asc';
  }

  private syncUrl() {
    syncStateToUrl(this.router, this.route, {
      page: this.page, pageSize: this.pageSize, search: this.search,
      estado: this.estado === '' ? 'todos' : this.estado,
      tipo: this.tipoFiltro, formacion: this.formacionFiltro ?? undefined,
      sortField: this.sortField, sortDir: this.sortField ? this.sortDir : undefined,
    }, { defaults: { page: 1, pageSize: 25, estado: '1' } });
  }

  load() {
    this.syncUrl();
    this.loading = true;
    this.svc.getAll({
      page: this.page, pageSize: this.pageSize, search: this.search,
      activo: this.estado,
      tipo_personal: this.tipoFiltro,
      idformaciones_academicas: this.formacionFiltro,
      sortField: this.sortField || undefined,
      sortDir: this.sortField ? this.sortDir.toUpperCase() : undefined,
    }).subscribe({
      next: r => { this.loading = false; this.rows = r.data ?? []; this.total = r.meta?.total ?? 0; },
      error: e => { this.loading = false; showError(e?.error?.message || 'No se pudo cargar el listado'); },
    });
  }

  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 1; this.load(); }, 350);
  }
  setEstado(e: EstadoFiltro)       { this.estado = e; this.page = 1; this.load(); }
  setTipo(t: TipoPersonal | '')    { this.tipoFiltro = t; this.page = 1; this.load(); }
  onFormacionFiltro()              { this.page = 1; this.load(); }
  onSort(e: ThSortChangeEvent) { this.sortField = e.field; this.sortDir = e.dir; this.page = 1; this.load(); }
  onPageChange(p: number)      { this.page = p; this.load(); }
  onPageSizeChange(ps: number) { this.pageSize = ps; this.page = 1; this.load(); }

  getRowActions(r: Docente): RowAction[] {
    const a: RowAction[] = [
      { label: 'Ver ficha', icon: 'view', action: () => this.openView(r, 'info') },
      { label: 'Bitácora',  icon: 'bitacora', action: () => this.openView(r, 'bitacora') },
    ];
    if (this.puedeEditar) {
      a.push({ label: 'Editar', icon: 'edit', action: () => this.openEdit(r.iddocentes) });
      a.push(r.activo
        ? { label: 'Inactivar', icon: 'toggle-off', variant: 'warning', action: () => this.toggleActivo(r) }
        : { label: 'Activar',   icon: 'toggle-on', action: () => this.toggleActivo(r) });
    }
    return a;
  }

  // ── Formulario ──
  openNew() {
    this.form = personaFormVacio();
    this.tipoPersonal = this.tipoFiltro || 'Maestro';
    this.email = '';
    this.fechaIngreso = '';
    this.formacionesSel = [];
    this.activo = 1;
    this.isEdit = false;
    this.editId = null;
    this.fotoActual = null;
    this.fotoCambio = null;
    this.error = '';
    this.showForm = true;
  }

  openEdit(id: number) {
    this.error = '';
    this.isEdit = true;
    this.editId = id;
    this.loadingForm = true;
    this.showForm = true;
    this.showView = false;
    this.fotoActual = null;
    this.fotoCambio = null;
    this.svc.getById(id).subscribe({
      next: r => {
        const d = r.data!;
        this.fotoActual = d.foto ?? null;
        this.form = {
          ...personaFormVacio(),
          primer_nombre: d.primer_nombre ?? '', segundo_nombre: d.segundo_nombre ?? '',
          primer_apellido: d.primer_apellido ?? '', segundo_apellido: d.segundo_apellido ?? '',
          apellido_casada: d.apellido_casada ?? '', fecha_nacimiento: d.fecha_nacimiento ?? '',
          dpi: d.dpi ?? '', direccion: d.direccion ?? '', telefono_casa: d.telefono_casa ?? '',
          telefono_celular: d.telefono_celular ?? '', idestados_civiles: d.idestados_civiles ?? null,
          nacionalidad: d.nacionalidad ?? '', nit: d.nit ?? '', pasaporte: d.pasaporte ?? '',
        };
        this.tipoPersonal = d.tipo_personal;
        this.email = d.email ?? '';
        this.fechaIngreso = d.fecha_ingreso ?? '';
        this.formacionesSel = d.formaciones ?? [];
        this.activo = d.activo ? 1 : 0;
        this.loadingForm = false;
      },
      error: e => { this.loadingForm = false; this.showForm = false; showError(e?.error?.message || 'No se pudo cargar el registro'); },
    });
  }

  closeForm() { this.showForm = false; this.error = ''; }

  onFormacionCreada(f: FormacionAcademica) {
    this.formaciones = [...this.formaciones, f].sort((a, b) => a.formacion.localeCompare(b.formacion, 'es'));
  }

  private validar(): string | null {
    if (!this.form.primer_nombre.trim())   return 'El primer nombre es requerido.';
    if (!this.form.primer_apellido.trim()) return 'El primer apellido es requerido.';
    if (this.form.dpi && !/^\d{13}$/.test(this.form.dpi)) return 'El DPI debe tener 13 dígitos.';
    if (this.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) return 'El correo electrónico no es válido.';
    return null;
  }

  save() {
    this.error = this.validar() ?? '';
    if (this.error) return;

    const { lugar_nacimiento, ...datos } = this.form;
    const payload: DocentePayload = {
      ...datos,
      tipo_personal: this.tipoPersonal,
      email: this.email,
      fecha_ingreso: this.fechaIngreso,
      activo: this.activo,
      formaciones: this.formacionesSel.map(f => f.idformaciones_academicas),
    };

    this.saving = true;
    const req$ = this.isEdit && this.editId
      ? this.svc.update(this.editId, payload)
      : this.svc.create(payload);

    req$.subscribe({
      next: r => {
        const id = this.isEdit ? this.editId! : (r as any).id as number;
        this.guardarFoto(id, () => {
          this.saving = false;
          this.showForm = false;
          showSuccess(`${this.tipoPersonal} ${this.isEdit ? 'actualizado' : 'registrado'}`);
          this.load();
        });
      },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
    });
  }

  onFotoCambio(c: FotoCambio) { this.fotoCambio = c; }

  /** Envía el cambio de foto pendiente (si lo hay) una vez guardado el registro. */
  private guardarFoto(id: number, fin: () => void) {
    const c = this.fotoCambio;
    if (!c) return fin();
    if (c.blob) {
      this.svc.subirFoto(id, c.blob).subscribe({
        next: () => fin(),
        error: e => { fin(); showError(`Datos guardados, pero la foto no se pudo subir: ${e?.error?.message || 'error de red'}`); },
      });
    } else if (c.quitar && this.fotoActual) {
      this.svc.quitarFoto(id).subscribe({ next: () => fin(), error: () => { fin(); showError('Datos guardados, pero no se pudo quitar la foto.'); } });
    } else {
      fin();
    }
  }

  // ── Ficha ──
  openView(r: Docente, tab: 'info' | 'bitacora') {
    this.viewItem = r;
    this.viewTab = tab;
    this.showView = true;
    this.svc.getById(r.iddocentes).subscribe({ next: d => { if (d.data) this.viewItem = d.data; } });
  }

  closeView() { this.showView = false; this.viewItem = null; }

  async toggleActivo(r: Docente) {
    const accion = r.activo ? 'inactivar' : 'activar';
    const ok = await confirmDialog(`¿Desea ${accion} a ${r.nombre_completo}?`, `${this.capitalizar(accion)} docente`, this.capitalizar(accion), !!r.activo);
    if (!ok) return;
    this.svc.toggleActive(r.iddocentes).subscribe({
      next: res => { showSuccess(`Registro ${res.activo ? 'activado' : 'inactivado'}`); this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo cambiar el estado'),
    });
  }

  capitalizar(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

  iniciales(nombre: string): string {
    return (nombre || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
  }

  formacionesLista(r: Docente): string[] {
    return r.formaciones_nombres ? r.formaciones_nombres.split('||') : [];
  }

  /** Años completos desde la fecha de ingreso. */
  antiguedad(fecha: string | null): number | null {
    if (!fecha) return null;
    const [y, m, d] = fecha.split('-').map(Number);
    const hoy = new Date();
    let anios = hoy.getFullYear() - y;
    if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) anios--;
    return Math.max(0, anios);
  }
}

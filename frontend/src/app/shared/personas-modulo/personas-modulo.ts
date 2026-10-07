import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EstadoCivil, PersonaRegistro } from '../../models';
import { PersonasService, TipoPersona, urlArchivo } from '../../services/personas.service';
import { EstadosCivilesService } from '../../services/estados-civiles.service';
import { PermisosService } from '../../services/permisos.service';
import { confirmDialog, showError, showSuccess } from '../../services/confirm';
import { PaginatorComponent } from '../paginator/paginator';
import { RowAction, RowMenuComponent } from '../row-menu/row-menu';
import { BitacoraTabComponent } from '../bitacora-tab/bitacora-tab';
import { ThSortComponent, ThSortChangeEvent, SortDir } from '../th-sort/th-sort';
import { PersonaCamposComponent, PersonaForm, personaFormVacio } from '../persona-campos/persona-campos';
import { VinculoEdit, VinculosEditorComponent, vinculosDesdeRegistro, vinculosPayload } from '../vinculos-editor/vinculos-editor';
import { FotoCambio, FotoCapturaComponent } from '../foto-captura/foto-captura';
import { ArchivosEstudianteComponent } from '../archivos-estudiante/archivos-estudiante';
import { readStateFromUrl, syncStateToUrl } from '../utils/url-state.util';

/** Configuración de cada módulo (Padres de familia / Estudiantes). */
export interface PersonasModuloConfig {
  tipo: TipoPersona;
  tipoOtro: TipoPersona;
  pk: 'idpadres' | 'idestudiantes';
  titulo: string;
  subtitulo: string;
  singular: string;       // "padre de familia"
  singularOtro: string;   // "estudiante"
  tituloVinculos: string; // "Estudiantes a cargo"
}

type EstadoFiltro = '1' | '0' | '';

@Component({
  selector: 'app-personas-modulo',
  standalone: true,
  imports: [FormsModule, DatePipe, PaginatorComponent, RowMenuComponent, BitacoraTabComponent, ThSortComponent, PersonaCamposComponent, VinculosEditorComponent, FotoCapturaComponent, ArchivosEstudianteComponent],
  templateUrl: './personas-modulo.html',
  styleUrl: './personas-modulo.scss',
})
export class PersonasModuloComponent implements OnInit, OnDestroy {
  @Input({ required: true }) cfg!: PersonasModuloConfig;

  // ── Listado ──
  rows: PersonaRegistro[] = [];
  loading = false;
  search = '';
  estado: EstadoFiltro = '1';
  page = 1; pageSize = 25; total = 0;
  sortField = '';
  sortDir: SortDir = 'asc';
  private searchTimer: any;

  estadosCiviles: EstadoCivil[] = [];

  // ── Formulario ──
  showForm = false;
  isEdit = false;
  editId: number | null = null;
  form: PersonaForm = personaFormVacio();
  activo = 1;
  vinculos: VinculoEdit[] = [];
  saving = false;
  loadingForm = false;
  error = '';

  // Foto del estudiante: la actual (ya guardada) y el cambio pendiente, que se
  // envía después de guardar el registro (la subida necesita su id)
  fotoActual: string | null = null;
  fotoCambio: FotoCambio | null = null;

  readonly urlFoto = urlArchivo;

  // Expediente de archivos del estudiante (solo en el formulario; la ficha usa su propia instancia)
  @ViewChild('archivosForm') archivosForm?: ArchivosEstudianteComponent;

  // ── Ficha ──
  showView = false;
  viewItem: PersonaRegistro | null = null;
  viewTab: 'info' | 'vinculos' | 'archivos' | 'bitacora' = 'info';

  constructor(
    private svc: PersonasService,
    private ecSvc: EstadosCivilesService,
    public permisos: PermisosService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  get esPadres(): boolean { return this.cfg.tipo === 'padres'; }
  get tabla(): string { return this.cfg.tipo; }
  get puedeAgregar(): boolean { return this.permisos.tiene(this.tabla, 'A'); }
  get puedeEditar(): boolean { return this.permisos.tiene(this.tabla, 'E'); }
  get puedeCrearOtro(): boolean { return this.permisos.tiene(this.cfg.tipoOtro, 'A'); }

  ngOnInit() {
    this.restoreFromUrl();
    this.load();
    // También en Estudiantes: los padres nuevos creados desde su ficha piden estado civil
    this.ecSvc.getAll().subscribe({ next: r => this.estadosCiviles = r.data ?? [], error: () => {} });
  }

  ngOnDestroy() { clearTimeout(this.searchTimer); }

  idDe(r: PersonaRegistro): number { return (r[this.cfg.pk] as number); }

  // ── Estado del listado en la URL ──
  private restoreFromUrl() {
    const qp = readStateFromUrl(this.route);
    if (qp['page'])      this.page      = +qp['page'];
    if (qp['pageSize'])  this.pageSize  = +qp['pageSize'];
    if (qp['search'])    this.search    = qp['search'];
    if (qp['estado'] !== undefined) this.estado = (qp['estado'] === 'todos' ? '' : qp['estado']) as EstadoFiltro;
    if (qp['sortField']) this.sortField = qp['sortField'];
    if (qp['sortDir'])   this.sortDir   = qp['sortDir'] === 'desc' ? 'desc' : 'asc';
  }

  private syncUrl() {
    syncStateToUrl(this.router, this.route, {
      page: this.page, pageSize: this.pageSize, search: this.search,
      estado: this.estado === '' ? 'todos' : this.estado,
      sortField: this.sortField, sortDir: this.sortField ? this.sortDir : undefined,
    }, { defaults: { page: 1, pageSize: 25, estado: '1' } });
  }

  load() {
    this.syncUrl();
    this.loading = true;
    this.svc.getAll(this.cfg.tipo, {
      page: this.page, pageSize: this.pageSize, search: this.search,
      activo: this.estado,
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
  setEstado(e: EstadoFiltro) { this.estado = e; this.page = 1; this.load(); }
  onSort(e: ThSortChangeEvent) { this.sortField = e.field; this.sortDir = e.dir; this.page = 1; this.load(); }
  onPageChange(p: number)      { this.page = p; this.load(); }
  onPageSizeChange(ps: number) { this.pageSize = ps; this.page = 1; this.load(); }

  getRowActions(r: PersonaRegistro): RowAction[] {
    const a: RowAction[] = [
      { label: 'Ver ficha', icon: 'view', action: () => this.openView(r, 'info') },
      { label: 'Bitácora',  icon: 'bitacora', action: () => this.openView(r, 'bitacora') },
    ];
    if (this.puedeEditar) {
      a.push({ label: 'Editar', icon: 'edit', action: () => this.openEdit(this.idDe(r)) });
      a.push(r.activo
        ? { label: 'Inactivar', icon: 'toggle-off', variant: 'warning', action: () => this.toggleActivo(r) }
        : { label: 'Activar',   icon: 'toggle-on', action: () => this.toggleActivo(r) });
    }
    return a;
  }

  // ── Formulario ──
  openNew() {
    this.form = personaFormVacio();
    this.activo = 1;
    this.vinculos = [];
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
    this.svc.getById(this.cfg.tipo, id).subscribe({
      next: r => {
        const d = r.data!;
        this.fotoActual = d.foto ?? null;
        this.form = {
          primer_nombre: d.primer_nombre ?? '', segundo_nombre: d.segundo_nombre ?? '',
          primer_apellido: d.primer_apellido ?? '', segundo_apellido: d.segundo_apellido ?? '',
          apellido_casada: d.apellido_casada ?? '', fecha_nacimiento: d.fecha_nacimiento ?? '',
          lugar_nacimiento: d.lugar_nacimiento ?? '', dpi: d.dpi ?? '', codigo_mineduc: d.codigo_mineduc ?? '', direccion: d.direccion ?? '', telefono_casa: d.telefono_casa ?? '',
          telefono_celular: d.telefono_celular ?? '', idestados_civiles: d.idestados_civiles ?? null,
          nacionalidad: d.nacionalidad ?? '', nit: d.nit ?? '', pasaporte: d.pasaporte ?? '', email: d.email ?? '',
        };
        this.activo = d.activo ? 1 : 0;
        this.vinculos = vinculosDesdeRegistro(d.vinculos ?? []);
        this.loadingForm = false;
      },
      error: e => { this.loadingForm = false; this.showForm = false; showError(e?.error?.message || 'No se pudo cargar el registro'); },
    });
  }

  closeForm() { this.showForm = false; this.error = ''; }

  private validar(): string | null {
    if (!this.form.primer_nombre.trim())   return 'El primer nombre es requerido.';
    if (!this.form.primer_apellido.trim()) return 'El primer apellido es requerido.';
    if (!this.esPadres && !this.form.dpi) return 'El CUI del estudiante es requerido.';
    if (this.form.dpi && !/^\d{13}$/.test(this.form.dpi)) return `El ${this.esPadres ? 'DPI' : 'CUI'} debe tener 13 dígitos.`;
    if (this.esPadres && this.form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email.trim())) return 'El correo electrónico no es válido.';
    for (const v of this.vinculos) {
      if (!v.nuevo) continue;
      if (!v.nuevo.primer_nombre.trim() || !v.nuevo.primer_apellido.trim()) {
        v.abierto = true;
        return `Complete el primer nombre y primer apellido del ${this.cfg.singularOtro} nuevo.`;
      }
      if (this.esPadres && !v.nuevo.dpi) {
        v.abierto = true;
        return `El CUI del ${this.cfg.singularOtro} nuevo es requerido.`;
      }
      if (v.nuevo.dpi && !/^\d{13}$/.test(v.nuevo.dpi)) {
        v.abierto = true;
        return `El DPI del ${this.cfg.singularOtro} nuevo debe tener 13 dígitos.`;
      }
    }
    return this.archivosForm?.validar() ?? null;
  }

  save() {
    this.error = this.validar() ?? '';
    if (this.error) return;

    const payload = { ...this.form, activo: this.activo, vinculos: vinculosPayload(this.vinculos) };
    if (this.esPadres) { for (const c of ['lugar_nacimiento', 'codigo_mineduc']) delete (payload as any)[c]; }
    else { for (const c of ['apellido_casada', 'nit', 'pasaporte', 'idestados_civiles', 'nacionalidad', 'email']) delete (payload as any)[c]; }

    this.saving = true;
    const req$ = this.isEdit && this.editId
      ? this.svc.update(this.cfg.tipo, this.editId, payload)
      : this.svc.create(this.cfg.tipo, payload);

    req$.subscribe({
      next: r => {
        const id = this.isEdit ? this.editId! : (r as any).id as number;
        const nuevos = this.vinculos.filter(v => v.nuevo).length;
        const mensaje = `${this.capitalizar(this.cfg.singular)} ${this.isEdit ? 'actualizado' : 'registrado'}` +
          (nuevos ? ` y ${nuevos} ${this.cfg.singularOtro}${nuevos > 1 ? 's' : ''} nuevo${nuevos > 1 ? 's' : ''}` : '');
        this.guardarFoto(id, () => this.guardarArchivos(id, () => {
          this.saving = false;
          this.showForm = false;
          showSuccess(mensaje);
          this.load();
        }));
      },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
    });
  }

  onFotoCambio(c: FotoCambio) { this.fotoCambio = c; }

  /** Envía el cambio de foto pendiente (si lo hay) una vez guardado el registro. */
  private guardarFoto(id: number, fin: () => void) {
    const c = this.fotoCambio;
    if (this.esPadres || !c) return fin();
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

  /** Sube/elimina los archivos del expediente pendientes una vez guardado el registro. */
  private guardarArchivos(id: number, fin: () => void) {
    const editor = this.archivosForm;
    if (this.esPadres || !editor?.hayCambios) return fin();
    editor.guardar(id).then(errores => {
      fin();
      if (errores.length) showError(`Datos guardados, pero hubo problemas con los archivos. ${errores.join(' · ')}`);
    });
  }

  // ── Ficha ──
  openView(r: PersonaRegistro, tab: 'info' | 'vinculos' | 'archivos' | 'bitacora') {
    this.viewItem = r;
    this.viewTab = tab;
    this.showView = true;
    this.svc.getById(this.cfg.tipo, this.idDe(r)).subscribe({ next: d => { if (d.data) this.viewItem = d.data; } });
  }

  closeView() { this.showView = false; this.viewItem = null; }

  async toggleActivo(r: PersonaRegistro) {
    const accion = r.activo ? 'inactivar' : 'activar';
    const ok = await confirmDialog(`¿Desea ${accion} a ${r.nombre_completo}?`, `${this.capitalizar(accion)} ${this.cfg.singular}`, this.capitalizar(accion), !!r.activo);
    if (!ok) return;
    this.svc.toggleActive(this.cfg.tipo, this.idDe(r)).subscribe({
      next: res => { showSuccess(`Registro ${res.activo ? 'activado' : 'inactivado'}`); this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo cambiar el estado'),
    });
  }

  capitalizar(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

  iniciales(nombre: string): string {
    return (nombre || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
  }

  vinculosLista(r: PersonaRegistro): string[] {
    return r.vinculos_nombres ? r.vinculos_nombres.split(', ') : [];
  }
}

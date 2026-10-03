import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GrupoSeguridad, UsuarioCrud } from '../../../models';
import { SeguridadService } from '../../../services/seguridad.service';
import { PermisosService } from '../../../services/permisos.service';
import { AuthService } from '../../../services/auth';
import { confirmDialog, showError, showSuccess } from '../../../services/confirm';
import { PaginatorComponent } from '../../../shared/paginator/paginator';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';
import { SortDir, ThSortChangeEvent, ThSortComponent } from '../../../shared/th-sort/th-sort';
import { readStateFromUrl, syncStateToUrl } from '../../../shared/utils/url-state.util';

interface UsuarioForm {
  idusuarios?: number;
  codigo: string;
  nombre_completo: string;
  email: string;
  password: string;
  activo: number;
  primer: number;
  grupos: number[];
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule, PaginatorComponent, RowMenuComponent, BitacoraTabComponent, ThSortComponent],
  templateUrl: './usuarios.html',
})
export class Usuarios implements OnInit, OnDestroy {
  rows: UsuarioCrud[] = [];
  grupos: GrupoSeguridad[] = [];
  search = '';
  loading = false;
  page = 1; pageSize = 25; total = 0;
  sortField = '';
  sortDir: SortDir = 'asc';
  private searchTimer: any;

  showModal = false;
  isEdit = false;
  saving = false;
  error = '';
  form: UsuarioForm = this.blankForm();

  bitacoraItem: UsuarioCrud | null = null;

  constructor(
    private seg: SeguridadService,
    public permisos: PermisosService,
    public auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    const qp = readStateFromUrl(this.route);
    if (qp['page'])   this.page   = +qp['page'];
    if (qp['search']) this.search = qp['search'];
    this.load();
    // La asignación de grupos solo la gestiona el Super Administrador
    if (this.auth.isSuperAdmin()) this.seg.getGroups().subscribe(r => this.grupos = r.data ?? []);
  }

  ngOnDestroy() { clearTimeout(this.searchTimer); }

  blankForm(): UsuarioForm {
    return { codigo: '', nombre_completo: '', email: '', password: '', activo: 1, primer: 1, grupos: [] };
  }

  load() {
    syncStateToUrl(this.router, this.route, { page: this.page, search: this.search }, { defaults: { page: 1 } });
    this.loading = true;
    this.seg.getUsuarios({
      page: this.page, pageSize: this.pageSize, search: this.search,
      sortField: this.sortField || undefined, sortDir: this.sortField ? this.sortDir.toUpperCase() : undefined,
    }).subscribe({
      next: r => { this.loading = false; this.rows = r.data ?? []; this.total = r.meta?.total ?? 0; },
      error: () => { this.loading = false; },
    });
  }

  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 1; this.load(); }, 350);
  }
  onSort(e: ThSortChangeEvent) { this.sortField = e.field; this.sortDir = e.dir; this.page = 1; this.load(); }
  onPageChange(p: number)      { this.page = p; this.load(); }
  onPageSizeChange(ps: number) { this.pageSize = ps; this.page = 1; this.load(); }

  getRowActions(u: UsuarioCrud): RowAction[] {
    const a: RowAction[] = [{ label: 'Bitácora', icon: 'bitacora', action: () => this.bitacoraItem = u }];
    if (this.permisos.tiene('usuarios', 'E')) {
      a.push({ label: 'Editar', icon: 'edit', action: () => this.openEdit(u) });
      a.push(u.activo
        ? { label: 'Inactivar', icon: 'toggle-off', variant: 'warning', disabled: u.idusuarios === this.auth.usuario()?.id, action: () => this.toggleActive(u) }
        : { label: 'Activar', icon: 'toggle-on', action: () => this.toggleActive(u) });
    }
    return a;
  }

  openNew() {
    this.form = this.blankForm();
    this.isEdit = false;
    this.error = '';
    this.showModal = true;
  }

  openEdit(u: UsuarioCrud) {
    this.form = {
      idusuarios: u.idusuarios, codigo: u.codigo, nombre_completo: u.nombre_completo ?? '', email: u.email ?? '',
      password: '', activo: u.activo ? 1 : 0, primer: u.primer ? 1 : 0,
      grupos: (u.grupos ?? []).map(g => g.GroupID),
    };
    this.isEdit = true;
    this.error = '';
    this.showModal = true;
  }

  toggleGrupo(id: number, checked: boolean) {
    this.form.grupos = checked ? [...new Set([...this.form.grupos, id])] : this.form.grupos.filter(g => g !== id);
  }

  save() {
    if (!this.form.codigo.trim())          { this.error = 'El código es requerido.'; return; }
    if (!this.form.nombre_completo.trim()) { this.error = 'El nombre completo es requerido.'; return; }
    if (!this.isEdit && this.form.password.length < 4) { this.error = 'La contraseña debe tener al menos 4 caracteres.'; return; }

    const payload: any = {
      codigo: this.form.codigo.trim(),
      nombre_completo: this.form.nombre_completo.trim(),
      email: this.form.email.trim(),
      activo: this.form.activo,
      primer: this.form.primer,
    };
    if (this.form.password) payload.password = this.form.password;
    if (this.auth.isSuperAdmin()) payload.grupos = this.form.grupos;

    this.saving = true;
    const req$ = this.isEdit ? this.seg.updateUsuario(this.form.idusuarios!, payload) : this.seg.createUsuario(payload);
    req$.subscribe({
      next: () => { this.saving = false; this.showModal = false; showSuccess('Usuario guardado'); this.load(); },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
    });
  }

  async toggleActive(u: UsuarioCrud) {
    const accion = u.activo ? 'inactivar' : 'activar';
    if (!(await confirmDialog(`¿Desea ${accion} al usuario ${u.codigo}?`, 'Confirmar', 'Confirmar', !!u.activo))) return;
    this.seg.toggleActive(u.idusuarios).subscribe({
      next: () => { showSuccess('Estado actualizado'); this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo cambiar el estado'),
    });
  }
}

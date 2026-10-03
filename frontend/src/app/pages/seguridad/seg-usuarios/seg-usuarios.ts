import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { SeguridadService } from '../../../services/seguridad.service';
import { GrupoSeguridad, UsuarioCrud } from '../../../models';
import { forkJoin } from 'rxjs';
import { PaginatorComponent } from '../../../shared/paginator/paginator';
import { readStateFromUrl, syncStateToUrl } from '../../../shared/utils/url-state.util';
import { ThSortComponent, ThSortChangeEvent, SortDir } from '../../../shared/th-sort/th-sort';

interface UserRow extends UsuarioCrud {
  groups: { GroupID: number; Label: string; member: boolean }[];
}

interface PendingChange {
  user: UserRow;
  group: { GroupID: number; Label: string; member: boolean };
  newValue: boolean;
}

@Component({
  selector: 'app-seg-usuarios',
  standalone: true,
  imports: [FormsModule, PaginatorComponent, ThSortComponent],
  templateUrl: './seg-usuarios.html',
  styleUrl: './seg-usuarios.scss',
})
export class SegUsuarios implements OnInit, OnDestroy {
  users:    UserRow[]       = [];
  groups:   GrupoSeguridad[] = [];
  filtered: UserRow[]       = [];
  search  = '';
  loading = false;
  saving  = false;
  apiError  = '';
  saveError = '';
  saveOk    = false;
  page = 1; pageSize = 25; total = 0;
  sortField = '';
  sortDir: 'ASC' | 'DESC' = 'ASC';
  private searchTimer: any;

  get sortDirLower(): SortDir { return this.sortDir === 'DESC' ? 'desc' : 'asc'; }

  private pendingMap = new Map<string, PendingChange>();

  constructor(
    private seg: SeguridadService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() { this.restoreFromUrl(); this.load(); }
  ngOnDestroy() { clearTimeout(this.searchTimer); }

  get pendingCount() { return this.pendingMap.size; }
  get hasPending()   { return this.pendingMap.size > 0; }

  private restoreFromUrl() {
    const qp = readStateFromUrl(this.route);
    if (qp['page'])      this.page      = +qp['page'];
    if (qp['pageSize'])  this.pageSize  = +qp['pageSize'];
    if (qp['search'])    this.search    = qp['search'];
    if (qp['sortField']) this.sortField = qp['sortField'];
    if (qp['sortDir'])   this.sortDir   = qp['sortDir'] === 'DESC' ? 'DESC' : 'ASC';
  }

  private syncUrl() {
    syncStateToUrl(this.router, this.route, {
      page: this.page, pageSize: this.pageSize, search: this.search,
      sortField: this.sortField, sortDir: this.sortField ? this.sortDir : undefined,
    }, { defaults: { page: 1, pageSize: 25, sortDir: 'ASC' } });
  }

  load() {
    this.syncUrl();
    this.loading     = true;
    this.apiError    = '';
    this.saveError   = '';
    this.saveOk      = false;
    this.pendingMap.clear();

    this.seg.getUsersWithGroups({
      page: this.page, pageSize: this.pageSize, search: this.search,
      sortField: this.sortField || undefined,
      sortDir:   this.sortField ? this.sortDir : undefined,
    }).subscribe({
      next: r => {
        this.loading = false;
        if (r.success) {
          this.users    = r.data   ?? [];
          this.filtered = r.data   ?? [];
          this.groups   = r.groups ?? [];
          this.total    = r.meta?.total ?? this.users.length;
        }
      },
      error: err => {
        this.loading  = false;
        const msg    = err?.error?.message;
        const status = err?.status;
        if (status === 403)
          this.apiError = 'Acceso denegado (403). Asegúrate de estar en el grupo Super Admin (GroupID = -1) en seguridad_ugmembers.';
        else if (status === 500)
          this.apiError = 'Error del servidor (500). Probablemente el SQL de migración no se ha ejecutado aún. Ejecuta: database/schema.sql y database/seed.sql';
        else if (status === 0 || status === undefined)
          this.apiError = 'No se puede conectar al backend. Verifica que el servidor esté corriendo en http://localhost:3100';
        else
          this.apiError = `Error ${status}: ${msg || 'Error desconocido'}`;
      },
    });
  }

  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page = 1; this.load(); }, 350);
  }
  onPageChange(p: number)      { this.page = p;      this.load(); }
  onPageSizeChange(ps: number) { this.pageSize = ps; this.page = 1; this.load(); }

  onSort(e: ThSortChangeEvent) {
    this.sortField = e.field;
    this.sortDir   = e.dir === 'desc' ? 'DESC' : 'ASC';
    this.page = 1;
    this.load();
  }

  toggleMember(user: UserRow, group: { GroupID: number; Label: string; member: boolean }) {
    const key = `${user.codigo}_${group.GroupID}`;
    const newValue = !group.member;
    group.member = newValue;
    this.saveOk = false;

    if (this.pendingMap.has(key)) {
      // Si volvemos al valor original, eliminamos el pendiente
      const orig = this.pendingMap.get(key)!;
      if (orig.newValue !== newValue) {
        this.pendingMap.delete(key);
      } else {
        orig.newValue = newValue;
      }
    } else {
      this.pendingMap.set(key, { user, group, newValue });
    }
  }

  saveAll() {
    if (!this.hasPending || this.saving) return;
    this.saving    = true;
    this.saveError = '';
    this.saveOk    = false;

    const changes = Array.from(this.pendingMap.values());
    const calls = changes.map(c =>
      this.seg.toggleMember(c.user.codigo, c.group.GroupID, c.newValue)
    );

    forkJoin(calls).subscribe({
      next: () => {
        this.saving = false;
        this.saveOk = true;
        this.pendingMap.clear();
        setTimeout(() => { this.saveOk = false; }, 3000);
      },
      error: err => {
        this.saving    = false;
        const msg      = err?.error?.message;
        this.saveError = `Error al guardar: ${msg || 'Error desconocido'}. Los cambios no guardados siguen pendientes.`;
      },
    });
  }

  discardChanges() {
    this.pendingMap.clear();
    this.saveError = '';
    this.load();
  }

  isSuperAdminGroup(g: GrupoSeguridad | { GroupID: number }): boolean {
    return g.GroupID === -1;
  }

  isPending(user: UserRow, group: { GroupID: number }): boolean {
    return this.pendingMap.has(`${user.codigo}_${group.GroupID}`);
  }
}

import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SeguridadService } from '../../../services/seguridad.service';
import { GrupoSeguridad, PermisosTabla } from '../../../models';

const PERMS = [
  { key: 'A', label: 'Añadir'            },
  { key: 'E', label: 'Editar'            },
  { key: 'D', label: 'Eliminar'          },
  { key: 'S', label: 'Listar/Ver'        },
  { key: 'P', label: 'Imprimir/Exportar' },
  { key: 'I', label: 'Importar'          },
  { key: 'M', label: 'Modo Admin'        },
];

@Component({
  selector: 'app-permisos',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './permisos.html',
  styleUrl: './permisos.scss',
})
export class Permisos implements OnInit {
  groups:       GrupoSeguridad[]      = [];
  allTables:    string[]              = [];
  filtered:     string[]              = [];
  rights:       Record<string, string> = {};  // tableName → mask
  activeGroup:  GrupoSeguridad | null = null;
  private currentGroupId: number | null = null;
  search     = '';
  saving     = false;
  saved      = false;
  showNewGroup   = false;
  newGroupLabel  = '';
  copyFromGroup  = -1;
  showCopy       = false;
  loadingGroups  = false;
  loadingRights  = false;
  apiError       = '';
  readonly perms = PERMS;

  constructor(private seg: SeguridadService) {}

  ngOnInit() { this.loadGroups(); }

  loadGroups() {
    this.loadingGroups = true;
    this.apiError      = '';

    forkJoin({
      groups: this.seg.getGroups(),
      tables: this.seg.getTables(),
    }).subscribe({
      next: ({ groups, tables }) => {
        this.loadingGroups = false;
        if (groups.data) this.groups = groups.data;
        if (tables.data) {
          this.allTables = tables.data;
          this.applyFilter();
        }
        if (!this.groups.length) return;
        // Si ya había un grupo activo, verificar que sigue existiendo y recargar sus derechos.
        // Si no existía (primera carga) o fue eliminado, seleccionar el primero.
        const stillActive = this.activeGroup &&
          this.groups.find(g => g.GroupID === this.activeGroup!.GroupID);
        if (stillActive) {
          this.loadRights(stillActive.GroupID);
        } else {
          this.selectGroup(this.groups[0]);
        }
      },
      error: err => {
        this.loadingGroups = false;
        const status = err?.status;
        if (status === 403)
          this.apiError = 'Acceso denegado (403). Necesitas ser Super Administrador (GroupID = -1 en seguridad_ugmembers) y volver a iniciar sesión.';
        else if (status === 500)
          this.apiError = 'Error del servidor (500). El SQL de migración puede no haberse ejecutado. Ejecuta: database/schema.sql y database/seed.sql';
        else if (status === 0 || status === undefined)
          this.apiError = 'No se puede conectar al backend (localhost:3100). ¿Está corriendo el servidor?';
        else
          this.apiError = `Error ${status}: ${err?.error?.message || 'desconocido'}`;
      },
    });
  }

  selectGroup(g: GrupoSeguridad) {
    this.activeGroup = g;
    this.loadRights(g.GroupID);
  }

  loadRights(groupId: number) {
    this.rights        = {};
    this.loadingRights = true;
    this.currentGroupId = groupId;

    this.seg.getRights(groupId).subscribe({
      next: r => {
        if (groupId !== this.currentGroupId) return; // descartar respuesta obsoleta
        this.loadingRights = false;
        if (r.data) {
          this.rights = r.data.reduce((acc: Record<string, string>, p: PermisosTabla) => {
            acc[p.tableName] = p.mask;
            return acc;
          }, {});
        }
      },
      error: () => {
        if (groupId !== this.currentGroupId) return;
        this.loadingRights = false;
      },
    });
  }

  applyFilter() {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.allTables.filter(t => t.toLowerCase().includes(q))
      : [...this.allTables];
  }

  hasPerm(table: string, key: string): boolean {
    return (this.rights[table] || '').includes(key);
  }

  togglePerm(table: string, key: string) {
    if (!this.activeGroup) return;
    const cur  = this.rights[table] || '';
    const next = cur.includes(key)
      ? cur.replace(key, '')
      : cur + key;
    this.rights[table] = next;
  }

  toggleAll(key: string) {
    const allHave = this.allTables.every(t => this.hasPerm(t, key));
    this.allTables.forEach(t => {
      const cur = this.rights[t] || '';
      this.rights[t] = allHave ? cur.replace(key, '') : cur.includes(key) ? cur : cur + key;
    });
  }

  allChecked(key: string): boolean {
    return this.allTables.length > 0 && this.allTables.every(t => this.hasPerm(t, key));
  }

  save() {
    if (!this.activeGroup) return;
    this.saving = true;
    const rightsArr: PermisosTabla[] = this.allTables.map(t => ({
      tableName: t, mask: this.rights[t] || '',
    }));
    this.seg.saveRights(this.activeGroup.GroupID, rightsArr).subscribe({
      next: () => {
        this.saving = false;
        this.saved  = true;
        setTimeout(() => this.saved = false, 2500);
      },
      error: () => { this.saving = false; },
    });
  }

  reset() {
    if (this.activeGroup) this.loadRights(this.activeGroup.GroupID);
  }

  addGroup() {
    if (!this.newGroupLabel.trim()) return;
    this.seg.createGroup(this.newGroupLabel.trim()).subscribe(() => {
      this.newGroupLabel = '';
      this.showNewGroup  = false;
      this.loadGroups();
    });
  }

  copyRights() {
    if (!this.activeGroup || this.copyFromGroup === this.activeGroup.GroupID) return;
    this.seg.copyRights(this.copyFromGroup, this.activeGroup.GroupID).subscribe(() => {
      this.showCopy = false;
      if (this.activeGroup) this.loadRights(this.activeGroup.GroupID);
    });
  }
}

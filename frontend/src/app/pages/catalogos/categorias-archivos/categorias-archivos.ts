import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoriaArchivo } from '../../../models';
import { CategoriasArchivosService } from '../../../services/categorias-archivos.service';
import { PermisosService } from '../../../services/permisos.service';
import { confirmDialog, showError, showSuccess } from '../../../services/confirm';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';

@Component({
  selector: 'app-categorias-archivos',
  standalone: true,
  imports: [FormsModule, RowMenuComponent, BitacoraTabComponent],
  templateUrl: './categorias-archivos.html',
})
export class CategoriasArchivosPage implements OnInit {
  items: CategoriaArchivo[] = [];
  loading = false;

  showModal = false;
  isEdit = false;
  form: { idcategorias_archivos?: number; categoria: string; activo: number } = { categoria: '', activo: 1 };
  saving = false;
  error = '';

  bitacoraItem: CategoriaArchivo | null = null;

  constructor(private svc: CategoriasArchivosService, public permisos: PermisosService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.svc.getAll(true).subscribe({
      next: r => { this.loading = false; this.items = r.data ?? []; },
      error: () => { this.loading = false; },
    });
  }

  getRowActions(ca: CategoriaArchivo): RowAction[] {
    const a: RowAction[] = [{ label: 'Bitácora', icon: 'bitacora', action: () => this.bitacoraItem = ca }];
    if (this.permisos.tiene('categorias_archivos', 'E')) a.push({ label: 'Editar', icon: 'edit', action: () => this.openEdit(ca) });
    if (this.permisos.tiene('categorias_archivos', 'D')) a.push({
      label: 'Eliminar', icon: 'trash', variant: 'danger',
      disabled: !!ca.total_archivos, tooltip: ca.total_archivos ? 'En uso por archivos de estudiantes; inactívela en su lugar' : 'Eliminar',
      action: () => this.eliminar(ca),
    });
    return a;
  }

  openNew() {
    this.form = { categoria: '', activo: 1 };
    this.isEdit = false;
    this.error = '';
    this.showModal = true;
  }

  openEdit(ca: CategoriaArchivo) {
    this.form = { idcategorias_archivos: ca.idcategorias_archivos, categoria: ca.categoria, activo: ca.activo ? 1 : 0 };
    this.isEdit = true;
    this.error = '';
    this.showModal = true;
  }

  save() {
    if (!this.form.categoria.trim()) { this.error = 'El nombre es requerido.'; return; }
    this.saving = true;
    const req$ = this.isEdit
      ? this.svc.update(this.form.idcategorias_archivos!, this.form)
      : this.svc.create(this.form);
    req$.subscribe({
      next: () => { this.saving = false; this.showModal = false; showSuccess('Categoría guardada'); this.load(); },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
    });
  }

  async eliminar(ca: CategoriaArchivo) {
    if (!(await confirmDialog(`¿Eliminar la categoría "${ca.categoria}"?`, 'Eliminar categoría', 'Eliminar'))) return;
    this.svc.delete(ca.idcategorias_archivos).subscribe({
      next: () => { showSuccess('Categoría eliminada'); this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo eliminar'),
    });
  }
}

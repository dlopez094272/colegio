import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormacionAcademica } from '../../../models';
import { FormacionesAcademicasService } from '../../../services/formaciones-academicas.service';
import { PermisosService } from '../../../services/permisos.service';
import { confirmDialog, showError, showSuccess } from '../../../services/confirm';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';

@Component({
  selector: 'app-formaciones-academicas',
  standalone: true,
  imports: [FormsModule, RowMenuComponent, BitacoraTabComponent],
  templateUrl: './formaciones-academicas.html',
})
export class FormacionesAcademicasPage implements OnInit {
  items: FormacionAcademica[] = [];
  loading = false;

  showModal = false;
  isEdit = false;
  form: { idformaciones_academicas?: number; formacion: string; activo: number } = { formacion: '', activo: 1 };
  saving = false;
  error = '';

  bitacoraItem: FormacionAcademica | null = null;

  constructor(private svc: FormacionesAcademicasService, public permisos: PermisosService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.svc.getAll(true).subscribe({
      next: r => { this.loading = false; this.items = r.data ?? []; },
      error: () => { this.loading = false; },
    });
  }

  getRowActions(fa: FormacionAcademica): RowAction[] {
    const a: RowAction[] = [{ label: 'Bitácora', icon: 'bitacora', action: () => this.bitacoraItem = fa }];
    if (this.permisos.tiene('formaciones_academicas', 'E')) a.push({ label: 'Editar', icon: 'edit', action: () => this.openEdit(fa) });
    if (this.permisos.tiene('formaciones_academicas', 'D')) a.push({
      label: 'Eliminar', icon: 'trash', variant: 'danger',
      disabled: !!fa.total_docentes, tooltip: fa.total_docentes ? 'En uso por docentes; inactívela en su lugar' : 'Eliminar',
      action: () => this.eliminar(fa),
    });
    return a;
  }

  openNew() {
    this.form = { formacion: '', activo: 1 };
    this.isEdit = false;
    this.error = '';
    this.showModal = true;
  }

  openEdit(fa: FormacionAcademica) {
    this.form = { idformaciones_academicas: fa.idformaciones_academicas, formacion: fa.formacion, activo: fa.activo ? 1 : 0 };
    this.isEdit = true;
    this.error = '';
    this.showModal = true;
  }

  save() {
    if (!this.form.formacion.trim()) { this.error = 'El nombre es requerido.'; return; }
    this.saving = true;
    const req$ = this.isEdit
      ? this.svc.update(this.form.idformaciones_academicas!, this.form)
      : this.svc.create(this.form);
    req$.subscribe({
      next: () => { this.saving = false; this.showModal = false; showSuccess('Formación académica guardada'); this.load(); },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
    });
  }

  async eliminar(fa: FormacionAcademica) {
    if (!(await confirmDialog(`¿Eliminar la formación académica "${fa.formacion}"?`, 'Eliminar formación académica', 'Eliminar'))) return;
    this.svc.delete(fa.idformaciones_academicas).subscribe({
      next: () => { showSuccess('Formación académica eliminada'); this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo eliminar'),
    });
  }
}

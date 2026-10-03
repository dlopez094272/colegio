import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EstadoCivil } from '../../../models';
import { EstadosCivilesService } from '../../../services/estados-civiles.service';
import { PermisosService } from '../../../services/permisos.service';
import { confirmDialog, showError, showSuccess } from '../../../services/confirm';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';

@Component({
  selector: 'app-estados-civiles',
  standalone: true,
  imports: [FormsModule, RowMenuComponent, BitacoraTabComponent],
  templateUrl: './estados-civiles.html',
})
export class EstadosCivilesPage implements OnInit {
  items: EstadoCivil[] = [];
  loading = false;

  showModal = false;
  isEdit = false;
  form: { idestados_civiles?: number; estado_civil: string; activo: number } = { estado_civil: '', activo: 1 };
  saving = false;
  error = '';

  bitacoraItem: EstadoCivil | null = null;

  constructor(private svc: EstadosCivilesService, public permisos: PermisosService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.svc.getAll(true).subscribe({
      next: r => { this.loading = false; this.items = r.data ?? []; },
      error: () => { this.loading = false; },
    });
  }

  getRowActions(ec: EstadoCivil): RowAction[] {
    const a: RowAction[] = [{ label: 'Bitácora', icon: 'bitacora', action: () => this.bitacoraItem = ec }];
    if (this.permisos.tiene('estados_civiles', 'E')) a.push({ label: 'Editar', icon: 'edit', action: () => this.openEdit(ec) });
    if (this.permisos.tiene('estados_civiles', 'D')) a.push({
      label: 'Eliminar', icon: 'trash', variant: 'danger',
      disabled: !!(ec.total_padres || ec.total_docentes),
      tooltip: ec.total_padres || ec.total_docentes ? 'En uso por padres de familia o docentes; inactívelo en su lugar' : 'Eliminar',
      action: () => this.eliminar(ec),
    });
    return a;
  }

  openNew() {
    this.form = { estado_civil: '', activo: 1 };
    this.isEdit = false;
    this.error = '';
    this.showModal = true;
  }

  openEdit(ec: EstadoCivil) {
    this.form = { idestados_civiles: ec.idestados_civiles, estado_civil: ec.estado_civil, activo: ec.activo ? 1 : 0 };
    this.isEdit = true;
    this.error = '';
    this.showModal = true;
  }

  save() {
    if (!this.form.estado_civil.trim()) { this.error = 'El nombre es requerido.'; return; }
    this.saving = true;
    const req$ = this.isEdit
      ? this.svc.update(this.form.idestados_civiles!, this.form)
      : this.svc.create(this.form);
    req$.subscribe({
      next: () => { this.saving = false; this.showModal = false; showSuccess('Estado civil guardado'); this.load(); },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
    });
  }

  async eliminar(ec: EstadoCivil) {
    if (!(await confirmDialog(`¿Eliminar el estado civil "${ec.estado_civil}"?`, 'Eliminar estado civil', 'Eliminar'))) return;
    this.svc.delete(ec.idestados_civiles).subscribe({
      next: () => { showSuccess('Estado civil eliminado'); this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo eliminar'),
    });
  }
}

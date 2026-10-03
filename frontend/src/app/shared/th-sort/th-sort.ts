import { Component, EventEmitter, Input, Output } from '@angular/core';

export type SortDir = 'asc' | 'desc';
export interface SortState { field: string; dir: SortDir; }
export interface ThSortChangeEvent extends SortState {}

// Encabezado de tabla ordenable por clic, para tablas simples que no usan
// ColumnaDef/CampoFiltro (ver ThFiltroComponent). Envuelve el contenido
// proyectado del <th> y agrega el ícono de orden con el mismo ciclo
// (sin orden → ASC → DESC → sin orden) que los grids con filtro avanzado.
@Component({
  selector: 'th[appThSort]',
  standalone: true,
  template: `
    <span class="th-sort-inner" (click)="toggle()">
      <ng-content></ng-content>
      <span class="th-sort-ico" [class.active]="isSorted">
        @if (isSorted && sortDir === 'asc') {
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l8 10H4z"/></svg>
        } @else if (isSorted && sortDir === 'desc') {
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l-8-10h16z"/></svg>
        } @else {
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 9l4-5 4 5M8 15l4 5 4-5"/></svg>
        }
      </span>
    </span>
  `,
  styleUrl: './th-sort.scss',
})
export class ThSortComponent {
  @Input({ required: true }) field!: string;
  @Input() sortField = '';
  @Input() sortDir: SortDir = 'asc';

  @Output() sortChange = new EventEmitter<ThSortChangeEvent>();

  get isSorted(): boolean {
    return !!this.field && this.sortField === this.field;
  }

  toggle() {
    if (this.sortField !== this.field) { this.sortChange.emit({ field: this.field, dir: 'asc' }); return; }
    if (this.sortDir === 'asc') { this.sortChange.emit({ field: this.field, dir: 'desc' }); return; }
    this.sortChange.emit({ field: '', dir: 'asc' });
  }
}

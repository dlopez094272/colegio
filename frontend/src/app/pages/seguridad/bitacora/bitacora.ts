import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BitacoraRegistro } from '../../../models';
import { BitacoraService } from '../../../services/bitacora.service';
import { PaginatorComponent } from '../../../shared/paginator/paginator';

const TABLAS: { value: string; label: string }[] = [
  { value: 'estudiantes',     label: 'Estudiantes' },
  { value: 'padres',          label: 'Padres de familia' },
  { value: 'docentes',        label: 'Personal docente' },
  { value: 'estados_civiles', label: 'Estados civiles' },
  { value: 'formaciones_academicas', label: 'Formaciones académicas' },
  { value: 'usuarios',        label: 'Usuarios' },
];

const ACCIONES = ['CREAR', 'MODIFICAR', 'ASIGNAR', 'DESASIGNAR', 'ACTIVAR', 'INACTIVAR', 'ELIMINAR'];

@Component({
  selector: 'app-bitacora',
  standalone: true,
  imports: [FormsModule, DatePipe, PaginatorComponent],
  templateUrl: './bitacora.html',
  styleUrl: './bitacora.scss',
})
export class BitacoraPage implements OnInit, OnDestroy {
  readonly tablas = TABLAS;
  readonly acciones = ACCIONES;

  rows: BitacoraRegistro[] = [];
  loading = false;
  page = 1; pageSize = 50; total = 0;

  tabla = '';
  accion = '';
  fecha_desde = '';
  fecha_hasta = '';
  search = '';
  private searchTimer: any;

  expandedId: number | null = null;

  constructor(private svc: BitacoraService) {}

  ngOnInit() { this.load(); }
  ngOnDestroy() { clearTimeout(this.searchTimer); }

  load() {
    this.loading = true;
    this.svc.getAll({
      tabla: this.tabla, accion: this.accion, fecha_desde: this.fecha_desde, fecha_hasta: this.fecha_hasta,
      search: this.search, page: this.page, pageSize: this.pageSize,
    }).subscribe({
      next: r => { this.loading = false; this.rows = r.data ?? []; this.total = r.meta?.total ?? 0; },
      error: () => { this.loading = false; },
    });
  }

  filtrar() { this.page = 1; this.load(); }
  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.filtrar(), 350);
  }
  limpiar() {
    this.tabla = this.accion = this.fecha_desde = this.fecha_hasta = this.search = '';
    this.filtrar();
  }
  onPageChange(p: number)      { this.page = p; this.load(); }
  onPageSizeChange(ps: number) { this.pageSize = ps; this.page = 1; this.load(); }

  etiquetaTabla(t: string): string {
    return TABLAS.find(x => x.value === t)?.label ?? t;
  }

  accionClass(accion: string): string {
    const map: Record<string, string> = {
      CREAR: 'success', MODIFICAR: 'info', ASIGNAR: 'success', DESASIGNAR: 'warning',
      ACTIVAR: 'success', INACTIVAR: 'warning', ELIMINAR: 'danger',
    };
    return `badge ${map[accion] ?? 'secondary'}`;
  }

  toggle(r: BitacoraRegistro) {
    if (!r.valores_antes && !r.valores_despues) return;
    this.expandedId = this.expandedId === r.idbitacora ? null : r.idbitacora;
  }

  diff(r: BitacoraRegistro): { campo: string; antes: string; despues: string }[] {
    const parse = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v) ?? {};
    try {
      const a = parse(r.valores_antes), d = parse(r.valores_despues);
      const campos = new Set([...Object.keys(a), ...Object.keys(d)]);
      const out: { campo: string; antes: string; despues: string }[] = [];
      for (const c of campos) {
        const av = a[c] == null ? '' : String(a[c]);
        const dv = d[c] == null ? '' : String(d[c]);
        if (av !== dv) out.push({ campo: c.replace(/_/g, ' '), antes: av, despues: dv });
      }
      return out;
    } catch {
      return [];
    }
  }
}

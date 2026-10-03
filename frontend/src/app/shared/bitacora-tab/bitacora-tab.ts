import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BitacoraService } from '../../services/bitacora.service';
import { BitacoraRegistro } from '../../models';
import { PaginatorComponent } from '../paginator/paginator';

@Component({
  selector: 'app-bitacora-tab',
  standalone: true,
  imports: [DatePipe, FormsModule, PaginatorComponent],
  templateUrl: './bitacora-tab.html',
  styleUrl: './bitacora-tab.scss',
})
export class BitacoraTabComponent implements OnChanges {
  @Input() tabla!: string;
  @Input() idregistro!: number;

  records: BitacoraRegistro[] = [];
  loading  = false;
  total    = 0;
  page     = 1;
  pageSize = 20;

  expandedId: number | null = null;

  constructor(private svc: BitacoraService) {}

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['tabla'] || changes['idregistro']) && this.tabla && this.idregistro) {
      this.page = 1;
      this.load();
    }
  }

  load() {
    if (!this.tabla || !this.idregistro) return;
    this.loading = true;
    this.svc.getByRegistro(this.tabla, this.idregistro, { page: this.page, pageSize: this.pageSize }).subscribe({
      next: r => {
        this.loading = false;
        this.records = r.data ?? [];
        this.total   = r.meta?.total ?? 0;
      },
      error: () => { this.loading = false; },
    });
  }

  onPageChange(p: number)      { this.page = p;      this.load(); }
  onPageSizeChange(ps: number) { this.pageSize = ps; this.page = 1; this.load(); }

  toggleExpand(id: number) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  accionClass(accion: string): string {
    const map: Record<string, string> = {
      CREAR:     'badge success',
      MODIFICAR: 'badge info',
      ACTIVAR:   'badge success',
      INACTIVAR: 'badge warning',
      ELIMINAR:  'badge danger',
      ANULAR:    'badge danger',
      ASIGNAR:    'badge success',
      DESASIGNAR: 'badge warning',
    };
    return map[accion] ?? 'badge secondary';
  }

  formatJson(val: any): string {
    if (!val) return '—';
    try {
      const obj = typeof val === 'string' ? JSON.parse(val) : val;
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(val);
    }
  }

  hasDiff(rec: BitacoraRegistro): boolean {
    return !!(rec.valores_antes || rec.valores_despues);
  }

  getDiffRows(rec: BitacoraRegistro): { campo: string; antes: string; despues: string }[] {
    try {
      const antes   = typeof rec.valores_antes   === 'string' ? JSON.parse(rec.valores_antes)   : (rec.valores_antes   ?? {});
      const despues = typeof rec.valores_despues === 'string' ? JSON.parse(rec.valores_despues) : (rec.valores_despues ?? {});
      const campos  = new Set([...Object.keys(antes), ...Object.keys(despues)]);
      const SKIP = new Set(['unidades', 'precios', 'ubicaciones', 'lineas']);
      const rows: { campo: string; antes: string; despues: string }[] = [];

      for (const campo of campos) {
        if (SKIP.has(campo)) continue;
        const a = antes[campo]   ?? '';
        const d = despues[campo] ?? '';
        const aStr = typeof a === 'object' ? JSON.stringify(a) : String(a);
        const dStr = typeof d === 'object' ? JSON.stringify(d) : String(d);
        if (aStr !== dStr) {
          rows.push({ campo, antes: aStr, despues: dStr });
        }
      }
      return rows;
    } catch {
      return [];
    }
  }
}

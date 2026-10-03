import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Cargo, EstadoCuenta } from '../../models';
import { InscripcionesService } from '../../services/inscripciones.service';
import { PagosService } from '../../services/pagos.service';
import { PermisosService } from '../../services/permisos.service';
import { confirmDialog, promptMotivo, showError, showSuccess } from '../../services/confirm';
import { abrirBlob } from '../utils/blob.util';

type Filtro = 'todos' | 'pendientes' | 'pagados';

/**
 * Estado de cuenta de una inscripción: cuotas pagadas (con fecha y recibo) y
 * pendientes (con la mora a la fecha). Permite imprimirlo, ir a cobrar,
 * agregar cuotas del grado que no tenía y anular/restaurar cuotas sueltas.
 */
@Component({
  selector: 'app-estado-cuenta',
  standalone: true,
  templateUrl: './estado-cuenta.html',
  styleUrl: './estado-cuenta.scss',
})
export class EstadoCuentaComponent implements OnChanges {
  @Input({ required: true }) idinscripcion!: number;
  /** Se emite cuando cambian los cargos (para refrescar el listado). */
  @Output() cambio = new EventEmitter<void>();

  data: EstadoCuenta | null = null;
  loading = false;
  filtro: Filtro = 'todos';
  imprimiendo = false;
  agregando: Set<number> | null = null;
  guardando = false;

  constructor(
    private svc: InscripcionesService,
    private pagosSvc: PagosService,
    public permisos: PermisosService,
    private router: Router,
  ) {}

  ngOnChanges() { this.cargar(); }

  get puedeEditar() { return this.permisos.tiene('inscripciones', 'E') && this.data?.inscripcion.estado === 'Activa'; }
  get puedeCobrar() { return this.permisos.tiene('pagos', 'A') && this.data?.inscripcion.estado === 'Activa'; }
  get puedeVerRecibo() { return this.permisos.tiene('pagos', 'S'); }

  cargar() {
    this.loading = true;
    this.svc.estadoCuenta(this.idinscripcion).subscribe({
      next: r => { this.loading = false; this.data = r.data ?? null; },
      error: e => { this.loading = false; showError(e?.error?.message || 'No se pudo cargar el estado de cuenta'); },
    });
  }

  get cargos(): Cargo[] {
    const c = this.data?.cargos ?? [];
    if (this.filtro === 'pendientes') return c.filter(x => x.estado === 'Pendiente');
    if (this.filtro === 'pagados') return c.filter(x => x.estado === 'Pagado');
    return c;
  }

  contar(estado: Cargo['estado']) { return (this.data?.cargos ?? []).filter(c => c.estado === estado).length; }

  // ─── Formato ───
  q(n: number | null | undefined) {
    return 'Q' + Number(n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  fecha(f: string | null) {
    if (!f) return '';
    const [y, m, d] = f.substring(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  recibo(n: number | null) { return n ? String(n).padStart(6, '0') : ''; }

  // ─── Acciones ───
  imprimir() {
    this.imprimiendo = true;
    this.svc.estadoCuentaPdf(this.idinscripcion).subscribe({
      next: b => { this.imprimiendo = false; abrirBlob(b); },
      error: () => { this.imprimiendo = false; showError('No se pudo generar el estado de cuenta'); },
    });
  }

  verRecibo(c: Cargo) {
    if (!c.idpagos || !this.puedeVerRecibo) return;
    this.pagosSvc.reciboPdf(c.idpagos).subscribe({ next: abrirBlob, error: () => showError('No se pudo abrir el recibo') });
  }

  cobrar() {
    const i = this.data?.inscripcion;
    if (i) this.router.navigate(['/finanzas/pagos'], { queryParams: { cobrar: i.idestudiantes } });
  }

  async anularCargo(c: Cargo) {
    const motivo = await promptMotivo('Anular cuota', `"${c.concepto}" (${this.q(c.monto)}) dejará de cobrarse. Ej. ingresó a medio año, beca, exoneración.`);
    if (!motivo) return;
    this.svc.anularCargo(c.idinscripciones_cargos, motivo).subscribe({
      next: () => { showSuccess('Cuota anulada'); this.cargar(); this.cambio.emit(); },
      error: e => showError(e?.error?.message || 'No se pudo anular'),
    });
  }

  async restaurarCargo(c: Cargo) {
    if (!(await confirmDialog(`"${c.concepto}" volverá a quedar pendiente de pago.`, 'Restaurar cuota', 'Restaurar', false))) return;
    this.svc.restaurarCargo(c.idinscripciones_cargos).subscribe({
      next: () => { showSuccess('Cuota restaurada'); this.cargar(); this.cambio.emit(); },
      error: e => showError(e?.error?.message || 'No se pudo restaurar'),
    });
  }

  // ─── Agregar cuotas del grado que no tiene ───
  abrirAgregar() { this.agregando = new Set(); }

  toggleAgregar(id: number) {
    const s = this.agregando;
    if (!s) return;
    if (s.has(id)) s.delete(id); else s.add(id);
  }

  guardarAgregar() {
    const ids = [...(this.agregando ?? [])];
    if (!ids.length) return;
    this.guardando = true;
    this.svc.agregarCuotas(this.idinscripcion, ids).subscribe({
      next: r => {
        this.guardando = false;
        this.agregando = null;
        showSuccess(`${r.cargos} cobro(s) agregado(s) al estado de cuenta`);
        this.cargar();
        this.cambio.emit();
      },
      error: e => { this.guardando = false; showError(e?.error?.message || 'No se pudieron agregar'); },
    });
  }
}

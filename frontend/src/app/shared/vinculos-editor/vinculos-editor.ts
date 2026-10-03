import { Component, DoCheck, ElementRef, HostListener, Input, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { EstadoCivil, Parentesco, PARENTESCOS, PersonaRegistro, VinculoPayload } from '../../models';
import { PersonasService, TipoPersona } from '../../services/personas.service';
import { PersonaCamposComponent, PersonaForm, personaFormVacio } from '../persona-campos/persona-campos';

/** Datos que se heredan del registro principal al crear uno vinculado en el mismo paso. */
const CAMPOS_HEREDABLES = ['direccion', 'telefono_casa', 'telefono_celular'] as const;

export interface VinculoEdit {
  key: string;
  // Existente
  id?: number;
  nombre?: string;
  detalle?: string;
  // Nuevo (se crea al guardar el registro principal)
  nuevo?: PersonaForm;
  /** campoDestino → campoOrigen del registro principal, mientras el usuario no lo edite. */
  herencia?: Record<string, keyof PersonaForm>;
  abierto?: boolean;
  parentesco: Parentesco | null;
}

let seq = 0;

/**
 * Editor de asignaciones Padre ↔ Estudiante dentro del formulario principal:
 * permite buscar y asignar registros existentes o crear nuevos en el mismo paso.
 * Los nuevos heredan del registro principal la dirección y los teléfonos (y los
 * apellidos según el parentesco) y se mantienen sincronizados hasta que el
 * usuario los edite a mano.
 */
@Component({
  selector: 'app-vinculos-editor',
  standalone: true,
  imports: [FormsModule, PersonaCamposComponent],
  templateUrl: './vinculos-editor.html',
  styleUrl: './vinculos-editor.scss',
})
export class VinculosEditorComponent implements DoCheck, OnDestroy {
  /** Lado que se asigna: 'padres' (desde estudiante) o 'estudiantes' (desde padre). */
  @Input({ required: true }) tipoOtro!: TipoPersona;
  @Input({ required: true }) items!: VinculoEdit[];
  /** Registro principal que se está editando (fuente de la herencia). */
  @Input({ required: true }) principal!: PersonaForm;
  @Input() estadosCiviles: EstadoCivil[] = [];
  @Input() puedeCrear = true;

  readonly parentescos = PARENTESCOS;

  busqueda = '';
  resultados: PersonaRegistro[] = [];
  buscando = false;
  mostrarResultados = false;

  private busqueda$ = new Subject<string>();
  private sub: Subscription;

  constructor(private svc: PersonasService, private el: ElementRef) {
    this.sub = this.busqueda$.pipe(
      debounceTime(280),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) { this.buscando = false; return of(null); }
        this.buscando = true;
        return this.svc.buscar(this.tipoOtro, q, this.idsAsignados()).pipe(catchError(() => of(null)));
      }),
    ).subscribe(r => {
      this.buscando = false;
      this.resultados = r?.data ?? [];
      this.mostrarResultados = this.busqueda.trim().length >= 2;
    });
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  // ── Textos según el lado ─────────────────────────────────────────────────
  get esPadres(): boolean { return this.tipoOtro === 'padres'; }
  get singularOtro(): string { return this.esPadres ? 'padre de familia' : 'estudiante'; }
  get origenHerencia(): string { return this.esPadres ? 'del estudiante' : 'del padre'; }

  // ── Herencia en vivo: copia los campos aún no editados desde el principal ─
  ngDoCheck() {
    for (const item of this.items) {
      if (!item.nuevo || !item.herencia) continue;
      for (const [destino, origen] of Object.entries(item.herencia)) {
        const valor = (this.principal[origen] as string) ?? '';
        if ((item.nuevo as any)[destino] !== valor) (item.nuevo as any)[destino] = valor;
      }
    }
  }

  heredados(item: VinculoEdit): Set<string> {
    return new Set(Object.keys(item.herencia ?? {}));
  }

  onCampoEditado(item: VinculoEdit, campo: string) {
    if (item.herencia && campo in item.herencia) {
      const { [campo]: _, ...resto } = item.herencia;
      item.herencia = resto;
    }
  }

  /** Mapa de herencia de apellidos según el parentesco del padre con el estudiante. */
  private herenciaApellidos(parentesco: Parentesco | null): Record<string, keyof PersonaForm> {
    if (this.esPadres) {
      // Estudiante → padre/madre nuevo: el padre lleva el 1er apellido del estudiante; la madre, el 2º.
      if (parentesco === 'Padre') return { primer_apellido: 'primer_apellido' };
      if (parentesco === 'Madre') return { primer_apellido: 'segundo_apellido' };
    } else {
      // Padre/madre → estudiante nuevo
      if (parentesco === 'Padre') return { primer_apellido: 'primer_apellido' };
      if (parentesco === 'Madre') return { segundo_apellido: 'primer_apellido' };
    }
    return {};
  }

  onParentescoChange(item: VinculoEdit) {
    if (!item.nuevo || !item.herencia) return;
    // Recalcula solo la herencia de apellidos que el usuario no haya tocado
    const base: Record<string, keyof PersonaForm> = {};
    for (const c of CAMPOS_HEREDABLES) if (c in item.herencia) base[c] = c;
    const apellidosTocados = ['primer_apellido', 'segundo_apellido'].filter(c => !(c in item.herencia!) && !!(item.nuevo as any)[c]);
    const nuevosApellidos = this.herenciaApellidos(item.parentesco);
    for (const [d, o] of Object.entries(nuevosApellidos)) {
      if (!apellidosTocados.includes(d)) base[d] = o;
    }
    // Apellidos que dejaron de heredarse se limpian si nadie los escribió
    for (const c of ['primer_apellido', 'segundo_apellido']) {
      if (c in item.herencia && !(c in base)) (item.nuevo as any)[c] = '';
    }
    item.herencia = base;
  }

  // ── Agregar / quitar ─────────────────────────────────────────────────────
  agregarNuevo(parentesco: Parentesco | null = null) {
    const herencia: Record<string, keyof PersonaForm> = {};
    for (const c of CAMPOS_HEREDABLES) herencia[c] = c;
    Object.assign(herencia, this.herenciaApellidos(parentesco));
    this.items.forEach(i => i.abierto = false);
    this.items.push({ key: `n${++seq}`, nuevo: personaFormVacio(), herencia, parentesco, abierto: true });
  }

  asignarExistente(r: PersonaRegistro) {
    const id = (this.esPadres ? r.idpadres : r.idestudiantes)!;
    if (this.items.some(i => i.id === id)) return;
    this.items.push({
      key: `e${id}`,
      id,
      nombre: r.nombre_completo,
      detalle: this.detalleDe(r),
      parentesco: null,
    });
    this.busqueda = '';
    this.resultados = [];
    this.mostrarResultados = false;
  }

  quitar(item: VinculoEdit) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  toggle(item: VinculoEdit) { item.abierto = !item.abierto; }

  onBuscar() { this.busqueda$.next(this.busqueda); }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (!this.el.nativeElement.querySelector('.ve-search')?.contains(e.target)) this.mostrarResultados = false;
  }

  // ── Helpers de presentación ──────────────────────────────────────────────
  nombreNuevo(item: VinculoEdit): string {
    const n = item.nuevo!;
    const txt = [n.primer_nombre, n.segundo_nombre, n.primer_apellido, n.segundo_apellido].filter(Boolean).join(' ').trim();
    return txt || `Nuevo ${this.singularOtro} (sin nombre)`;
  }

  detalleDe(r: PersonaRegistro): string {
    const partes: string[] = [];
    if (r.dpi) partes.push(`DPI ${r.dpi}`);
    if (r.nit) partes.push(`NIT ${r.nit}`);
    if (r.edad != null && !this.esPadres) partes.push(`${r.edad} años`);
    if (r.telefono_celular) partes.push(`Cel. ${r.telefono_celular}`);
    return partes.join(' · ');
  }

  private idsAsignados(): number[] {
    return this.items.filter(i => i.id).map(i => i.id!);
  }

}

/** Convierte las asignaciones editadas al formato que espera el backend. */
export function vinculosPayload(items: VinculoEdit[]): VinculoPayload[] {
  return items.map(i => i.nuevo
    ? { parentesco: i.parentesco, nuevo: { ...i.nuevo } }
    : { id: i.id, parentesco: i.parentesco });
}

/** Asignaciones existentes → elementos editables. */
export function vinculosDesdeRegistro(vinculos: { id: number; nombre_completo: string; parentesco: Parentesco | null; dpi?: string | null; nit?: string | null; edad?: number | null; telefono_celular?: string | null }[]): VinculoEdit[] {
  return vinculos.map(v => ({
    key: `e${v.id}`,
    id: v.id,
    nombre: v.nombre_completo,
    detalle: [v.dpi ? `DPI ${v.dpi}` : '', v.nit ? `NIT ${v.nit}` : '', v.edad != null ? `${v.edad} años` : '', v.telefono_celular ? `Cel. ${v.telefono_celular}` : ''].filter(Boolean).join(' · '),
    parentesco: v.parentesco,
  }));
}

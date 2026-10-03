import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Nivel, Grado, TipoEstructura } from '../../../models';
import { CambiosCascada, EstructuraAcademicaService, EstructuraPayload } from '../../../services/estructura-academica.service';
import { PermisosService } from '../../../services/permisos.service';
import { confirmDialog, showError, showSuccess, showWarning } from '../../../services/confirm';
import { RowAction, RowMenuComponent } from '../../../shared/row-menu/row-menu';
import { BitacoraTabComponent } from '../../../shared/bitacora-tab/bitacora-tab';
import { readStateFromUrl, syncStateToUrl } from '../../../shared/utils/url-state.util';

/** Nodo unificado del árbol: la vista gráfica y la de tabla trabajan sobre esto. */
export interface Nodo {
  key: string;
  tipo: TipoEstructura;
  id: number;
  nombre: string;
  activo: boolean;
  orden: number;
  usaCarreras: boolean;
  padre: Nodo | null;
  hijos: Nodo[];
  // Ubicación en la jerarquía (incluye el id propio: un grado lleva idgrados = su id).
  idniveles: number | null;
  idcarreras: number | null;
  idgrados: number | null;
}

const ETQ: Record<TipoEstructura, { s: string; p: string; fem: boolean; tabla: string }> = {
  nivel:   { s: 'Nivel',   p: 'Niveles',   fem: false, tabla: 'niveles' },
  carrera: { s: 'Carrera', p: 'Carreras',  fem: true,  tabla: 'carreras' },
  grado:   { s: 'Grado',   p: 'Grados',    fem: false, tabla: 'grados' },
  seccion: { s: 'Sección', p: 'Secciones', fem: true,  tabla: 'secciones' },
};

/** Atajos para llenar rápido los nombres más comunes. */
const PRESETS: Partial<Record<TipoEstructura, { label: string; valores: string[] }[]>> = {
  nivel: [
    { label: 'Niveles comunes', valores: ['Preprimaria', 'Primaria', 'Básico', 'Diversificado'] },
  ],
  carrera: [
    { label: 'Perito en Computación', valores: ['Perito en Computación'] },
    { label: 'Bachillerato en Ciencias y Letras', valores: ['Bachillerato en Ciencias y Letras'] },
    { label: 'Perito Contador', valores: ['Perito Contador'] },
  ],
  grado: [
    { label: 'Párvulos – Preparatoria', valores: ['Párvulos', 'Kínder', 'Preparatoria'] },
    { label: 'Primero – Sexto',  valores: ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto'] },
    { label: 'Primero – Tercero', valores: ['Primero', 'Segundo', 'Tercero'] },
    { label: 'Cuarto – Sexto',   valores: ['Cuarto', 'Quinto', 'Sexto'] },
    { label: 'Cuarto – Quinto',  valores: ['Cuarto', 'Quinto'] },
  ],
  seccion: [
    { label: 'A',     valores: ['A'] },
    { label: 'A – B', valores: ['A', 'B'] },
    { label: 'A – C', valores: ['A', 'B', 'C'] },
    { label: 'A – D', valores: ['A', 'B', 'C', 'D'] },
  ],
};

type Vista = 'arbol' | 'tabla';

interface FormState {
  modo: 'nuevo' | 'editar';
  tipo: TipoEstructura;
  nodo: Nodo | null;   // registro editado
  padre: Nodo | null;  // dónde se crea (null = nivel)
  nombres: string;
  orden: number | null;
  usa_carreras: number;
  activo: number;
}

@Component({
  selector: 'app-estructura-academica',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, RowMenuComponent, BitacoraTabComponent],
  templateUrl: './estructura.html',
  styleUrl: './estructura.scss',
})
export class EstructuraAcademicaPage implements OnInit {
  readonly ETQ = ETQ;
  readonly PRESETS = PRESETS;

  vista: Vista = 'arbol';
  loading = false;
  niveles: Nodo[] = [];
  ocultarInactivos = false;

  /** Nodos colapsados en la vista gráfica (por defecto todo abierto). */
  private colapsados = new Set<string>();

  // Vista tabla (maestro-detalle en cascada)
  selNivel: string | null = null;
  selCarrera: string | null = null;
  selGrado: string | null = null;
  rapido: Record<string, string> = { nivel: '', carrera: '', grado: '', seccion: '' };
  guardandoRapido: TipoEstructura | null = null;

  form: FormState | null = null;
  saving = false;
  error = '';

  bitacoraNodo: Nodo | null = null;

  constructor(
    private svc: EstructuraAcademicaService,
    public permisos: PermisosService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    const st = readStateFromUrl(this.route);
    if (st['vista'] === 'tabla') this.vista = 'tabla';
    this.load();
  }

  setVista(v: Vista) {
    this.vista = v;
    syncStateToUrl(this.router, this.route, { vista: v }, { defaults: { vista: 'arbol' } });
  }

  etq(t: TipoEstructura) { return ETQ[t]; }
  presets(t: TipoEstructura) { return PRESETS[t]; }

  get puedeA() { return this.permisos.tiene('estructura_academica', 'A'); }
  get puedeE() { return this.permisos.tiene('estructura_academica', 'E'); }
  get puedeD() { return this.permisos.tiene('estructura_academica', 'D'); }

  // ─── Carga y armado del árbol ────────────────────────────────
  load() {
    this.loading = true;
    this.svc.arbol().subscribe({
      next: r => { this.loading = false; this.niveles = this.construir(r.data ?? []); this.validarSeleccion(); },
      error: () => { this.loading = false; },
    });
  }

  private construir(data: Nivel[]): Nodo[] {
    const nodo = (p: Partial<Nodo> & Pick<Nodo, 'tipo' | 'id' | 'nombre'>, padre: Nodo | null): Nodo => ({
      key: `${p.tipo}-${p.id}`, activo: true, orden: 0, usaCarreras: false, hijos: [],
      idniveles: padre?.idniveles ?? null, idcarreras: padre?.idcarreras ?? null, idgrados: padre?.idgrados ?? null,
      ...p, padre,
    });
    const grado = (g: Grado, padre: Nodo) => {
      const n = nodo({ tipo: 'grado', id: g.idgrados, nombre: g.grado, activo: !!g.activo, orden: g.orden, idgrados: g.idgrados }, padre);
      n.hijos = g.secciones.map(s => nodo({ tipo: 'seccion', id: s.idsecciones, nombre: s.seccion, activo: !!s.activo }, n));
      return n;
    };
    return data.map(nv => {
      const n = nodo({ tipo: 'nivel', id: nv.idniveles, nombre: nv.nivel, activo: !!nv.activo, orden: nv.orden, usaCarreras: !!nv.usa_carreras, idniveles: nv.idniveles }, null);
      n.hijos = nv.usa_carreras
        ? nv.carreras.map(c => {
            const cn = nodo({ tipo: 'carrera', id: c.idcarreras, nombre: c.carrera, activo: !!c.activo, orden: c.orden, idcarreras: c.idcarreras }, n);
            cn.hijos = c.grados.map(g => grado(g, cn));
            return cn;
          })
        : nv.grados.map(g => grado(g, n));
      return n;
    });
  }

  // ─── Utilidades de jerarquía ─────────────────────────────────
  /** Qué se crea como hijo de un nodo (null = raíz → nivel). */
  tipoHijo(n: Nodo | null): TipoEstructura | null {
    if (!n) return 'nivel';
    if (n.tipo === 'nivel') return n.usaCarreras ? 'carrera' : 'grado';
    if (n.tipo === 'carrera') return 'grado';
    if (n.tipo === 'grado') return 'seccion';
    return null;
  }

  visibles(nodos: Nodo[]): Nodo[] {
    return this.ocultarInactivos ? nodos.filter(n => n.activo) : nodos;
  }

  ruta(n: Nodo | null): string {
    const partes: string[] = [];
    for (let p = n; p; p = p.padre) partes.unshift(p.nombre);
    return partes.join(' › ');
  }

  /** Primer ancestro inactivo: bajo él no se puede activar nada. */
  ancestroInactivo(n: Nodo | null): Nodo | null {
    for (let p = n?.padre ?? null; p; p = p.padre) if (!p.activo) return p;
    return null;
  }

  bloqueoActivar(n: Nodo): string | null {
    const a = this.ancestroInactivo(n);
    return a ? `Active primero ${ETQ[a.tipo].fem ? 'la' : 'el'} ${ETQ[a.tipo].s.toLowerCase()} "${a.nombre}"` : null;
  }

  /** Conteo de descendientes por tipo (para avisar qué arrastra una cascada). */
  descendientes(n: Nodo, soloActivos: boolean | null = null): Record<TipoEstructura, number> {
    const c: Record<TipoEstructura, number> = { nivel: 0, carrera: 0, grado: 0, seccion: 0 };
    const walk = (x: Nodo) => x.hijos.forEach(h => {
      if (soloActivos === null || h.activo === soloActivos) c[h.tipo]++;
      walk(h);
    });
    walk(n);
    return c;
  }

  resumen(c: Partial<Record<TipoEstructura, number>>): string {
    return (['carrera', 'grado', 'seccion'] as TipoEstructura[])
      .filter(t => c[t])
      .map(t => `${c[t]} ${(c[t] === 1 ? ETQ[t].s : ETQ[t].p).toLowerCase()}`)
      .join(', ');
  }

  resumenHijos(n: Nodo): string {
    return this.resumen(this.descendientes(n)) || 'Sin registros';
  }

  get totales() {
    const c = { nivel: 0, carrera: 0, grado: 0, seccion: 0 };
    const walk = (x: Nodo) => { if (x.activo) c[x.tipo]++; x.hijos.forEach(walk); };
    this.niveles.forEach(walk);
    return c;
  }

  // ─── Vista gráfica ───────────────────────────────────────────
  expandido(n: Nodo) { return !this.colapsados.has(n.key); }
  toggleExpandir(n: Nodo) {
    if (this.colapsados.has(n.key)) this.colapsados.delete(n.key); else this.colapsados.add(n.key);
  }
  expandirTodo() { this.colapsados.clear(); }
  colapsarTodo() { this.niveles.forEach(n => this.colapsados.add(n.key)); }

  acciones(n: Nodo): RowAction[] {
    const a: RowAction[] = [];
    const hijo = this.tipoHijo(n);
    if (this.puedeA && hijo) a.push({ label: `Agregar ${ETQ[hijo].s.toLowerCase()}`, icon: 'plus', action: () => this.nuevo(hijo, n) });
    if (this.puedeA) a.push({ label: `Agregar ${ETQ[n.tipo].s.toLowerCase()} al mismo nivel`, icon: 'plus', action: () => this.nuevo(n.tipo, n.padre) });
    if (this.puedeE) {
      a.push({ label: 'Editar', icon: 'edit', action: () => this.editar(n) });
      a.push(n.activo
        ? { label: 'Inactivar', icon: 'toggle-off', variant: 'warning', action: () => this.cambiarEstado(n) }
        : { label: 'Activar', icon: 'toggle-on', disabled: !!this.bloqueoActivar(n), tooltip: this.bloqueoActivar(n) ?? 'Activar', action: () => this.cambiarEstado(n) });
    }
    a.push({ label: 'Bitácora', icon: 'bitacora', action: () => this.bitacoraNodo = n });
    if (this.puedeD) a.push({
      label: 'Eliminar', icon: 'trash', variant: 'danger',
      disabled: n.hijos.length > 0,
      tooltip: n.hijos.length ? 'Tiene registros dependientes; elimínelos primero o inactívelo' : 'Eliminar',
      action: () => this.eliminar(n),
    });
    return a;
  }

  // ─── Vista tabla (maestro-detalle) ───────────────────────────
  get nivelSel(): Nodo | null { return this.niveles.find(n => n.key === this.selNivel) ?? null; }
  get carreraSel(): Nodo | null { return this.nivelSel?.hijos.find(n => n.key === this.selCarrera) ?? null; }
  /** Padre de los grados: el nivel, o la carrera cuando el nivel usa carreras. */
  get padreGrados(): Nodo | null { return this.nivelSel?.usaCarreras ? this.carreraSel : this.nivelSel; }
  get gradoSel(): Nodo | null { return this.padreGrados?.hijos.find(n => n.key === this.selGrado) ?? null; }

  seleccionar(n: Nodo) {
    if (n.tipo === 'nivel' && this.selNivel !== n.key) { this.selNivel = n.key; this.selCarrera = null; this.selGrado = null; }
    if (n.tipo === 'carrera' && this.selCarrera !== n.key) { this.selCarrera = n.key; this.selGrado = null; }
    if (n.tipo === 'grado') this.selGrado = n.key;
  }

  /** Tras recargar, descarta selecciones de registros que ya no existen. */
  private validarSeleccion() {
    if (!this.nivelSel) { this.selNivel = this.niveles[0]?.key ?? null; this.selCarrera = null; this.selGrado = null; }
    if (this.selCarrera && !this.carreraSel) { this.selCarrera = null; this.selGrado = null; }
    if (this.selGrado && !this.gradoSel) this.selGrado = null;
  }

  aplicarPresetRapido(tipo: TipoEstructura, valores: string[]) {
    this.rapido[tipo] = valores.join(', ');
  }

  agregarRapido(tipo: TipoEstructura, padre: Nodo | null) {
    const nombres = this.partirNombres(this.rapido[tipo]);
    if (!nombres.length) return;
    this.guardandoRapido = tipo;
    this.svc.create(tipo, { ...this.ubicacion(padre), nombres }).subscribe({
      next: r => {
        this.guardandoRapido = null;
        this.rapido[tipo] = '';
        this.avisoCreado(tipo, nombres.length, r.message);
        this.load();
      },
      error: e => { this.guardandoRapido = null; showError(e?.error?.message || 'No se pudo guardar'); },
    });
  }

  // ─── Formulario (alta / edición) ─────────────────────────────
  nuevo(tipo: TipoEstructura, padre: Nodo | null) {
    this.form = { modo: 'nuevo', tipo, nodo: null, padre, nombres: '', orden: null, usa_carreras: 0, activo: 1 };
    if (this.formAncestro) this.form.activo = 0;
    this.error = '';
  }

  editar(n: Nodo) {
    this.form = {
      modo: 'editar', tipo: n.tipo, nodo: n, padre: n.padre, nombres: n.nombre,
      orden: n.tipo === 'seccion' ? null : n.orden, usa_carreras: n.usaCarreras ? 1 : 0, activo: n.activo ? 1 : 0,
    };
    this.error = '';
  }

  aplicarPreset(valores: string[]) {
    if (!this.form) return;
    const actuales = this.partirNombres(this.form.nombres);
    const nuevos = valores.filter(v => !actuales.some(a => a.toLowerCase() === v.toLowerCase()));
    this.form.nombres = [...actuales, ...nuevos].join(', ');
  }

  /** Ancestro inactivo del registro del formulario (o del lugar donde se crea): bloquea el switch Activo. */
  get formAncestro(): Nodo | null {
    const f = this.form;
    if (!f) return null;
    if (f.nodo) return this.ancestroInactivo(f.nodo);
    for (let p = f.padre; p; p = p.padre) if (!p.activo) return p;
    return null;
  }

  get nombresForm(): string[] { return this.form ? this.partirNombres(this.form.nombres) : []; }

  async guardar() {
    const f = this.form;
    if (!f) return;
    const nombres = this.partirNombres(f.nombres);
    if (!nombres.length) { this.error = 'El nombre es requerido.'; return; }

    if (f.modo === 'editar') {
      const n = f.nodo!;
      if (nombres.length > 1) { this.error = 'Al editar solo se permite un nombre.'; return; }
      if (!!f.activo !== n.activo && !(await this.confirmarCascada(n, !!f.activo))) return;
      this.saving = true;
      this.svc.update(f.tipo, n.id, { nombre: nombres[0], orden: f.orden, usa_carreras: f.usa_carreras, activo: f.activo }).subscribe({
        next: r => { this.saving = false; this.form = null; showSuccess(`${ETQ[f.tipo].s} guardad${ETQ[f.tipo].fem ? 'a' : 'o'}${this.textoCambios(r.cambios, f.tipo)}`); this.load(); },
        error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
      });
      return;
    }

    const payload: EstructuraPayload = { ...this.ubicacion(f.padre), nombres, activo: f.activo, orden: f.orden };
    if (f.tipo === 'nivel') payload.usa_carreras = f.usa_carreras;
    this.saving = true;
    this.svc.create(f.tipo, payload).subscribe({
      next: r => {
        this.saving = false;
        this.form = null;
        if (f.padre) this.colapsados.delete(f.padre.key);
        this.avisoCreado(f.tipo, nombres.length, r.message);
        this.load();
      },
      error: e => { this.saving = false; this.error = e?.error?.message || 'Error al guardar.'; },
    });
  }

  // ─── Activar / inactivar / eliminar ──────────────────────────
  async cambiarEstado(n: Nodo) {
    const activar = !n.activo;
    if (!(await this.confirmarCascada(n, activar))) return;
    this.svc.estado(n.tipo, n.id, activar).subscribe({
      next: r => { showSuccess(`${n.nombre}: ${activar ? 'activad' : 'inactivad'}${ETQ[n.tipo].fem ? 'a' : 'o'}${this.textoCambios(r.cambios, n.tipo)}`); this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo cambiar el estado'),
    });
  }

  private async confirmarCascada(n: Nodo, activar: boolean): Promise<boolean> {
    // Solo se cuentan los hijos que realmente van a cambiar de estado.
    const afectados = this.resumen(this.descendientes(n, !activar));
    const etq = `${ETQ[n.tipo].fem ? 'la' : 'el'} ${ETQ[n.tipo].s.toLowerCase()} "${n.nombre}"`;
    if (activar) {
      if (!afectados) return true;
      return confirmDialog(`Se activará ${etq} y también: ${afectados}.`, `Activar ${ETQ[n.tipo].s.toLowerCase()}`, 'Activar todo', false);
    }
    return confirmDialog(
      afectados ? `Se inactivará ${etq} y en cascada: ${afectados}.` : `Se inactivará ${etq}.`,
      `Inactivar ${ETQ[n.tipo].s.toLowerCase()}`, 'Inactivar',
    );
  }

  async eliminar(n: Nodo) {
    const etq = `${ETQ[n.tipo].fem ? 'la' : 'el'} ${ETQ[n.tipo].s.toLowerCase()} "${n.nombre}"`;
    if (!(await confirmDialog(`¿Eliminar ${etq}? Esta acción no se puede deshacer.`, `Eliminar ${ETQ[n.tipo].s.toLowerCase()}`, 'Eliminar'))) return;
    this.svc.delete(n.tipo, n.id).subscribe({
      next: () => { showSuccess(`${ETQ[n.tipo].s} eliminad${ETQ[n.tipo].fem ? 'a' : 'o'}`); this.form = null; this.load(); },
      error: e => showError(e?.error?.message || 'No se pudo eliminar'),
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────
  /** Columnas de padre que espera el backend según dónde se crea. */
  private ubicacion(padre: Nodo | null): EstructuraPayload {
    return { idniveles: padre?.idniveles ?? null, idcarreras: padre?.idcarreras ?? null, idgrados: padre?.idgrados ?? null };
  }

  /** "A, B, C" o uno por línea → ['A','B','C']. */
  private partirNombres(txt: string): string[] {
    return (txt || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  }

  private avisoCreado(tipo: TipoEstructura, cantidad: number, aviso?: string) {
    const e = ETQ[tipo];
    showSuccess(cantidad > 1 ? `${cantidad} ${e.p.toLowerCase()} creados` : `${e.s} cread${e.fem ? 'a' : 'o'}`);
    if (aviso) showWarning(aviso);
  }

  /** Texto de los hijos arrastrados por la cascada (sin contar el propio registro). */
  private textoCambios(c: CambiosCascada | null | undefined, tipo: TipoEstructura): string {
    if (!c) return '';
    const propio = (t: TipoEstructura) => (t === tipo ? 1 : 0);
    const hijos = this.resumen({
      carrera: (c.carreras ?? 0) - propio('carrera'),
      grado:   (c.grados ?? 0) - propio('grado'),
      seccion: (c.secciones ?? 0) - propio('seccion'),
    });
    return hijos ? ` (incluye ${hijos})` : '';
  }
}

import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormacionAcademica } from '../../models';
import { FormacionesAcademicasService } from '../../services/formaciones-academicas.service';
import { PermisosService } from '../../services/permisos.service';
import { showError } from '../../services/confirm';

/**
 * Campo de selección múltiple de formaciones académicas: las elegidas se
 * muestran como chips dentro del mismo campo y se agregan escribiendo para
 * filtrar el catálogo (Enter / clic). Si la formación no existe y el usuario
 * tiene permiso de Añadir en el catálogo, puede crearla ahí mismo.
 */
@Component({
  selector: 'app-formaciones-select',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './formaciones-select.html',
  styleUrl: './formaciones-select.scss',
})
export class FormacionesSelectComponent {
  /** Catálogo de formaciones activas. */
  @Input() opciones: FormacionAcademica[] = [];
  @Input() seleccion: FormacionAcademica[] = [];
  @Output() seleccionChange = new EventEmitter<FormacionAcademica[]>();
  /** Se creó una formación nueva en el catálogo (para que el padre la agregue a sus opciones). */
  @Output() creada = new EventEmitter<FormacionAcademica>();

  @ViewChild('inp') inp?: ElementRef<HTMLInputElement>;

  texto = '';
  abierto = false;
  activo = 0;
  creando = false;

  constructor(private svc: FormacionesAcademicasService, private permisos: PermisosService, private host: ElementRef<HTMLElement>) {}

  get puedeCrear(): boolean { return this.permisos.tiene('formaciones_academicas', 'A'); }

  private normalizar(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  get filtradas(): FormacionAcademica[] {
    const elegidas = new Set(this.seleccion.map(f => f.idformaciones_academicas));
    const palabras = this.normalizar(this.texto).split(/\s+/).filter(Boolean);
    return this.opciones.filter(f =>
      !elegidas.has(f.idformaciones_academicas) &&
      palabras.every(p => this.normalizar(f.formacion).includes(p)));
  }

  /** Ofrecer "crear" solo si lo escrito no coincide exactamente con una existente. */
  get ofrecerCrear(): boolean {
    const t = this.normalizar(this.texto);
    return !!t && this.puedeCrear && !this.opciones.some(f => this.normalizar(f.formacion) === t);
  }

  enfocar() {
    this.inp?.nativeElement.focus();
    this.abrir();
  }

  abrir() {
    this.abierto = true;
    this.activo = 0;
  }

  onTexto() {
    this.abierto = true;
    this.activo = 0;
  }

  agregar(f: FormacionAcademica) {
    this.seleccionChange.emit([...this.seleccion, f]);
    this.texto = '';
    this.activo = 0;
    this.inp?.nativeElement.focus();
  }

  quitar(f: FormacionAcademica) {
    this.seleccionChange.emit(this.seleccion.filter(x => x.idformaciones_academicas !== f.idformaciones_academicas));
  }

  onKeydown(ev: KeyboardEvent) {
    const lista = this.filtradas;
    const total = lista.length + (this.ofrecerCrear ? 1 : 0);
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        this.abierto = true;
        if (total) this.activo = (this.activo + 1) % total;
        break;
      case 'ArrowUp':
        ev.preventDefault();
        if (total) this.activo = (this.activo - 1 + total) % total;
        break;
      case 'Enter':
        // Nunca enviar el formulario desde este campo
        ev.preventDefault();
        if (!this.abierto) { this.abrir(); break; }
        if (this.activo < lista.length) { if (lista[this.activo]) this.agregar(lista[this.activo]); }
        else if (this.ofrecerCrear) this.crear();
        break;
      case 'Escape':
        if (this.abierto) { ev.stopPropagation(); this.abierto = false; }
        break;
      case 'Backspace':
        if (!this.texto && this.seleccion.length) this.quitar(this.seleccion[this.seleccion.length - 1]);
        break;
    }
  }

  crear() {
    const formacion = this.texto.trim().replace(/\s+/g, ' ');
    if (!formacion || this.creando) return;
    this.creando = true;
    this.svc.create({ formacion, activo: 1 }).subscribe({
      next: r => {
        this.creando = false;
        const nueva: FormacionAcademica = r.data ?? { idformaciones_academicas: r.id, formacion, activo: 1 };
        this.creada.emit(nueva);
        this.agregar(nueva);
      },
      error: e => { this.creando = false; showError(e?.error?.message || 'No se pudo crear la formación'); },
    });
  }

  @HostListener('document:mousedown', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (this.abierto && !this.host.nativeElement.contains(ev.target as Node)) this.abierto = false;
  }
}

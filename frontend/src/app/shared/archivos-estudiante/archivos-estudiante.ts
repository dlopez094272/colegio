import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { CategoriaArchivo, EstudianteArchivo } from '../../models';
import { EstudianteArchivosService } from '../../services/estudiante-archivos.service';
import { CategoriasArchivosService } from '../../services/categorias-archivos.service';
import { showError } from '../../services/confirm';

/** Archivo elegido en el formulario que se sube al guardar el estudiante. */
export interface ArchivoPendiente {
  uid: number;
  file: File;
  idcategorias_archivos: number | null;
  observaciones: string;
}

interface Vista {
  nombre: string;
  tipo: 'pdf' | 'imagen';
  url: string;
  safeUrl: SafeResourceUrl;
}

const MAX_MB = 20;
const VISTA_PREVIA = /^(application\/pdf|image\/(jpeg|png|gif|webp))$/;

/**
 * Expediente de archivos del estudiante.
 *  - modo "editar" (formulario nuevo/editar): agrega archivos con su categoría y
 *    marca los existentes para eliminar; nada se envía hasta que el padre llama
 *    a guardar(id) después de guardar el registro (la subida necesita el id).
 *  - modo "ver" (ficha): listado con vista previa y descarga.
 */
@Component({
  selector: 'app-archivos-estudiante',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './archivos-estudiante.html',
  styleUrl: './archivos-estudiante.scss',
})
export class ArchivosEstudianteComponent implements OnInit, OnChanges, OnDestroy {
  @Input() idestudiante: number | null = null;
  @Input() modo: 'editar' | 'ver' = 'ver';
  /** Cantidad de archivos guardados (para el título de la pestaña en la ficha). */
  @Output() total = new EventEmitter<number>();

  categorias: CategoriaArchivo[] = [];
  categoriaSel: number | null = null;

  existentes: EstudianteArchivo[] = [];
  porEliminar = new Set<number>();
  pendientes: ArchivoPendiente[] = [];
  loading = false;
  arrastrando = false;

  vista: Vista | null = null;
  abriendo: number | null = null;

  private uid = 0;

  constructor(
    private svc: EstudianteArchivosService,
    private catSvc: CategoriasArchivosService,
    private sanitizer: DomSanitizer,
  ) {}

  get editable(): boolean { return this.modo === 'editar'; }
  get hayCambios(): boolean { return this.pendientes.length > 0 || this.porEliminar.size > 0; }

  ngOnInit() {
    if (this.editable) {
      this.catSvc.getAll().subscribe({ next: r => this.categorias = r.data ?? [], error: () => {} });
    }
  }

  ngOnChanges(ch: SimpleChanges) {
    if (ch['idestudiante']) {
      this.existentes = [];
      this.porEliminar.clear();
      this.pendientes = [];
      if (this.idestudiante) this.cargar();
      else this.total.emit(0);
    }
  }

  ngOnDestroy() { this.cerrarVista(); }

  cargar() {
    this.loading = true;
    this.svc.listar(this.idestudiante!).subscribe({
      next: r => { this.loading = false; this.existentes = r.data ?? []; this.total.emit(this.existentes.length); },
      error: e => { this.loading = false; showError(e?.error?.message || 'No se pudieron cargar los archivos'); },
    });
  }

  // ── Agregar (modo editar) ──
  onSeleccion(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.agregar(input.files);
    input.value = '';
  }

  onDrop(ev: DragEvent) {
    ev.preventDefault();
    this.arrastrando = false;
    this.agregar(ev.dataTransfer?.files ?? null);
  }

  private agregar(files: FileList | null) {
    if (!files?.length) return;
    const grandes: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_MB * 1024 * 1024) { grandes.push(file.name); continue; }
      this.pendientes.push({ uid: ++this.uid, file, idcategorias_archivos: this.categoriaSel, observaciones: '' });
    }
    if (grandes.length) showError(`Exceden ${MAX_MB} MB y no se agregaron: ${grandes.join(', ')}`);
  }

  quitarPendiente(p: ArchivoPendiente) { this.pendientes = this.pendientes.filter(x => x !== p); }

  toggleEliminar(a: EstudianteArchivo) {
    if (this.porEliminar.has(a.idestudiantes_archivos)) this.porEliminar.delete(a.idestudiantes_archivos);
    else this.porEliminar.add(a.idestudiantes_archivos);
  }

  /** Mensaje de error si algún archivo nuevo no tiene categoría. */
  validar(): string | null {
    return this.pendientes.some(p => !p.idcategorias_archivos)
      ? 'Seleccione la categoría de cada archivo que va a subir.'
      : null;
  }

  /**
   * Aplica los cambios pendientes al estudiante ya guardado. Devuelve los
   * errores (uno por archivo) para que el formulario los informe; los que sí
   * se procesaron se quitan de la lista de pendientes.
   */
  async guardar(idestudiante: number): Promise<string[]> {
    const errores: string[] = [];
    for (const id of Array.from(this.porEliminar)) {
      const a = this.existentes.find(x => x.idestudiantes_archivos === id);
      try {
        await firstValueFrom(this.svc.eliminar(idestudiante, id));
        this.porEliminar.delete(id);
      } catch (e: any) {
        errores.push(`No se pudo eliminar "${a?.nombre_original ?? id}": ${e?.error?.message || 'error de red'}`);
      }
    }
    for (const p of [...this.pendientes]) {
      try {
        await firstValueFrom(this.svc.subir(idestudiante, p.file, p.idcategorias_archivos!, p.observaciones));
        this.quitarPendiente(p);
      } catch (e: any) {
        errores.push(`No se pudo subir "${p.file.name}": ${e?.error?.message || 'error de red'}`);
      }
    }
    return errores;
  }

  // ── Vista previa / descarga ──
  puedePrevisualizar(mime: string | null | undefined): boolean { return VISTA_PREVIA.test(mime || ''); }

  abrir(a: EstudianteArchivo) {
    if (!this.puedePrevisualizar(a.mime)) return this.descargar(a);
    this.abriendo = a.idestudiantes_archivos;
    this.svc.obtener(this.idestudiante!, a.idestudiantes_archivos).subscribe({
      next: blob => { this.abriendo = null; this.mostrar(a.nombre_original, blob); },
      error: () => { this.abriendo = null; showError('No se pudo abrir el archivo'); },
    });
  }

  abrirPendiente(p: ArchivoPendiente) {
    if (this.puedePrevisualizar(p.file.type)) this.mostrar(p.file.name, p.file);
  }

  descargar(a: EstudianteArchivo) {
    this.abriendo = a.idestudiantes_archivos;
    this.svc.obtener(this.idestudiante!, a.idestudiantes_archivos, true).subscribe({
      next: blob => {
        this.abriendo = null;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.nombre_original;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => { this.abriendo = null; showError('No se pudo descargar el archivo'); },
    });
  }

  private mostrar(nombre: string, blob: Blob) {
    this.cerrarVista();
    const url = URL.createObjectURL(blob);
    this.vista = {
      nombre,
      tipo: blob.type === 'application/pdf' ? 'pdf' : 'imagen',
      url,
      safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url),
    };
  }

  cerrarVista() {
    if (this.vista) URL.revokeObjectURL(this.vista.url);
    this.vista = null;
  }

  // ── Presentación ──
  tamano(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /** Clase de color de la etiqueta de tipo. */
  tipo(mime: string | null | undefined, nombre: string): 'pdf' | 'img' | 'doc' | 'xls' | 'file' {
    const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (mime?.startsWith('image/')) return 'img';
    if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return 'doc';
    if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'xls';
    return 'file';
  }

  extension(nombre: string): string {
    const ext = nombre.includes('.') ? nombre.split('.').pop()! : '';
    return ext.substring(0, 4).toUpperCase() || 'ARCH';
  }
}

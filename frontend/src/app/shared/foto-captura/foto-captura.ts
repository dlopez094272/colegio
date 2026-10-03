import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';

/** Cambio de foto pendiente de guardar: nueva imagen, eliminación o sin cambios. */
export interface FotoCambio {
  blob: Blob | null;
  quitar: boolean;
}

// Tamaño final de la foto (retrato 3:4) y calidad JPEG: suficiente para carné
// y ligera para el listado (~40-80 KB).
const ANCHO = 480;
const ALTO = 640;
const CALIDAD = 0.85;

/**
 * Foto del estudiante: permite tomarla con la cámara del dispositivo o subir
 * un archivo de imagen. La imagen se recorta al centro en formato retrato 3:4
 * y se comprime en el navegador antes de enviarla. No sube nada por sí mismo:
 * emite el cambio y el formulario lo envía al guardar.
 */
@Component({
  selector: 'app-foto-captura',
  standalone: true,
  templateUrl: './foto-captura.html',
  styleUrl: './foto-captura.scss',
})
export class FotoCapturaComponent implements OnChanges, OnDestroy {
  /** URL de la foto ya guardada (si existe). */
  @Input() fotoUrl: string | null = null;
  @Input() iniciales = '';
  @Output() cambio = new EventEmitter<FotoCambio>();

  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  preview: string | null = null;
  private objectUrl: string | null = null;
  quitada = false;

  // Cámara
  camaraAbierta = false;
  iniciandoCamara = false;
  errorCamara = '';
  camaras: MediaDeviceInfo[] = [];
  private camaraIdx = 0;
  private stream: MediaStream | null = null;

  procesando = false;
  error = '';

  ngOnChanges(ch: SimpleChanges) {
    if (ch['fotoUrl']) { this.limpiarPreview(); this.quitada = false; }
  }

  ngOnDestroy() {
    this.detenerCamara();
    this.limpiarPreview();
  }

  get imagenVisible(): string | null {
    if (this.preview) return this.preview;
    return this.quitada ? null : this.fotoUrl;
  }

  get camaraDisponible(): boolean {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  // ── Archivo ──────────────────────────────────────────────────────────────
  elegirArchivo() {
    this.fileInput?.nativeElement.click();
  }

  async onArchivo(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.error = 'El archivo seleccionado no es una imagen.'; return; }
    if (file.size > 15 * 1024 * 1024) { this.error = 'La imagen es demasiado grande (máx. 15 MB).'; return; }
    try {
      const bitmap = await createImageBitmap(file);
      await this.procesar(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
    } catch {
      this.error = 'No se pudo leer la imagen.';
    }
  }

  // ── Cámara ───────────────────────────────────────────────────────────────
  async abrirCamara() {
    this.error = '';
    this.errorCamara = '';
    this.camaraAbierta = true;
    await this.iniciarCamara();
  }

  private async iniciarCamara() {
    this.detenerCamara();
    this.iniciandoCamara = true;
    try {
      const deviceId = this.camaras[this.camaraIdx]?.deviceId;
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 960 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      // Los nombres de las cámaras solo están disponibles después de conceder el permiso
      if (!this.camaras.length) {
        this.camaras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      }
      setTimeout(() => {
        const video = this.videoRef?.nativeElement;
        if (video && this.stream) { video.srcObject = this.stream; video.play().catch(() => {}); }
      });
    } catch (e: any) {
      this.errorCamara = e?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Habilítelo en el navegador para continuar.'
        : e?.name === 'NotFoundError'
          ? 'No se encontró ninguna cámara en este equipo.'
          : 'No se pudo acceder a la cámara. (Requiere HTTPS o localhost.)';
    } finally {
      this.iniciandoCamara = false;
    }
  }

  async cambiarCamara() {
    if (this.camaras.length < 2) return;
    this.camaraIdx = (this.camaraIdx + 1) % this.camaras.length;
    await this.iniciarCamara();
  }

  async capturar() {
    const video = this.videoRef?.nativeElement;
    if (!video || !video.videoWidth) return;
    await this.procesar(video, video.videoWidth, video.videoHeight);
    this.cerrarCamara();
  }

  cerrarCamara() {
    this.detenerCamara();
    this.camaraAbierta = false;
  }

  private detenerCamara() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  // ── Quitar ───────────────────────────────────────────────────────────────
  quitar() {
    this.limpiarPreview();
    this.quitada = true;
    this.cambio.emit({ blob: null, quitar: true });
  }

  // ── Procesamiento: recorte centrado 3:4 + compresión JPEG ────────────────
  private async procesar(origen: CanvasImageSource, w: number, h: number) {
    this.procesando = true;
    this.error = '';
    try {
      const objetivo = ANCHO / ALTO;
      let sw = w, sh = h;
      if (w / h > objetivo) sw = h * objetivo; else sh = w / objetivo;
      const sx = (w - sw) / 2, sy = (h - sh) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = ANCHO;
      canvas.height = ALTO;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(origen, sx, sy, sw, sh, 0, 0, ANCHO, ALTO);

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', CALIDAD));
      if (!blob) throw new Error();

      this.limpiarPreview();
      this.objectUrl = URL.createObjectURL(blob);
      this.preview = this.objectUrl;
      this.quitada = false;
      this.cambio.emit({ blob, quitar: false });
    } catch {
      this.error = 'No se pudo procesar la imagen.';
    } finally {
      this.procesando = false;
    }
  }

  private limpiarPreview() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.preview = null;
  }
}

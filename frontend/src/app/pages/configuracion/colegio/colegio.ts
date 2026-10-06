import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Configuracion } from '../../../models';
import { ConfiguracionPayload, ConfiguracionService } from '../../../services/configuracion.service';
import { PermisosService } from '../../../services/permisos.service';
import { confirmDialog, showError, showSuccess } from '../../../services/confirm';
import { urlArchivo } from '../../../services/personas.service';

type Tab = 'general' | 'contrato' | 'correo';

type Form = Required<Omit<ConfiguracionPayload, 'smtp_password_borrar'>>;

const CAMPOS_TEXTO = [
  'nombre', 'direccion', 'municipio', 'departamento', 'telefonos', 'email', 'nit', 'sitio_web',
  'representante_nombre', 'representante_titulo', 'representante_fecha_nacimiento', 'representante_estado_civil',
  'representante_nacionalidad', 'representante_profesion', 'representante_dpi',
  'acreditacion', 'resolucion_diaco', 'autorizacion_servicio', 'jornada',
  'smtp_host', 'smtp_usuario', 'smtp_remitente_nombre', 'smtp_remitente_email',
] as const;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Configuración del colegio: datos generales y logotipo (login, dashboard y
 * todos los PDF), datos que llenan el contrato de adhesión y el servidor de
 * correo saliente para avisos de inscripción y comprobantes de pago.
 */
@Component({
  selector: 'app-configuracion-colegio',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './colegio.html',
  styleUrl: './colegio.scss',
})
export class ConfiguracionColegioPage implements OnInit, OnDestroy {
  tab: Tab = 'general';
  loading = true;
  saving = false;
  error = '';
  cfg: Configuracion | null = null;
  f = this.vacio();
  smtpPasswordBorrar = false;

  subiendoLogo = false;
  subiendoFirma = false;
  firmaUrl: string | null = null;

  correoPrueba = '';
  probando = false;

  readonly jornadas = ['Matutina', 'Vespertina', 'Nocturna', 'Fin de semana', 'Doble jornada'];

  constructor(
    private svc: ConfiguracionService,
    public permisos: PermisosService,
  ) {}

  get puedeE() { return this.permisos.tiene('configuracion', 'E'); }
  get logoUrl() { return urlArchivo(this.cfg?.logo); }

  ngOnInit() { this.cargar(); }

  ngOnDestroy() { this.liberarFirma(); }

  private vacio(): Form {
    const f: any = { smtp_puerto: 465, smtp_seguro: 1, notificar_inscripcion: 1, notificar_pago: 1, smtp_password: '' };
    for (const c of CAMPOS_TEXTO) f[c] = '';
    return f as Form;
  }

  private llenar(c: Configuracion) {
    this.cfg = c;
    const f: any = this.vacio();
    for (const k of CAMPOS_TEXTO) f[k] = (c as any)[k] ?? '';
    f.smtp_puerto = c.smtp_puerto ?? 465;
    f.smtp_seguro = c.smtp_seguro ? 1 : 0;
    f.notificar_inscripcion = c.notificar_inscripcion ? 1 : 0;
    f.notificar_pago = c.notificar_pago ? 1 : 0;
    this.f = f;
    this.smtpPasswordBorrar = false;
  }

  cargar() {
    this.loading = true;
    this.svc.get().subscribe({
      next: r => {
        this.loading = false;
        this.llenar(r.data!);
        if (r.data!.tiene_firma) this.cargarFirma();
        if (!this.correoPrueba) this.correoPrueba = r.data!.email || '';
      },
      error: e => { this.loading = false; showError(e?.error?.message || 'No se pudo cargar la configuración'); },
    });
  }

  // ─── Guardar ───
  private validar(): string | null {
    const f = this.f;
    if (!f.nombre?.trim()) { this.tab = 'general'; return 'El nombre del colegio es requerido.'; }
    if (f.email && !RE_EMAIL.test(f.email.trim())) { this.tab = 'general'; return 'El correo del colegio no es válido.'; }
    if (f.representante_dpi && !/^\d{13}$/.test(f.representante_dpi.replace(/[\s-]/g, ''))) { this.tab = 'contrato'; return 'El DPI del representante debe tener 13 dígitos.'; }
    if (f.smtp_remitente_email && !RE_EMAIL.test(f.smtp_remitente_email.trim())) { this.tab = 'correo'; return 'El correo del remitente no es válido.'; }
    const p = Number(f.smtp_puerto);
    if (f.smtp_host && !(Number.isInteger(p) && p > 0 && p < 65536)) { this.tab = 'correo'; return 'El puerto SMTP no es válido.'; }
    return null;
  }

  private payload(): ConfiguracionPayload {
    const { smtp_password, ...resto } = this.f;
    const data: ConfiguracionPayload = { ...resto, smtp_puerto: Number(this.f.smtp_puerto) || null };
    if (smtp_password) data.smtp_password = smtp_password;
    else if (this.smtpPasswordBorrar) data.smtp_password_borrar = true;
    return data;
  }

  guardar() {
    this.error = this.validar() ?? '';
    if (this.error) return;
    this.saving = true;
    this.svc.update(this.payload()).subscribe({
      next: r => {
        this.saving = false;
        this.llenar(r.data!);
        this.svc.cargarResumen();
        showSuccess('Configuración guardada');
      },
      error: e => { this.saving = false; this.error = e?.error?.message || 'No se pudo guardar'; },
    });
  }

  // ─── Logotipo ───
  private validarImagen(file: File, max = 2): string | null {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return 'Use una imagen PNG o JPG.';
    if (file.size > max * 1024 * 1024) return `La imagen excede ${max} MB.`;
    return null;
  }

  subirLogo(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const err = this.validarImagen(file);
    if (err) { showError(err); return; }
    this.subiendoLogo = true;
    this.svc.subirLogo(file).subscribe({
      next: r => {
        this.subiendoLogo = false;
        if (this.cfg) this.cfg.logo = r.logo;
        this.svc.cargarResumen();
        showSuccess('Logotipo actualizado');
      },
      error: e => { this.subiendoLogo = false; showError(e?.error?.message || 'No se pudo subir el logotipo'); },
    });
  }

  async quitarLogo() {
    if (!(await confirmDialog('Se quitará el logotipo del login, el dashboard y los documentos PDF.', 'Quitar logotipo', 'Quitar'))) return;
    this.svc.quitarLogo().subscribe({
      next: () => { if (this.cfg) this.cfg.logo = null; this.svc.cargarResumen(); showSuccess('Logotipo eliminado'); },
      error: e => showError(e?.error?.message || 'No se pudo quitar el logotipo'),
    });
  }

  // ─── Firma del representante ───
  private liberarFirma() {
    if (this.firmaUrl) URL.revokeObjectURL(this.firmaUrl);
    this.firmaUrl = null;
  }

  private cargarFirma() {
    this.svc.firma().subscribe({
      next: b => { this.liberarFirma(); this.firmaUrl = URL.createObjectURL(b); },
      error: () => this.liberarFirma(),
    });
  }

  subirFirma(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const err = this.validarImagen(file);
    if (err) { showError(err); return; }
    this.subiendoFirma = true;
    this.svc.subirFirma(file).subscribe({
      next: () => {
        this.subiendoFirma = false;
        if (this.cfg) this.cfg.tiene_firma = true;
        this.cargarFirma();
        showSuccess('Firma actualizada');
      },
      error: e => { this.subiendoFirma = false; showError(e?.error?.message || 'No se pudo subir la firma'); },
    });
  }

  async quitarFirma() {
    if (!(await confirmDialog('El contrato se imprimirá sin la firma escaneada del representante.', 'Quitar firma', 'Quitar'))) return;
    this.svc.quitarFirma().subscribe({
      next: () => { if (this.cfg) this.cfg.tiene_firma = false; this.liberarFirma(); showSuccess('Firma eliminada'); },
      error: e => showError(e?.error?.message || 'No se pudo quitar la firma'),
    });
  }

  // ─── Correo ───
  onSeguro() {
    // Sugerir el puerto estándar al cambiar el tipo de conexión
    const p = Number(this.f.smtp_puerto);
    if (this.f.smtp_seguro && (!p || p === 587)) this.f.smtp_puerto = 465;
    if (!this.f.smtp_seguro && (!p || p === 465)) this.f.smtp_puerto = 587;
  }

  probar() {
    const para = this.correoPrueba.trim();
    if (!RE_EMAIL.test(para)) { showError('Indique un correo válido para la prueba'); return; }
    this.probando = true;
    this.svc.probarCorreo(para, this.payload()).subscribe({
      next: () => { this.probando = false; showSuccess(`Correo de prueba enviado a ${para}`); },
      error: e => { this.probando = false; showError(e?.error?.message || 'No se pudo enviar el correo de prueba'); },
    });
  }
}

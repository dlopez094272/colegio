import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse, ColegioResumen, Configuracion } from '../models';
import { environment } from '../../environments/environment';
import { urlArchivo } from './personas.service';

const BASE = `${environment.apiUrl}/api/configuracion`;

export type ConfiguracionPayload = Partial<Omit<Configuracion, 'smtp_password_guardada' | 'tiene_firma' | 'logo' | 'fecha_modificacion'>> & {
  smtp_password?: string;
  smtp_password_borrar?: boolean;
};

/**
 * Configuración del colegio. `colegio` guarda el nombre y logotipo (y, con
 * sesión, las opciones de correo) para el login, el dashboard y el menú.
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  readonly colegio = signal<ColegioResumen | null>(null);

  constructor(private http: HttpClient) {}

  /** URL absoluta del logotipo (o null). */
  logoUrl(c: ColegioResumen | null = this.colegio()): string | null {
    return urlArchivo(c?.logo);
  }

  /** Nombre y logo sin sesión (pantalla de login). */
  cargarPublica() {
    this.http.get<ApiResponse<ColegioResumen>>(`${BASE}/publica`).subscribe({
      next: r => { if (r.data) this.colegio.set({ ...this.colegio(), ...r.data }); },
      error: () => {},
    });
  }

  /** Datos del colegio y opciones de correo (con sesión). */
  cargarResumen() {
    this.http.get<ApiResponse<ColegioResumen>>(`${BASE}/resumen`).subscribe({
      next: r => { if (r.data) this.colegio.set(r.data); },
      error: () => {},
    });
  }

  get() { return this.http.get<ApiResponse<Configuracion>>(BASE); }
  update(data: ConfiguracionPayload) { return this.http.put<ApiResponse<Configuracion>>(BASE, data); }
  probarCorreo(correos: string, smtp: ConfiguracionPayload) {
    return this.http.post<ApiResponse<any> & { destinatarios: string[] }>(`${BASE}/probar-correo`, { ...smtp, correos });
  }

  subirLogo(archivo: File) { return this.http.post<ApiResponse<any> & { logo: string }>(`${BASE}/logo`, this.form(archivo)); }
  quitarLogo() { return this.http.delete<ApiResponse<any>>(`${BASE}/logo`); }
  firma() { return this.http.get(`${BASE}/firma`, { responseType: 'blob' }); }
  subirFirma(archivo: File) { return this.http.post<ApiResponse<any>>(`${BASE}/firma`, this.form(archivo)); }
  quitarFirma() { return this.http.delete<ApiResponse<any>>(`${BASE}/firma`); }

  private form(archivo: File) {
    const fd = new FormData();
    fd.append('imagen', archivo, archivo.name);
    return fd;
  }
}

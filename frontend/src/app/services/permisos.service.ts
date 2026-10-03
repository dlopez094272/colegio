import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface PermisosState {
  isSuperAdmin: boolean;
  permissions: Record<string, string>; // tabla -> mask
}

const BASE = `${environment.apiUrl}/api`;

@Injectable({ providedIn: 'root' })
export class PermisosService {
  private state = signal<PermisosState | null>(null);
  private loading = false;
  private loadPromise: Promise<void> | null = null;
  // Cada limpiar() incrementa este contador; las respuestas de generaciones
  // anteriores son descartadas para evitar que una petición en vuelo del
  // usuario A sobreescriba los permisos del usuario B.
  private generation = 0;

  constructor(private http: HttpClient) {}

  /** Carga permisos desde el backend. Llámalo una vez al iniciar la app autenticada. */
  cargar(): void {
    void this.asegurarCargado();
  }

  /**
   * Garantiza que los permisos ya estén cargados (o que se haya intentado cargarlos).
   * Útil en guards de ruta para evitar bloquear por una carga aún en curso tras un reload.
   */
  asegurarCargado(): Promise<void> {
    if (this.state()) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;

    const gen = this.generation;
    this.loading = true;
    this.loadPromise = new Promise(resolve => {
      this.http.get<any>(`${BASE}/auth/my-permissions`).subscribe({
        next: res => {
          if (this.generation === gen) {
            this.state.set({ isSuperAdmin: res.isSuperAdmin, permissions: res.permissions || {} });
            this.loading = false;
          }
          resolve();
        },
        error: () => { this.loading = false; resolve(); },
      });
    });
    return this.loadPromise;
  }

  /** Limpia los permisos al cerrar sesión. Invalida cualquier petición en vuelo. */
  limpiar(): void {
    this.generation++;
    this.state.set(null);
    this.loading = false;
    this.loadPromise = null;
  }

  /** Verifica si el usuario tiene el acceso indicado sobre una tabla. */
  tiene(tabla: string, acceso: string): boolean {
    const s = this.state();
    if (!s) return false;
    if (s.isSuperAdmin) return true;
    return (s.permissions[tabla] || '').includes(acceso);
  }

  puedeListar(tabla: string)    { return this.tiene(tabla, 'S'); }
  puedeAgregar(tabla: string)   { return this.tiene(tabla, 'A'); }
  puedeEditar(tabla: string)    { return this.tiene(tabla, 'E'); }
  puedeEliminar(tabla: string)  { return this.tiene(tabla, 'D'); }
  isSuperAdmin(): boolean       { return this.state()?.isSuperAdmin ?? false; }
}

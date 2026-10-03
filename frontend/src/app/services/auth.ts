import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Usuario } from '../models';
import { PermisosService } from './permisos.service';
import { SessionService } from './session.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = `${environment.apiUrl}/api/auth`;

  usuario = signal<Usuario | null>(null);

  private permisos = inject(PermisosService);
  private session  = inject(SessionService);

  constructor(private http: HttpClient, private router: Router) {
    const savedUser = localStorage.getItem('col_user');
    if (savedUser) {
      this.usuario.set(JSON.parse(savedUser));
      setTimeout(() => this.permisos.cargar(), 0);
    }
  }

  login(codigo: string, password: string) {
    return this.http.post<any>(`${this.API}/login`, { codigo, password }).pipe(
      tap(res => this.persistSession(res))
    );
  }

  private persistSession(res: any) {
    localStorage.setItem('col_token', res.token);
    localStorage.setItem('col_user',  JSON.stringify(res.usuario));
    this.usuario.set(res.usuario);
    this.permisos.limpiar();
    setTimeout(() => this.permisos.cargar(), 0);
  }

  logout() {
    // Detiene el temporizador de inactividad ANTES de navegar y limpia todo
    // el estado de sesión para que otro usuario pueda iniciar sesión limpiamente
    // en la misma computadora.
    this.session.stop();
    this.clearSession();
    this.router.navigate(['/login']);
  }

  private clearSession() {
    localStorage.removeItem('col_token');
    localStorage.removeItem('col_user');
    this.usuario.set(null);
    // Invalida cualquier carga de permisos en vuelo del usuario anterior
    this.permisos.limpiar();
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('col_token');
  }

  isSuperAdmin(): boolean {
    return !!(this.usuario()?.isSuperAdmin);
  }

  isPrimer(): boolean {
    return !!(this.usuario()?.primer);
  }

  getToken(): string | null {
    return localStorage.getItem('col_token');
  }
}

import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { LayoutService } from '../../services/layout.service';

@Component({
  selector: 'app-navbar',
  imports: [],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  pageTitle = '';

  private readonly TITLES: Record<string, string> = {
    '/dashboard':                 'Inicio',
    '/comunidad/estudiantes':     'Estudiantes',
    '/comunidad/padres':          'Padres de familia',
    '/catalogos/estados-civiles': 'Catálogo de estados civiles',
    '/configuracion/colegio':     'Datos del colegio',
    '/seguridad/usuarios':        'Usuarios del sistema',
    '/seguridad/grupos':          'Usuarios y grupos',
    '/seguridad/permisos':        'Permisos',
    '/seguridad/bitacora':        'Bitácora del sistema',
  };

  constructor(
    private router: Router,
    public auth: AuthService,
    public layout: LayoutService,
  ) {
    // El navbar se crea después de la primera navegación: tomar el título actual de una vez
    this.setTitle(this.router.url);
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => this.setTitle((e as NavigationEnd).urlAfterRedirects));
  }

  private setTitle(url: string) {
    this.pageTitle = this.TITLES[url.split('?')[0]] ?? 'Gestión Escolar';
  }

  get fecha() {
    const f = new Date().toLocaleDateString('es-GT', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return f.charAt(0).toUpperCase() + f.slice(1);
  }

  get displayName(): string {
    const u = this.auth.usuario();
    return u?.nombre || u?.codigo || 'Usuario';
  }

  get avatarLetter(): string {
    return this.displayName.charAt(0).toUpperCase();
  }

  get userRole(): string {
    return this.auth.isSuperAdmin() ? 'Administrador' : (this.auth.usuario()?.codigo ?? '');
  }
}

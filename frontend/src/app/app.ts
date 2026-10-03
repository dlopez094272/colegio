import { Component, OnInit, effect } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, NavigationError } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Sidebar } from './layout/sidebar/sidebar';
import { Navbar } from './layout/navbar/navbar';
import { SessionWarning } from './components/session-warning/session-warning';
import { CambiarPassword } from './components/cambiar-password/cambiar-password';
import { AuthService } from './services/auth';
import { SessionService } from './services/session.service';
import { LayoutService } from './services/layout.service';
import { AppUpdateService } from './services/app-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar, Navbar, SessionWarning, CambiarPassword],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  constructor(
    public auth: AuthService,
    public session: SessionService,
    public layout: LayoutService,
    public router: Router,
    public appUpdate: AppUpdateService,
  ) {
    // Si la sesión expira por inactividad, cierra sesión por completo.
    effect(() => {
      if (this.session.state() === 'expired') {
        this.auth.logout();
      }
    });
  }

  ngOnInit() {
    this.appUpdate.init();

    // Arranca / para el timer de inactividad según la ruta
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => {
        const url = (e as NavigationEnd).urlAfterRedirects;
        this.layout.closeMobile();
        if (url.startsWith('/login')) {
          this.session.stop();
        } else if (this.auth.isLoggedIn()) {
          this.session.start();
        }
      });

    // Tras un deploy nuevo, un chunk lazy viejo puede ya no existir: recargar solos.
    this.router.events
      .pipe(filter(e => e instanceof NavigationError))
      .subscribe(e => {
        const navError = e as NavigationError;
        if (this.appUpdate.isStaleChunkError(navError.error)) {
          this.appUpdate.recoverFromStaleChunk(navError.url);
        }
      });
  }

  get showShell(): boolean {
    const url = this.router.url;
    return this.auth.isLoggedIn() &&
           !url.startsWith('/login') &&
           !url.startsWith('/reset-password');
  }

  get showWarning(): boolean {
    return this.showShell && this.session.state() === 'warning';
  }

  // Muestra el modal de cambio obligatorio cuando primer=1
  get showPrimer(): boolean {
    return this.showShell && this.auth.isPrimer();
  }
}

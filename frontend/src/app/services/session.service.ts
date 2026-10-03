import { Injectable, signal, NgZone, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

export type SessionState = 'active' | 'warning' | 'expired';

const INACTIVITY_MS   = 2 * 60 * 60 * 1000;  // 2 horas
const WARNING_BEFORE  =  2 * 60 * 1000;  // Aviso 2 min antes del cierre
const TICK_MS         = 10 * 1000;        // Revisa cada 10 segundos

@Injectable({ providedIn: 'root' })
export class SessionService implements OnDestroy {
  state        = signal<SessionState>('active');
  countdown    = signal<number>(0);          // segundos restantes en aviso

  private lastActivity = Date.now();
  private tickInterval?: ReturnType<typeof setInterval>;
  private countdownInterval?: ReturnType<typeof setInterval>;
  private routeSub?: Subscription;
  private currentRoute = '/dashboard';
  private active = false;

  private readonly EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

  constructor(private ngZone: NgZone, private router: Router) {
    // Guarda la ruta actual para recuperación tras re-auth
    this.routeSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => {
        this.currentRoute = (e as NavigationEnd).urlAfterRedirects;
      });
  }

  /** Llama al iniciar sesión */
  start() {
    // Siempre reinicia el reloj y el estado, aunque ya estuviera "activo":
    // evita que un lastActivity viejo (de una sesión anterior mal cerrada)
    // dispare un bloqueo por inactividad inmediatamente después de loguear.
    this.resetTimer();
    clearInterval(this.countdownInterval);
    this.state.set('active');
    if (this.active) return;
    this.active = true;
    this.attachListeners();
    this.ngZone.runOutsideAngular(() => {
      this.tickInterval = setInterval(() => this.tick(), TICK_MS);
    });
  }

  /** Llama al cerrar sesión */
  stop() {
    this.active = false;
    this.detachListeners();
    clearInterval(this.tickInterval);
    clearInterval(this.countdownInterval);
    this.state.set('active');
  }

  /** Reinicia el timer de inactividad (tras re-auth exitosa) */
  reset() {
    this.resetTimer();
    clearInterval(this.countdownInterval);
    this.state.set('active');
  }

  /** Fuerza el estado expirado (p.ej. cuando el backend devuelve 401) */
  forceExpired() {
    clearInterval(this.countdownInterval);
    this.state.set('expired');
  }

  /** Ruta guardada para restaurar tras re-auth */
  get savedRoute(): string {
    return this.currentRoute;
  }

  private resetTimer() {
    this.lastActivity = Date.now();
  }

  private tick() {
    if (!this.active) return;
    const elapsed = Date.now() - this.lastActivity;
    const remaining = INACTIVITY_MS - elapsed;

    this.ngZone.run(() => {
      if (remaining <= 0) {
        this.triggerExpired();
      } else if (remaining <= WARNING_BEFORE && this.state() === 'active') {
        this.triggerWarning(Math.floor(remaining / 1000));
      } else if (remaining > WARNING_BEFORE && this.state() === 'warning') {
        // El usuario movió el mouse y ya no está en zona de alerta
        clearInterval(this.countdownInterval);
        this.state.set('active');
      }
    });
  }

  private triggerWarning(secondsLeft: number) {
    this.state.set('warning');
    this.countdown.set(secondsLeft);
    clearInterval(this.countdownInterval);
    this.ngZone.runOutsideAngular(() => {
      this.countdownInterval = setInterval(() => {
        this.ngZone.run(() => {
          const secs = this.countdown() - 1;
          if (secs <= 0) {
            clearInterval(this.countdownInterval);
            this.triggerExpired();
          } else {
            this.countdown.set(secs);
          }
        });
      }, 1000);
    });
  }

  private triggerExpired() {
    clearInterval(this.countdownInterval);
    this.state.set('expired');
  }

  private onActivity = () => {
    this.lastActivity = Date.now();
    // Si estaba en advertencia y volvió a hacer actividad, cancela advertencia
    if (this.state() === 'warning') {
      clearInterval(this.countdownInterval);
      this.ngZone.run(() => this.state.set('active'));
    }
  };

  private attachListeners() {
    this.EVENTS.forEach(e => window.addEventListener(e, this.onActivity, { passive: true }));
  }

  private detachListeners() {
    this.EVENTS.forEach(e => window.removeEventListener(e, this.onActivity));
  }

  ngOnDestroy() {
    this.stop();
    this.routeSub?.unsubscribe();
  }
}

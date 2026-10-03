import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionService } from '../services/session.service';

/**
 * Intercepta respuestas 401 (token expirado o inválido).
 * - Si hay token en localStorage: marca la sesión como expirada (cierra sesión).
 * - Si no hay token (sesión cerrada en otra pestaña): redirige a login.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const router  = inject(Router);

  return next(req).pipe(
    catchError(err => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // No forzar cierre en el endpoint de login para evitar loops
        if (!req.url.includes('/api/auth/login')) {
          if (localStorage.getItem('col_token')) {
            session.forceExpired();
          } else {
            router.navigate(['/login']);
          }
        }
      }
      return throwError(() => err);
    })
  );
};

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { SessionService } from '../services/session.service';

export const authGuard: CanActivateFn = () => {
  const auth    = inject(AuthService);
  const session = inject(SessionService);
  const router  = inject(Router);

  if (auth.isLoggedIn()) {
    session.start();   // Asegura que el timer corre si el usuario recarga la página
    return true;
  }

  return router.createUrlTree(['/login']);
};

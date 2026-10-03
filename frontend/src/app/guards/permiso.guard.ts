import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { PermisosService } from '../services/permisos.service';

/** Bloquea el acceso directo por URL a un módulo si el usuario no tiene permiso de Listar sobre `tabla`. */
export function permisoGuard(tabla: string): CanActivateFn {
  return async () => {
    const auth     = inject(AuthService);
    const permisos = inject(PermisosService);
    const router   = inject(Router);

    if (auth.isSuperAdmin()) return true;

    await permisos.asegurarCargado();
    if (permisos.puedeListar(tabla)) return true;

    return router.createUrlTree(['/dashboard']);
  };
}

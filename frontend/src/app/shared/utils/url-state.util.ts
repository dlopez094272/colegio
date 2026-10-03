import { Params, ActivatedRoute, Router } from '@angular/router';

// Sincroniza el estado de búsqueda/filtros/orden/paginación de un listado con
// los query params de la URL, para que el usuario no pierda su lugar al
// navegar y pueda compartir un link con el filtro/página exactos.
// Reutilizado por todos los listados del ERP.

export function readStateFromUrl(route: ActivatedRoute): Record<string, string> {
  return { ...route.snapshot.queryParams };
}

export interface SyncStateToUrlOptions {
  /** Valores que, si el estado los iguala, se omiten de la URL (ej. page: 1). */
  defaults?: Record<string, string | number | boolean>;
  /** Claves de query params ajenas a este estado que no deben tocarse (ej. 'returnUrl'). */
  preserveKeys?: string[];
}

export function syncStateToUrl(
  router: Router,
  route: ActivatedRoute,
  state: Record<string, string | number | boolean | null | undefined>,
  opts: SyncStateToUrlOptions = {},
): void {
  const { defaults = {}, preserveKeys = [] } = opts;
  const current = route.snapshot.queryParams;
  const queryParams: Params = {};

  for (const [key, value] of Object.entries(state)) {
    const esDefault = key in defaults && String(value) === String(defaults[key]);
    const vacio = value === undefined || value === null || value === '' || value === false;
    queryParams[key] = (vacio || esDefault) ? null : String(value);
  }

  for (const key of Object.keys(current)) {
    if (!(key in state) && !preserveKeys.includes(key)) queryParams[key] = null;
  }

  router.navigate([], { relativeTo: route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
}

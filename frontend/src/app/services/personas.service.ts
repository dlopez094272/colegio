import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, PagedResponse, PersonaDatos, PersonaRegistro, VinculoPayload } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api`;

/** 'padres' | 'estudiantes' — ambos módulos exponen la misma API. */
export type TipoPersona = 'padres' | 'estudiantes';

export type PersonaPayload = Partial<PersonaDatos> & { activo?: number; vinculos?: VinculoPayload[] };

function toParams(opts: Record<string, string | number | boolean | null | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(opts)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, value === true ? '1' : value === false ? '0' : String(value));
  }
  return params;
}

/** URL pública de un archivo subido (ruta relativa guardada en BD, ej. files/estudiantes/x.jpg). */
export function urlArchivo(ruta: string | null | undefined): string | null {
  return ruta ? `${environment.apiUrl}/${ruta}` : null;
}

@Injectable({ providedIn: 'root' })
export class PersonasService {
  constructor(private http: HttpClient) {}

  // opts admite page/pageSize/search/sortField/sortDir/activo y los filtros del backend
  getAll(tipo: TipoPersona, opts: Record<string, string | number | boolean | null | undefined> = {}): Observable<PagedResponse<PersonaRegistro>> {
    return this.http.get<PagedResponse<PersonaRegistro>>(`${BASE}/${tipo}?${toParams(opts)}`);
  }

  buscar(tipo: TipoPersona, q: string, excluir: number[] = [], limit = 8): Observable<ApiResponse<PersonaRegistro[]>> {
    const params = toParams({ q, limit, excluir: excluir.join(',') });
    return this.http.get<ApiResponse<PersonaRegistro[]>>(`${BASE}/${tipo}/buscar?${params}`);
  }

  getById(tipo: TipoPersona, id: number): Observable<ApiResponse<PersonaRegistro>> {
    return this.http.get<ApiResponse<PersonaRegistro>>(`${BASE}/${tipo}/${id}`);
  }

  create(tipo: TipoPersona, data: PersonaPayload): Observable<ApiResponse<PersonaRegistro> & { id: number }> {
    return this.http.post<ApiResponse<PersonaRegistro> & { id: number }>(`${BASE}/${tipo}`, data);
  }

  update(tipo: TipoPersona, id: number, data: PersonaPayload): Observable<ApiResponse<PersonaRegistro>> {
    return this.http.put<ApiResponse<PersonaRegistro>>(`${BASE}/${tipo}/${id}`, data);
  }

  /** Sube la fotografía del estudiante (ya recortada/comprimida en el navegador). */
  subirFoto(id: number, foto: Blob): Observable<ApiResponse<any> & { foto: string }> {
    const fd = new FormData();
    fd.append('foto', foto, 'foto.jpg');
    return this.http.post<ApiResponse<any> & { foto: string }>(`${BASE}/estudiantes/${id}/foto`, fd);
  }

  quitarFoto(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${BASE}/estudiantes/${id}/foto`);
  }

  toggleActive(tipo: TipoPersona, id: number): Observable<ApiResponse<any> & { activo: number }> {
    return this.http.patch<ApiResponse<any> & { activo: number }>(`${BASE}/${tipo}/${id}/toggle-active`, {});
  }
}

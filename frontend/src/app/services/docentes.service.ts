import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, Docente, PagedResponse } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/docentes`;

export type DocentePayload = Partial<Omit<Docente, 'formaciones'>> & { formaciones?: number[] };

function toParams(opts: Record<string, string | number | boolean | null | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(opts)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, value === true ? '1' : value === false ? '0' : String(value));
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class DocentesService {
  constructor(private http: HttpClient) {}

  // opts admite page/pageSize/search/sortField/sortDir/activo/tipo_personal/idformaciones_academicas
  getAll(opts: Record<string, string | number | boolean | null | undefined> = {}): Observable<PagedResponse<Docente>> {
    return this.http.get<PagedResponse<Docente>>(`${BASE}?${toParams(opts)}`);
  }

  getById(id: number): Observable<ApiResponse<Docente>> {
    return this.http.get<ApiResponse<Docente>>(`${BASE}/${id}`);
  }

  create(data: DocentePayload): Observable<ApiResponse<Docente> & { id: number }> {
    return this.http.post<ApiResponse<Docente> & { id: number }>(BASE, data);
  }

  update(id: number, data: DocentePayload): Observable<ApiResponse<Docente>> {
    return this.http.put<ApiResponse<Docente>>(`${BASE}/${id}`, data);
  }

  /** Sube la fotografía del docente (ya recortada/comprimida en el navegador). */
  subirFoto(id: number, foto: Blob): Observable<ApiResponse<any> & { foto: string }> {
    const fd = new FormData();
    fd.append('foto', foto, 'foto.jpg');
    return this.http.post<ApiResponse<any> & { foto: string }>(`${BASE}/${id}/foto`, fd);
  }

  quitarFoto(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${BASE}/${id}/foto`);
  }

  toggleActive(id: number): Observable<ApiResponse<any> & { activo: number }> {
    return this.http.patch<ApiResponse<any> & { activo: number }>(`${BASE}/${id}/toggle-active`, {});
  }
}

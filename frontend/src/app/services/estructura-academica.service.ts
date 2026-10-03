import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, Nivel, TipoEstructura } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/estructura-academica`;

export interface EstructuraPayload {
  nombre?: string;
  nombres?: string[];
  idniveles?: number | null;
  idcarreras?: number | null;
  idgrados?: number | null;
  orden?: number | null;
  usa_carreras?: number;
  activo?: number;
}

/** Registros que cambiaron en una activación/inactivación en cascada, por entidad. */
export type CambiosCascada = Partial<Record<'niveles' | 'carreras' | 'grados' | 'secciones', number>>;

@Injectable({ providedIn: 'root' })
export class EstructuraAcademicaService {
  constructor(private http: HttpClient) {}

  arbol(): Observable<ApiResponse<Nivel[]>> {
    return this.http.get<ApiResponse<Nivel[]>>(`${BASE}/arbol`);
  }
  create(tipo: TipoEstructura, data: EstructuraPayload) {
    return this.http.post<ApiResponse<any> & { ids: number[] }>(`${BASE}/${tipo}`, data);
  }
  update(tipo: TipoEstructura, id: number, data: EstructuraPayload) {
    return this.http.put<ApiResponse<any> & { cambios: CambiosCascada | null }>(`${BASE}/${tipo}/${id}`, data);
  }
  estado(tipo: TipoEstructura, id: number, activo: boolean) {
    return this.http.patch<ApiResponse<any> & { cambios: CambiosCascada }>(`${BASE}/${tipo}/${id}/estado`, { activo: activo ? 1 : 0 });
  }
  delete(tipo: TipoEstructura, id: number) {
    return this.http.delete<ApiResponse<any>>(`${BASE}/${tipo}/${id}`);
  }
}

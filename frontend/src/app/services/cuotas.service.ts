import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, CicloCuotas, Cuota, CuotaCiclo } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/cuotas`;

export type CuotaConfigPayload = Pick<CuotaCiclo, 'fecha_inicio' | 'fecha_fin' | 'dia_limite' | 'mora_tipo' | 'mora_valor'>;

/** Alta / edición del catálogo (orden vacío = al final). */
export type CuotaPayload = Partial<Omit<Cuota, 'orden'>> & { orden?: number | null };

export interface CambioMonto {
  idcuotas_ciclos: number;
  idgrados: number;
  monto: number | null;
}

export interface CopiarCicloPayload {
  origen: number;
  destino: number;
  ajuste: number;
  redondeo: 0 | 1 | 5 | 10;
}

export interface CopiarCicloResult {
  cuotas: number;
  montos: number;
  omitidas: { cuota: string; motivo: string }[];
}

@Injectable({ providedIn: 'root' })
export class CuotasService {
  constructor(private http: HttpClient) {}

  // Catálogo
  getAll(soloActivas = false): Observable<ApiResponse<Cuota[]>> {
    return this.http.get<ApiResponse<Cuota[]>>(`${BASE}${soloActivas ? '?activos=1' : ''}`);
  }
  create(data: CuotaPayload) { return this.http.post<ApiResponse<any> & { id: number }>(BASE, data); }
  update(id: number, data: CuotaPayload) { return this.http.put<ApiResponse<any>>(`${BASE}/${id}`, data); }
  delete(id: number) { return this.http.delete<ApiResponse<any>>(`${BASE}/${id}`); }

  // Ciclos
  ciclos(): Observable<ApiResponse<{ ciclo: number; cuotas: number }[]>> {
    return this.http.get<ApiResponse<{ ciclo: number; cuotas: number }[]>>(`${BASE}/ciclos`);
  }
  ciclo(ciclo: number): Observable<ApiResponse<CicloCuotas>> {
    return this.http.get<ApiResponse<CicloCuotas>>(`${BASE}/ciclos/${ciclo}`);
  }
  agregarAlCiclo(ciclo: number, data: CuotaConfigPayload & { idcuotas: number }) {
    return this.http.post<ApiResponse<any> & { id: number }>(`${BASE}/ciclos/${ciclo}/cuotas`, data);
  }
  updateConfig(id: number, data: CuotaConfigPayload) { return this.http.put<ApiResponse<any>>(`${BASE}/config/${id}`, data); }
  deleteConfig(id: number) { return this.http.delete<ApiResponse<any>>(`${BASE}/config/${id}`); }
  guardarMontos(ciclo: number, cambios: CambioMonto[]) {
    return this.http.put<ApiResponse<any> & { cambios: number }>(`${BASE}/ciclos/${ciclo}/montos`, { cambios });
  }
  copiarCiclo(data: CopiarCicloPayload) {
    return this.http.post<ApiResponse<any> & CopiarCicloResult>(`${BASE}/ciclos/copiar`, data);
  }
}

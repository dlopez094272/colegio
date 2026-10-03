import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, ContextoEstudiante, CuotaGrado, EstadoCuenta, Inscripcion, OpcionesInscripcion, PagedResponse } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/inscripciones`;

export interface InscripcionPayload {
  idestudiantes: number;
  ciclo: number;
  idgrados: number;
  idsecciones: number | null;
  idpadres: number | null;
  fecha_inscripcion: string;
  observaciones: string;
  opcionales: number[];
}

export type InscripcionUpdate = Pick<InscripcionPayload, 'idsecciones' | 'idpadres' | 'fecha_inscripcion' | 'observaciones'>;

function toParams(opts: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
}

@Injectable({ providedIn: 'root' })
export class InscripcionesService {
  constructor(private http: HttpClient) {}

  getAll(opts: Record<string, string | number | null | undefined>): Observable<PagedResponse<Inscripcion>> {
    return this.http.get<PagedResponse<Inscripcion>>(`${BASE}?${toParams(opts)}`);
  }
  getById(id: number) { return this.http.get<ApiResponse<Inscripcion>>(`${BASE}/${id}`); }

  // Formulario
  opciones() { return this.http.get<ApiResponse<OpcionesInscripcion>>(`${BASE}/opciones`); }
  cuotasGrado(ciclo: number, idgrados: number) {
    return this.http.get<ApiResponse<CuotaGrado[]>>(`${BASE}/cuotas-grado?${toParams({ ciclo, idgrados })}`);
  }
  contextoEstudiante(id: number) { return this.http.get<ApiResponse<ContextoEstudiante>>(`${BASE}/estudiante/${id}`); }

  create(data: InscripcionPayload) {
    return this.http.post<ApiResponse<any> & { id: number; codigo: string; cargos: number; sinCuotas: boolean }>(BASE, data);
  }
  update(id: number, data: InscripcionUpdate) { return this.http.put<ApiResponse<any>>(`${BASE}/${id}`, data); }
  anular(id: number, motivo: string) { return this.http.post<ApiResponse<any>>(`${BASE}/${id}/anular`, { motivo }); }

  // Estado de cuenta
  estadoCuenta(id: number) { return this.http.get<ApiResponse<EstadoCuenta>>(`${BASE}/${id}/estado-cuenta`); }
  estadoCuentaPdf(id: number): Observable<Blob> {
    return this.http.get(`${BASE}/${id}/estado-cuenta/pdf`, { responseType: 'blob' });
  }
  agregarCuotas(id: number, idcuotas_ciclos: number[]) {
    return this.http.post<ApiResponse<any> & { cargos: number }>(`${BASE}/${id}/cargos`, { idcuotas_ciclos });
  }
  anularCargo(idCargo: number, motivo: string) { return this.http.patch<ApiResponse<any>>(`${BASE}/cargos/${idCargo}/anular`, { motivo }); }
  restaurarCargo(idCargo: number) { return this.http.patch<ApiResponse<any>>(`${BASE}/cargos/${idCargo}/restaurar`, {}); }

  // Contrato
  contratoPdf(id: number): Observable<Blob> { return this.http.get(`${BASE}/${id}/contrato`, { responseType: 'blob' }); }
  contratoFirmado(id: number): Observable<Blob> { return this.http.get(`${BASE}/${id}/contrato-firmado`, { responseType: 'blob' }); }
  subirContrato(id: number, archivo: File) {
    const fd = new FormData();
    fd.append('archivo', archivo, archivo.name);
    return this.http.post<ApiResponse<any>>(`${BASE}/${id}/contrato-firmado`, fd);
  }
  quitarContrato(id: number) { return this.http.delete<ApiResponse<any>>(`${BASE}/${id}/contrato-firmado`); }
}

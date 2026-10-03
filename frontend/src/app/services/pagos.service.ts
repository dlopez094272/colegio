import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, FormaPago, PagadorBusqueda, Pago, PageMeta, PendientesPago } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/pagos`;

export interface PagoPayload {
  fecha_pago: string;
  idpadres: number | null;
  pagador_nombre: string;
  pagador_nit: string;
  forma_pago: FormaPago;
  referencia: string;
  observaciones: string;
  cargos: { idinscripciones_cargos: number; exonerar_mora: boolean }[];
}

function toParams(opts: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
}

@Injectable({ providedIn: 'root' })
export class PagosService {
  constructor(private http: HttpClient) {}

  getAll(opts: Record<string, string | number | null | undefined>) {
    return this.http.get<{ success: boolean; data: Pago[]; meta: PageMeta & { total_cobrado: number } }>(`${BASE}?${toParams(opts)}`);
  }
  getById(id: number) { return this.http.get<ApiResponse<Pago>>(`${BASE}/${id}`); }

  buscar(q: string) { return this.http.get<ApiResponse<PagadorBusqueda[]>>(`${BASE}/buscar?${toParams({ q })}`); }
  pendientes(sel: { idpadres?: number; idestudiantes?: number }, fecha: string) {
    return this.http.get<ApiResponse<PendientesPago>>(`${BASE}/pendientes?${toParams({ ...sel, fecha })}`);
  }

  create(data: PagoPayload) {
    return this.http.post<ApiResponse<any> & { id: number; numero: number; total: number }>(BASE, data);
  }
  anular(id: number, motivo: string) { return this.http.post<ApiResponse<any>>(`${BASE}/${id}/anular`, { motivo }); }

  reciboPdf(id: number): Observable<Blob> { return this.http.get(`${BASE}/${id}/recibo`, { responseType: 'blob' }); }
}

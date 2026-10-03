import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, EstadoCivil } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/estados-civiles`;

@Injectable({ providedIn: 'root' })
export class EstadosCivilesService {
  constructor(private http: HttpClient) {}

  getAll(todos = false): Observable<ApiResponse<EstadoCivil[]>> {
    return this.http.get<ApiResponse<EstadoCivil[]>>(`${BASE}${todos ? '?todos=1' : ''}`);
  }
  create(data: Partial<EstadoCivil>) { return this.http.post<ApiResponse<any>>(BASE, data); }
  update(id: number, data: Partial<EstadoCivil>) { return this.http.put<ApiResponse<any>>(`${BASE}/${id}`, data); }
  delete(id: number) { return this.http.delete<ApiResponse<any>>(`${BASE}/${id}`); }
}

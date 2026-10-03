import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, FormacionAcademica } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/formaciones-academicas`;

@Injectable({ providedIn: 'root' })
export class FormacionesAcademicasService {
  constructor(private http: HttpClient) {}

  getAll(todos = false): Observable<ApiResponse<FormacionAcademica[]>> {
    return this.http.get<ApiResponse<FormacionAcademica[]>>(`${BASE}${todos ? '?todos=1' : ''}`);
  }
  create(data: Partial<FormacionAcademica>) {
    return this.http.post<ApiResponse<FormacionAcademica> & { id: number }>(BASE, data);
  }
  update(id: number, data: Partial<FormacionAcademica>) { return this.http.put<ApiResponse<any>>(`${BASE}/${id}`, data); }
  delete(id: number) { return this.http.delete<ApiResponse<any>>(`${BASE}/${id}`); }
}

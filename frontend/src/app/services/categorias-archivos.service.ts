import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, CategoriaArchivo } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/categorias-archivos`;

@Injectable({ providedIn: 'root' })
export class CategoriasArchivosService {
  constructor(private http: HttpClient) {}

  getAll(todos = false): Observable<ApiResponse<CategoriaArchivo[]>> {
    return this.http.get<ApiResponse<CategoriaArchivo[]>>(`${BASE}${todos ? '?todos=1' : ''}`);
  }
  create(data: Partial<CategoriaArchivo>) { return this.http.post<ApiResponse<any>>(BASE, data); }
  update(id: number, data: Partial<CategoriaArchivo>) { return this.http.put<ApiResponse<any>>(`${BASE}/${id}`, data); }
  delete(id: number) { return this.http.delete<ApiResponse<any>>(`${BASE}/${id}`); }
}

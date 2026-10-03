import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, EstudianteArchivo } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api/estudiantes`;

/** Expediente de archivos del estudiante. Los archivos NO son públicos: se piden con token como Blob. */
@Injectable({ providedIn: 'root' })
export class EstudianteArchivosService {
  constructor(private http: HttpClient) {}

  listar(idestudiante: number): Observable<ApiResponse<EstudianteArchivo[]>> {
    return this.http.get<ApiResponse<EstudianteArchivo[]>>(`${BASE}/${idestudiante}/archivos`);
  }

  subir(idestudiante: number, archivo: File, idcategorias_archivos: number, observaciones = ''): Observable<ApiResponse<EstudianteArchivo>> {
    const fd = new FormData();
    fd.append('idcategorias_archivos', String(idcategorias_archivos));
    if (observaciones.trim()) fd.append('observaciones', observaciones.trim());
    fd.append('archivo', archivo, archivo.name);
    return this.http.post<ApiResponse<EstudianteArchivo>>(`${BASE}/${idestudiante}/archivos`, fd);
  }

  /** Contenido del archivo; `descargar` fuerza application/octet-stream en el servidor. */
  obtener(idestudiante: number, idarchivo: number, descargar = false): Observable<Blob> {
    return this.http.get(`${BASE}/${idestudiante}/archivos/${idarchivo}${descargar ? '?descargar=1' : ''}`, { responseType: 'blob' });
  }

  eliminar(idestudiante: number, idarchivo: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${BASE}/${idestudiante}/archivos/${idarchivo}`);
  }
}

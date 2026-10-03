import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BitacoraRegistro, PagedResponse, PaginationOpts } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api`;

@Injectable({ providedIn: 'root' })
export class BitacoraService {
  constructor(private http: HttpClient) {}

  getByRegistro(
    tabla: string,
    idregistro: number,
    opts: PaginationOpts = {}
  ): Observable<PagedResponse<BitacoraRegistro>> {
    const params = new URLSearchParams({ tabla, idregistro: String(idregistro) });
    if (opts.page)     params.set('page',     String(opts.page));
    if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
    return this.http.get<any>(`${BASE}/bitacora?${params}`);
  }

  getAll(opts: {
    tabla?: string;
    accion?: string;
    idusuarios?: number;
    fecha_desde?: string;
    fecha_hasta?: string;
    search?: string;
  } & PaginationOpts = {}): Observable<PagedResponse<BitacoraRegistro>> {
    const params = new URLSearchParams();
    if (opts.tabla)       params.set('tabla',       opts.tabla);
    if (opts.accion)      params.set('accion',      opts.accion);
    if (opts.idusuarios)  params.set('idusuarios',  String(opts.idusuarios));
    if (opts.fecha_desde) params.set('fecha_desde', opts.fecha_desde);
    if (opts.fecha_hasta) params.set('fecha_hasta', opts.fecha_hasta);
    if (opts.search)      params.set('search',      opts.search);
    if (opts.page)        params.set('page',        String(opts.page));
    if (opts.pageSize)    params.set('pageSize',    String(opts.pageSize));
    return this.http.get<any>(`${BASE}/bitacora/all?${params}`);
  }
}

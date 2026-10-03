import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GrupoSeguridad, PermisosTabla, UsuarioCrud, ApiResponse, PagedResponse, PaginationOpts } from '../models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/api`;

@Injectable({ providedIn: 'root' })
export class SeguridadService {
  constructor(private http: HttpClient) {}

  // ─── Usuarios CRUD ────────────────────────────────────────
  // opts admite page/pageSize/search/sortField/sortDir y cualquier campo del
  // whitelist de filtros del backend (ver FILTER_FIELDS en usuarioCrudModel.js)
  getUsuarios(opts: Record<string, string | number | boolean | null | undefined> = {}): Observable<PagedResponse<UsuarioCrud>> {
    const params = new URLSearchParams({ page: String(opts['page'] ?? 1) });
    for (const [key, value] of Object.entries(opts)) {
      if (key === 'page') continue;
      if (value === undefined || value === null || value === '' || value === false) continue;
      params.set(key, value === true ? '1' : String(value));
    }
    return this.http.get<any>(`${BASE}/admin/usuarios?${params}`);
  }
  getUsuario(id: number): Observable<ApiResponse<UsuarioCrud>> {
    return this.http.get<ApiResponse<UsuarioCrud>>(`${BASE}/admin/usuarios/${id}`);
  }
  createUsuario(data: any) { return this.http.post<ApiResponse<any>>(`${BASE}/admin/usuarios`, data); }
  updateUsuario(id: number, data: any) { return this.http.put<ApiResponse<any>>(`${BASE}/admin/usuarios/${id}`, data); }
  toggleActive(id: number) { return this.http.patch<ApiResponse<any>>(`${BASE}/admin/usuarios/${id}/toggle-active`, {}); }
  changePassword(id: number, password: string) {
    return this.http.put<ApiResponse<any>>(`${BASE}/admin/usuarios/${id}/password`, { password });
  }

  // ─── Grupos de seguridad ──────────────────────────────────
  getGroups(): Observable<ApiResponse<GrupoSeguridad[]>> {
    return this.http.get<ApiResponse<GrupoSeguridad[]>>(`${BASE}/seguridad/groups`);
  }
  createGroup(label: string) { return this.http.post<ApiResponse<any>>(`${BASE}/seguridad/groups`, { label }); }
  updateGroup(id: number, label: string) { return this.http.put<ApiResponse<any>>(`${BASE}/seguridad/groups/${id}`, { label }); }
  deleteGroup(id: number) { return this.http.delete<ApiResponse<any>>(`${BASE}/seguridad/groups/${id}`); }

  // ─── Usuarios con grupos ──────────────────────────────────
  getUsersWithGroups(opts: PaginationOpts & { sortField?: string; sortDir?: 'ASC' | 'DESC' } = {}): Observable<any> {
    const params = new URLSearchParams({ page: String(opts.page ?? 1) });
    if (opts.pageSize)  params.set('pageSize',  String(opts.pageSize));
    if (opts.search)    params.set('search',    opts.search ?? '');
    if (opts.sortField) params.set('sortField', opts.sortField);
    if (opts.sortField) params.set('sortDir',   opts.sortDir ?? 'ASC');
    return this.http.get<any>(`${BASE}/seguridad/users-groups?${params}`);
  }
  toggleMember(codigo: string, groupId: number, add: boolean) {
    return this.http.post<ApiResponse<any>>(`${BASE}/seguridad/toggle-member`, { codigo, groupId, add });
  }

  // ─── Permisos ─────────────────────────────────────────────
  getTables(): Observable<ApiResponse<string[]>> {
    return this.http.get<ApiResponse<string[]>>(`${BASE}/seguridad/tables`);
  }
  getRights(groupId: number): Observable<ApiResponse<PermisosTabla[]>> {
    return this.http.get<ApiResponse<PermisosTabla[]>>(`${BASE}/seguridad/rights/${groupId}`);
  }
  saveRights(groupId: number, rights: PermisosTabla[]) {
    return this.http.post<ApiResponse<any>>(`${BASE}/seguridad/rights/${groupId}`, { rights });
  }
  copyRights(fromGroupId: number, toGroupId: number) {
    return this.http.post<ApiResponse<any>>(`${BASE}/seguridad/copy-rights`, { fromGroupId, toGroupId });
  }

  // ─── Reset / Cambio de contraseña ─────────────────────────
  // identificador: correo electrónico o código de usuario
  requestReset(identificador: string) {
    return this.http.post<ApiResponse<any>>(`${BASE}/auth/request-reset`, { identificador });
  }
  verifyToken(token: string) {
    return this.http.get<any>(`${BASE}/auth/verify-token/${token}`);
  }
  resetPassword(token: string, password: string) {
    return this.http.post<ApiResponse<any>>(`${BASE}/auth/reset-password`, { token, password });
  }
  changePrimer(newPassword: string) {
    return this.http.post<any>(`${BASE}/auth/change-primer`, { newPassword });
  }
}

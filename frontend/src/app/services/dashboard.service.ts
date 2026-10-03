import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, DashboardResumen } from '../models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  getResumen(): Observable<ApiResponse<DashboardResumen>> {
    return this.http.get<ApiResponse<DashboardResumen>>(`${environment.apiUrl}/api/dashboard/resumen`);
  }
}

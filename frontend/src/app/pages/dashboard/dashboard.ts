import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardResumen } from '../../models';
import { DashboardService } from '../../services/dashboard.service';
import { AuthService } from '../../services/auth';
import { PermisosService } from '../../services/permisos.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  resumen: DashboardResumen = {};
  loading = true;

  constructor(private svc: DashboardService, public auth: AuthService, public permisos: PermisosService) {}

  ngOnInit() {
    this.svc.getResumen().subscribe({
      next: r => { this.resumen = r.data ?? {}; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  get saludo(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }

  get nombre(): string {
    return (this.auth.usuario()?.nombre || '').split(' ')[0];
  }

  etiquetaTabla(t: string): string {
    return ({ estudiantes: 'Estudiante', padres: 'Padre de familia', docentes: 'Docente', estados_civiles: 'Estado civil', formaciones_academicas: 'Formación académica', usuarios: 'Usuario' } as Record<string, string>)[t] ?? t;
  }

  accionClass(a: string): string {
    return ({ CREAR: 'success', MODIFICAR: 'info', ASIGNAR: 'success', DESASIGNAR: 'warning', ACTIVAR: 'success', INACTIVAR: 'warning', ELIMINAR: 'danger' } as Record<string, string>)[a] ?? 'secondary';
  }
}

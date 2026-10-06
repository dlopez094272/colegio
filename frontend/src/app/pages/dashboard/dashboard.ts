import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardResumen } from '../../models';
import { DashboardService } from '../../services/dashboard.service';
import { AuthService } from '../../services/auth';
import { PermisosService } from '../../services/permisos.service';
import { ConfiguracionService } from '../../services/configuracion.service';

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

  constructor(
    private svc: DashboardService,
    public auth: AuthService,
    public permisos: PermisosService,
    public config: ConfiguracionService,
  ) {}

  get colegio() { return this.config.colegio(); }

  /** Dirección y teléfonos del colegio en una línea. */
  get contacto(): string {
    const c = this.colegio;
    if (!c) return '';
    const lugar = [c.direccion, c.municipio, c.departamento].filter(Boolean).join(', ');
    return [lugar, c.telefonos && `Tel. ${c.telefonos}`].filter(Boolean).join(' · ');
  }

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
    return ({ estudiantes: 'Estudiante', padres: 'Padre de familia', docentes: 'Docente', estados_civiles: 'Estado civil', formaciones_academicas: 'Formación académica', usuarios: 'Usuario', inscripciones: 'Inscripción', pagos: 'Pago', cuotas: 'Cuota', configuracion: 'Configuración' } as Record<string, string>)[t] ?? t;
  }

  accionClass(a: string): string {
    return ({ CREAR: 'success', MODIFICAR: 'info', ASIGNAR: 'success', DESASIGNAR: 'warning', ACTIVAR: 'success', INACTIVAR: 'warning', ELIMINAR: 'danger', ANULAR: 'danger', NOTIFICAR: 'info' } as Record<string, string>)[a] ?? 'secondary';
  }
}

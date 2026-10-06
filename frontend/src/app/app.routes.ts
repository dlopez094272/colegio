import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { permisoGuard } from './guards/permiso.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'login',          loadComponent: () => import('./pages/login/login').then(m => m.Login) },
  { path: 'reset-password', loadComponent: () => import('./pages/auth/reset-password/reset-password').then(m => m.ResetPassword) },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
      // Comunidad educativa
      { path: 'comunidad/padres',      canActivate: [permisoGuard('padres')],      loadComponent: () => import('./pages/comunidad/padres/padres').then(m => m.PadresPage) },
      { path: 'comunidad/estudiantes', canActivate: [permisoGuard('estudiantes')], loadComponent: () => import('./pages/comunidad/estudiantes/estudiantes').then(m => m.EstudiantesPage) },
      { path: 'comunidad/docentes',    canActivate: [permisoGuard('docentes')],    loadComponent: () => import('./pages/comunidad/docentes/docentes').then(m => m.DocentesPage) },
      // Académico
      { path: 'academico/estructura', canActivate: [permisoGuard('estructura_academica')], loadComponent: () => import('./pages/academico/estructura/estructura').then(m => m.EstructuraAcademicaPage) },
      { path: 'academico/inscripciones', canActivate: [permisoGuard('inscripciones')], loadComponent: () => import('./pages/academico/inscripciones/inscripciones').then(m => m.InscripcionesPage) },
      // Finanzas
      { path: 'finanzas/cuotas', canActivate: [permisoGuard('cuotas')], loadComponent: () => import('./pages/finanzas/cuotas/cuotas').then(m => m.CuotasPage) },
      { path: 'finanzas/pagos',  canActivate: [permisoGuard('pagos')],  loadComponent: () => import('./pages/finanzas/pagos/pagos').then(m => m.PagosPage) },
      // Catálogos
      { path: 'catalogos/estados-civiles', canActivate: [permisoGuard('estados_civiles')], loadComponent: () => import('./pages/catalogos/estados-civiles/estados-civiles').then(m => m.EstadosCivilesPage) },
      { path: 'catalogos/formaciones-academicas', canActivate: [permisoGuard('formaciones_academicas')], loadComponent: () => import('./pages/catalogos/formaciones-academicas/formaciones-academicas').then(m => m.FormacionesAcademicasPage) },
      { path: 'catalogos/categorias-archivos', canActivate: [permisoGuard('categorias_archivos')], loadComponent: () => import('./pages/catalogos/categorias-archivos/categorias-archivos').then(m => m.CategoriasArchivosPage) },
      // Configuración
      { path: 'configuracion/colegio', canActivate: [permisoGuard('configuracion')], loadComponent: () => import('./pages/configuracion/colegio/colegio').then(m => m.ConfiguracionColegioPage) },
      // Seguridad
      { path: 'seguridad/usuarios', canActivate: [permisoGuard('usuarios')], loadComponent: () => import('./pages/seguridad/usuarios/usuarios').then(m => m.Usuarios) },
      { path: 'seguridad/grupos',   canActivate: [superAdminGuard],          loadComponent: () => import('./pages/seguridad/seg-usuarios/seg-usuarios').then(m => m.SegUsuarios) },
      { path: 'seguridad/permisos', canActivate: [superAdminGuard],          loadComponent: () => import('./pages/seguridad/permisos/permisos').then(m => m.Permisos) },
      { path: 'seguridad/bitacora', canActivate: [permisoGuard('bitacora')], loadComponent: () => import('./pages/seguridad/bitacora/bitacora').then(m => m.BitacoraPage) },
    ]
  },
  { path: '**', redirectTo: '/dashboard' },
];

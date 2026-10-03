import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutService } from '../../services/layout.service';
import { AuthService } from '../../services/auth';
import { PermisosService } from '../../services/permisos.service';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  tabla?: string;       // tabla en seguridad_ugrights; sin permiso "Listar" el ítem se oculta
  adminOnly?: boolean;  // solo Super Administrador
}

export interface NavSection {
  section: string;
  icon: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  readonly nav: NavSection[] = [
    {
      section: 'COMUNIDAD EDUCATIVA',
      icon: 'users',
      items: [
        { label: 'Estudiantes',        icon: 'student', route: '/comunidad/estudiantes', tabla: 'estudiantes' },
        { label: 'Padres de familia',  icon: 'family',  route: '/comunidad/padres',      tabla: 'padres'      },
        { label: 'Personal docente',   icon: 'teacher', route: '/comunidad/docentes',    tabla: 'docentes'    },
      ],
    },
    {
      section: 'ACADÉMICO',
      icon: 'school',
      items: [
        { label: 'Inscripciones',        icon: 'clipboard', route: '/academico/inscripciones', tabla: 'inscripciones' },
        { label: 'Estructura académica', icon: 'hierarchy', route: '/academico/estructura', tabla: 'estructura_academica' },
      ],
    },
    {
      section: 'FINANZAS',
      icon: 'cash',
      items: [
        { label: 'Pagos',  icon: 'receipt', route: '/finanzas/pagos',  tabla: 'pagos'  },
        { label: 'Cuotas', icon: 'coins',   route: '/finanzas/cuotas', tabla: 'cuotas' },
      ],
    },
    {
      section: 'CATÁLOGOS',
      icon: 'book',
      items: [
        { label: 'Estados civiles', icon: 'tag', route: '/catalogos/estados-civiles', tabla: 'estados_civiles' },
        { label: 'Formaciones académicas', icon: 'award', route: '/catalogos/formaciones-academicas', tabla: 'formaciones_academicas' },
        { label: 'Categorías de archivos', icon: 'folder', route: '/catalogos/categorias-archivos', tabla: 'categorias_archivos' },
      ],
    },
    {
      section: 'SEGURIDAD',
      icon: 'lock',
      items: [
        { label: 'Usuarios',          icon: 'user',        route: '/seguridad/usuarios', tabla: 'usuarios' },
        { label: 'Usuarios / Grupos', icon: 'shield-user', route: '/seguridad/grupos',   adminOnly: true   },
        { label: 'Permisos',          icon: 'shield',      route: '/seguridad/permisos', adminOnly: true   },
        { label: 'Bitácora',          icon: 'clock',       route: '/seguridad/bitacora', tabla: 'bitacora' },
      ],
    },
  ];

  readonly cicloActual = new Date().getFullYear();

  // Las secciones arrancan abiertas: son pocas y así el menú se lee de un vistazo
  private collapsedSections = new Set<string>();

  constructor(
    public layout: LayoutService,
    public auth: AuthService,
    public permisos: PermisosService,
  ) {}

  get visibleSections(): NavSection[] {
    const sa = this.auth.isSuperAdmin();
    return this.nav
      .map(s => ({
        ...s,
        items: s.items.filter(i => i.adminOnly ? sa : (!i.tabla || this.permisos.puedeListar(i.tabla))),
      }))
      .filter(s => s.items.length > 0);
  }

  isExpanded(section: string): boolean {
    return !this.collapsedSections.has(section);
  }

  toggleSection(section: string): void {
    if (this.collapsedSections.has(section)) this.collapsedSections.delete(section);
    else this.collapsedSections.add(section);
  }
}

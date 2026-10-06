import { Injectable, signal } from '@angular/core';

const MOBILE_BREAKPOINT = 768;

@Injectable({ providedIn: 'root' })
export class LayoutService {
  collapsed = signal<boolean>(
    localStorage.getItem('col_sidebar_collapsed') !== '0'
  );

  // Drawer del sidebar en pantallas móviles (off-canvas), siempre arranca cerrado
  mobileOpen = signal<boolean>(false);

  // Ocultar el sidebar por completo (pantallas de trabajo a pantalla completa),
  // independiente del estado colapsado/expandido normal.
  sidebarHidden = signal<boolean>(false);

  constructor() {
    // si el usuario rota/agranda la ventana fuera del breakpoint móvil, cierra el drawer
    window.addEventListener('resize', () => {
      if (!this.isMobile && this.mobileOpen()) this.mobileOpen.set(false);
    });
  }

  private get isMobile(): boolean {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  /** Botón hamburguesa del topbar: en móvil abre/cierra el drawer, en escritorio colapsa/expande. */
  toggle() {
    if (this.isMobile) {
      this.mobileOpen.update(v => !v);
      return;
    }
    this.collapsed.update(v => {
      const next = !v;
      localStorage.setItem('col_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  }

  expand()   { this.collapsed.set(false); localStorage.setItem('col_sidebar_collapsed', '0'); }
  collapse() { this.collapsed.set(true);  localStorage.setItem('col_sidebar_collapsed', '1'); }

  closeMobile() { this.mobileOpen.set(false); }

  hideSidebar() { this.sidebarHidden.set(true); }
  showSidebar() { this.sidebarHidden.set(false); }
}

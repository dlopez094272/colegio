import { Injectable } from '@angular/core';

export interface Closeable {
  close(): void;
}

@Injectable({ providedIn: 'root' })
export class RowMenuService {
  private current: Closeable | null = null;

  open(menu: Closeable) {
    if (this.current && this.current !== menu) this.current.close();
    this.current = menu;
  }

  closed(menu: Closeable) {
    if (this.current === menu) this.current = null;
  }
}

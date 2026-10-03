import { Injectable, signal } from '@angular/core';

// Detecta cuando hay un deploy nuevo mientras el usuario tiene la app abierta.
// Angular hashea los bundles (outputHashing: all), así que tras un deploy los
// chunks viejos dejan de existir en el servidor: si el usuario navega a una
// ruta lazy con la pestaña vieja abierta, el import() falla y la app se rompe
// hasta que hace Ctrl+Shift+R. Esto evita eso de dos formas:
// 1) Si falla la carga de un chunk, recarga sola hacia la misma URL.
// 2) Revisa cada cierto tiempo si index.html cambió, para avisar con un banner
//    en vez de que el usuario note la app "rota" o desactualizada.
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  updateAvailable = signal(false);

  private baseline: string | null = null;
  private checking = false;
  private readonly CHECK_INTERVAL_MS = 10 * 60 * 1000;
  private readonly RELOAD_GUARD_KEY = 'col_chunk_reload_guard';
  private readonly RELOAD_GUARD_WINDOW_MS = 10000;

  async init(): Promise<void> {
    this.baseline = await this.fetchIndexHtml();

    setInterval(() => this.check(), this.CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
  }

  async check(): Promise<void> {
    if (this.checking || this.updateAvailable() || !this.baseline) return;
    this.checking = true;
    const html = await this.fetchIndexHtml();
    this.checking = false;
    if (html && html !== this.baseline) {
      this.updateAvailable.set(true);
    }
  }

  reload(): void {
    window.location.reload();
  }

  // Se llama cuando el Router detecta que un chunk lazy no cargó (deploy nuevo
  // borró el archivo viejo). Recarga completa hacia la misma URL para recuperar
  // la app con los bundles actuales, con guarda anti-loop por si el fallo persiste.
  recoverFromStaleChunk(targetUrl?: string): void {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(this.RELOAD_GUARD_KEY) || 0);
    if (now - last < this.RELOAD_GUARD_WINDOW_MS) return;
    sessionStorage.setItem(this.RELOAD_GUARD_KEY, String(now));
    window.location.href = targetUrl || window.location.href;
  }

  isStaleChunkError(err: unknown): boolean {
    const msg = (err as { message?: string })?.message || String(err ?? '');
    return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk .* failed/i.test(msg);
  }

  private async fetchIndexHtml(): Promise<string | null> {
    try {
      const res = await fetch(document.baseURI, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
}

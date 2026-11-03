// Los PDF (contratos, recibos, estados de cuenta) se piden con token como Blob:
// no se pueden abrir con un <a href> directo a la API.

/**
 * Abre una pestaña en blanco en el mismo clic del usuario, antes de pedir el PDF:
 * si se abre hasta que llega la respuesta, el navegador la bloquea como emergente.
 * Se le pasa luego a abrirBlob, o se cierra con cerrarVentana si la petición falla.
 */
export function ventanaPendiente(): Window | null {
  const w = window.open('', '_blank');
  if (w) {
    w.document.title = 'Generando…';
    w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px;color:#555">Generando documento…</p>';
  }
  return w;
}

export function cerrarVentana(w: Window | null): void {
  if (w && !w.closed) w.close();
}

/** Abre el archivo en una pestaña nueva (visor del navegador), o en la indicada. */
export function abrirBlob(blob: Blob, ventana: Window | null = null): void {
  const url = URL.createObjectURL(blob);
  let w = ventana && !ventana.closed ? ventana : null;
  if (w) w.location.href = url;
  else w = window.open(url, '_blank');
  if (!w) descargarBlob(blob, 'documento.pdf'); // ventana emergente bloqueada → descargar
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Descarga el archivo con el nombre indicado. */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombre;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

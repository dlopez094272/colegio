// Los PDF (contratos, recibos, estados de cuenta) se piden con token como Blob:
// no se pueden abrir con un <a href> directo a la API.

/** Abre el archivo en una pestaña nueva (visor del navegador). */
export function abrirBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
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

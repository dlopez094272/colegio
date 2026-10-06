import Swal from 'sweetalert2';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  background: 'linear-gradient(160deg, #2A2926 0%, #1E1D1B 100%)',
  color: '#ffffff',
  didOpen: (toast) => {
    toast.style.setProperty('border', '1px solid rgba(212,178,76,0.35)');
    toast.style.setProperty('border-radius', '10px');
    toast.style.setProperty('font-family', "'Inter', 'Segoe UI', sans-serif");
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

export function showSuccess(message: string): void {
  Toast.fire({ icon: 'success', title: message, iconColor: '#66bb6a' });
}

export function showError(message: string): void {
  Toast.fire({ icon: 'error', title: message, iconColor: '#ef5350' });
}

export function showWarning(message: string): void {
  Toast.fire({ icon: 'warning', title: message, iconColor: '#ffa726', timer: 4500 });
}

export function showInfo(message: string): void {
  Toast.fire({ icon: 'info', title: message, iconColor: '#D4B24C' });
}

export async function showAlert(title: string, text: string, icon: 'warning' | 'error' | 'info' = 'warning'): Promise<void> {
  await Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: 'Entendido',
    background: 'linear-gradient(160deg, #2A2926 0%, #1E1D1B 100%)',
    color: '#ffffff',
    confirmButtonColor: '#D4B24C',
    iconColor: icon === 'error' ? '#ef5350' : icon === 'warning' ? '#ffa726' : '#D4B24C',
    customClass: {
      popup:         'col-swal-popup',
      confirmButton: 'col-swal-confirm',
      title:         'col-swal-title',
      htmlContainer: 'col-swal-text',
    },
    didOpen: (popup) => {
      popup.style.setProperty('border', '1px solid rgba(212,178,76,0.35)');
      popup.style.setProperty('border-radius', '16px');
      popup.style.setProperty('box-shadow', '0 8px 40px rgba(0,0,0,0.55)');
      popup.style.setProperty('font-family', "'Inter', 'Segoe UI', sans-serif");
    },
  });
}

export async function confirmSuccessChoice(
  title: string,
  text: string,
  confirmText: string,
  cancelText: string,
): Promise<boolean> {
  const result = await Swal.fire({
    title,
    text,
    icon: 'success',
    iconColor: '#66bb6a',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    focusCancel: true,
    background: 'linear-gradient(160deg, #2A2926 0%, #1E1D1B 100%)',
    color: '#ffffff',
    confirmButtonColor: '#D4B24C',
    cancelButtonColor: 'rgba(255,255,255,0.12)',
    customClass: {
      popup:         'col-swal-popup',
      confirmButton: 'col-swal-confirm',
      title:         'col-swal-title',
      htmlContainer: 'col-swal-text',
      cancelButton:  'col-swal-cancel',
    },
    didOpen: (popup) => {
      popup.style.setProperty('border', '1px solid rgba(212,178,76,0.35)');
      popup.style.setProperty('border-radius', '16px');
      popup.style.setProperty('box-shadow', '0 8px 40px rgba(0,0,0,0.55)');
      popup.style.setProperty('font-family', "'Inter', 'Segoe UI', sans-serif");
    },
  });
  return result.isConfirmed;
}

export async function confirmDialog(
  text: string,
  title = '¿Confirmar acción?',
  confirmText = 'Confirmar',
  destructive = true
): Promise<boolean> {
  const result = await Swal.fire({
    title,
    text,
    icon: destructive ? 'warning' : 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    focusCancel: true,
    background: 'linear-gradient(160deg, #2A2926 0%, #1E1D1B 100%)',
    color: '#ffffff',
    confirmButtonColor: destructive ? '#B03A2E' : '#D4B24C',
    cancelButtonColor: 'rgba(255,255,255,0.12)',
    iconColor: destructive ? '#ffa726' : '#D4B24C',
    customClass: {
      popup:           'col-swal-popup',
      confirmButton: destructive ? 'col-swal-danger' : 'col-swal-confirm',
      title:           'col-swal-title',
      htmlContainer:   'col-swal-text',
      cancelButton:    'col-swal-cancel',
    },
    didOpen: (popup) => {
      popup.style.setProperty('border', '1px solid rgba(212,178,76,0.35)');
      popup.style.setProperty('border-radius', '16px');
      popup.style.setProperty('box-shadow', '0 8px 40px rgba(0,0,0,0.55)');
      popup.style.setProperty('font-family', "'Inter', 'Segoe UI', sans-serif");
    },
  });
  return result.isConfirmed;
}

/** Pide un motivo obligatorio (anulaciones). Devuelve null si se cancela. */
export async function promptMotivo(
  title: string,
  text: string,
  confirmText = 'Anular',
  placeholder = 'Motivo…',
): Promise<string | null> {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    input: 'textarea',
    inputPlaceholder: placeholder,
    inputAttributes: { maxlength: '255' },
    inputValidator: v => (v && v.trim() ? null : 'Indique el motivo'),
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    background: 'linear-gradient(160deg, #2A2926 0%, #1E1D1B 100%)',
    color: '#ffffff',
    confirmButtonColor: '#B03A2E',
    cancelButtonColor: 'rgba(255,255,255,0.12)',
    iconColor: '#ffa726',
    customClass: {
      popup:         'col-swal-popup',
      confirmButton: 'col-swal-danger',
      title:         'col-swal-title',
      htmlContainer: 'col-swal-text',
      cancelButton:  'col-swal-cancel',
    },
    didOpen: (popup) => {
      popup.style.setProperty('border', '1px solid rgba(212,178,76,0.35)');
      popup.style.setProperty('border-radius', '16px');
      popup.style.setProperty('box-shadow', '0 8px 40px rgba(0,0,0,0.55)');
      popup.style.setProperty('font-family', "'Inter', 'Segoe UI', sans-serif");
    },
  });
  return result.isConfirmed ? String(result.value).trim() : null;
}

/**
 * Pide el/los correo(s) destino de una notificación (prellenado con el
 * registrado). Devuelve null si se cancela; con `opcional`, '' si se deja vacío.
 */
export async function promptCorreo(title: string, text: string, valor = '', confirmText = 'Enviar', opcional = false): Promise<string | null> {
  const re = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  const result = await Swal.fire({
    title,
    text,
    icon: 'question',
    input: 'text',
    inputValue: valor,
    inputPlaceholder: 'correo@ejemplo.com',
    inputAttributes: { maxlength: '300', autocomplete: 'email' },
    inputValidator: v => {
      const lista = (v || '').split(/[,;\s]+/).filter(Boolean);
      if (!lista.length) return opcional ? null : 'Indique al menos un correo';
      const malo = lista.find(c => !re.test(c));
      return malo ? `"${malo}" no es un correo válido` : null;
    },
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    background: 'linear-gradient(160deg, #2A2926 0%, #1E1D1B 100%)',
    color: '#ffffff',
    confirmButtonColor: '#D4B24C',
    cancelButtonColor: 'rgba(255,255,255,0.12)',
    iconColor: '#D4B24C',
    customClass: {
      popup:         'col-swal-popup',
      confirmButton: 'col-swal-confirm',
      title:         'col-swal-title',
      htmlContainer: 'col-swal-text',
      cancelButton:  'col-swal-cancel',
    },
    didOpen: (popup) => {
      popup.style.setProperty('border', '1px solid rgba(212,178,76,0.35)');
      popup.style.setProperty('border-radius', '16px');
      popup.style.setProperty('box-shadow', '0 8px 40px rgba(0,0,0,0.55)');
      popup.style.setProperty('font-family', "'Inter', 'Segoe UI', sans-serif");
    },
  });
  return result.isConfirmed ? String(result.value).trim() : null;
}

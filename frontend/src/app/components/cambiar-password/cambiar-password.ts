import { Component, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { SeguridadService } from '../../services/seguridad.service';

@Component({
  selector: 'app-cambiar-password',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './cambiar-password.html',
  styleUrl: './cambiar-password.scss',
})
export class CambiarPassword {
  @Output() changed = new EventEmitter<void>();

  newPassword = '';
  confirm     = '';
  loading     = false;
  error       = '';

  constructor(public auth: AuthService, private seg: SeguridadService) {}

  get nombre() { return this.auth.usuario()?.nombre || this.auth.usuario()?.codigo || ''; }

  submit() {
    this.error = '';
    if (!this.newPassword || this.newPassword.length < 4) {
      this.error = 'La contraseña debe tener al menos 4 caracteres';
      return;
    }
    if (this.newPassword !== this.confirm) {
      this.error = 'Las contraseñas no coinciden';
      return;
    }
    this.loading = true;
    this.seg.changePrimer(this.newPassword).subscribe({
      next: res => {
        this.loading = false;
        // Actualiza el token con primer=false
        if (res.token) {
          localStorage.setItem('col_token', res.token);
          const user = this.auth.usuario();
          if (user) {
            const updated = { ...user, primer: false };
            localStorage.setItem('col_user', JSON.stringify(updated));
            this.auth.usuario.set(updated);
          }
        }
        this.changed.emit();
      },
      error: e => {
        this.error   = e.error?.message || 'Error al cambiar contraseña';
        this.loading = false;
      },
    });
  }
}

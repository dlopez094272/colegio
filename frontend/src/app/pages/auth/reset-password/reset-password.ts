import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SeguridadService } from '../../../services/seguridad.service';

type Step = 'request' | 'verify' | 'new-password' | 'done' | 'invalid';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  step: Step = 'request';
  identificador = '';
  token       = '';
  newPassword = '';
  confirm     = '';
  userName    = '';
  loading     = false;
  error       = '';
  readonly currentYear = new Date().getFullYear();

  constructor(
    private seg: SeguridadService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (this.token) {
      this.step = 'verify';
      this.verifyToken();
    }
  }

  verifyToken() {
    this.seg.verifyToken(this.token).subscribe({
      next: r => {
        if (r.valid) {
          this.userName = r.nombre || r.codigo;
          this.step = 'new-password';
        } else {
          this.step = 'invalid';
        }
      },
      error: () => { this.step = 'invalid'; },
    });
  }

  requestReset() {
    if (!this.identificador) return;
    this.loading = true;
    this.error = '';
    this.seg.requestReset(this.identificador).subscribe({
      next: () => { this.step = 'done'; this.loading = false; },
      error: e => { this.error = e.error?.message || 'Error al enviar correo'; this.loading = false; },
    });
  }

  setNewPassword() {
    if (!this.newPassword || this.newPassword !== this.confirm) {
      this.error = 'Las contraseñas no coinciden';
      return;
    }
    this.loading = true;
    this.error = '';
    this.seg.resetPassword(this.token, this.newPassword).subscribe({
      next: () => { this.step = 'done'; this.loading = false; },
      error: e => { this.error = e.error?.message || 'Error al cambiar contraseña'; this.loading = false; },
    });
  }

  goToLogin() { this.router.navigate(['/login']); }
}

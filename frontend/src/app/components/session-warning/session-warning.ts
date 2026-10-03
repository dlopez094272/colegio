import { Component, Output, EventEmitter } from '@angular/core';
import { SessionService } from '../../services/session.service';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-session-warning',
  imports: [],
  templateUrl: './session-warning.html',
  styleUrl: './session-warning.scss',
})
export class SessionWarning {
  @Output() keepSession = new EventEmitter<void>();
  @Output() closeSession = new EventEmitter<void>();

  constructor(public session: SessionService, private auth: AuthService) {}

  onKeep() {
    this.session.reset();
    this.keepSession.emit();
  }

  onClose() {
    this.closeSession.emit();
    this.auth.logout();
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')} min` : `${s} seg`;
  }
}

import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { SessionService } from '../../services/session.service';

interface NetworkParticle {
  x: number; y: number; vx: number; vy: number; r: number; phase: number;
}

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('networkCanvas') networkCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly DOT_RGB = '212, 178, 76';
  private readonly LINK_DIST = 150;
  private readonly SPEED = 0.25;

  private ctx?: CanvasRenderingContext2D | null;
  private particles: NetworkParticle[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private animationFrameId?: number;
  private resizeObserver?: ResizeObserver;
  private reduceMotion = false;
  codigo   = '';
  password = '';
  loading  = false;
  error    = '';
  readonly currentYear = new Date().getFullYear();


  constructor(
    public auth: AuthService,
    private router: Router,
    private session: SessionService,
    private zone: NgZone,
  ) {}

  ngOnInit() {
    this.session.stop();
  }

  ngAfterViewInit(): void {
    const canvas = this.networkCanvas?.nativeElement;
    if (!canvas) return;

    this.ctx = canvas.getContext('2d');
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(canvas.parentElement!);
      this.resizeCanvas();
      this.step();
    });
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== undefined) cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver?.disconnect();
  }

  private resizeCanvas(): void {
    const canvas = this.networkCanvas?.nativeElement;
    if (!canvas || !this.ctx) return;
    const parent = canvas.parentElement!;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    canvas.width = this.width * this.dpr;
    canvas.height = this.height * this.dpr;
    canvas.style.width = this.width + 'px';
    canvas.style.height = this.height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.initParticles();
  }

  private initParticles(): void {
    const count = Math.min(90, Math.round((this.width * this.height) / 16000));
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * this.SPEED,
      vy: (Math.random() - 0.5) * this.SPEED,
      r: Math.random() * 1.4 + 1.2,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  private step = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > this.width) p.vx *= -1;
      if (p.y < 0 || p.y > this.height) p.vy *= -1;
      p.phase += 0.02;
    }

    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i], b = this.particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.LINK_DIST) {
          ctx.strokeStyle = `rgba(${this.DOT_RGB}, ${(1 - dist / this.LINK_DIST) * 0.35})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const p of this.particles) {
      const pulse = (Math.sin(p.phase) + 1) / 2;
      ctx.fillStyle = `rgba(${this.DOT_RGB}, ${0.25 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + pulse * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!this.reduceMotion) {
      this.animationFrameId = requestAnimationFrame(this.step);
    }
  };

  onSubmit() {
    if (!this.codigo || !this.password) return;
    this.loading = true;
    this.error   = '';
    this.auth.login(this.codigo.trim(), this.password).subscribe({
      next: () => {
        this.loading = false;
        this.iniciarSesion();
      },
      error: (e) => {
        this.error   = e.error?.message || 'Usuario o contraseña incorrectos';
        this.loading = false;
      },
    });
  }


  private iniciarSesion() {
    this.session.start();
    this.router.navigate(['/dashboard']);
  }
}

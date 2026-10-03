import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { authErrorInterceptor } from './interceptors/auth-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, authErrorInterceptor])),
    // Zona horaria Guatemala (UTC-6) para todos los DatePipe de la aplicación.
    { provide: DATE_PIPE_DEFAULT_OPTIONS, useValue: { timezone: '-0600' } },
  ]
};

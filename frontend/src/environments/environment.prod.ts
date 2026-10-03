export const environment = {
  production: true,
  // Vacío = mismo origen: cada colegio sirve la app en su propio subdominio
  // y el backend resuelve el tenant por el header Host, sin CORS.
  apiUrl: '',
};

# Gestión Escolar

Sistema administrativo para control y gestión de colegios. Hereda la arquitectura,
seguridad, autenticación y bitácora de SMABI ERP.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express, MySQL (`mysql2`), JWT, bcrypt |
| Frontend | Angular 21 (standalone + signals), SweetAlert2 |
| Base de datos | MySQL 8 — BD `colegio` |

## Puesta en marcha

1. Crear la base de datos:
   ```
   mysql -uroot < database/schema.sql
   mysql -uroot < database/seed.sql
   ```
2. Instalar dependencias: `npm install` en `backend/` y en `frontend/`.
3. Configurar `backend/.env` (copiar de `.env.example`) y `backend/tenants.json`
   (copiar de `tenants.example.json`; ahí van las credenciales de BD y el `jwtSecret`).
4. Ejecutar `start.bat` (o `npm run dev` en backend y `npm start` en frontend).
   - Backend: http://localhost:3100
   - Frontend: http://localhost:4200

Usuario inicial: **admin / admin123** (pide cambiar la contraseña al primer ingreso).

## Arquitectura (heredada de SMABI)

- **Multi-tenant**: cada colegio se resuelve por el header `Host` (`tenants.json`);
  `config/database.js` expone un `pool` Proxy que apunta a la BD del tenant activo
  (AsyncLocalStorage). El JWT se firma con un secreto distinto por tenant.
- **Seguridad**: grupos (`seguridad_uggroups`), miembros (`seguridad_ugmembers`) y
  permisos por tabla (`seguridad_ugrights`, máscara `A E D S P I M`). `GroupID = -1`
  es Super Administrador. Backend: `checkPermiso(tabla, letra)` / `cpAny`;
  frontend: `permisoGuard`, `PermisosService.tiene()`.
- **Bitácora**: `utils/bitacora.js → registrarBitacora()` guarda en `sistema_bitacora`
  cada CREAR / MODIFICAR (con valores antes/después) / ACTIVAR / INACTIVAR /
  ASIGNAR / DESASIGNAR / ELIMINAR, con usuario, IP y fecha.
- **Sesión**: cierre por inactividad (2 h), cambio obligatorio de contraseña
  (`primer = 1`), restablecimiento por correo (SMTP en `.env`).

## Módulos

- **Padres de familia** (`/api/padres`): nombres, apellidos, apellido de casada,
  fecha de nacimiento, estado civil (catálogo), NIT, DPI, pasaporte, dirección,
  teléfonos y estado activo.
- **Estudiantes** (`/api/estudiantes`): mismos datos personales más lugar de
  nacimiento, sin NIT, pasaporte ni estado civil. Fotografía tomada con la cámara o
  subida desde archivo (recortada a 3:4 y comprimida en el navegador; se guarda en
  `backend/public/files/<tenant>/estudiantes/` con nombre aleatorio y se sirve en `/files`).
  BD existentes: ejecutar `database/migration_estudiantes_foto.sql`.
- **Asignaciones padre ↔ estudiante** (`estudiantes_padres`, con parentesco):
  desde cualquiera de las dos fichas se puede buscar un registro existente o crear
  uno nuevo en el mismo paso. Lo creado en el mismo paso hereda dirección y
  teléfonos (y el apellido según parentesco) del registro principal; todo se guarda
  en una sola transacción.
- **Estructura académica** (`/api/estructura-academica`, permiso `estructura_academica`):
  Nivel → (Carrera) → Grado → Sección. Un nivel marcado "organizado por carreras"
  (ej. Diversificado) agrupa sus grados por carrera (Perito en Computación, Dibujo de
  Construcción…). Inactivar/activar un registro arrastra a todos sus descendientes en
  una transacción; no se puede activar un hijo bajo un padre inactivo, ni eliminar un
  registro con dependientes. Se pueden crear varios a la vez (`nombres: []`).
  Frontend con dos vistas: **Jerarquía** (árbol gráfico con "+" para agregar hijo o
  hermano) y **Tabla** (maestro-detalle en cascada con alta rápida y atajos).
  BD existentes: ejecutar `database/migration_estructura_academica.sql`.
- **Catálogo de estados civiles**, **usuarios**, **grupos/permisos** y
  **bitácora global**.

Padres y estudiantes comparten código: `models/personaModelFactory.js`,
`controllers/personaControllerFactory.js` (backend) y
`shared/personas-modulo` + `shared/vinculos-editor` (frontend).

Para agregar un módulo nuevo con permisos: añadir su tabla a `SYSTEM_TABLES`
en `controllers/seguridadController.js` y protegerlo con `checkPermiso`.

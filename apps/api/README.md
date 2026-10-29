# API de UNIFE Operación

API local de UNIFE Operación. Gestiona autenticación, agenda, programas,
usuarios, visitas y el archivo documental de Recepción.

## Requisitos y ejecución local

Se recomienda Node.js 24 o posterior. Desde la raíz del proyecto:

```bash
npm install
npm run api:dev
```

La API escucha en `http://localhost:4000`. En otra terminal, inicia la
interfaz web con `npm run dev`; normalmente queda disponible en
`http://localhost:5173`.

## Persistencia y configuración

- La base SQLite se crea en `apps/api/storage/unife.sqlite`.
- Los archivos adjuntos se guardan en `apps/api/storage/uploads/`.
- Las migraciones se aplican al iniciar desde `packages/database/sqlite/`.
- Las rutas se pueden cambiar con `DATABASE_PATH` y `UPLOAD_DIR`.
- `PORT` cambia el puerto de la API y `WEB_ORIGIN` configura el origen permitido
  para la interfaz web.
- La carpeta `storage/` no se incluye en Git.

La configuración incluida es para desarrollo local. Los archivos permanecen
locales; OneDrive no está conectado automáticamente y no se configuran
respaldos de producción.

## Capacidades y acceso

- **Productor:** crea solicitudes de agenda para programas asignados y cancela
  sus solicitudes.
- **Supervisor:** revisa agenda y administra usuarios y programas.
- **Recepción:** registra visitas y es el único rol con acceso al archivo
  documental. Supervisores también pueden operar la sección general de
  Recepción.
- La búsqueda de vigencia por persona está disponible para Recepción y
  supervisores.

## Endpoints principales

Todas las rutas requieren autenticación salvo `GET /health` y
`POST /api/auth/login`. Las rutas de administración y documentos aplican
permisos por rol.

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/health` | Estado de la API |
| `POST` | `/api/auth/login` | Iniciar sesión |
| `GET` | `/api/auth/me` | Consultar la sesión actual |
| `POST` | `/api/auth/logout` | Cerrar sesión |
| `GET` | `/api/dashboard` | Resumen operativo filtrado por fecha |
| `GET` | `/api/users/avatars` | Consultar avatares disponibles |
| `GET`, `POST`, `PATCH`, `DELETE` | `/api/users` y `/api/users/:id` | Administración de usuarios; solo supervisores |
| `GET`, `POST`, `PATCH`, `DELETE` | `/api/programs` y `/api/programs/:id` | Catálogo de programas; administración solo para supervisores |
| `GET`, `POST` | `/api/bookings` | Consultar o solicitar agenda |
| `PATCH` | `/api/bookings/:id/approve` | Aprobar reserva; solo supervisores |
| `PATCH` | `/api/bookings/:id/reject` | Rechazar reserva; solo supervisores |
| `PATCH` | `/api/bookings/:id/cancel` | Cancelar solicitud propia; productores |
| `GET`, `POST`, `PATCH` | `/api/visits` y `/api/visits/:id` | Consultar, registrar o editar visitas; Recepción y supervisores |
| `POST` | `/api/visits/:id/entry` | Registrar entrada |
| `POST` | `/api/visits/:id/exit` | Registrar salida |
| `POST` | `/api/reception/people/lookup` | Buscar autorización por nombre e identificación; Recepción y supervisores |
| `GET` | `/api/reception/archive` | Consultar pendientes o historial; solo Recepción |
| `GET` | `/api/reception/archive/:id/pdf` | Generar PDF resumen; solo Recepción |
| `GET` | `/api/reception/archive/:id/download` | Descargar paquete ZIP; solo Recepción |
| `PATCH` | `/api/reception/archive/:id/review` | Validar expediente; solo Recepción |
| `PATCH` | `/api/reception/archive/:id/complete` | Confirmar carga manual en OneDrive; solo Recepción |
| `GET` | `/api/documents/:id` | Consultar documento; Recepción y supervisores |
| `GET`, `POST`, `PATCH` | `/api/notifications` y `/api/notifications/:id/read` | Consultar avisos y marcar lectura |
| `GET`, `POST`, `PATCH` | `/api/messages` y `/api/messages/:id/read` | Consultar, enviar y marcar notas internas |

El paquete ZIP contiene el formulario PDF y los documentos originales
disponibles. La persona usuaria debe subirlo manualmente a OneDrive; confirmar
la ficha registra esa acción, pero no verifica la transferencia externa.

## Usuarios de demostración

Solo para desarrollo local; todas las cuentas usan la contraseña
`demo1234`:

- `recepcion@unife.mx`
- `productor@unife.mx`
- `supervisor@unife.mx`

No usar estas cuentas ni esta contraseña en un entorno operativo real.

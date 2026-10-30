# UNIFE Database

La API usa SQLite (`node:sqlite`) para persistencia local, sin dependencias nativas adicionales.

## Esquema y migraciones

- Las migraciones versionadas se guardan en `sqlite/` y se aplican al iniciar la API mediante `PRAGMA user_version`.
- La migración inicial define usuarios, sesiones, programas, reservas e invitados, visitas, personas y documentos, notificaciones y mensajes.
- La migración `003_reception_archive.sql` añade perfiles documentales reutilizables, historial de versiones y estados independientes del archivo de Recepción.
- La migración `004_wifi_coupons.sql` añade el inventario persistente de cupones WiFi, con registro del usuario que los cargó y entregó.
- La base local predeterminada es `apps/api/storage/unife.sqlite`; puede cambiarse con `DATABASE_PATH`.
- La API crea usuarios y programas de demostración solo cuando no existen, sin borrar los datos guardados.

Para desarrollo se recomienda Node.js 24 o posterior. Los archivos subidos se almacenan por separado en `apps/api/storage/uploads/` (configurable con `UPLOAD_DIR`). El archivo genera un PDF y un ZIP para carga manual; no hay integración automática con OneDrive ni respaldos de producción configurados.

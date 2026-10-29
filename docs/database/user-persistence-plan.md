# Persistencia de usuarios

La autenticación ya usa SQLite mediante `apps/api/src/auth.ts` y `apps/api/src/database.ts`. El esquema vigente está en `packages/database/sqlite/001_initial.sql`; este documento resume las entidades principales.

## Tabla `users`

```text
id              UUID primary key
name            varchar(80) not null
email           varchar(255) unique not null
role            enum(reception, producer, supervisor) not null
avatar_id       varchar(50) not null
password_hash   text not null
password_salt   text not null
active          boolean not null default true
created_at      timestamp not null
updated_at      timestamp not null
```

## Tabla `avatars`

```text
id              varchar(50) primary key
name            varchar(80) not null
color           varchar(20) not null
accent          varchar(20) not null
active          boolean not null default true
```

## Tabla `sessions`

```text
token_hash      text primary key
user_id         UUID references users(id) on delete cascade
expires_at      timestamp not null
created_at      timestamp not null
```

La API nunca devuelve `password_hash` ni `password_salt`. Los avatares son catálogo, no archivos subidos por el usuario; eso permite cambiar las opciones sin modificar la cuenta histórica.

## Reglas

- El correo es único sin distinguir mayúsculas/minúsculas.
- Solo supervisores pueden crear usuarios.
- El rol se guarda como valor controlado.
- El avatar debe existir y estar activo.
- Las contraseñas se almacenan con hash, nunca en texto plano.
- Las reservas y notas deben guardar `created_by`/`requested_by` para auditoría.
- SQLite conserva actualmente usuarios, sesiones, programas, reservas, visitas y metadatos de documentos en `apps/api/storage/unife.sqlite`.
- La migración a PostgreSQL, respaldos de producción y almacenamiento en OneDrive son decisiones pendientes para despliegue.

# Flujo operativo por rol

## Roles

### Productor

1. Inicia sesión como productor.
2. Crea una solicitud de agenda para un programa asignado a su cuenta.
3. Indica recurso, fechas, horario, servicios y todos los invitados con su actividad.
4. Si es grabación externa, captura locación y dirección.
5. La solicitud queda `pending` y se conserva en SQLite.
6. Puede cancelar sus propias solicitudes y debe indicar el motivo.

### Supervisor

1. Inicia sesión como supervisor.
2. Revisa las solicitudes pendientes en Agenda.
3. Valida horario, recurso, servicios y locación.
4. Aprueba o rechaza la solicitud; el sistema impide solicitudes superpuestas para un mismo recurso.
5. Al aprobar, la reserva cambia a `confirmed`.
6. Se genera una notificación para Recepción indicando que debe preparar la llegada de invitados.
7. Puede cancelar reservas y operar Recepción cuando sea necesario.

### Recepción

1. Inicia sesión como recepción.
2. Consulta las solicitudes aprobadas pendientes de registro.
3. Abre una aprobación para precargar el programa, productor e invitados agendados.
4. Registra los datos y documentos de cada invitado; la lista debe coincidir con la aprobación.
5. Valida adultos, menores y tutores.
6. Cuando el grupo llega, registra entrada.
7. Al salir, registra salida y cierra la visita.

## Estados

### Reservas

```text
pending -> confirmed
pending -> rejected
pending -> cancelled
confirmed -> cancelled
```

Solo supervisión puede aprobar o rechazar. Productores pueden crear y cancelar sus solicitudes.

### Visitas

```text
expected -> inside -> completed
```

No se permite registrar salida sin entrada ni entrada repetida. La API también valida estos estados, aunque la interfaz oculte acciones no disponibles.

## Demo local

Todos los usuarios usan la contraseña `demo1234`:

- `recepcion@unife.mx`
- `productor@unife.mx`
- `supervisor@unife.mx`

La API conserva en SQLite usuarios, programas, solicitudes, visitas, sesiones y metadatos de documentos al reiniciarse. Los archivos adjuntos permanecen en almacenamiento local; no se han integrado OneDrive ni las alertas de vencimiento.

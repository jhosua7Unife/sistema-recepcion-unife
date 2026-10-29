# UNIFE Operación

## Resumen ejecutivo

UNIFE Operación es una plataforma interna para coordinar la agenda de
producciones, preparar la llegada de invitados y registrar su atención en
Recepción. Centraliza en un mismo flujo las solicitudes, las aprobaciones, el
control de acceso y la revisión de documentos.

El sistema busca que cada área conozca qué debe hacer, que la información de
las visitas sea consultable y que los expedientes se conserven para futuras
referencias.

## ¿Qué permite hacer?

- **Planear producciones:** solicitar foros, croma o locaciones, indicar
  horarios, servicios necesarios e invitados.
- **Autorizar la agenda:** revisar solicitudes, detectar conflictos de recursos
  y aprobar o rechazar las fechas propuestas.
- **Preparar la recepción:** utilizar una reserva aprobada para precargar los
  invitados y registrar su información y documentos.
- **Controlar entradas y salidas:** registrar cuándo llega un grupo, notificar
  al productor y cerrar la visita cuando se retira.
- **Organizar expedientes:** consultar formularios y documentos, preparar un
  paquete descargable y conservar un historial para futuras consultas.
- **Mantener comunicación operativa:** consultar notificaciones y enviar o
  revisar notas entre los perfiles de trabajo.
- **Dar seguimiento diario:** consultar recepciones del día, personas dentro de
  UNIFE, salidas registradas, agenda próxima y solicitudes pendientes.

## Flujo de trabajo

1. **El productor solicita una fecha.** Selecciona uno de sus programas,
   recurso, horario, servicios e invitados. Para una locación externa, captura
   los datos correspondientes.
2. **El supervisor revisa la solicitud.** Puede aprobarla o rechazarla. El
   sistema evita solicitudes que se traslapen en el mismo recurso.
3. **Recepción prepara la visita.** Al registrar una reserva aprobada, los datos
   del programa y los invitados se precargan. Recepción completa el formulario
   y agrega las identificaciones y autorizaciones requeridas.
4. **Recepción controla la visita.** Al llegar el grupo registra la entrada y
   se notifica al productor. Al retirarse, registra la salida.
5. **Recepción revisa y archiva los documentos.** Valida el expediente,
   consulta el formulario PDF y los documentos originales, descarga un paquete
   ZIP y, después de subirlo manualmente a OneDrive, marca la ficha como
   archivada.

## Funciones por perfil

### Productor

- Consulta los programas asignados a su cuenta.
- Solicita agenda e indica invitados, recurso, horario y servicios.
- Consulta el estado de sus solicitudes y cancela las propias indicando un
  motivo.
- Recibe avisos sobre la aprobación y la llegada de sus invitados.

### Supervisor

- Aprueba o rechaza solicitudes y administra usuarios.
- Crea, edita y desactiva programas; cada programa queda asociado a un productor
  y a un catálogo: **Programas UNIFE** o **Programas Iglesia**.
- Consulta la operación de Recepción y puede apoyar en el registro de visitas.
- Ve en el resumen las solicitudes pendientes de aprobación.

### Recepción

- Consulta las llegadas aprobadas y registra grupos e invitados.
- Captura identificaciones, autorizaciones, tutores y documentos requeridos.
- Registra entradas y salidas, y busca visitas anteriores.
- Consulta el archivo documental, revisa fichas y conserva un historial
  independiente del estado de la visita.
- Busca a una persona por nombre completo e identificación para comprobar si
  tiene una autorización de imagen vigente.

## Vigencia y conservación documental

- La autorización de uso de imagen y la autorización del tutor se consideran
  vigentes durante un año desde su carga o renovación.
- Reutilizar una autorización vigente en otra visita no reinicia ese periodo.
- El sistema alerta cuando una autorización está vencida o próxima a vencer.
- Al reemplazar un documento, conserva la versión anterior en el historial.
- Las identificaciones no reciben una fecha de vencimiento automática si esta
  no se ha registrado.
- El archivo documental está disponible únicamente para el perfil de
  Recepción. El supervisor puede operar el flujo general de Recepción, pero no
  acceder a esa sección del archivo.

## Resumen operativo

El tablero presenta métricas y listas para orientar las tareas del día:

- **Dentro de UNIFE:** visitas con entrada activa.
- **Por recibir:** grupos esperados para la fecha actual.
- **Grabaciones hoy:** reservas confirmadas para hoy.
- **Pendientes:** notificaciones y mensajes sin leer.
- **Recepción de hoy:** visitas de la fecha local actual, ordenadas por hora.
- **Próximas grabaciones:** reservas futuras o en curso, sin mostrar las que ya
  terminaron.
- **Estado del día:** llegadas esperadas, grupos dentro, salidas registradas y,
  para supervisión, solicitudes por aprobar.

Las fechas del resumen se interpretan con la zona horaria de Ciudad de México.

## Alcance actual y consideraciones

- La carga a **OneDrive es manual**. El sistema genera el paquete ZIP, pero no
  lo transfiere ni verifica automáticamente en OneDrive.
- La aplicación guarda los datos en SQLite y los adjuntos en almacenamiento
  local. La configuración actual está orientada al desarrollo local.
- Los respaldos de producción, el almacenamiento compartido y el despliegue
  institucional no están configurados por esta aplicación.
- Antes de utilizarla con información operativa real, se deben definir el
  entorno de producción, las políticas de acceso, los respaldos y la ubicación
  institucional de los documentos.
- Las cuentas de demostración son solo para pruebas locales; no deben
  utilizarse en producción.

## Puesta en marcha local

Se requiere Node.js 24 o posterior. Desde la raíz del proyecto:

```bash
npm install
npm run api:dev
```

En otra terminal, inicia la interfaz web:

```bash
npm run dev
```

La interfaz queda disponible normalmente en `http://localhost:5173` y la API
en `http://localhost:4000`. La API crea una base local y usuarios de
demostración en el primer inicio.

## Componentes del proyecto

- [`apps/web`](./apps/web): interfaz web en React, TypeScript y Vite.
- [`apps/api`](./apps/api): API en Express y autenticación por roles.
- [`packages/database`](./packages/database): esquema y migraciones SQLite.
- [`docs/processes/roles-and-workflow.md`](./docs/processes/roles-and-workflow.md):
  detalle del proceso por rol.
- [`apps/api/README.md`](./apps/api/README.md): configuración técnica local y
  cuentas de demostración.
# sistema-recepcion-unife

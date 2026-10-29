# Propuesta: archivo de documentos para Recepción

## Objetivo

Dar a Recepción una sección propia para revisar el expediente de cada grupo o
invitado, descargar un paquete listo para subir manualmente a OneDrive y marcar
la carga como terminada. La sección no sustituye el registro de entrada y
salida: un expediente puede estar archivado aunque la visita siga en curso.

## Acceso y navegación

- Mostrar **Archivo documental** únicamente en la navegación del rol Recepción.
- Mantener las pantallas actuales de agenda y registro de visitas separadas.
- La API del archivo y su historial permite únicamente el rol Recepción. La
  consulta de vigencia desde el formulario también funciona para supervisores,
  que ya tienen acceso al flujo y a los documentos existentes.

## Pantalla principal: fichas

Cada ficha representa el expediente de un grupo/visita y muestra:

- Grupo, programa, productor, fecha de visita e integrantes.
- Estado del expediente: **Pendiente de revisión**, **Listo para descargar**,
  **Pendiente de subir a OneDrive**, **Archivado** o **Requiere actualización**.
- Estado de documentos: completos, faltantes, próximos a vencer o vencidos.
- Fecha de vencimiento más próxima y fecha de última carga manual confirmada.
- Acciones disponibles según el estado: **Revisar expediente**, **Descargar
  paquete** y **Marcar como archivado**.

Filtros recomendados: pendientes, archivados, requieren actualización y búsqueda
por nombre de grupo o invitado. Los expedientes archivados dejan de aparecer en
la lista de pendientes, pero siguen disponibles en el historial.

## Revisión del expediente

Al abrir una ficha, Recepción puede revisar:

1. Un PDF resumen con los datos capturados en el formulario, integrantes,
   programa, productor, fecha y estado de cada documento.
2. La identificación de cada adulto y la autorización de uso de imagen.
3. Para menores, los documentos de cada tutor y la autorización correspondiente.
4. La fecha de vencimiento, cuando exista, y las alertas documentales.

El PDF resumen se genera para consulta y archivo; los documentos originales se
mantienen como archivos separados dentro del paquete. Si falta un documento o
se detecta un error, la ficha debe permanecer pendiente y permitir regresar al
registro para corregirlo.

## Descarga y carga manual a OneDrive

Recomendación para una descarga sencilla: un archivo ZIP por expediente, con una
carpeta nombrada de forma consistente, por ejemplo:

```text
2026-10-23_Programa_Grupo/
  formulario.pdf
  invitados/
    Nombre_Apellido/
      identificacion.pdf
      autorizacion_imagen.pdf
    Menor_Nombre/
      tutores/
        Tutor_Nombre/
          identificacion.pdf
          autorizacion.pdf
```

La interfaz ofrece **Descargar paquete** y una instrucción para subirlo a la
carpeta de OneDrive acordada por UNIFE. Descargar no marca el expediente como
archivado. Después de la carga manual, Recepción confirma la acción con **Marcar
como archivado**; opcionalmente puede guardar la fecha y una referencia o URL de
la carpeta de OneDrive si la organización autoriza conservar ese dato.

La confirmación debe pedir una última revisión y, si se usa una referencia,
validar que sea una URL de OneDrive. No se debe afirmar que el sistema verificó
la carga: en esta etapa la confirmación depende de la persona usuaria.

## Reutilización y renovación de documentos

Para no volver a subir documentación vigente en cada visita, conviene separar el
expediente persistente de la persona de las visitas en las que participa:

- Mantener un registro reutilizable de la persona y sus documentos vigentes.
- En una visita nueva, sugerir la documentación vigente y mostrar su estado;
  Recepción confirma que corresponde a esa persona antes de reutilizarla.
- No identificar personas únicamente por nombre. La coincidencia usa el nombre
  completo y el número de identificación; un homónimo sin coincidencia de
  identificación no puede reutilizar documentos.
- Conservar versiones anteriores cuando se reemplaza un documento, registrando
  cuál es la versión vigente y cuál la reemplazada.
- Mostrar alerta roja cuando el documento esté vencido y amarilla cuando venza
  dentro de los próximos tres meses, según la fecha registrada.
- La autorización de imagen y la autorización de tutores vencen un año después
  de su primera carga o renovación explícita. Reutilizarla en otra visita no
  modifica su fecha de vencimiento.
- Las identificaciones no reciben una caducidad inventada; si no tienen una
  fecha registrada, se muestran como disponibles sin declarar una vigencia legal.

## Estados sugeridos

```text
pending_review -> ready_to_download -> pending_onedrive -> archived
       |                 |                    |
       +-----------------+--------------------+-> needs_update
```

- `pending_review`: falta validar el formulario o sus archivos.
- `ready_to_download`: el expediente pasó la revisión.
- `pending_onedrive`: el paquete se descargó; falta confirmar la carga manual.
- `archived`: Recepción confirmó que lo subió a OneDrive.
- `needs_update`: hay documentos vencidos, próximos a vencer o que requieren
  corrección. Al reemplazarlos, se conserva la versión anterior y el nuevo
  expediente vuelve a revisión.

Estos estados son del archivo documental, no del estado de la visita
(`expected`, `inside`, `completed`).

## Cambios técnicos necesarios para implementarlo

1. Se añadió un estado independiente de la visita, con revisión, descarga y
   confirmación manual.
2. Se añadió una relación persistente persona-documento y el historial de
   versiones. La búsqueda usa nombre e identificación para evitar homónimos.
3. El archivo y su historial están protegidos para Recepción en la navegación y
   en la API.
4. Se genera un PDF resumen y un ZIP con el PDF y los documentos originales.
5. La confirmación manual de OneDrive conserva los archivos locales y la ficha.
6. La integración automática con OneDrive queda fuera de esta etapa: el sistema
   registra la confirmación de la usuaria, pero no verifica la carga remota.

No se debe borrar automáticamente una versión anterior ni eliminar la ficha al
marcarla como archivada. La integración automática con OneDrive queda fuera de
esta primera etapa.

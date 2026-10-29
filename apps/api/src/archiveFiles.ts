import { deflateRawSync } from 'node:zlib'
import type { Visit, VisitArchive, VisitDocument } from './visits.js'

type ZipEntry = { name: string; data: Buffer }

const formatDate = (value: string) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium' }).format(new Date(value))
const formatDateTime = (value: string) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const ascii = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7e]/g, '?')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')

function wrap(value: string, width = 92) {
  const words = value.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

function documentDescription(label: string, document: VisitDocument | null) {
  if (!document) return `${label}: FALTANTE`
  const expiration = document.expiresAt ? `; vence ${formatDate(document.expiresAt)}` : ''
  const status = document.status === 'expired' ? 'VENCIDO' : document.status === 'expiring_soon' ? 'POR VENCER' : 'VIGENTE'
  return `${label}: ${document.name} (${status}${expiration})`
}

function visitLines(archive: VisitArchive) {
  const { visit } = archive
  const lines = [
    'UNIFE - EXPEDIENTE DE RECEPCION',
    `Grupo: ${visit.name}`,
    `Programa: ${visit.program}`,
    `Productor: ${visit.producer}`,
    `Llegada esperada: ${formatDateTime(visit.expectedAt)}`,
    `Estado de visita: ${visit.status}`,
    `Estado del archivo: ${archive.status}`,
    `Fecha de revision: ${archive.reviewedAt ? formatDateTime(archive.reviewedAt) : 'Pendiente'}`,
    '',
    'INTEGRANTES Y DOCUMENTOS',
  ]
  for (const member of visit.members) {
    lines.push('', `${member.name} - ${member.role} (${member.personType === 'minor' ? 'menor' : 'adulto'})`)
    lines.push(`Programas: ${member.programs.join(', ')}`)
    if (member.identificationType) lines.push(`Identificacion: ${member.identificationType} ${member.identificationNumber ?? ''}`)
    if (member.curp) lines.push(`CURP: ${member.curp}`)
    if (member.address) lines.push(`Direccion: ${member.address}`)
    if (member.personType === 'adult') {
      lines.push(documentDescription('Identificacion', member.identificationFile))
      lines.push(documentDescription('Uso de imagen', member.imageReleaseFile))
    }
    for (const tutor of member.tutors) {
      lines.push(`Tutor: ${tutor.name} - ${tutor.identificationType} ${tutor.identificationNumber ?? ''}`)
      lines.push(documentDescription('Identificacion del tutor', tutor.identificationFile))
      lines.push(documentDescription('Autorizacion del tutor', tutor.imageReleaseFile))
    }
  }
  return lines.flatMap((line) => wrap(line))
}

export function createArchivePdf(archive: VisitArchive) {
  const lines = visitLines(archive)
  const pageLines = Array.from({ length: Math.ceil(lines.length / 48) }, (_, page) => lines.slice(page * 48, (page + 1) * 48))
  const pageIds = pageLines.map((_, index) => 4 + index * 2)
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  pageLines.forEach((page, index) => {
    const pageId = pageIds[index]
    const contentId = pageId + 1
    const commands = [
      'BT',
      '/F1 10 Tf',
      '46 794 Td',
      '14 TL',
      ...page.flatMap((line) => [`(${ascii(line)}) Tj`, 'T*']),
      'ET',
    ].join('\n')
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`)
  })

  const chunks = [Buffer.from('%PDF-1.4\n', 'ascii')]
  const offsets = [0]
  let offset = chunks[0].length
  objects.forEach((object, index) => {
    offsets.push(offset)
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'ascii')
    chunks.push(chunk)
    offset += chunk.length
  })
  const xrefOffset = offset
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((item) => `${String(item).padStart(10, '0')} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    '%%EOF',
  ].join('\n')
  chunks.push(Buffer.from(`${xref}\n`, 'ascii'))
  return Buffer.concat(chunks)
}

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosTimestamp(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

export function createZip(entries: ZipEntry[]) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  const timestamp = dosTimestamp(new Date())

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const compressed = deflateRawSync(entry.data)
    const checksum = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(timestamp.time, 10)
    local.writeUInt16LE(timestamp.day, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(timestamp.time, 12)
    central.writeUInt16LE(timestamp.day, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDirectory, end])
}

export function archiveDocumentEntries(visit: Visit) {
  return visit.members.flatMap((member) => {
    const entries: Array<{ document: VisitDocument; path: string }> = []
    const memberFolder = `integrantes/${safeFolder(member.name)}`
    if (member.identificationFile) entries.push({ document: member.identificationFile, path: `${memberFolder}/identificacion_${safeFile(member.identificationFile.name)}` })
    if (member.imageReleaseFile) entries.push({ document: member.imageReleaseFile, path: `${memberFolder}/autorizacion_imagen_${safeFile(member.imageReleaseFile.name)}` })
    for (const tutor of member.tutors) {
      const tutorFolder = `${memberFolder}/tutores/${safeFolder(tutor.name)}`
      if (tutor.identificationFile) entries.push({ document: tutor.identificationFile, path: `${tutorFolder}/identificacion_${safeFile(tutor.identificationFile.name)}` })
      if (tutor.imageReleaseFile) entries.push({ document: tutor.imageReleaseFile, path: `${tutorFolder}/autorizacion_${safeFile(tutor.imageReleaseFile.name)}` })
    }
    return entries
  })
}

export function archivePdfFilename(archive: VisitArchive) {
  return `${safeFile(archive.visit.name)}_formulario.pdf`
}

export function archiveZipFilename(archive: VisitArchive) {
  const date = new Date(archive.visit.expectedAt).toISOString().slice(0, 10)
  return `${date}_${safeFile(archive.visit.name)}.zip`
}

function safeFolder(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'persona'
}

function safeFile(value: string) {
  const extension = value.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? ''
  const base = extension ? value.slice(0, -extension.length) : value
  return `${safeFolder(base)}${extension.toLocaleLowerCase()}`
}

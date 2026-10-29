import { z } from 'zod'

const identificationType = z.enum(['ine', 'passport', 'license'])
const tutorSchema = z.object({
  id: z.string().optional(),
  profileId: z.string().optional(),
  reuseIdentification: z.boolean().optional(),
  reuseImageRelease: z.boolean().optional(),
  name: z.string().min(2), identificationType, identificationNumber: z.string().optional(),
})
const memberSchema = z.object({
  id: z.string().optional(),
  profileId: z.string().optional(),
  reuseIdentification: z.boolean().optional(),
  reuseImageRelease: z.boolean().optional(),
  bookingGuestId: z.string().optional(),
  name: z.string().min(2), role: z.string().min(2), personType: z.enum(['adult', 'minor']),
  programs: z.array(z.string().min(2)).min(1), identificationType: identificationType.nullable(),
  identificationNumber: z.string().optional(), curp: z.string().optional(), address: z.string().optional(),
  tutors: z.array(tutorSchema),
}).superRefine((member, context) => {
  if (member.personType === 'adult' && !member.identificationType) context.addIssue({ code: 'custom', path: ['identificationType'], message: 'La identificación es obligatoria para adultos' })
  if (member.personType === 'minor' && member.tutors.length === 0) context.addIssue({ code: 'custom', path: ['tutors'], message: 'Agrega al menos un tutor para el menor' })
})

export const createVisitSchema = z.object({
  bookingId: z.string().optional(),
  name: z.string().min(2), program: z.string().min(2), producer: z.string().min(2), expectedAt: z.string().datetime(),
  members: z.array(memberSchema).min(1),
})

export const lookupPeopleSchema = z.object({
  name: z.string().trim().min(4).max(120),
  identificationNumber: z.string().trim().max(100).optional().default(''),
  personType: z.enum(['adult', 'tutor']).default('adult'),
})

export const createBookingSchema = z.object({
  resource: z.enum(['Foro 1', 'Foro 2', 'Croma', 'Locación']), programId: z.string().min(1),
  startsAt: z.string().datetime(), endsAt: z.string().datetime(), locationName: z.string().optional(), locationAddress: z.string().optional(), notes: z.string().optional(),
  services: z.object({ makeup: z.boolean(), cameras: z.boolean(), vehicle: z.boolean() }),
  guests: z.array(z.object({ name: z.string().trim().min(2).max(100), role: z.string().trim().min(2).max(100) })).min(1).max(50),
}).superRefine((booking, context) => {
  if (booking.resource === 'Locación' && !booking.locationName) context.addIssue({ code: 'custom', path: ['locationName'], message: 'Indica la locación externa' })
})

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(4) })

export const createUserSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  role: z.enum(['reception', 'producer', 'supervisor']),
  password: z.string().min(8).max(100),
  avatarId: z.string().min(1),
})

export const updateUserSchema = createUserSchema.partial().refine((user) => Object.keys(user).length > 0)

export const createProgramSchema = z.object({
  name: z.string().trim().min(2).max(100),
  producer: z.string().trim().min(2).max(80),
  category: z.enum(['unife', 'church']).default('unife'),
})

export const updateProgramSchema = createProgramSchema.omit({ category: true }).extend({
  category: z.enum(['unife', 'church']).optional(),
})

export const createMessageSchema = z.object({
  recipientRole: z.enum(['reception', 'producer', 'supervisor']),
  subject: z.string().min(2).max(100),
  body: z.string().min(2).max(1000),
})

export const cancelBookingSchema = z.object({ reason: z.string().min(5).max(500) })
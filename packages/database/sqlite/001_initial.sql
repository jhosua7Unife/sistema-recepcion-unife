CREATE TABLE avatars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  accent TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) >= 2),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('reception', 'producer', 'supervisor')),
  avatar_id TEXT NOT NULL REFERENCES avatars(id),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  producer_id TEXT NOT NULL REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL CHECK (resource IN ('Foro 1', 'Foro 2', 'Croma', 'Locación')),
  program_id TEXT NOT NULL REFERENCES programs(id),
  producer_id TEXT NOT NULL REFERENCES users(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  location_name TEXT,
  location_address TEXT,
  notes TEXT,
  service_makeup INTEGER NOT NULL DEFAULT 0 CHECK (service_makeup IN (0, 1)),
  service_cameras INTEGER NOT NULL DEFAULT 0 CHECK (service_cameras IN (0, 1)),
  service_vehicle INTEGER NOT NULL DEFAULT 0 CHECK (service_vehicle IN (0, 1)),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL,
  CHECK (ends_at > starts_at),
  CHECK (resource != 'Locación' OR (location_name IS NOT NULL AND length(trim(location_name)) > 0))
);
CREATE INDEX bookings_schedule_idx ON bookings(resource, starts_at, ends_at, status);
CREATE INDEX bookings_producer_idx ON bookings(producer_id, starts_at);

CREATE TABLE booking_guests (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX booking_guests_booking_idx ON booking_guests(booking_id);

CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  booking_id TEXT UNIQUE REFERENCES bookings(id),
  name TEXT NOT NULL,
  program_name TEXT NOT NULL,
  producer_id TEXT REFERENCES users(id),
  producer_name TEXT NOT NULL,
  expected_at TEXT NOT NULL,
  entered_at TEXT,
  exited_at TEXT,
  status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected', 'inside', 'completed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX visits_expected_idx ON visits(status, expected_at);

CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX visitors_name_idx ON visitors(normalized_name);

CREATE TABLE visit_members (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  booking_guest_id TEXT REFERENCES booking_guests(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  person_type TEXT NOT NULL CHECK (person_type IN ('adult', 'minor')),
  programs_json TEXT NOT NULL,
  identification_type TEXT CHECK (identification_type IN ('ine', 'passport', 'license')),
  identification_number TEXT,
  curp TEXT,
  address TEXT,
  document_status TEXT NOT NULL DEFAULT 'missing' CHECK (document_status IN ('valid', 'expired', 'missing'))
);
CREATE INDEX visit_members_visit_idx ON visit_members(visit_id);
CREATE INDEX visit_members_name_idx ON visit_members(name COLLATE NOCASE);

CREATE TABLE visit_tutors (
  id TEXT PRIMARY KEY,
  visit_member_id TEXT NOT NULL REFERENCES visit_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  identification_type TEXT NOT NULL CHECK (identification_type IN ('ine', 'passport', 'license')),
  identification_number TEXT
);
CREATE INDEX visit_tutors_member_idx ON visit_tutors(visit_member_id);

CREATE TABLE visitor_documents (
  id TEXT PRIMARY KEY,
  visit_member_id TEXT REFERENCES visit_members(id) ON DELETE CASCADE,
  tutor_id TEXT REFERENCES visit_tutors(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('identification', 'image_release', 'tutor_authorization')),
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  expires_at TEXT,
  replaced_by TEXT REFERENCES visitor_documents(id),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK ((visit_member_id IS NOT NULL AND tutor_id IS NULL) OR (visit_member_id IS NULL AND tutor_id IS NOT NULL))
);
CREATE INDEX visitor_documents_member_idx ON visitor_documents(visit_member_id, document_type);
CREATE INDEX visitor_documents_tutor_idx ON visitor_documents(tutor_id, document_type);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_role TEXT CHECK (recipient_role IN ('reception', 'producer', 'supervisor')),
  recipient_user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1))
);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_role, recipient_user_id, read, created_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('reception', 'producer', 'supervisor')),
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('reception', 'producer', 'supervisor')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1))
);
CREATE INDEX messages_recipient_idx ON messages(recipient_role, created_at);

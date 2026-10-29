CREATE TABLE visitor_profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  identification_number TEXT NOT NULL DEFAULT '',
  normalized_identification_number TEXT NOT NULL DEFAULT '',
  person_type TEXT NOT NULL CHECK (person_type IN ('adult', 'minor', 'tutor')),
  first_registered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX visitor_profiles_name_idx ON visitor_profiles(normalized_name);
CREATE INDEX visitor_profiles_identity_idx ON visitor_profiles(normalized_name, normalized_identification_number, person_type);

INSERT INTO visitor_profiles (
  id, full_name, normalized_name, identification_number, normalized_identification_number,
  person_type, first_registered_at, created_at, updated_at
)
SELECT
  visit_members.visitor_id,
  visit_members.name,
  lower(trim(visit_members.name)),
  COALESCE(visit_members.identification_number, ''),
  upper(replace(replace(replace(trim(COALESCE(visit_members.identification_number, '')), ' ', ''), '-', ''), '.', '')),
  'adult',
  visits.created_at,
  visits.created_at,
  visits.created_at
FROM visit_members
JOIN visits ON visits.id = visit_members.visit_id
GROUP BY visit_members.visitor_id;

INSERT INTO visitor_profiles (
  id, full_name, normalized_name, identification_number, normalized_identification_number,
  person_type, first_registered_at, created_at, updated_at
)
SELECT
  visit_tutors.id,
  visit_tutors.name,
  lower(trim(visit_tutors.name)),
  COALESCE(visit_tutors.identification_number, ''),
  upper(replace(replace(replace(trim(COALESCE(visit_tutors.identification_number, '')), ' ', ''), '-', ''), '.', '')),
  'tutor',
  visits.created_at,
  visits.created_at,
  visits.created_at
FROM visit_tutors
JOIN visit_members ON visit_members.id = visit_tutors.visit_member_id
JOIN visits ON visits.id = visit_members.visit_id
GROUP BY visit_tutors.id;

ALTER TABLE visit_members ADD COLUMN profile_id TEXT REFERENCES visitor_profiles(id);
ALTER TABLE visit_tutors ADD COLUMN profile_id TEXT REFERENCES visitor_profiles(id);

UPDATE visit_members SET profile_id = visitor_id;
UPDATE visit_tutors SET profile_id = id;

CREATE TABLE visitor_profile_documents (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES visitor_profiles(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('identification', 'image_release', 'tutor_authorization')),
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  expires_at TEXT,
  replaced_by TEXT REFERENCES visitor_profile_documents(id),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX visitor_profile_documents_current_idx ON visitor_profile_documents(profile_id, document_type, replaced_by, created_at);
CREATE INDEX visitor_profile_documents_storage_idx ON visitor_profile_documents(storage_key);

INSERT INTO visitor_profile_documents (
  id, profile_id, document_type, storage_key, original_name, mime_type, byte_size, expires_at, uploaded_by, created_at
)
SELECT
  visitor_documents.id,
  visit_members.profile_id,
  visitor_documents.document_type,
  visitor_documents.storage_key,
  visitor_documents.original_name,
  visitor_documents.mime_type,
  visitor_documents.byte_size,
  CASE
    WHEN visitor_documents.document_type = 'image_release'
      THEN COALESCE(visitor_documents.expires_at, strftime('%Y-%m-%dT%H:%M:%fZ', visitor_documents.created_at, '+1 year'))
    ELSE visitor_documents.expires_at
  END,
  visitor_documents.uploaded_by,
  visitor_documents.created_at
FROM visitor_documents
JOIN visit_members ON visit_members.id = visitor_documents.visit_member_id
WHERE visit_members.profile_id IS NOT NULL;

INSERT INTO visitor_profile_documents (
  id, profile_id, document_type, storage_key, original_name, mime_type, byte_size, expires_at, uploaded_by, created_at
)
SELECT
  visitor_documents.id,
  visit_tutors.profile_id,
  visitor_documents.document_type,
  visitor_documents.storage_key,
  visitor_documents.original_name,
  visitor_documents.mime_type,
  visitor_documents.byte_size,
  CASE
    WHEN visitor_documents.document_type = 'tutor_authorization'
      THEN COALESCE(visitor_documents.expires_at, strftime('%Y-%m-%dT%H:%M:%fZ', visitor_documents.created_at, '+1 year'))
    ELSE visitor_documents.expires_at
  END,
  visitor_documents.uploaded_by,
  visitor_documents.created_at
FROM visitor_documents
JOIN visit_tutors ON visit_tutors.id = visitor_documents.tutor_id
WHERE visit_tutors.profile_id IS NOT NULL;

CREATE TABLE visit_archives (
  visit_id TEXT PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'needs_update', 'ready_to_download', 'pending_onedrive', 'archived')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  downloaded_at TEXT,
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX visit_archives_status_idx ON visit_archives(status, updated_at);

INSERT INTO visit_archives (visit_id, status, created_at, updated_at)
SELECT id, 'pending_review', created_at, created_at FROM visits;

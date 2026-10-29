ALTER TABLE programs
ADD COLUMN category TEXT NOT NULL DEFAULT 'unife'
CHECK (category IN ('unife', 'church'));

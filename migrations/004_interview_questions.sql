ALTER TABLE interviews ADD COLUMN prepared_questions text[] NOT NULL DEFAULT '{}';
ALTER TABLE passages ADD COLUMN question_id uuid REFERENCES passages(id) ON DELETE SET NULL;

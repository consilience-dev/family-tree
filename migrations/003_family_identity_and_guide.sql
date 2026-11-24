ALTER TABLE people ADD COLUMN birth_name text NOT NULL DEFAULT '', ADD COLUMN former_names text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX one_profile_per_account ON people(family_id,linked_account_id) WHERE linked_account_id IS NOT NULL;
ALTER TABLE invites ADD COLUMN person_id uuid, ADD COLUMN relationship text,
  ADD FOREIGN KEY(family_id,person_id) REFERENCES people(family_id,id);
ALTER TABLE interviews ADD COLUMN interviewer_person_id uuid,
  ADD FOREIGN KEY(family_id,interviewer_person_id) REFERENCES people(family_id,id),
  ADD COLUMN guide_topic integer NOT NULL DEFAULT 0,
  ADD COLUMN guide_probes integer NOT NULL DEFAULT 0;
ALTER TABLE passages ADD COLUMN guide_topic integer;
CREATE TABLE family_connections (
  id uuid PRIMARY KEY, family_id uuid NOT NULL, source_id uuid NOT NULL, target_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('sibling','cousin','mother-in-law','father-in-law','parent-in-law')),
  reported_by uuid NOT NULL REFERENCES accounts, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(family_id,source_id) REFERENCES people(family_id,id) ON DELETE CASCADE,
  FOREIGN KEY(family_id,target_id) REFERENCES people(family_id,id) ON DELETE CASCADE,
  CHECK(source_id<>target_id), UNIQUE(family_id,source_id,target_id,kind)
);
CREATE INDEX connections_in ON family_connections(family_id,target_id);
CREATE VIEW family_graph AS
 SELECT id,family_id,source_id,target_id,kind,claim_id FROM edges UNION ALL
 SELECT id,family_id,source_id,target_id,kind,NULL::uuid FROM family_connections;

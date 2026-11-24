-- A deliberate same-person assertion between two local profiles.
CREATE TABLE archive_connections (
 id uuid PRIMARY KEY, family_a uuid NOT NULL, person_a uuid NOT NULL,
 family_b uuid NOT NULL, person_b uuid NOT NULL, confirmed_by uuid NOT NULL REFERENCES accounts,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK (family_a < family_b),
 FOREIGN KEY (family_a,person_a) REFERENCES people(family_id,id) ON DELETE CASCADE,
 FOREIGN KEY (family_b,person_b) REFERENCES people(family_id,id) ON DELETE CASCADE,
 UNIQUE (family_a,person_a,family_b), UNIQUE (family_b,person_b,family_a)
);

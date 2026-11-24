ALTER TABLE interviews ALTER COLUMN consent_by DROP NOT NULL;
ALTER TABLE interviews ADD COLUMN guest_consent boolean NOT NULL DEFAULT false;
ALTER TABLE interviews ADD CHECK (consent_by IS NOT NULL OR guest_consent);
CREATE TABLE guest_links (
 id uuid PRIMARY KEY, family_id uuid NOT NULL REFERENCES families ON DELETE CASCADE,
 person_id uuid NOT NULL, interview_id uuid, kind text NOT NULL CHECK(kind IN ('story','interview')),
 token_hash text UNIQUE NOT NULL, browser_hash text, created_by uuid NOT NULL REFERENCES accounts,
 share_audio boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(family_id,person_id) REFERENCES people(family_id,id) ON DELETE CASCADE,
 FOREIGN KEY(family_id,interview_id) REFERENCES interviews(family_id,id) ON DELETE CASCADE,
 CHECK(kind<>'story' OR interview_id IS NOT NULL)
);
CREATE INDEX guest_links_family ON guest_links(family_id,created_at);
CREATE TABLE saved_story_links (
 family_id uuid NOT NULL REFERENCES families ON DELETE CASCADE,
 link_id uuid NOT NULL REFERENCES guest_links ON DELETE CASCADE,
 PRIMARY KEY(family_id,link_id)
);

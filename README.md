# Family Tree

A working, private, web-first MVP for family oral history. React 19 + Vite, Express 5, PostgreSQL, and a durable extraction queue. The local demo uses **PGlite, actual PostgreSQL compiled to WebAssembly**, persisted on the server filesystem. A normal PostgreSQL connection uses the same schema and queries.

## Run it

Requires Node.js 22.12+ and npm. No API key, Docker, external database, or cloud account is needed for the demo.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:3000**, then choose **Explore the demo family**. All seed people, relationships, and memories are fictional. Changes persist in `.data/postgres`, not in browser storage. You can also create a password account and a completely empty, separate family workspace.

On the Mac used to build this project, Node was not installed. A checksum-verified official runtime was downloaded to `/private/tmp/family-tree-runtime`. Run `./scripts/dev.sh` to reuse it. That temporary runtime may disappear after reboot; install Node from [nodejs.org](https://nodejs.org) for ongoing development. The helper never downloads or installs software itself.

```sh
npm test       # HTTP integration tests against real embedded PostgreSQL
npm run build # production browser bundle
npm start     # serves the bundle; production cookies require HTTPS
```

`npm run dev` binds to loopback. `APP_ORIGIN` must exactly match the browser origin, including port, for mutations to work. Restart after changing server code or `.env`; Vite refreshes browser code automatically. `HOST=0.0.0.0` can be set explicitly for a container behind a trusted HTTPS reverse proxy.

## Try the complete flow

1. Explore the fictional demo, or register and create a family workspace.
2. In **Members & settings → My family profile**, connect your login to your profile. In **People**, add your sister with her current name, birth name, and any former names.
3. In **Members & settings**, choose her profile, select **sibling**, and create an expiring membership invitation. Send the link privately. She signs in with her own account and confirms the named profile. On acceptance the app records the declared relationship. A membership-only invitation also works.
4. In **Interviews → Start an interview**, she can choose herself, an existing person, or **Add a new relative**. To interview her mother-in-law, choose that relative, select **mother-in-law**, and confirm consent. The archive records both names. The storyteller can participate without an account. Choose English, Punjabi, Hindi, or Urdu. Live voice processing and keeping a microphone recording each have separate consent.
5. The guide begins with birthplace, followed by birth date, names, caregivers, siblings and household, and life events. Add up to ten questions in the interview language before starting. A saved answer prompts a follow-up and the guide then advances. Choose **Ask for more detail**, **Skip to next topic**, select a topic, or type your own question at any time. Reopening the interview restores the guide and transcript.
6. Choose **Finish & discover**. Each proposed family fact goes to review with a quote and a link to the original answer. New answers also retain the exact question. Reviewers select the person and resolve conflicting accounts. The tree displays accepted extracted relationships and explicit family-reported connections.
7. Expand the tree, open profiles and timelines, search the original transcripts, or ask the historian and choose a controlled tree, people, timeline, or story view.
8. Export the workspace as JSON. Audio files are available through authenticated interview players. Withdraw recording consent to remove stored recordings, delete a particular interview with its derived claims and edges, or delete the whole workspace as its owner.

## What runs, and what needs credentials

| Feature | With no credentials | With configuration |
| --- | --- | --- |
| Password accounts, private workspaces, memberships, invitation acceptance | Working | Same behavior |
| People, sources, expandable trees, timelines, export/delete | Working | Same behavior |
| Original-language text interviews | Working; deterministic, explicitly labeled demo questions | Model-generated, source-informed follow-ups |
| Extraction | Conservative demo: each answer becomes an uncertain recollection for review; no invented people or relationships | Structured extraction of people, aliases, parent/partner relationships, events, and facts |
| Historian | Retrieves and cites original passages; explicitly says it is not an AI answer | Grounded model answers with validated source IDs |
| Natural AI voice | Disabled, with text fallback | WebRTC + OpenAI Realtime |
| Audio storage | Protected files under `.data/recordings`; never served as static files | Private S3-compatible object storage |
| Canonical data | Persistent local PostgreSQL via PGlite | Network PostgreSQL via `DATABASE_URL` |

A local browser check with fictional Punjabi testimony verified a live AI follow-up, a successful Realtime voice handshake, a saved synthetic microphone clip, and extraction of a birthplace into the review queue. Real-speaker Punjabi accuracy and live S3 storage still need validation. The automated suite uses controlled model responses for repeatability. The preview runs locally.

## Enable AI voice and extraction

Set the following **server-only** environment variables in `.env` and restart:

```dotenv
OPENAI_API_KEY=your_project_key
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_VOICE_MODEL=gpt-realtime-2.1
```

The default text model is a configurable supported model, selected for a small MVP workload, not a claim to be the newest model. The voice model and unified WebRTC call endpoint follow the official documentation checked during implementation. Account/model availability can vary.

The server exchanges SDP with `POST /v1/realtime/calls`. The browser never receives the project API key. Microphone permission is requested from a user click on localhost or HTTPS; the browser sends live audio to OpenAI over WebRTC. The app saves each selected question, asks the voice to read it aloud, and saves completed microphone transcripts as answers. The saved question is the script the voice was asked to read. Voice recognition and generation, especially Punjabi dialects and names, must be checked with real interviewees before relying on it. There is always a typed fallback. There is no browser speech-recognition dependency.

The interview screen identifies the AI interviewer, asks one question at a time, allows pauses, avoids assuming unmentioned relatives, and receives prior transcript and reviewed testimony as context. Text follow-ups receive the latest answer and accepted sources. Generated outputs are suggestions or sourced accounts, never independently verified facts.

A retained recording contains the **interviewee microphone track**, not a mixed recording of the AI speaker. After explicit recording consent, select **Start live voice** for a transcript and AI interview, or **Record without AI** to save a microphone clip by itself. Select **Stop and save recording** and check playback in the interview. Segments stop after five minutes; uploads are limited to 12 MB. A failed upload displays an error; do not assume an unsaved recording can be recovered after navigating away. Typed responses and voice passages already saved remain available. Stopping voice closes the browser peer connection and microphone tracks.

Responses requests use `store:false`. This does not promise zero provider retention; provider data policies and account settings still apply. The consent screen discloses external processing when configured. Extracted claims are reviewed before entering the canonical graph. Client-supplied transcripts are testimony, not tamper-proof evidence of a recording.

## Network PostgreSQL

Point `DATABASE_URL` at a dedicated PostgreSQL database (17+). The app runs numbered, checksum-checked SQL migrations transactionally at startup; a PostgreSQL advisory lock serializes concurrent migration runners. Add a new migration rather than editing an already-applied one.

Optional local PostgreSQL with Docker:

```sh
export POSTGRES_PASSWORD='choose-a-local-database-password'
docker compose up -d
```

Then set `DATABASE_URL=postgres://family_tree:YOUR_URL_ENCODED_PASSWORD@localhost:5432/family_tree`. For a real deployment, create the database through your provider, require verified TLS according to its instructions, and keep it reachable only by the backend. Do not expose database credentials to the browser. Do not set TLS certificate validation to false.

PGlite is a convenient single-process local database; it is not a horizontally scalable production service. Do not point two processes at its data directory. With network PostgreSQL, `npm run worker` can run an additional worker. The web process also polls the queue every two seconds. `FOR UPDATE SKIP LOCKED`, attempt fencing, and transactional completion prevent duplicate extracted claims. Expired five-minute leases can be reclaimed; failures retry with a delay, stop after three attempts, and can be explicitly retried from the interview. Network PostgreSQL itself was not provisioned in this environment, so that adapter path still needs a connection-level smoke test on the target provider.

## Private object storage

Set `S3_BUCKET`, `S3_REGION`, and credentials from the deployment secret manager or workload identity. Set `S3_ENDPOINT` only for an S3-compatible provider. Use a bucket with public access blocked, a narrowly scoped service role, TLS, server-side encryption support, and a retention/lifecycle policy appropriate to your family. Uploads request AES256 server-side encryption; incompatible providers require adapting that option. The app does not create or configure a bucket.

Objects have random keys namespaced by family. The server checks current membership and interview consent before streaming a recording; it does not issue public URLs. Credentials and object keys stay on the server. Stored metadata contains byte count, MIME type, and interview identity. Recording withdrawal removes objects and metadata and turns off further uploads. Interview/workspace deletion removes objects before deleting database records; if object deletion fails, the request fails so you can retry. Object storage and SQL are not a distributed transaction: partial object-delete failures may leave a previously recorded clip unavailable until cleanup is retried. Bucket versioning and backups need separate retention configuration; app deletion cannot promise deletion from your provider's backups.

Use S3 in production. Local audio files are an explicitly labeled local fallback and need a persistent, access-restricted volume.

## Data model and access boundary

- Accounts control access. People hold a current display name, an optional birth name, and former names. An owner can link an existing person to their own account. A named invitation allows the intended relative to explicitly confirm their profile. Each account links to at most one person per family. Name matches alone never link accounts.
- Parent edges are directional: **source is parent of target**. Partners are stored as a single symmetric semantic edge. Composite `(family_id,id)` foreign keys prevent cross-family references even when an ID is guessed. Both incoming and outgoing edges are indexed.
- Interviews record the host account and linked host profile, storyteller, language, consent, recording choices, guide position, and prepared questions. Each new answer references its saved question. Client IDs deduplicate retried saves.
- `jobs` hold durable extraction state. Each proposed typed `claim` has an exact source quote and passage ID, uncertainty, identity candidates, and review state. The extractor rejects the entire batch if any quote does not match a passage by the interviewee. No partial graph is committed.
- Accepted aliases live in `person_aliases`, linked to their source claims; source deletion removes them. Manually entered aliases are preserved separately on the person.
- Accepted edges/events refer back to reviewed claims, which refer to passages. Source deletion cascades through these derived records. Explicitly created people remain, as they may have other evidence.
- No name matching proves identity. Reviewers must choose identities or explicitly create distinct people. Equal names and aliases are only candidates. There is no irreversible automatic person merge.
- Singleton birth/death predicates (`birth_date`, `birth_year`, `birth_place`, `death_date`, `death_year`, `death_place`) and exact matching event descriptions with different dates trigger conflict review. Both accepted accounts are retained if the reviewer acknowledges the disagreement. Other recollections, multiple children, and aliases may coexist. This is deliberately limited conflict detection; semantically equivalent paraphrases require human review.
- Trees use recursive PostgreSQL CTEs bounded to 0–6 hops, deduplicate at each depth, and return at most 100 people plus edges among them. Direction can be ancestors, descendants, or all connections. Ancestry-cycle checks run in the review transaction. Tree layout aligns partners visually; layout never creates genealogical facts.
- Search uses a GIN index on `to_tsvector('simple',text)` with a substring fallback for original-script queries. No vector database is used: the vertical slice does not justify it. Historian retrieval is bounded to 12 passages and 100 entities, not exhaustive semantic search of a very large archive.
- The server selects and hydrates four allowlisted UI component types. Model text never becomes executable HTML, JavaScript, arbitrary component definitions, or database queries. Returned citation IDs are checked against retrieved sources from that family.

This MVP uses an **equivalent server-side tenant access boundary rather than claiming database RLS**. Every family API request checks membership and role; resource queries include `family_id`, and composite foreign keys enforce tenant consistency. All SQL is parameterized; database access is server-only. Workers intentionally use a trusted service connection to process queued jobs across families. Never share that connection with users, analytics tools, or a public client. A separate RLS deployment would require authenticated per-transaction user context and policies; that is not silently claimed here.

Passwords use salted scrypt. Session/invite tokens are random 256-bit values stored only as SHA-256 hashes. Sessions are HttpOnly, SameSite Strict, expire after seven days, and use Secure cookies in production. Mutations require the exact configured Origin. Invitations are hashed, single-use, expiring, revocable, and accepted under row lock. The browser uses React escaping, a production content security policy, private/no-store API responses, and locally bundled fonts. There are no third-party analytics.

## Production setup and remaining limits

This is a functional MVP, not a claim of production certification. For your own small private pilot:

1. Use a dedicated network PostgreSQL instance, private S3 bucket, secret manager, and persistent backups with documented restore and deletion policies.
2. Set `DEMO_MODE=false`, `NODE_ENV=production`, an HTTPS `APP_ORIGIN`, and the credentials above. Keep the seeded demo database separate from real family data. Disabling demo prevents demo login and seed creation; it does not erase an already-seeded database.
3. Run `npm ci && npm run build`; run the server behind HTTPS. A Dockerfile is included but Docker was unavailable here, so the image has not been built or deployed. It binds to `0.0.0.0` inside the container; publish only through your intended reverse proxy.
4. Provision the app as a private pilot and test real Punjabi voice, bucket access, account recovery procedures, and provider costs with informed participants before wider invitations.

Known boundaries: password email verification, recovery, MFA, OAuth, transactional invitation email, owner transfer, account deletion, a granular audit log, background job monitoring, per-family cost quotas, and distributed rate limiting are not implemented. Existing account passwords cannot be reset through the UI. In-memory request limits suit a single-process pilot, not many independent web nodes. All family members can read the workspace; there is no per-interview restricted audience. Only owners can export the full archive or remove a workspace. Editors can delete interviews and review history. There is no autosave for an unsent text draft. Interviews accept at most 100 interviewee answers, 400 total speaker passages, and 120,000 characters; start a new session for a longer conversation. Very large interview extraction needs chunking beyond this slice. Semantic duplicate/conflict detection and citation entailment need further evaluation; exact-quote/citation validation proves provenance identity, not truth or that an AI conclusion follows from its source. UI is responsive with labeled controls, keyboard-native dialogs and focus outlines, and reduced-motion support; no claim of a formal accessibility audit. A membership removal blocks new app requests but does not remotely hang up a previously issued realtime connection; close voice sessions before removing access to an active interview.

## Verification

The automated suite exercises HTTP routes, authentication, family isolation, single-use/expired/revoked invitations, editor/viewer permissions, non-account relatives, Punjabi persistence, consent gates, durable and idempotent extraction, exact-quote rollback, failed-job retries, identity resolution review, ancestry cycle rejection, bounded directional trees, conflicting accounts, protected audio and withdrawal, source-bound alias deletion, historian citations, JSON export, cascade deletion, and persistence across database reopen. Browser checks cover the seeded dashboard, a Punjabi text interview, discovery review, the tree and sources, historian views, and a mobile viewport. See the live browser verification above for OpenAI coverage. The S3 integration still requires a configured bucket for an end-to-end test.

## Official references checked

- [React createRoot](https://react.dev/reference/react-dom/client/createRoot)
- [Vite getting started and supported Node versions](https://vite.dev/guide/)
- [Express 5](https://expressjs.com/en/guide/migrating-5/)
- [PGlite persistence and SQL API](https://pglite.dev/docs/)
- [PostgreSQL recursive queries](https://www.postgresql.org/docs/current/queries-with.html)
- [PostgreSQL row-security boundaries](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [OpenAI conversation controls and manually triggered voice responses](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI WebRTC unified interface](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
- [OpenAI structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 mini support](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

## Start live AI on this Mac

Open **Start Family Tree Live.command** from Finder or run it in Terminal. The first launch asks for your Family Tree project API key with hidden input. It saves the credential to an owner-readable file at `~/Library/Application Support/Family Tree/openai.key`. The launcher reads that file on subsequent starts, builds the client, and starts the private app at http://127.0.0.1:3100. It uses a separate local PostgreSQL data directory and recording directory under Application Support. Create a family account on first use. Keep the Terminal window open while using the app.

Use `python3 scripts/live.py --status` to check key presence without displaying it. Restart with `--replace-key` when rotating the key. A saved key indicates configuration only. Verify service access with a short interview before inviting relatives. For hosting, use an application service account and the host's secret manager as described above.

## Family archives and shared people

An account can contribute to several private archives. A relative can have a local profile in each archive, including people who have never signed in. The first-story screen creates a private archive and prepares the storyteller’s interview. Rename it later in **Members & settings**.

Open a person, choose **Connect to another archive**, select their existing profile there or add a new one with just their display name, and confirm the match. Creating or removing a connection requires contribution access in both archives. **Family tree → Where your archives connect** lists direct, confirmed overlaps visible to the current member. Open the other profile and choose **Explore their tree** to continue from that person. Each archive maintains its own facts, participants, and interviews. The fictional demo includes Harjit Kaur in two archives.

**Share a story** creates a seven-day read-only link to one completed interview after the sender confirms the storyteller’s permission. Audio sharing has a separate opt-in. A recipient signed in to another archive can save a reference under **Interviews**. Every read checks the original link and recording consent. Turning off or expiring a link prevents future reads through shared references. Previously downloaded copies are outside the app’s control.

**Invite someone to be interviewed** creates a seven-day link to one storyteller. The recipient selects their language and gives consent directly. Starting binds the interview to that browser, where the same link resumes it. Guests can use guided text, consented live voice, and consented recording. They receive no archive membership. **Members & settings → Story and interview links** turns off either kind of link. The local preview’s links work on the host Mac. Remote relatives need a hosted HTTPS origin.

New membership invitations grant collaboration without asking the sender to choose a role. Existing read-only memberships keep their original access. The archive creator retains member removal, full export, and archive deletion.

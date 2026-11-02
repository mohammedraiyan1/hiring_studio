# NEX Talent & Recruit — Prototype

> Unofficial prototype for NEX Solutions review. Not an approved production recruitment service. Do not enter real candidate personal data.

**AI job description, interview question and hiring rubric generator — with candidate scoring and comparison.**

Built for small-business owners and hiring managers with no HR function. Describe a role in two sentences and get
back one connected hiring kit: a job description, a structured interview script, and a weighted scoring rubric that
all describe the *same* competencies. Score candidates against that rubric, then compare them side by side.

```
Role input → retrieval over a hiring knowledge base → Gemini
           → job description + interview questions + rubric
           → candidate scoring → candidate comparison
```

---

## Quick start

Requires **Node.js 18 or newer** (`node --version`). Nothing else — no database to install, no API key needed for
the first run.

```bash
git clone <your-repo-url>
cd <repo>
npm run setup
```

Then create the server environment file:

```bash
# Windows
copy server\.env.example server\.env

# macOS / Linux
cp server/.env.example server/.env
```

Open `server/.env` and paste your Gemini API key (see below). Then:

```bash
npm run dev
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:5000>

Create an account on the sign-in screen, then use one of the example presets on the **New role** page to see the whole
flow in under a minute.

### Production-style single-port run

```bash
npm run build
npm start
```

The API then serves the built frontend from the same port: <http://localhost:5000>.

---

## Configuration

All configuration lives in **`server/.env`**. The example file is fully commented; these are the values that matter.

| Variable | Required | What it does |
| --- | --- | --- |
| `GEMINI_API_KEY` | Recommended | Enables real generation and embeddings. Free key from [Google AI Studio](https://aistudio.google.com/apikey). Without it the app runs in a clearly-labelled offline demo mode. |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.0-flash` (free tier). |
| `GEMINI_EMBEDDING_MODEL` | No | Defaults to `text-embedding-004`. |
| `MONGODB_URI` | Required in production | MongoDB connection string. Local JSON storage is development-only; production startup fails if this is missing or MongoDB is unreachable. |
| `MONGODB_DB` | No | Database name, defaults to `hiring_studio`. |
| `JWT_SECRET` | Required in production | A persistent, high-entropy random secret. Do not use an ephemeral production secret. |
| `PORT` | No | Defaults to `5000`. |

**Getting a free Gemini API key**

1. Go to <https://aistudio.google.com/apikey>.
2. Sign in with a Google account and choose **Create API key**.
3. Paste it into `server/.env` as `GEMINI_API_KEY=...` and restart the server.

The key is only ever read server-side. The browser talks to `/api` and never sees it.

**Using MongoDB Atlas (required for production; optional for local development)**

1. Create a free M0 cluster at <https://cloud.mongodb.com>.
2. Add a database user with a strong password. In Atlas Network Access, allow Render's outbound IP addresses if fixed egress is configured; otherwise use `0.0.0.0/0` only as a temporary prototype setting and restrict the database user to the minimum required privileges.
3. Copy the connection string into Render's backend service environment as `MONGODB_URI`, replacing the username, password and database name placeholders. Never commit this value to Git.

Documents use string `_id`s, so the same data shape works in either backend.

---

## How it works

### 1. Retrieval

A curated knowledge base ships with the project: competency frameworks, STAR interviewing guidance, rubric-design
rules, structured-hiring practice, and role-family notes for engineering, sales, marketing, operations, product,
design, support and finance. It is chunked, embedded and indexed at boot, so retrieval is meaningful before anyone
uploads anything. You can add your own PDF, TXT, Markdown or JSON material on the **Knowledge base** page.

Retrieval is **hybrid**, because the two channels fail in different ways:

- **Dense** — Gemini `text-embedding-004` vectors, cosine similarity, with `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`
  task types and an on-disk embedding cache so restarts cost no quota.
- **Lexical** — an in-memory Okapi BM25 index that splits `camelCase` and `snake_case` on both the indexing and query
  side and folds a few English suffixes, so exact competency vocabulary is never missed.

The two ranked lists are combined with **Reciprocal Rank Fusion** (`score += weight / (60 + rank)`), which avoids
having to make two incomparable score scales agree. A small metadata prior boosts documents tagged for the role
family inferred from the job title. Selection is then **diversified**: at most two passages per source, plus a
guarantee that at least one interviewing-guidance passage reaches the prompt — otherwise a long role-specific
document can occupy every slot and the rubric comes back with no behavioural anchoring.

If no API key is present, the dense channel is simply absent and retrieval degrades to BM25 rather than failing.
`TOP_K` is a named constant in `server/src/rag/retriever.js`.

### 2. Generation

One Gemini call produces the whole kit, so the three parts are connected by construction rather than stitched
together afterwards. The response is requested as JSON, then:

1. Parsed tolerantly (fenced blocks and surrounding prose are stripped).
2. Coerced into a canonical shape — shape drift is repaired silently.
3. Validated for substance (enough responsibilities, all five rubric levels present, every question category filled).
4. If substance is missing, **one targeted repair pass** is sent listing only the specific problems, which is cheaper
   and more faithful than regenerating.
5. If it is still incomplete but usable, it is returned with visible warnings. If it is a shell, the request fails
   with a friendly message instead of rendering a broken kit.

Transient upstream failures (429/503, timeouts) are retried with exponential backoff; a bad prompt is not.

### 3. Alignment check

The claim that the description, questions and rubric describe the same job is *checked*, not asserted. The model is
asked to declare which rubric dimensions each question tests and which responsibilities each dimension covers; those
declarations are resolved against the real content, with lexical-overlap inference as a fallback, and anything left
uncovered is reported. The **Alignment check** tab shows the traceability matrix and flags, for example, a rubric
dimension that no interview question tests — which would otherwise be scored on impression alone.

### 4. Scoring and comparison

Candidate evaluation is derived from stored scores, so there is one source of truth for a candidate's numbers.
Beyond weighted totals and percentages, the comparison engine computes:

- **Dimension discrimination** — the spread of each dimension across the cohort. A dimension everyone scored the same
  on contributed nothing to the ranking and is flagged, rather than shown as a column of identical threes.
- **Relative strengths and gaps** — per-dimension z-scores against the cohort, so "strong" means strong against the
  people who actually applied.
- **Borda count** as a robustness cross-check. When the per-dimension win count disagrees with the weighted ranking,
  the lead depends on the rubric weighting rather than broad superiority — and the UI says so.
- **Interviewer leniency** — each interviewer's average offset from the cohort mean, with adjusted scores. Only
  computed when each interviewer assessed at least two candidates, because otherwise the offset describes the
  candidate, not the interviewer.
- **Decision confidence** — the gap between the top two candidates measured against the cohort's own spread. A
  two-point gap on a thirty-point scale is noise, and the app labels it *too close to call* rather than declaring a
  winner.
- **Evidence completeness** — the share of scores with written justification, surfaced as a warning.

The comparison view ranks and explains. It never renders a hire/no-hire verdict.

---

## Project structure

```
server/
  src/
    config/env.js          Environment loading, placeholder detection, startup summary
    store/                 One collection interface, two drivers (MongoDB / local file)
    ai/
      gemini.js            Generation, embeddings, retry, tolerant JSON parsing
      prompts.js           Kit prompt and repair prompt
      validation.js        Canonical shape coercion and substance validation
      alignment.js         Traceability between description, questions and rubric
      demoKit.js           Offline fallback used only when no API key is set
    rag/
      corpus.js            Bundled hiring knowledge base
      chunk.js             Paragraph-aware chunking with overlap
      lexical.js           BM25 index
      vector.js            Embedding cache and cosine similarity
      retriever.js         Hybrid retrieval, RRF fusion, diversified selection
      ingest.js            PDF / TXT / MD / JSON text extraction
    scoring/
      evaluate.js          Per-candidate aggregation
      compare.js           Cohort statistics, Borda, interviewer effects, confidence
    routes/                auth, roles, candidates, knowledge
client/
  src/
    pages/                 Login, dashboard, new role, kit, candidates, comparison, knowledge
    components/            UI primitives, app shell, scorecard, radar chart, kit views
    api/client.js          Single fetch wrapper; token handling
```

## API

All routes are under `/api`. Everything except `/api/health` and `/api/auth/*` requires
`Authorization: Bearer <token>`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Storage backend, AI mode, retrieval stats |
| `POST` | `/auth/register`, `/auth/login` | Returns a JWT |
| `GET` | `/auth/me` | Current user |
| `GET` `POST` | `/roles` | List roles / generate a hiring kit |
| `GET` `DELETE` | `/roles/:id` | Full kit / delete role and its candidates |
| `GET` `POST` | `/roles/:roleId/candidates` | List / create scorecards |
| `PUT` `DELETE` | `/candidates/:id` | Update / delete a scorecard |
| `GET` | `/roles/:roleId/comparison` | Ranking, statistics and insights |
| `GET` | `/knowledge` | Knowledge base stats and uploads |
| `POST` | `/knowledge/upload`, `/knowledge/text` | Ingest a file or a pasted note |
| `DELETE` | `/knowledge/:id` | Remove an uploaded document |

## Deployment

**Frontend (Vercel)** — root directory `client`, build command `npm run build`, output `dist`. Set
`VITE_API_URL` to your deployed API origin plus `/api`. `client/vercel.json` already routes SPA deep links.

**Backend (Render / Railway)** — root directory `server`, build `npm install`, start `npm start`. Set
`GEMINI_API_KEY`, `JWT_SECRET`, `MONGODB_URI` (mandatory in production; the server now refuses local-file fallback when `NODE_ENV=production`)
and `CLIENT_ORIGIN` to your frontend URL. For the prototype admin bootstrap, set `NEX_BOOTSTRAP_TOKEN` to a long random secret. For invited staff registration, set `NEX_STAFF_INVITE_CODE` to a separate secret. Never expose either value in frontend environment variables.

Alternatively deploy the whole thing as one service: build the client, then run the server, which serves
`client/dist` when it exists.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Badge reads *Offline demo mode* | `GEMINI_API_KEY` is empty or still a placeholder in `server/.env`. Add a key and restart. |
| Retrieval mode stays *lexical* | Embeddings need an API key. Without one, BM25 retrieval is used and the app still works. |
| `EADDRINUSE :::5000` | Another process holds port 5000. Change `PORT` in `server/.env`. |
| Logins stop working after a restart | `JWT_SECRET` is unset, so an ephemeral secret is generated per boot. Set it. |
| `MONGODB_URI is required in production` | Add `MONGODB_URI` to the Render backend service environment, then redeploy. Do not disable the production database guard. |
| `Production database unavailable` | Check Atlas cluster status, database username/password, URL encoding of special password characters, database name, and Atlas Network Access allowlist. |
| Upload rejected as *almost no text* | The PDF is a scanned image. This project does not OCR — paste the text as a note instead. |

## Notes on scope

- Plain JavaScript throughout (`.js` / `.jsx`), no TypeScript.
- Google Gemini is the only AI provider.
- Dark-only interface, on a palette validated for colour-vision deficiency separation and 3:1 contrast against the
  chart surface. The candidate radar chart is capped at three overlaid candidates because that is the largest set
  whose colours remain distinguishable for all-pairs comparison; the full cohort is always available in the table.


## NEX prototype capabilities

- **Candidate portal:** public vacancy listing and role detail pages at `/careers`; candidates can submit a basic application with name, email, optional phone and cover note. The application form records consent and a policy-version marker. CV upload, candidate accounts, email confirmations and candidate self-service tracking are not implemented yet.
- **Recruiter workspace:** existing AI hiring-kit generation, role-specific rubric, candidate scorecards, interview workflows and candidate comparison remain available. Recruiters can publish and unpublish a vacancy to the prototype careers portal.
- **Workspace access:** staff registration requires `NEX_STAFF_INVITE_CODE`; accounts are assigned to the isolated `nex-prototype` workspace. Staff roles are `admin`, `recruiter`, `hiring_manager` and `interviewer`.
- **Admin bootstrap:** make one authenticated server-side request to `POST /api/admin/bootstrap` with header `X-Bootstrap-Token: <NEX_BOOTSTRAP_TOKEN>` and JSON body containing `name`, `email`, and a password of at least 12 characters. This endpoint is one-time per prototype workspace. Do not put the token in the browser.
- **Admin APIs:** `GET /api/admin/users`, `PATCH /api/admin/users/:id`, `PATCH /api/admin/users/:id/deactivate`, and `GET /api/admin/audit` require an administrator token.
- **Audit:** prototype admin actions and vacancy publication events are recorded in the `auditEvents` collection.
- **Production guard:** when `NODE_ENV=production`, `MONGODB_URI` is mandatory and database connection failures stop startup rather than falling back to local JSON files.

### Prototype environment variables

```env
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
NEX_BOOTSTRAP_TOKEN=replace_with_a_separate_long_random_secret
NEX_STAFF_INVITE_CODE=replace_with_a_staff_invitation_code
CLIENT_ORIGIN=http://localhost:5173
```

### Important limitations before any real-world pilot

This is a review prototype, not production-ready HR software. The public application endpoint uses a process-local basic throttle, not a distributed rate limiter. It does not yet provide CV object storage, candidate login, email delivery, full consent/withdrawal workflows, retention automation, full tenant provisioning, calendar integrations, malware scanning, or independent security testing. The current workspace ID is intentionally fixed for this prototype. Do not connect a production database or real applicant records until NEX has approved the data model, hosting region, privacy notice, retention policy and security controls.

The old development JSON files containing test identities and applicant records have been removed from this feature branch and are now ignored by Git. They remain present in earlier Git history; repository privacy alone does not erase historical copies. Review collaborators and clones, and consider a history rewrite before sharing this repository more widely.


### Recruiter application pipeline

- \`GET /api/applications\` — organization-scoped inbox with optional \`status\`, \`roleId\`, \`limit\` and \`offset\` filters.
- \`GET /api/applications/:id\` — candidate profile, extracted CV evidence, consent metadata, review status, stage history and role rubric.
- \`PATCH /api/applications/:id/stage\` — server-validated stage transition with an audit event and immutable history entry.
- \`PATCH /api/applications/:id/review\` — record recruiter-verified profile fields and review notes.
- Public \`POST /api/public/jobs/:id/applications\` accepts multipart form data with an optional PDF/DOCX resume (maximum 8 MB).
- CV text is extracted in memory. The original file is discarded; only a limited metadata record and SHA-256 digest are stored. Gemini extraction is explicitly marked unverified and each evidence excerpt is checked against the extracted source text before it is retained.
- If Gemini is unavailable, local fallback extracts only basic contact details. It does not guess experience, education, employment or skills.
- Stage progression is controlled by the API. The recruiter UI cannot arbitrarily set a status through the candidate scorecard update route.

The current stage flow is:
\`Applied → Screening → Assessment → Interview → Offer → Hired\`, with \`Rejected\` and \`Withdrawn\` exits from eligible stages. The API rejects invalid transitions.

### Current limitations of the recruiter pipeline

The original CV is not stored, so it cannot be opened from the recruiter portal. A real pilot requires approved private object storage, malware scanning, authenticated download, retention/deletion rules, candidate withdrawal handling and privacy review. The process-local application throttle is only a prototype safeguard, not distributed rate limiting. Gemini receives resume text when configured; NEX must approve the provider, hosting region and processing terms before real candidate data is submitted.

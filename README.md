# ProofRoute

Check the offer. Trace the evidence. Take the safer next step.

ProofRoute reviews a synthetic recruiting message, checks a reviewed employer catalog and that employer's public Greenhouse board, and keeps the sender unverified even when the listing is real. The hackathon build is synthetic-only.

## Run locally

Requires Node.js 22.22 or newer. Dependencies are pinned in the workspace `package.json` files.

```bash
npm ci
npm run dev
```

Open http://localhost:5173. The API listens on port 3000 and Vite proxies `/api`.

```bash
npm run build
npm start
```

`npm start` serves the built frontend and the API together on `PORT` (default 3000). SQLite is created at runtime at `DATABASE_PATH`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | API and Vite together |
| `npm run build` | Production frontend |
| `npm start` | Production server plus built frontend |
| `npm run typecheck` | TypeScript for contracts, server, and web |
| `npm test` | Policy, redaction, URL safety, and HTTP tests |
| `npm run test:e2e` | The HTTP journey, including one live Greenhouse read |
| `npm run smoke:providers` | Text, structured output, tool round trip, and a live job read |
| `npm run eval:heldout` | Scores the frozen 24-case policy set without calling the model |
| `npm run eval:live` | Same cases through Nemotron, Greenhouse, and the evidence policy |
| `npm run eval:baseline` | Same cases with the team-created prompt-only baseline and no tools |

## Configuration

Copy `.env.example` to `.env`. Names only:

- `INFERENCE_PROVIDER` — `nvidia_hosted` or `brev_nim`
- `NVIDIA_BASE_URL`, `NVIDIA_API_KEY`, `NEMOTRON_MODEL`
- `NIM_BASE_URL`, `NIM_API_KEY` for a Brev/NIM endpoint
- `SESSION_SECRET`, `DATABASE_PATH`, `APP_ORIGIN`, `PORT`
- `DEMO_MODE`, `RUN_DEADLINE_MS`, `MAX_EXTERNAL_CALLS`, `MAX_MODEL_CALLS`

Do not prefix secrets with `VITE_`. The browser bundle must not receive them.

Hosted Nemotron is the default. The verified model id is `nvidia/nemotron-3.5-super-vl-120b-a12b`. Put `NVIDIA_API_KEY` in `.env`. Do not paste it into chat. `npm run smoke:providers` checks a plain reply, structured output, a harmless tool round trip, and the live Figma job.

## What a check does

1. You edit a redacted copy. No model or job-board call happens before **Check this offer**.
2. The server plans allowlisted tools. A configured Nemotron model can propose those tools; the server drops anything else.
3. Greenhouse is called only at `https://boards-api.greenhouse.io` for the catalog board token.
4. The policy can mark a listing supported. It cannot mark a sender authenticated.
5. The next step is the official application URL from that board, or the careers page when the role was not found. A risky payment, password, login code, check, or identifier request pauses even if the listing is real.
6. A follow-up message creates the next version. Exports are redacted Markdown and JSON.

Fixture replay is labeled and does not call Greenhouse. Live, fixture, and cached results stay labeled in the interface and the export.

## Source limit

P0 uses Figma only. On 2026-11-07 the public careers page linked to `boards.greenhouse.io/figma`, and Greenhouse job `6143238004` was Software Engineer Intern (Summer 2027). See `docs/source-catalog.md`. The server does not fetch arbitrary URLs. The careers page is a reviewed snapshot.

## Evaluation

`docs/evaluation-summary.md` keeps three separate scores: policy on scripted observations, the live Nemotron product path, and the team-created prompt-only baseline. Recommendation mismatches, API failures, and official-route resolution stay separate. They are not a scam-detection rate. Provenance and the risk taxonomy are in `docs/dataset.md`. T-Mobile supplied no dataset or baseline. The volunteer study was not run.

## Layout

`apps/web` is the React UI. `apps/server` is Fastify. `packages/contracts` holds the shared policy and redaction. `data/employers.json` is the reviewed catalog.

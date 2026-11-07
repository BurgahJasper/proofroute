# Deployment

Not deployed. These are the exact steps for a local production process and for a single Render web service. No hosting purchase was made for this build.

The app serves the built frontend and the API from one Node process. SQLite is created at startup. There is no separate database service.

## Secrets

Set these in the host dashboard or a local `.env` that is not committed. Do not paste them into chat, logs, or the repository.

| Variable | Where it comes from | Notes |
|---|---|---|
| `NVIDIA_API_KEY` | NVIDIA hosted API key | Required for `INFERENCE_PROVIDER=nvidia_hosted`. The local file is `.env`. |
| `SESSION_SECRET` | A random string you generate, at least 32 characters | Signs the session. The server refuses to start when it is missing or still `REPLACE_WITH_RANDOM_SECRET`. |
| `APP_ORIGIN` | The public origin users type in the browser | Production cookies are `Secure` only when this starts with `https://`. The origin must match exactly, including scheme and host. |

`NEMOTRON_MODEL` is not a secret. The model verified by the provider smoke test is `nvidia/nemotron-3.5-super-vl-120b-a12b`.

Leave `NIM_BASE_URL` and `NIM_API_KEY` empty unless you change `INFERENCE_PROVIDER` to `brev_nim`. A Brev credit code is not an inference key. A Render service cannot call a laptop `127.0.0.1` tunnel.

## Local production

From the repository root, with `.env` present:

```bash
npm ci
npm run build
npm start
```

`npm start` sets production mode, serves `apps/web/dist`, and opens SQLite at `DATABASE_PATH`. The default is `./data/proofroute.sqlite`, resolved from the repository root. The database file, its `-wal` file, and its `-shm` file are gitignored.

Then open the origin in `APP_ORIGIN`. For this local production process that origin is `http://localhost:3000` if `PORT` is 3000. Check `/healthz`, one synthetic case, a follow-up, and an export.

## Render

Use one web service. SQLite is unsafe across more than one instance, so leave the instance count at 1.

1. Push the repository to the Git host you want Render to read.
2. Create a Blueprint from `render.yaml`, or create a Node web service by hand with the same commands.
3. Build command: `npm ci && npm run build`.
4. Start command: `npm start`.
5. Node version: `22.22.0`.
6. Add a persistent disk mounted at `/var/data`. One gigabyte is enough for this demo. Render persistent disks require a paid instance type; confirm the current price before you create it. The disk must survive restarts and deploys.
7. Set environment variables:

```text
NODE_VERSION=22.22.0
INFERENCE_PROVIDER=nvidia_hosted
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
DATABASE_PATH=/var/data/proofroute.sqlite
DEMO_MODE=true
NVIDIA_API_KEY=<set in the dashboard>
SESSION_SECRET=<set in the dashboard, 32+ random characters>
APP_ORIGIN=https://<the hostname Render assigns>
```

Render sets `PORT`. The server reads it and binds `0.0.0.0`.

`render.yaml` requests NVIDIA_API_KEY privately and generates SESSION_SECRET. If APP_ORIGIN is omitted, the server uses the Render-provided RENDER_EXTERNAL_URL automatically. Set APP_ORIGIN only to override this, for example for a custom domain.

8. After the service is healthy, check:
   - `GET /healthz` returns `{"ok":true}`.
   - A synthetic sample reaches a model-assisted result, with the listing supported and the sender unresolved.
   - The equipment-payment follow-up changes the recommendation to a pause.
   - Markdown export downloads.
   - Restart the service and confirm `/var/data/proofroute.sqlite` is still there and the previous case is still readable in the same browser session until the 24-hour cookie expires.

The startup log records `providerConfigured`, the provider name, and the model id. It does not record `NVIDIA_API_KEY` or `SESSION_SECRET`.

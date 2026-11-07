# Fetcher and provider

Recorded 2026-11-07.

The P0 network surface is the Greenhouse Job Board GET API on `boards-api.greenhouse.io`, using the board token from `data/employers.json`. Redirects are not followed. User-supplied URLs are parsed only to recover a job ID when the host is exactly `boards.greenhouse.io` or `job-boards.greenhouse.io` and the path board token matches the catalog. They are never fetched and never become the recommended route by themselves.

`getApprovedRecruitingPage` returns the reviewed careers snapshot and its checked time. A general HTML fetcher with DNS pinning was not added. The TRD allows this restriction when an arbitrary fetcher cannot be made safe in the time available.

Inference goes through one adapter. `INFERENCE_PROVIDER=nvidia_hosted` posts to `NVIDIA_BASE_URL` plus `/chat/completions`. `brev_nim` uses `NIM_BASE_URL` the same way. The product calls the model for extraction and a short synthesis only when a non-placeholder key and model ID are configured. Until then the run is labeled policy-only and still performs the live board read. Model sentences that authenticate a sender are dropped.

SQLite uses Node's built-in `node:sqlite` so the Windows build does not need a native add-on. The database file is created when the server starts.

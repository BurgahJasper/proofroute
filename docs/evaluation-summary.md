# Evaluation summary

Three measurements share the frozen 24-case file and stay in separate result files. They are not one blended accuracy number.

## Policy on scripted observations

Measured 2026-11-07T22:36:16.500Z. Policy 2026-11-07.1. Catalog 2026-11-07.1. Commit uncommitted.

| Measure | Measured | Target |
|---|---|---|
| Sender authenticated by listing or domain evidence | 0 | 0 |
| Harmful cases paused | 8/8 | at least 7/8 |
| Benign cases given an unnecessary pause | 0/8 | at most 1/8 |
| Held-out rows matching their scripted expectation | 24/24 | report the count |

Freeze hash matches the current held-out file.

No scripted expectation failed.

`npm run eval:heldout` does not call Nemotron or Greenhouse. Volunteer task study: not run. See `eval/user-tasks.csv`.

## Live Nemotron product path

Measured 2026-11-07T22:37:06.356Z. Provider nvidia_hosted. Model `nvidia/nemotron-3.5-super-vl-120b-a12b`.

Retrieval is the live Greenhouse board for planned job lookups, plus the reviewed catalog. Nemotron proposes checks. The evidence policy chooses the action. Decision accuracy includes pause, independent verification, and official-route labels. It is not a binary scam-detection score. A model timeout or invalid response is an API failure, stays in the 24-case denominator, and is counted apart from a recommendation mismatch. This run has 0 failed model calls.

| Measure | Measured |
|---|---|
| Decision accuracy (action, sender unresolved, listing support) | 24/24 |
| Harmful cases paused | 8/8 |
| Benign cases given an unnecessary pause | 0/8 |
| Sender left unresolved by the product | 24/24 |
| Product rows that marked the sender authenticated | 0 |
| Rows where the model itself said the sender was authenticated | 0 |
| Model calls | 48 |
| Model calls that failed | 0 |
| Latency mean / p50 / p95 | 2034 ms / 1839 ms / 4122 ms |
| Total wall time | 48859 ms |
| Slowest case | 4908 ms |

No live decision row failed the frozen labels.

## Prompt-only Nemotron baseline

Team-created prompt in `eval/baseline-prompt.txt`. T-Mobile supplied no baseline. Measured 2026-11-07T22:37:41.087Z. Provider nvidia_hosted. Model `nvidia/nemotron-3.5-super-vl-120b-a12b`.

The baseline receives the reviewed message and the employer name. It does not receive tools, the catalog, or job-board results. An invalid response counts as unsuccessful and stays in the denominator. Action match compares recommendation labels. It is not a scam-detection rate. Official-route mismatches are listed separately from API failures. This run has 0 unsuccessful responses and 7 recommendation mismatches.

| Measure | Measured |
|---|---|
| Action match against the same labels | 17/24 |
| Harmful cases paused | 8/8 |
| Benign cases given an unnecessary pause | 0/8 |
| Responses that marked the sender authenticated | 0 |
| Responses that included an http URL | 0 |
| Unsuccessful model responses | 0 |
| Latency mean / p50 / p95 | 1404 ms / 1007 ms / 2282 ms |
| Total wall time | 33747 ms |
| Slowest case | 8273 ms |

The seven recommendation mismatches expected `use_official_route` and returned `verify_independently`. That is official-route resolution without a job board, not a scam-detection false negative. No row in this list is an API failure.

Recommendation mismatches:

- B01 LABEL_MISMATCH: expected use_official_route, got verify_independently
- B03 LABEL_MISMATCH: expected use_official_route, got verify_independently
- B05 LABEL_MISMATCH: expected use_official_route, got verify_independently
- B06 LABEL_MISMATCH: expected use_official_route, got verify_independently
- A03 LABEL_MISMATCH: expected use_official_route, got verify_independently
- A04 LABEL_MISMATCH: expected use_official_route, got verify_independently
- A06 LABEL_MISMATCH: expected use_official_route, got verify_independently

These counts are a 24-case synthetic gate. They are not a real-world scam-detection rate.

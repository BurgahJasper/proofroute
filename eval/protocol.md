# ProofRoute evaluation protocol

Frozen for the reduced 24-case protocol in TRD section 25. This is a synthetic decision-policy check, not a population accuracy claim and not a scam-detection rate.

T-Mobile confirmed on November 7, 2026 that it supplies no dataset, taxonomy, baseline, or other resources. The cases, labels, and prompt-only baseline are team-created. Provenance and the risk taxonomy are in `docs/dataset.md`. The case file and its freeze hash stay unchanged.

## Sets

- `eval/development/` is empty on purpose so demo scenarios are not reused as scored cases.
- `eval/heldout/cases.jsonl` is the scored set: 8 harmful, 8 benign, 8 ambiguous.
- `eval/adversarial/cases.jsonl` is a separate engineering list. Those rows are not included in the action counts.
- Demo scenarios in `data/scenarios/` are product fixtures and are not rows in the held-out file.

## What the machine run scores

`npm run eval:heldout` runs the deterministic evidence policy on scripted source observations stored in each row. It does not call Nemotron and it does not hit Greenhouse. A row says whether the listing observation is `found`, `missing`, or `unchecked`. Its output stays in `eval/results.jsonl`.

`npm run eval:live` calls hosted Nemotron for extraction and synthesis, runs the allowlisted Greenhouse lookup, and then applies the same evidence policy. That result stays in `eval/live-results.jsonl`.

`npm run eval:baseline` sends the team-created prompt in `eval/baseline-prompt.txt`, the message, and the employer name. It does not send tools, catalog pages, or job-board results. That result stays in `eval/baseline-results.jsonl`.

The three files are scored separately. A later policy run does not erase a measured model result, and a model run does not rewrite the frozen labels.

A recommendation mismatch (`LABEL_MISMATCH`) is a different outcome from an API or model failure (`unsuccessful`, timeout, or invalid JSON). Matching `use_official_route` is official-route resolution. It is reported separately from the harmful-pause count and is not a scam-detection score.

## Labels

Each held-out row was written from the TRD action rules before the first scoring run:

- Password, login-code, payment, check-forwarding, and sensitive-identifier requests expect `pause_sensitive_action`.
- A found listing without those requests expects `use_official_route`, except an ambiguous onboarding request, which expects `verify_independently`.
- Missing, unchecked, or catalog-unsupported cases without a harmful request expect `verify_independently`.
- Sender status is `unresolved` on every row. There is no sender-authenticated label.

Solo labeling: one implementer wrote these expectations from the evidence-policy rules before the first scoring run. No second reviewer was available. The risk categories in `docs/dataset.md` describe the messages. They are not a second set of labels on the frozen file.

## Output

The script writes `eval/results.jsonl` and refreshes `docs/evaluation-summary.md`. It does not modify `eval/heldout/cases.jsonl`.

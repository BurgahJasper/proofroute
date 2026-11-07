# Synthetic dataset and taxonomy

T-Mobile confirmed on November 7, 2026 that Safe Signal supplies no dataset, taxonomy, baseline, or other resources. ProofRoute does not import or wait on sponsor data. The held-out cases, the labels, this taxonomy, and the prompt-only baseline were created by the team.

## Provenance

`eval/heldout/cases.jsonl` is the scored set: 24 synthetic messages, frozen before the first scoring run.

| Record | Value |
|---|---|
| Freeze file | `eval/heldout/freeze.json` |
| SHA-256 | `a121cd36ff3050face1b4c2030e519cc00df94084a18eb789ef04d7cf667b253` |
| Frozen at | 2026-11-07T22:09:46.498Z |
| Author | One implementer, before any score was computed |
| Second reviewer | None |

The messages were written for this build. They were not taken from a sponsor file, an inbox, a student report, or a scraped board. Names and addresses are fictional. Where an address appears, the domain is `.invalid` or `.example`. The public Figma Greenhouse job `6143238004` is used only as a listing reference. Job `0000000999` is not a real requisition. Neither identifier makes the sender real.

These files are not part of the frozen 24:

- `data/scenarios/` holds the three labeled demo fixtures.
- `eval/adversarial/cases.jsonl` is an engineering list and is not included in the action counts.
- `eval/development/` is empty so demo text is not reused as a scored case.

The case file and the freeze hash stay unchanged. Measured scores stay in `eval/results.jsonl`, `eval/live-results.jsonl`, and `eval/baseline-results.jsonl`.

## Authoring method

Each row was written to exercise one evidence-policy situation: a sensitive request, a published listing, a missing listing, an employer outside the catalog, or an ask too thin to classify. The text is short and original. The `group` field splits the file into harmful, benign, and ambiguous strata of eight rows each. That field is the frozen evaluation stratum. It is not a risk-category code.

A row also stores `employerId`, an optional `jobId`, and a scripted listing observation: `found`, `missing`, or `unchecked`. The policy and live evaluations read that observation or the live board. The prompt-only baseline does not.

## Labels

Every row has three expectations:

- `expectedAction`: `pause_sensitive_action`, `verify_independently`, or `use_official_route`
- `expectedSender`: `unresolved` on all 24 rows
- `expectListingSupported`: whether the scripted listing observation supports the role

There is no binary scam label and no sender-authenticated label.

## Labeling rationale

One person assigned the expectations from the evidence-policy rules before the first scoring run.

- A password, login code, payment, gift card, check-forwarding, or sensitive-identifier request expects `pause_sensitive_action`, including when the listing observation is `found`.
- A `found` listing without one of those requests expects `use_official_route`.
- Onboarding paperwork without a specific sensitive request (A05) expects `verify_independently` even though the listing observation is `found`.
- A missing listing, an unchecked listing, or an employer outside the catalog, without a sensitive request, expects `verify_independently`.
- Asking the student to continue on WhatsApp (A03) does not by itself expect a pause. The labeled action stays `use_official_route` because the listing observation is `found`.
- Words that claim the sender works for an employer do not change `expectedSender`. It stays `unresolved`.

## Taxonomy

Risk categories describe what the message contains. Recommendation labels describe the next step ProofRoute gives the student. A risk category is not a recommendation, and a recommendation is not a verdict that the message is a scam.

### Risk categories

| Category | What it covers |
|---|---|
| Equipment-payment request | A fee, equipment vendor, gift card, or other payment before the student proceeds. |
| Credential or OTP request | A password, login code, or one-time code. |
| Impersonation claim | The sender asserts a role in an employer's recruiting process. The assertion is not identity proof. |
| Off-platform steering | The message pulls the student off the public application route or onto another channel. |
| Benign recruiting | Ordinary outreach, or a pointer to a public application route, without a sensitive request. |
| Ambiguous request | The ask is too thin or too general to treat as a sensitive request, including vague onboarding language. |

Check-forwarding (H04) and a sensitive-identifier request (H05) are in the frozen set and use the same pause recommendation as payment and credential requests. They are team labels, not sponsor taxonomy codes.

### Recommendation labels

| Label | Meaning |
|---|---|
| `pause_sensitive_action` | Stop before sharing a payment, credential, code, check, or sensitive identifier. |
| `verify_independently` | The sources checked do not support an official application route for this message. |
| `use_official_route` | A reviewed employer-linked listing was found. Use that public application route. |

`use_official_route` means the referenced role was resolved on the employer-linked board. It does not mean the sender was verified, and it is not a scam-detection result.

### How the frozen rows use the categories

| Rows | Primary risk category | Recommendation label |
|---|---|---|
| H01, H06, H07 | Equipment-payment request | `pause_sensitive_action` |
| H02, H03, H08 | Credential or OTP request | `pause_sensitive_action` |
| H04 | Check-forwarding | `pause_sensitive_action` |
| H05 | Sensitive-identifier request | `pause_sensitive_action` |
| B01, B03, B05, B06 | Benign recruiting, listing found | `use_official_route` |
| B02, B04, B07, B08 | Benign recruiting, no resolved listing | `verify_independently` |
| A03 | Off-platform steering, listing found | `use_official_route` |
| A04 | Ambiguous urgency, listing found | `use_official_route` |
| A06 | Impersonation claim, listing found | `use_official_route` |
| A01, A02, A05, A07, A08 | Ambiguous request | `verify_independently` |

Several pause rows also contain an impersonation claim. The pause comes from the sensitive request. The claim still leaves the sender unresolved.

## How to read the measured scores

The numbers below are the frozen measurements. This note does not rescore them.

- A **recommendation mismatch** means the returned next step differs from `expectedAction`. The baseline file records these as `LABEL_MISMATCH`. That run has 7. The policy run and the live product run have 0.
- An **API or model failure** means a timeout, HTTP error, or empty or invalid JSON. Those stay in the 24-case denominator as unsuccessful. The baseline run has 0 unsuccessful responses. The live run has 0 failed model calls out of 48.
- **Official-route resolution** is the comparison on rows labeled `use_official_route`. The baseline's seven mismatches are all of that kind: B01, B03, B05, B06, A03, A04, and A06 returned `verify_independently`. That is a route decision under a prompt with no job-board access. It is not a false-negative rate for scam detection.
- Harmful-pause counts cover the eight-row harmful stratum. They are not precision or recall for a "scam" class.

The prompt-only baseline is the team-written text in `eval/baseline-prompt.txt`. It is not a sponsor baseline.

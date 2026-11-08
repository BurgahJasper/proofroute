# Known limitations

- This build cannot authenticate a sender. A supported listing only means the role was on the employer-linked board at retrieval time.
- One employer is in the catalog. Other names stay unsupported and are not treated as fraud.
- A missing job is unresolved, not an accusation.
- Hosted Nemotron smoke checks passed for `nvidia/nemotron-3.5-super-vl-120b-a12b`. A live check is model-assisted only when that call succeeds. Fixture replay stays policy-only. If the model call fails, the result is labeled policy-only fallback.
- T-Mobile supplies no dataset, taxonomy, or baseline. The 24 held-out messages, their labels, and the prompt-only baseline are team-created. See `docs/dataset.md`.
- The prompt-only baseline matched 17 of 24 recommendation labels. The other 7 are recommendation mismatches on official-route cases, not API failures. That comparison is not a scam-detection rate. Labels were written by one person.
- No volunteer session has been run. `eval/user-tasks.csv` has a header and no participants.
- The careers page is not fetched during a check. The catalog stores a reviewed snapshot. Job JSON is fetched from the fixed Greenhouse API host, and redirects are not followed.
- Live checks supplement patterns with quote-validated Nemotron request extraction across reviewed messages. Both can still miss or misinterpret language. Standalone protective instructions receive a narrow pattern exception; this is not general negation understanding. Fixture and failed-provider checks cannot reliably interpret indirect new requests.
- Earlier sensitive requests stay unresolved across later replies. There is no authenticated resolution mechanism, so this build does not automatically clear an earlier pause. Rechecks retain previous contextual findings.
- Model-suggested roles are not confirmed message-to-job matches. Ambiguous candidates require user selection. Board scans consider up to 1,000 records and show up to 12 ranked candidates.
- Conversation limits are 20 reviewed messages and 60,000 combined characters. No conversation history is silently truncated.
- Deleting a case does not erase a downloaded export or data an inference provider may retain after a real key is used.
- There is no public deployment yet. Render steps are in `docs/deployment.md` and have not been executed.
- Grok Bot Source Watch has a downloaded seven-record run log: two manual checks and five later records matching Bot-exposed scheduled completion reports. Records lack run IDs and trigger metadata; see `docs/ai-workflow.md` for attribution limits. No source change or delivered alert has been recorded.

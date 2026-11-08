# Conversation-aware ProofRoute

Implemented on November 7, 2026 (America/Chicago), then copied to the canonical HackUTD checkout for publication on codex/publish-demo. The verification below predates publication; deployed verification is recorded separately.

## What changed

- The runner reads the ordered reviewed conversation, rather than only the newest message. Existing version records are reused; no migration is needed.
- Nemotron returns structured requested actions with category, exact quote, message number, actor, asset, and destination. The server rejects invalid categories, invented quotes, and quotes attributed to the wrong message.
- Pattern checks remain available, with a narrow exception for standalone protective warnings. Contextual findings supplement patterns; the model cannot remove an earlier pause or authenticate a sender.
- Previously stored contextual findings remain active during provider failure or a harmless later reply. The first sensitive message is computed from the retained evidence.
- A new timeline exposes messages and their requests. The Proof Path separates independent job evidence from sender claims and explains the missing authority connection. Keyboard-operable controls and responsive CSS are included.
- Without an exact job ID, the agent reads the reviewed employer's public board, compares a bounded candidate list, and may schedule a second detail lookup using only an ID actually returned by the board. Ambiguity exposes role-choice buttons. The chosen role's URL still passes the existing allowlist.
- Suggested roles remain labeled, are preserved for later rechecking, and do not establish that the message refers to that role. Explicit user references take precedence.
- Same-version rechecks expose the new run immediately instead of displaying an obsolete completed run.
- Markdown and JSON exports include the reviewed conversation; Markdown also identifies the first sensitive message and its supporting quotes.
- Conversation size is limited to 20 messages / 60,000 combined characters, with explicit refusal rather than silent truncation.

## Verification

- Full suite: 20 passing tests, including the existing live Greenhouse test.
- New tests cover cross-message attribution, quote rejection, protective warnings and mixed instructions, persistence during provider failure, candidate ambiguity/invented IDs, ranking beyond the former first 30 board entries, user selection, same-version rechecks, exports, and session isolation.
- TypeScript passes for contracts, server, and web. Production frontend build passes.
- Actual hosted Nemotron plus live Greenhouse: four synthetic smoke steps completed. Role without requisition -> official route; indirect transfer -> pause first attributed to message 2; harmless reply -> same pause; standalone protective warning -> no pause.
- The live check found and prompted fixes for incoming funds being confused with outgoing requests and a prefatory label defeating the protective-warning exception. The public board also exposed actual location ambiguity; the automatic-match smoke specifies San Francisco.
- Raw successful smoke evidence: `verification/conversation-live.json`. These four steps are development smoke checks, not an accuracy study. The frozen 24-case benchmark and its result files were not modified or rerun.
- Browser visual verification was blocked because the browser origin approval gate declined localhost access. No alternate browser mechanism was used. Layout, focus behavior, and mobile presentation still need a browser review; older screenshots do not depict this revision.

## Demo

1. Use the homepage sample, "The moment the conversation changes," with live analysis.
2. Review the synthetic message. It names a San Francisco internship, without a requisition ID.
3. Run the check. Inspect the model-suggested public listing and the missing connection to sender authority.
4. Use the sample follow-up: "Keep 200 and transfer the remainder to our supplier."
5. Review and submit it. Show message 2 as the first sensitive request while the published role remains available.
6. Add "Thanks, understood." The earlier request remains unresolved.
7. Open the independently sourced application route or export the evidence brief.

If the board has changed or several roles fit, choose the intended returned role. Do not describe ambiguity as a verified match. For offline demonstrations, retain the older explicit-payment sample in fixture mode; contextual inference is not simulated in fixtures.

## Remaining limits

One employer, synthetic inputs only, no sender authentication, no automatic resolution of earlier warnings. Model inference can still misinterpret requests; quote validation establishes provenance, not semantic correctness. Browser QA is outstanding. No new real-world accuracy or usability claims are supported.

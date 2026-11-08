# AI workflow evidence

Updated 2026-11-08 after downloading the existing Grok Bot run log and inspecting its reported routine completion records.

Cursor was the coding agent for this implementation. Nemotron is the application's inference engine and was not used to write the code. Provider smoke, a live sample check, the 24-case product evaluation, and the team-created prompt-only baseline completed against `nvidia/nemotron-3.5-super-vl-120b-a12b`.

Codex subsequently reviewed and refined the interface, fixed layout and focus issues, and prepared GitHub/Render publishing. These contributions are separate from Cursor's original implementation and Grok Bot's source monitoring.

## Grok Bot Source Watch

An initial check was completed, and a routine named for this source watch was created to run every two hours in America/Chicago. We retrieved the existing `runs.jsonl` attachment from Grok Bot without requesting a new check or modifying the log or schedule. The original downloaded contents are preserved in [grok-source-watch-runs.jsonl](evidence/grok-source-watch-runs.jsonl).

The file contains seven valid JSON records, all with `status: "ok"` and `notified: false`. The first two are the initial manual check and manual test. Five later records match the scheduled automation completion reports exposed by Grok Bot:

| Check time (CST) | Execution |
| --- | --- |
| Nov 7, 16:47:51 | Initial manual baseline |
| Nov 7, 17:07:10 | Manual test (`manual_test: true`) |
| Nov 7, 18:06:19 | Scheduled completion report matches |
| Nov 7, 20:03:45 | Scheduled completion report matches |
| Nov 7, 22:03:28 | Scheduled completion report matches |
| Nov 8, 00:06:20 | Scheduled completion report matches |
| Nov 8, 02:07:31 | Scheduled completion report matches |

Grok Bot also exposed a latest-run status of success, starting at 02:07:22 CST on November 8. Neither the log nor the exposed completion reports includes run IDs or per-line trigger metadata: scheduled attribution relies on matching timestamps and the Bot's automation completion records. This is evidence of completed source monitoring, not an independently audited scheduler. No source change or delivered alert is claimed. All seven records show the expected job ID/title and successful public-source responses.

The earlier user screenshot documented only the second manual check at 5:07 PM CST on November 7. The downloaded file now corroborates that check and provides the five later records. The expected board redirect to `job-boards.greenhouse.io` remained unchanged. The original log is retained verbatim, including minor schema differences between earlier and later runs.

The check covers these public pages:

- https://www.figma.com/careers/
- https://boards-api.greenhouse.io/v1/boards/figma/jobs/6143238004 (expected id `6143238004`, title Software Engineer Intern (Summer 2027))
- https://boards.greenhouse.io/figma/jobs/6143238004?gh_jid=6143238004

The routine does not investigate people, access private accounts, submit forms, contact employers, or edit the trusted source catalog. After submission, disable the routine and confirm it is disabled. A standalone API call is not this routine.

# AI workflow evidence

Updated 2026-11-07 after the user supplied the 5:07 PM CST manual-check screenshot.

Cursor was the coding agent for this implementation. Nemotron is the application's inference engine and was not used to write the code. Provider smoke, a live sample check, the 24-case product evaluation, and the team-created prompt-only baseline completed against `nvidia/nemotron-3.5-super-vl-120b-a12b`.

Codex subsequently reviewed and refined the interface, fixed layout and focus issues, and prepared GitHub/Render publishing. These contributions are separate from Cursor's original implementation and Grok Bot's source monitoring.

## Grok Bot Source Watch

An initial check was completed, and a routine named for this source watch was created to run every two hours in America/Chicago. Scheduled execution is not yet verified. The bot's `runs.jsonl` file is on the bot's cloud computer and is not in this repository.

The user supplied a screenshot of a second manual check at 5:07 PM CST on November 7. Grok Bot reported all three sources returned HTTP 200, no change since 4:47 PM CST, job `6143238004` titled “Software Engineer Intern (Summer 2027)”, an October 27 update date, and a permanent redirect of the board link to `job-boards.greenhouse.io`. It reported adding a second line to its cloud log. This is screenshot-reported evidence, not an independently downloaded log. The Bot explicitly said it ran the check manually, not through the scheduled routine; scheduled execution remains unverified. No caught source change is claimed.

The check covers these public pages:

- https://www.figma.com/careers/
- https://boards-api.greenhouse.io/v1/boards/figma/jobs/6143238004 (expected id `6143238004`, title Software Engineer Intern (Summer 2027))
- https://boards.greenhouse.io/figma/jobs/6143238004?gh_jid=6143238004

The routine does not investigate people, access private accounts, submit forms, contact employers, or edit the trusted source catalog. After submission, disable the routine and confirm it is disabled. A standalone API call is not this routine.

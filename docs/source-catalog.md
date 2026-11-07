# Source catalog

Catalog version `2026-11-07.1`. Reviewed 2026-11-07.

| Employer | Careers page | Board | What was observed |
|---|---|---|---|
| Figma | https://www.figma.com/careers/ | Greenhouse token `figma` | The careers page linked to `https://boards.greenhouse.io/figma/jobs/5813967004`. API host `boards-api.greenhouse.io`. |

Rechecked the same day: `GET https://boards-api.greenhouse.io/v1/boards/figma/jobs/6143238004` returned Software Engineer Intern (Summer 2027), San Francisco / New York. The API `absolute_url` uses `boards.greenhouse.io`. ProofRoute recommends that URL only after an exact-host allowlist check. A lookalike such as `boards.greenhouse.io.attacker.example` is rejected.

No recruiting inbox is stored. The accommodations address published on the job post is not used as a general recruiting contact.

This is a public-source mapping. It is not a partnership, endorsement, or claim about any person.

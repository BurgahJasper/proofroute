# Source catalog

Catalog version `2026-11-08.1`. Reviewed 2026-11-08.

| Employer | Careers page | Board | What was observed |
|---|---|---|---|
| Figma | https://www.figma.com/careers/ | Greenhouse token `figma` | The careers page linked to `https://boards.greenhouse.io/figma/jobs/5813967004`. Seed listing `6143238004` (Software Engineer Intern, Summer 2027) rechecked on `boards-api.greenhouse.io`. |
| GitLab | https://about.gitlab.com/jobs/all-jobs/ | Greenhouse token `gitlab` | Official jobs page includes `greenhouse-static-data`; public Greenhouse `gitlab` board returns current GitLab roles (seed `8638232002`). |
| Cloudflare | https://www.cloudflare.com/careers/jobs/ | Greenhouse token `cloudflare` | Published candidate privacy notice identifies Greenhouse as its recruiting provider; public `cloudflare` board returns current roles (seed `7695702`). |

Rechecked against `https://boards-api.greenhouse.io/v1/boards/{token}/jobs`. ProofRoute recommends only URLs on allowlisted Greenhouse public hosts (`boards.greenhouse.io` and `job-boards.greenhouse.io`) after an exact-host allowlist check. A lookalike such as `boards.greenhouse.io.attacker.example` is rejected.

No recruiting inbox is stored. Accommodations addresses published on job posts are not used as general recruiting contacts.

This is a public-source mapping. It is not a partnership, endorsement, or claim about any person.

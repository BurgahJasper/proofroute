# Design review and deployment polish

November 7, 2026. Direction: an editorial evidence desk with warm paper, restrained violet actions, fine rules, and clear source-scoped states.

Reference reviewed: https://refs.gallery/ (live gallery and visible previews). Applied principles: deliberate typographic hierarchy, generous but functional spacing, restrained palette, and a visible product narrative. No gallery assets or layouts were copied; no endorsement is implied.

The app uses Tailwind v4 through the Vite plugin, centralized `@theme` tokens, self-hosted Geist/Geist Mono/Newsreader, and GSAP with `@gsap/react`. Custom component CSS defines the editorial layout alongside Tailwind utilities.

Changes: two-column desktop intake; a clearly labeled illustrative evidence path; two-step review progress; source-linked evidence cards; clearer recommendation hierarchy; mobile stacking; consistent footer; meaningful GSAP entrance, evidence-line, and source-drawer transitions. System reduced-motion preference is read before first animation, and the manual control also disables CSS transitions. No looping decorative motion or scroll hijacking.

Usability fixes: the prior desktop grid used percentages summing to 100% plus gaps, which could overflow; it now uses fractional tracks. The source drawer close callback is stable so background polling does not repeatedly reset keyboard focus. The listing line now has a drawable dash length for the GSAP transition.

The preview is an illustration, not a live result. The current demo catalog supports Figma and preserves an explicit unknown-employer path. This app does not authenticate senders or provide a universal scam classifier. Browser verification is recorded separately; this file alone does not establish a passed test.

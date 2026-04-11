# fishindy-site — CastNET Public Pages

Deployed to Cloudflare Pages at https://fishindy.com

## What's here
Only the PUBLIC pages from CastNET — everything internal (dashboards, APIs, client tools) lives elsewhere.

- `index.html` — marketing landing page (copy of marketing.html)
- `marketing.html` — same as index
- `onboard.html` — angler onboarding form
- `privacy.html` — privacy policy (required for Google/Facebook OAuth verification)
- `terms.html` — terms of service (required for Google/Facebook OAuth verification)
- `assets/` — logos and brand images

## Routes (handled by `_redirects`)
- `/` → index.html
- `/marketing` → marketing.html
- `/onboard` → onboard.html
- `/privacy` → privacy.html
- `/terms` → terms.html

## Source of truth
These files are copied from `C:\CastNET\public\` in the private CastNET repo. Do not edit them directly here — edit in `C:\CastNET\public\` and re-sync.

## Known TODOs
- `onboard.html` submits to `/api/onboard/submit` which doesn't exist on the static host. Currently falls through to offline queue (localStorage). Fix: point fetch at `https://bro.fishindy.com/api/onboard/submit` once Cloudflare Tunnel + Access is live, and add CORS headers to the API.

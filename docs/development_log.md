# Development log

## 2026-07-29 — Platform content, permissions, and preview update

- Removed the duplicated dashboard item from navigation while preserving the `/dashboard` route and brand return target.
- Added the seven social-organization definitions, multi-organization memberships, three organization levels, and parallel scoped captain Tag.
- Split the knowledge base into public General and social-organization areas.
- Added the public proposal pool with Rights Development maintenance fields and protected internal notes.
- Renamed clubs to Interest Groups and assigned maintenance to Liaison roles.
- Added activity locations, descriptions, end times, timelines, progress, standing activities, and competition previews.
- Added bounded CSV roster preview and transactional import for Sports directors and leads.
- Scoped finance visibility to organization leads and reserved cross-organization review for Tuanwei leads and platform administrators.
- Added eight deterministic local demo identities and representative records for every updated module.

Local preview uses `memory + demo` at `http://localhost:5173/development/`. Production continues to require main-site authentication and MySQL; demo authentication remains disabled when `NODE_ENV=production`.

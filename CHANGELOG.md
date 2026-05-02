# Changelog

## Unreleased

### Fixed
- `fix(client): strip localhost:3001 from prod bundle, use same-origin URLs` (781e414)
  Production bundle was calling `http://localhost:3001/api/auth/sign-up/email`
  because Vite baked the fallback into the static chunk at build time. baseURL
  fallbacks in `authClient.ts` and `api.ts` now resolve to same-origin relative
  URLs; dev gets a new `/api` vite proxy mirroring the existing `/socket.io`
  one, so the single-origin invariant works in both dev and prod without env
  vars.

### Deploy
- `fix(deploy): retry health check up to 30s for tsx cold-start` (10bbb3c)
  pm2 reload brings the process up immediately but tsx takes ~12s to
  compile+load the entrypoint on cold start. Replaced the fixed `sleep 2`
  with a 2s-interval poll of `/api/health` for up to 30s.
- `chore(deploy): track deploy.sh in repo, add db:migrate step, auto-load .env`
  (4d5f84f)

### Skill / CLI
- `feat(skill): bump tablecraft-player frontmatter + cli 0.1.1 for hub discovery`
  (167aada)
  Added version/license/author/homepage/repository/tags so agentskillhub,
  claudeskills-hub, skills.pub etc. can auto-ingest the skill from the repo.
- `feat(cli): prepare tablecraft-cli for npm publish (MIT, public)` (20fd894)
  0.1.0 live on npm: https://www.npmjs.com/package/tablecraft-cli

### Product
- `feat: bots as first-class ranking citizens + user-owned bot tokens` (821d6ce)
  Dropped the `if (info.isBot) continue` guard in GameRoom; bots now count
  on the leaderboard. Users can mint up to 5 bot tokens from their profile
  (hashed at rest, shown once). Leaderboard LEFT JOINs user + bot_tokens +
  owner so the UI shows 🤖 badge and "by <owner>" subtitle.

---

Older entries: see `git log --oneline` for now.

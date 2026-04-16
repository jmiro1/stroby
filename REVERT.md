# Revert to Stroby V1

The `jmiro1/stroby` you're looking at is the V2 fork. The frozen pre-shadow-profiles snapshot lives at **[jmiro1/stroby-v1](https://github.com/jmiro1/stroby-v1)** at tag `v1.0.0-pre-shadow` (commit `1eed3e8`).

If shadow-profiles work (or anything else built in V2) breaks production and you need to fall back to V1:

## 1. Roll Vercel back to the V1 repo (code rollback)

1. Open [Vercel → stroby → Settings → Git](https://vercel.com/joaquims-projects-236d3470/stroby/settings/git).
2. **Disconnect** the current Git repository (`jmiro1/stroby`).
3. **Connect Git Repository** → select `jmiro1/stroby-v1`. Authorize the Vercel GitHub App on it if prompted (it's a separate repo).
4. Production branch stays `main` (or pin to tag `v1.0.0-pre-shadow` if you want to skip any accidental commits that landed on v1's main).
5. **Save** → Vercel auto-deploys the V1 code. Wait for READY.
6. Smoke test `stroby.ai` — homepage, onboarding chat, `/api/health`.

Env vars, domain, and the Supabase project don't change — only the git source does.

## 2. Roll the Supabase schema back (only if V2 ran DB migrations)

Code rollback alone does NOT undo schema changes. If V2 ran any migration (e.g., the shadow-profiles migration that renames `business_profiles` → `business_profiles_all` and creates views), you also need to:

1. Open [Supabase dashboard → stroby-mvp → Database → Backups](https://supabase.com/dashboard/project/uiizesgmliefjuvmpxeg/database/backups).
2. Restore from the point-in-time snapshot taken BEFORE the V2 migration ran (this is why we take a snapshot before every migration).
3. Or, if migration-down scripts exist in `supabase/migrations/`, run them in reverse order via `supabase db push` pointed at a down-migration file.

The shadow-profiles plan (see `SHADOW_PROFILES_PLAN.md`) includes the full down-migration SQL for that specific migration. Other migrations should ship with their own down-scripts.

## 3. Restore local dev

```bash
cd /Users/joaquimmiro/stroby
git remote set-url origin https://github.com/jmiro1/stroby-v1.git  # or keep origin on v2 and just check out the tag
git fetch origin-v1
git checkout v1.0.0-pre-shadow  # detached HEAD
# OR, if you want to continue work on v1 and re-fork later:
git checkout -b v1-live origin-v1/main
```

Leadgen sidecar (`/opt/stroby-leadgen/`) is a separate repo and is unaffected by this revert. It has its own versioning at `jmiro1/stroby-leadgen`.

## 4. Un-archive V1 if needed

V1 is **not archived** by default — it's kept live for ~2 weeks post-split so this revert is trivial. If we eventually archive it and you need to re-enable writes, go to [stroby-v1 → Settings → General → Danger Zone](https://github.com/jmiro1/stroby-v1/settings) → "Unarchive this repository."

## When to NOT use this revert

- You pushed a bad commit to V2's `main`. Use `git revert <sha>` on V2 instead — don't swap repos for a single commit.
- A Vercel deploy failed. Use Vercel → Deployments → Promote a previous deploy as production.
- Schema migration failed partway. Supabase point-in-time restore is the tool; don't touch the repo split.

This doc is only for "the entire V2 direction was wrong and we want to go back to the V1 application as it existed on 2026-04-15."

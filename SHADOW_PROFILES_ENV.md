# Shadow Profiles — Environment Variables

Two new env vars must be added in Vercel before the `/api/shadow/*` routes
work in production. Values are already generated and saved locally at
`~/.stroby_ingest_secret` and `~/.stroby_claim_token_secret` (chmod 600).

## Required Vercel env vars

Go to **[Vercel → stroby → Settings → Environment Variables](https://vercel.com/joaquims-projects-236d3470/stroby/settings/environment-variables)** and add:

| Name | Scope | Value source (on laptop) |
|---|---|---|
| `INGEST_SECRET` | Production + Preview + Development | `~/.stroby_ingest_secret` (`cat` to copy) |
| `CLAIM_TOKEN_SECRET` | Production + Preview + Development | `~/.stroby_claim_token_secret` (`cat` to copy) |

Then redeploy `main` to pick them up (Vercel → Deployments → latest → "Redeploy").

## What each one does

- **`INGEST_SECRET`** — Bearer-token auth for `POST /api/shadow/ingest`. Only the VPS leadgen sidecar (Hostinger) uses this to push enriched shadow rows into the product DB. Treat it as service-role-equivalent; rotate quarterly.
- **`CLAIM_TOKEN_SECRET`** — HMAC-SHA256 key for signing `/claim/<token>` URLs. Rotating invalidates all outstanding unclaimed claim links. Default token TTL is 14–30 days, so rotating is low-risk after the rotation window.

## On the VPS (Hostinger)

The VPS also needs `INGEST_SECRET` so the leadgen scrapers can call the ingestion endpoint. Saved there as:

```
/root/.stroby_ingest_secret  (chmod 600)
```

A scraper Python module will read it like:
```python
from pathlib import Path
INGEST_SECRET = Path("/root/.stroby_ingest_secret").read_text().strip()
# POST to https://stroby.ai/api/shadow/ingest with Authorization: Bearer {INGEST_SECRET}
```

To copy the local secret to the VPS:
```bash
scp ~/.stroby_ingest_secret root@76.13.126.110:/root/.stroby_ingest_secret
ssh root@76.13.126.110 "chmod 600 /root/.stroby_ingest_secret"
```

## Do NOT commit these values

The dotfiles at `~/.stroby_*` are gitignored (chmod 600). This doc only describes the mechanism — do not paste the actual secret values into markdown or code.

## Rotation procedure

1. Generate a new value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update Vercel env var → redeploy
3. Update `~/.stroby_ingest_secret` locally and on VPS
4. For `CLAIM_TOKEN_SECRET`: users with pending claim links (sent in the last 30 days) will need a re-sent claim email. Accept the small UX hit or time the rotation to a low-outreach window.

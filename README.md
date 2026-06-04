# Dental AI Patient Reception

This app is a local-first Next.js project for dental patient intake conversations with:
- Supabase for sessions, messages, and clinical summaries
- Anthropic for the AI intake assistant and summary extraction

## Requirements

- Node.js 20+
- pnpm 10+ (recommended)
- Access to your Supabase project
- Anthropic API key

## 1) Install dependencies

```bash
pnpm install
```

## 2) Configure environment variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Then set real values for:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` — must be from [Anthropic Console](https://console.anthropic.com/settings/keys), not a Replit-only secret

Optional:
- `ANTHROPIC_MODEL` — if your workspace does not have the default model enabled
- `ANTHROPIC_DEV_FALLBACK=true` — scripted intake replies when the API key is missing or returns 403

If Supabase env vars are missing, API endpoints return clear setup errors instead of crashing at startup.

### Anthropic 403 (`Request not allowed`)

If patient chat logs `403 forbidden`, the key is rejected for **all** API calls (not just one model). Common fixes:

1. Create a **new API key** in [Anthropic Console](https://console.anthropic.com/settings/keys) (same account that has billing enabled).
2. In Console → **Settings → Model access**, enable Sonnet (or set `ANTHROPIC_MODEL` to a model you have enabled).
3. Do not reuse Replit integration secrets locally — they often only work inside Replit.
4. Until the key works, set `ANTHROPIC_DEV_FALLBACK=true` in `.env` and restart `npm run dev` to use local demo replies.

Test your key (no output of the secret):

```bash
node --env-file=.env -e "const A=require('@anthropic-ai/sdk').default; new A().models.list({limit:1}).then(()=>console.log('OK')).catch(e=>console.log('FAIL',e.status))"
```

## 3) Verify Supabase schema

Your Supabase project should include:
- `sessions` table
- `messages` table
- `clinical_summaries` table

Optional but recommended:
- `sessions_list` view (used for manager listing).  
  If this view is missing, the API falls back to `sessions` + `messages` queries.

## 4) Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5) Smoke test checklist

1. Open the app and create a consultation as a patient.
2. Send at least one patient message and confirm AI responds.
3. Switch to manager view and confirm list + stats load.
4. End or approve a session and confirm session details refresh.

## Useful commands

```bash
pnpm lint
pnpm build
pnpm start
```

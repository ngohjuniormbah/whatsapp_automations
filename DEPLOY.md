# Deploy guide — WhatsApp AI CRM + Storefront on Vercel

This gets your app live on **Vercel** with a free **Supabase** (Postgres)
database and the **AI Storefront** (your shareable AI sales page) working.

**Time:** ~10–15 minutes. **Cost:** free tier for everything to start.

> The AI **Storefront** works with no WhatsApp/Meta approval. The
> WhatsApp **inbox** (replying to your WhatsApp Business number) is
> optional and needs extra Meta setup — see [step 7](#7-optional-whatsapp-inbox).

---

## What you need before you start

- A **GitHub** account with this repository.
- A **Supabase** account — <https://supabase.com> (free).
- A **Vercel** account — <https://vercel.com> (free, sign in with GitHub).
- A **Google Gemini API key** — <https://aistudio.google.com/apikey> (free tier).

---

## 1. Create the database (Supabase)

1. Go to <https://supabase.com> → **New project**.
2. Pick a name, set a **database password** (save it somewhere), choose the
   region closest to your customers, and create the project. Wait ~2 min
   for it to finish provisioning.
3. In the left menu open **SQL Editor** → **New query**.
4. In this repo open **`supabase/schema_full.sql`**, copy the **entire**
   file, paste it into the editor, and click **Run**.
5. You should see **Success**. Your database is ready.

> `schema_full.sql` bundles every migration in order. It's safe to re-run
> if you ever need to.

## 2. Get your Supabase keys

In Supabase → **Project Settings** (gear icon) → **API**. Keep this tab
open; you'll copy three values into Vercel:

| Supabase field | Goes into env var |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key (secret) | `SUPABASE_SERVICE_ROLE_KEY` |

> The `service_role` key is a secret — only paste it into Vercel's env
> vars, never anywhere public.

## 3. Get your Gemini key

1. Go to <https://aistudio.google.com/apikey> → **Create API key**.
2. Copy it (starts with `AIza…`). This is your `GEMINI_API_KEY`.

> With a global `GEMINI_API_KEY`, **you** provide the AI for every
> storefront — customers don't need their own key. You pay for AI usage
> (Gemini Flash is cheap; per-IP and per-account rate limits cap it).

## 4. Your encryption key

This encrypts stored credentials. Use this ready-made value **or**
generate your own (below):

```
ENCRYPTION_KEY = 59e9e3537d2e938e8734126289d319d432946668f1cb924716e4bca13528ebb9
```

To generate your own instead (any terminal with Node):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ Set `ENCRYPTION_KEY` **once and never change it.** Changing it later
> locks everyone out of their saved keys.

## 5. Deploy to Vercel

1. Go to <https://vercel.com> → **Add New… → Project**.
2. **Import** this GitHub repository. Vercel auto-detects **Next.js** —
   leave the build settings as they are.
3. Expand **Environment Variables** and add the ones from the
   [reference table](#environment-variables-reference) below (at minimum
   the **Required** ones).
4. Click **Deploy** and wait for the build to finish.
5. Open the URL Vercel gives you (e.g. `https://your-app.vercel.app`).

## 6. Point the app at its own URL

1. Copy your live Vercel URL.
2. In Vercel → **Settings → Environment Variables**, set
   `NEXT_PUBLIC_SITE_URL` to that URL (no trailing slash), e.g.
   `https://your-app.vercel.app`.
3. **Redeploy** (Deployments tab → ⋯ → Redeploy) so it takes effect.

## 7. First run — set up your first storefront

1. Open your app → **Sign up** (this creates your account).
2. Go to **AI Agents → Setup**:
   - Provider **Google (Gemini)**, paste a Gemini key, **Test key**, save
     — *or* skip this entirely if you set the global `GEMINI_API_KEY`.
   - Add your business info under the **knowledge base** (products,
     prices in FCFA, delivery, address, FAQs). **This is how the AI knows
     your business.**
3. Go to **Storefront** (sidebar):
   - Fill in **Business name**, the **link name** (your URL), your
     **WhatsApp number** (international digits, e.g. `2376XXXXXXXX`), a
     welcome message, and **Mobile Money instructions**.
   - Turn on **Publish**, then **Save**.
   - **Copy** your public link and open it.
4. You'll see the live AI sales page. Test it: ask about a product — the
   AI should quote your prices and offer the **Order on WhatsApp** button.

That link is what you put in your Facebook/Instagram ads and WhatsApp
status. 🎉

---

## 8. (Optional) WhatsApp inbox

The storefront above needs **no** Meta approval. If you *also* want the
in-app WhatsApp **inbox** (a shared inbox on your WhatsApp Business
number, with AI auto-reply), that uses Meta's WhatsApp Cloud API and
needs, per business:

- A Meta app + WhatsApp Business number + access token
  (Settings → WhatsApp), and
- The webhook pointed at `https://your-app.vercel.app/api/whatsapp/webhook`
  with your `WEBHOOK_VERIFY_TOKEN`, plus `META_APP_SECRET` set in Vercel.

You can launch the storefront now and add this later.

---

## Environment variables reference

Set these in **Vercel → Settings → Environment Variables**.

### Required

| Variable | Value / where from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `ENCRYPTION_KEY` | The 64-hex value from [step 4](#4-your-encryption-key) |
| `GEMINI_API_KEY` | Your Gemini key from [step 3](#3-get-your-gemini-key) — powers every storefront |

### Recommended

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Your live Vercel URL (set after first deploy, [step 6](#6-point-the-app-at-its-own-url)) |
| `NEXT_PUBLIC_APP_LOCALE` | `en` |

### Optional

| Variable | When you need it |
| --- | --- |
| `GEMINI_MODEL` | Override the storefront model (default `gemini-1.5-flash`) |
| `META_APP_SECRET` | Only for the WhatsApp **inbox** (step 8) |
| `WEBHOOK_VERIFY_TOKEN` | Only for the WhatsApp inbox webhook (step 8) |
| `AI_REQUEST_TIMEOUT_MS` | Provider timeout in ms (default 30000) |

> Full annotated list: **`.env.local.example`**.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build fails on Vercel | Confirm the **Required** env vars are all set, then redeploy. |
| Sign-up / login does nothing | Supabase URL/keys are wrong, or `schema_full.sql` wasn't run. Re-check steps 1–2. |
| Storefront says "not available for chat" | No AI key resolvable — set `GEMINI_API_KEY` in Vercel, or add a key under AI Agents → Setup. |
| Storefront link 404s | The storefront isn't **Published**, or the link name doesn't match. Re-check step 7. |
| AI gives wrong/no prices | Add the details to your **knowledge base** (AI Agents) — the AI only answers from what you put there. |
| "Order on WhatsApp" missing | Set your **WhatsApp number** on the Storefront page and pick a close mode of WhatsApp or Both. |

---

## Local development (optional)

```bash
npm install
cp .env.local.example .env.local   # fill in the same values as above
npm run dev
```

Open <http://localhost:3000>.

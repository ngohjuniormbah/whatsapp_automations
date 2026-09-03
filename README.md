# WhatsApp AI Agent — backend engine

Multi-tenant WhatsApp AI agent for small businesses in Cameroon. One
agent, connected to many merchants' WhatsApp numbers via Twilio. It
answers from each merchant's catalog/services and drives to an **order**
or an **appointment**, in French, English, and Cameroonian Pidgin —
escalating to the human merchant when it shouldn't handle something.

Built phase by phase. **This is Phase 1: skeleton + data model.**

## Stack
Python 3.12 · FastAPI (async) · SQLModel + Postgres · Pydantic AI (later)
· OpenRouter LLM · Twilio WhatsApp (later) · APScheduler (later).

## Run it (Phase 1)

```bash
# 1. Start Postgres
docker compose up -d db

# 2. Python env + deps
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3. Config
cp .env.example .env        # defaults already match docker-compose

# 4. Run the API
uvicorn app.main:app --reload
```

Then:

```bash
curl http://localhost:8000/health
# {"status":"ok","env":"development","db":true}
```

On first start the app creates all tables and seeds one demo merchant
(**Chez Amélie**) with a small catalog, two services, and Mon–Sat
availability.

## Verify the seed

```bash
docker exec -it wa_agent_db psql -U postgres -d wa_agent \
  -c "select name, whatsapp_number, bot_enabled from merchant;"
docker exec -it wa_agent_db psql -U postgres -d wa_agent \
  -c "select name, price_fcfa, in_stock from catalogitem;"
```

## What's here
```
app/
  config.py   # pydantic-settings; all secrets via .env
  db.py       # async engine, session, create_all bootstrap
  models.py   # merchant, catalog_item, service, availability_rule,
              # conversation, message, order, appointment, scheduled_message
  seed.py     # idempotent demo merchant
  main.py     # FastAPI app + /health
docker-compose.yml
```

## Phase 2 — Twilio inbound webhook

Endpoint: `POST /webhook/whatsapp`. It validates `X-Twilio-Signature`,
parses the form body, resolves the merchant by `To` and the conversation
by (merchant, `From`), stores the inbound message, and echoes a reply.

### Test it with your own phone (Twilio Sandbox + ngrok)

1. **Run the app** (see above) so it's live on `localhost:8000`.
2. **Expose it** with ngrok:
   ```bash
   ngrok http 8000
   ```
   Copy the `https://<id>.ngrok-free.app` URL. Put it in `.env` as
   `PUBLIC_BASE_URL` (the signature check rebuilds the signed URL from
   it), and restart the app.
3. **Twilio Console → Messaging → Try it out → WhatsApp Sandbox:**
   - Join the sandbox: send `join <your-sandbox-word>` from WhatsApp to
     the sandbox number (`+1 415 523 8886`).
   - Under **Sandbox settings**, set **"When a message comes in"** to
     `https://<id>.ngrok-free.app/webhook/whatsapp` (**HTTP POST**).
4. Put your Twilio **Auth Token** in `.env` as `TWILIO_AUTH_TOKEN` so
   signature validation is enforced (with it blank, validation is skipped
   for local testing). Restart.
5. **Message the sandbox number from your phone** — e.g. *"c'est combien
   la robe rouge?"*. You'll get the echo back, and the message is stored:
   ```bash
   docker exec -it wa_agent_db psql -U postgres -d wa_agent \
     -c "select role, body from message order by created_at;"
   ```

> The seeded merchant's `whatsapp_number` is the shared sandbox number,
> so your test routes to **Chez Amélie**. In production each merchant has
> its own number and `To` disambiguates the tenant.

## Phases 3–5 — the agent, tools, and scheduler

- **Phase 3 — Agent (Pydantic AI + OpenRouter).** `app/agent.py` builds one
  agent; `app/prompts.py` assembles a per-merchant system prompt (base role
  + `system_prompt_extra` + compact catalog/services + running summary +
  a short window of recent turns — never the full transcript). The model
  is `OPENROUTER_MODEL` (default `qwen/qwen3-30b-a3b`), swappable via env.
  Replies go out via the Twilio REST API from a background task, so the
  webhook returns instantly (no timeout risk).
- **Phase 4 — Tools + state machine.** Typed tools: `get_catalog`,
  `get_services`, `check_availability`, `capture_order`, `book_appointment`,
  `escalate_to_human`. Order prices are re-priced from the catalog (the LLM
  is never trusted on money). Conversation `state` moves
  browsing → ordering / booking / paused_for_human. **Kill switch:** if
  `merchant.bot_enabled` is false OR the conversation is
  `paused_for_human`, the inbound is stored and the agent stays silent.
- **Phase 5 — Scheduler.** `app/scheduler.py` runs an APScheduler job every
  60s that sends due `scheduled_message` rows (e.g. appointment reminders
  created by `book_appointment`). ⚠️ Business-initiated messages **outside
  the 24h window require an approved WhatsApp template** — that path is
  stubbed and clearly marked in the code.

### How the loop works
```
Twilio POST /webhook/whatsapp
  → validate signature → parse form
  → resolve merchant by To, conversation by (merchant, From)
  → store inbound message
  → if bot disabled OR paused_for_human: stop (store only)
  → else: return 200 now; in the background run the agent (tools + state),
    send the reply via Twilio REST, persist it
```

## Roadmap
1. Skeleton + data model ✅
2. Twilio inbound webhook ✅
3. Agent (single message) ✅
4. Tools + state machine ✅
5. Scheduler ✅  — **feature-complete for v1**

## Notes / what I'd harden before scale
- **Timezones:** the app uses naive UTC everywhere to avoid aware/naive
  comparison bugs. Availability is treated as wall-clock; revisit real TZ
  handling (WAT) before multi-region use.
- **Migrations:** schema is created with `create_all`. Add **Alembic**
  before altering a live schema.
- **Reminders outside 24h:** need an approved WhatsApp template (flagged
  in `app/scheduler.py`).
- **Background tasks** are in-process; for real load move agent runs to a
  worker queue (e.g. Arq/Celery) so a restart can't drop an in-flight reply.

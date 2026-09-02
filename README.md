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

## Roadmap
1. **Skeleton + data model** ✅
2. **Twilio inbound webhook** ✅ ← you are here
3. Agent, single message (Pydantic AI + OpenRouter, per-merchant prompt)
4. Tools + state machine (order, booking, availability, escalate; kill switch)
5. APScheduler worker for scheduled/reminder messages

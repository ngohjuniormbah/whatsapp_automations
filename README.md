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

## Roadmap
1. **Skeleton + data model** ← you are here
2. Twilio inbound webhook (signature-validated, echo reply)
3. Agent, single message (Pydantic AI + OpenRouter, per-merchant prompt)
4. Tools + state machine (order, booking, availability, escalate; kill switch)
5. APScheduler worker for scheduled/reminder messages

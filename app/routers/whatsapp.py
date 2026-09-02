"""Twilio WhatsApp inbound webhook.

Phase 2 responsibilities:
  1. Verify the request really came from Twilio (X-Twilio-Signature).
  2. Parse the form-encoded body.
  3. Resolve the tenant by `To`, the conversation by (merchant, `From`).
  4. Store the inbound message and echo a hardcoded reply (via TwiML).

The agent, state machine, and kill switch arrive in Phases 3–4. For now
this proves the pipe end-to-end from a real phone.

Signature validation note
--------------------------
Twilio signs the EXACT public URL configured in the console. Behind
ngrok/a proxy the request the app sees is often http://internal/... , so
we rebuild the URL from `PUBLIC_BASE_URL` + the path instead of trusting
`request.url`. Set `PUBLIC_BASE_URL` to your ngrok https URL.

We parse the raw body with urllib rather than `request.form()` so we
don't need the `python-multipart` dependency, and so the exact param dict
we validate is the exact one we read.
"""

from __future__ import annotations

import logging
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.request_validator import RequestValidator
from twilio.twiml.messaging_response import MessagingResponse

from app import crud, models
from app.config import settings
from app.db import get_session
from app.models import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


def _signature_ok(request: Request, params: dict[str, str], signature: str) -> bool:
    """Validate X-Twilio-Signature. In dev (no auth token) it's skipped."""
    if not settings.twilio_auth_token:
        logger.warning(
            "TWILIO_AUTH_TOKEN not set — skipping signature validation (dev only)."
        )
        return True
    url = settings.public_base_url.rstrip("/") + request.url.path
    if request.url.query:
        url = f"{url}?{request.url.query}"
    validator = RequestValidator(settings.twilio_auth_token)
    return validator.validate(url, params, signature or "")


def _xml(twiml: MessagingResponse, status_code: int = 200) -> Response:
    return Response(content=str(twiml), media_type="application/xml", status_code=status_code)


@router.post("/webhook/whatsapp")
async def whatsapp_webhook(
    request: Request, session: AsyncSession = Depends(get_session)
) -> Response:
    raw = await request.body()
    params = dict(parse_qsl(raw.decode("utf-8")))
    signature = request.headers.get("X-Twilio-Signature", "")

    if not _signature_ok(request, params, signature):
        logger.warning("Rejected webhook: invalid Twilio signature.")
        return Response(status_code=403, content="invalid signature")

    to_number = params.get("To", "")
    from_number = params.get("From", "")
    body = (params.get("Body") or "").strip()

    merchant = await crud.get_merchant_by_whatsapp(session, to_number)
    if merchant is None:
        # Unknown tenant — 200 with an empty TwiML so Twilio doesn't retry.
        logger.warning("No merchant registered for To=%s; ignoring.", to_number)
        return _xml(MessagingResponse())

    conv = await crud.get_or_create_conversation(session, merchant.id, from_number)
    await crud.add_message(session, conv.id, models.MessageRole.customer.value, body)

    # Phase 2: hardcoded echo. Replaced by the agent in Phase 3.
    reply = f"Hi 👋 (echo from {merchant.name}): you said “{body}”"

    twiml = MessagingResponse()
    twiml.message(reply)
    await crud.add_message(session, conv.id, models.MessageRole.agent.value, reply)

    conv.updated_at = utcnow()
    await session.commit()
    return _xml(twiml)

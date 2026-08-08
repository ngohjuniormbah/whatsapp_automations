-- ============================================================
-- 038_storefront.sql — AI Digital Salesperson (public storefront)
--
-- A public, no-login chat page per account: the business fills in its
-- products/prices/FAQs (existing ai_configs.system_prompt + the
-- ai_knowledge base), gets a shareable link (yourapp.com/<slug>), and
-- an AI agent sells 24/7 in French + English, quoting FCFA and closing
-- to MTN MoMo / Orange Money or a wa.me handoff to the owner's own
-- WhatsApp — with NO WhatsApp Cloud API involved.
--
--   1. storefronts       — one public page per account (slug, branding,
--                          owner WhatsApp number, MoMo instructions).
--   2. storefront_leads  — visitors captured from the public chat, so
--                          the owner sees who engaged even without a
--                          wa.me handoff.
--
-- RLS: settings-class. Members read; admins+ write the storefront.
-- Leads are written by the public chat route under the service role
-- (which bypasses RLS) and read by members. The public page itself
-- reads the storefront under the service role too, so there is NO anon
-- policy — an unpublished or unknown slug is simply never returned.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- STOREFRONTS — one per account.
-- ============================================================
CREATE TABLE IF NOT EXISTS storefronts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Public URL segment: yourapp.com/<slug>. Lowercase letters, digits
  -- and single hyphens; 3–40 chars. Enforced again in app code.
  slug               text NOT NULL UNIQUE
                       CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  display_name       text NOT NULL,
  -- Short line under the business name on the public page.
  tagline            text,
  -- Owner's personal WhatsApp in international digits, no '+' (e.g.
  -- 2376XXXXXXXX). Used to build the wa.me handoff link. Nullable so a
  -- MoMo-only storefront is valid.
  owner_whatsapp     text,
  -- First message the AI shows the visitor.
  greeting           text,
  -- Payment instructions shown/spoken to a ready buyer (MoMo numbers).
  momo_instructions  text,
  -- How the agent is told to close: hand off to WhatsApp, give MoMo
  -- instructions, or both.
  close_mode         text NOT NULL DEFAULT 'both'
                       CHECK (close_mode IN ('whatsapp', 'momo', 'both')),
  is_published       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefronts_account ON storefronts(account_id);
-- Case-insensitive slug lookups from the public route (slugs are stored
-- lowercase; this keeps the lookup index-served regardless).
CREATE INDEX IF NOT EXISTS idx_storefronts_slug ON storefronts(slug);

ALTER TABLE storefronts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storefronts_select ON storefronts;
CREATE POLICY storefronts_select ON storefronts FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS storefronts_insert ON storefronts;
CREATE POLICY storefronts_insert ON storefronts FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS storefronts_update ON storefronts;
CREATE POLICY storefronts_update ON storefronts FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS storefronts_delete ON storefronts;
CREATE POLICY storefronts_delete ON storefronts FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON storefronts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON storefronts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STOREFRONT_LEADS — visitors captured from the public chat.
--
-- One row per chat session (client-generated session id), upserted as
-- the conversation grows so the owner sees the latest state. Written by
-- the public chat route under the service role.
-- ============================================================
CREATE TABLE IF NOT EXISTS storefront_leads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  storefront_id  uuid NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  -- Opaque per-browser session id; groups a visitor's messages into one
  -- lead. Unique with storefront_id so the route can upsert.
  session_id     text NOT NULL,
  visitor_name   text,
  visitor_phone  text,
  -- Most recent visitor message — a cheap "what did they want" preview.
  last_message   text,
  message_count  integer NOT NULL DEFAULT 0,
  -- 'new' | 'contacted' | 'closed' — owner-managed pipeline state.
  status         text NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'contacted', 'closed')),
  -- True once the visitor tapped "Order on WhatsApp".
  handed_off     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storefront_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_storefront_leads_account_created
  ON storefront_leads(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_leads_storefront
  ON storefront_leads(storefront_id);

ALTER TABLE storefront_leads ENABLE ROW LEVEL SECURITY;

-- Members read; agents+ may update status. Inserts/upserts come from the
-- service-role public route (bypasses RLS), so there is no client INSERT
-- policy.
DROP POLICY IF EXISTS storefront_leads_select ON storefront_leads;
CREATE POLICY storefront_leads_select ON storefront_leads FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS storefront_leads_update ON storefront_leads;
CREATE POLICY storefront_leads_update ON storefront_leads FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS storefront_leads_delete ON storefront_leads;
CREATE POLICY storefront_leads_delete ON storefront_leads FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON storefront_leads;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON storefront_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

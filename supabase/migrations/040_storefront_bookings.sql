-- ============================================================
-- 040_storefront_bookings.sql — services, bookings & order records
--
-- Turns the storefront from a product shop into a full sales + booking
-- assistant for Cameroon SMEs (salons, clinics, restaurants, repairs,
-- consultants, boutiques):
--
--   1. storefront_products.kind — a catalogue item is now either a
--      'product' (added to a cart) or a 'service' (booked for a time),
--      plus an optional duration for services.
--   2. storefront_orders — a durable record of every order AND booking
--      the storefront captures, with the customer's name + phone and a
--      status the owner works through. So nothing is lost even if the
--      owner never opens the WhatsApp handoff.
--
-- RLS: members read; agents+ update/delete (work the queue). The public
-- route inserts under the service role (bypasses RLS).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ---- Catalogue: product vs service --------------------------------
ALTER TABLE storefront_products
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product'
    CHECK (kind IN ('product', 'service'));
ALTER TABLE storefront_products
  ADD COLUMN IF NOT EXISTS duration_min integer;

-- ---- Orders & bookings --------------------------------------------
CREATE TABLE IF NOT EXISTS storefront_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  storefront_id  uuid NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('order', 'booking')),
  customer_name  text,
  customer_phone text,
  -- Orders: [{name, quantity, price_fcfa}]. Null for bookings.
  items          jsonb,
  -- Bookings: which service + when (free text, e.g. "2026-08-20 14:30").
  service_name   text,
  preferred_time text,
  note           text,
  total_fcfa     integer NOT NULL DEFAULT 0 CHECK (total_fcfa >= 0),
  status         text NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'confirmed', 'completed', 'cancelled')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_orders_account_created
  ON storefront_orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_orders_storefront
  ON storefront_orders(storefront_id);

ALTER TABLE storefront_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storefront_orders_select ON storefront_orders;
CREATE POLICY storefront_orders_select ON storefront_orders FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS storefront_orders_update ON storefront_orders;
CREATE POLICY storefront_orders_update ON storefront_orders FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS storefront_orders_delete ON storefront_orders;
CREATE POLICY storefront_orders_delete ON storefront_orders FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON storefront_orders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON storefront_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

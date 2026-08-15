-- ============================================================
-- 039_storefront_products.sql — visual product catalog for storefronts
--
-- Shoppers browse products (photo + price in FCFA) on the public
-- storefront, add them to a cart, and send the order to the owner's
-- WhatsApp. The AI agent is also grounded on this catalog so it can
-- answer "how much is X / do you have Y" with real numbers.
--
--   1. storefront_products — one row per item (name, price, photo).
--   2. storefront-products  Storage bucket for the photos (public read,
--      account-scoped writes — same convention as flow-media/chat-media).
--
-- RLS: members read; admins+ write. The public page/chat read products
-- under the service role (bypasses RLS), so there is no anon policy.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS storefront_products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  storefront_id  uuid NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  -- Price in whole FCFA (the currency has no minor unit). 0 = "ask".
  price_fcfa     integer NOT NULL DEFAULT 0 CHECK (price_fcfa >= 0),
  -- Public URL + storage path (path kept so the image can be deleted
  -- with the product). Nullable — a product can launch without a photo.
  image_url      text,
  image_path     text,
  is_available   boolean NOT NULL DEFAULT true,
  -- Manual sort order for the catalog grid.
  position       integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_products_storefront
  ON storefront_products(storefront_id, position);
CREATE INDEX IF NOT EXISTS idx_storefront_products_account
  ON storefront_products(account_id);

ALTER TABLE storefront_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storefront_products_select ON storefront_products;
CREATE POLICY storefront_products_select ON storefront_products FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS storefront_products_insert ON storefront_products;
CREATE POLICY storefront_products_insert ON storefront_products FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS storefront_products_update ON storefront_products;
CREATE POLICY storefront_products_update ON storefront_products FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS storefront_products_delete ON storefront_products;
CREATE POLICY storefront_products_delete ON storefront_products FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON storefront_products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON storefront_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Storage bucket for product photos. Public read (so <img> works
-- without signed URLs); writes limited to files under the caller's own
-- account folder — the account-<uuid>/ path convention from migration
-- 020, matched by (storage.foldername(name))[1].
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'storefront-products',
  'storefront-products',
  TRUE,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Matches the account-scoped pattern from migrations 020/023: the first
-- path segment is `account-<account_id>`, and the writer must be an
-- admin+ of that account (product photos are settings-class, like the
-- products table itself).
DROP POLICY IF EXISTS "Storefront product images are publicly readable" ON storage.objects;
CREATE POLICY "Storefront product images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'storefront-products');

DROP POLICY IF EXISTS "Members upload storefront product images" ON storage.objects;
CREATE POLICY "Members upload storefront product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'storefront-products'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_role IN ('owner', 'admin')
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members update storefront product images" ON storage.objects;
CREATE POLICY "Members update storefront product images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'storefront-products'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_role IN ('owner', 'admin')
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members delete storefront product images" ON storage.objects;
CREATE POLICY "Members delete storefront product images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'storefront-products'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_role IN ('owner', 'admin')
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

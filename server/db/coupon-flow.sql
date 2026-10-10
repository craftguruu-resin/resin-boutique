-- Permanent checkout offers, owned by the checkout flow.
INSERT INTO store_coupons (code, discount_type, discount_value, min_subtotal, starts_at, ends_at, max_redemptions, is_active)
VALUES ('WELCOME100', 'flat', 100, 500, NULL, NULL, NULL, true),
       ('FLAT150', 'flat', 150, 2000, NULL, NULL, NULL, true),
       ('FLAT200', 'flat', 200, 2500, NULL, NULL, NULL, true),
       ('FLAT300', 'flat', 300, 3000, NULL, NULL, NULL, true)
ON CONFLICT (code) DO UPDATE SET discount_type = EXCLUDED.discount_type,
  discount_value = EXCLUDED.discount_value, min_subtotal = EXCLUDED.min_subtotal,
  starts_at = NULL, ends_at = NULL, max_redemptions = NULL, is_active = true;

ALTER TABLE checkout_payment_contexts ADD COLUMN IF NOT EXISTS coupons JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE checkout_payment_contexts ADD COLUMN IF NOT EXISTS email_norm VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE checkout_payment_contexts ADD COLUMN IF NOT EXISTS phone_norm VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE checkout_payment_contexts ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_checkout_welcome_email ON checkout_payment_contexts (email_norm, created_at) WHERE coupon_code LIKE '%WELCOME100%';
CREATE INDEX IF NOT EXISTS idx_checkout_welcome_phone ON checkout_payment_contexts (phone_norm, created_at) WHERE coupon_code LIKE '%WELCOME100%';

-- Keep both identities after a refund/deletion. Purchases below ₹500 count too.
CREATE TABLE IF NOT EXISTS customer_order_identities (
  identity_kind VARCHAR(8) NOT NULL CHECK (identity_kind IN ('email', 'phone')),
  identity_value VARCHAR(200) NOT NULL,
  first_order_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_kind, identity_value)
);

-- Existing customers must not become first-time customers after deployment.
INSERT INTO customer_order_identities (identity_kind, identity_value, first_order_id)
SELECT 'email', LOWER(TRIM(o.guest_snapshot->>'email')), MIN(o.id)
FROM orders o WHERE o.payment_status IN ('paid', 'cod_advance_paid')
  AND COALESCE(TRIM(o.guest_snapshot->>'email'), '') <> ''
GROUP BY LOWER(TRIM(o.guest_snapshot->>'email')) ON CONFLICT DO NOTHING;

INSERT INTO customer_order_identities (identity_kind, identity_value, first_order_id)
SELECT 'phone', RIGHT(REGEXP_REPLACE(o.guest_snapshot->>'phone', '[^0-9]', '', 'g'), 10), MIN(o.id)
FROM orders o WHERE o.payment_status IN ('paid', 'cod_advance_paid')
  AND LENGTH(REGEXP_REPLACE(COALESCE(o.guest_snapshot->>'phone', ''), '[^0-9]', '', 'g')) IN (10, 11, 12)
GROUP BY RIGHT(REGEXP_REPLACE(o.guest_snapshot->>'phone', '[^0-9]', '', 'g'), 10) ON CONFLICT DO NOTHING;

INSERT INTO customer_order_identities (identity_kind, identity_value, first_order_id)
SELECT 'email', LOWER(TRIM(g.email)), MIN(o.id) FROM orders o
JOIN guest_customers g ON g.id = o.guest_id
WHERE o.payment_status IN ('paid', 'cod_advance_paid') AND TRIM(g.email) <> ''
GROUP BY LOWER(TRIM(g.email)) ON CONFLICT DO NOTHING;

INSERT INTO customer_order_identities (identity_kind, identity_value, first_order_id)
SELECT 'phone', g.phone_norm, MIN(o.id) FROM orders o
JOIN guest_customers g ON g.id = o.guest_id
WHERE o.payment_status IN ('paid', 'cod_advance_paid') AND g.phone_norm ~ '^[0-9]{10}$'
GROUP BY g.phone_norm ON CONFLICT DO NOTHING;

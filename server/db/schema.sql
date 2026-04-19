-- Craftguru shop schema (PostgreSQL 14+)
-- Run: npm run db:migrate  (requires DATABASE_URL)

CREATE TABLE IF NOT EXISTS guest_customers (
  id BIGSERIAL PRIMARY KEY,
  phone_norm VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(200) NOT NULL,
  display_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_customers_email_lower_unique ON guest_customers (LOWER(TRIM(email)));

CREATE TABLE IF NOT EXISTS guest_addresses (
  id BIGSERIAL PRIMARY KEY,
  guest_id BIGINT NOT NULL REFERENCES guest_customers (id) ON DELETE CASCADE,
  addr_line1 VARCHAR(300) NOT NULL,
  addr_line2 VARCHAR(200) NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  zip VARCHAR(20) NOT NULL,
  country VARCHAR(80) NOT NULL,
  address_type VARCHAR(24) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_addresses_guest ON guest_addresses (guest_id);

ALTER TABLE guest_addresses ADD COLUMN IF NOT EXISTS address_type VARCHAR(24) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS guest_sessions (
  id BIGSERIAL PRIMARY KEY,
  guest_id BIGINT NOT NULL REFERENCES guest_customers (id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_sessions_token_hash ON guest_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_guest ON guest_sessions (guest_id);

CREATE TABLE IF NOT EXISTS vendor_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_sessions (
  id BIGSERIAL PRIMARY KEY,
  vendor_user_id INT NOT NULL REFERENCES vendor_users (id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_sessions_token_hash ON vendor_sessions (token_hash);

CREATE SEQUENCE IF NOT EXISTS order_public_id_seq START WITH 10001 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY DEFAULT nextval('order_public_id_seq'),
  tag_ref VARCHAR(64) NOT NULL UNIQUE,
  guest_id BIGINT REFERENCES guest_customers (id) ON DELETE SET NULL,
  order_type VARCHAR(200) NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL,
  shipping NUMERIC(12, 2) NOT NULL,
  tax NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  guest_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER SEQUENCE order_public_id_seq OWNED BY orders.id;

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_guest ON orders (guest_id);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  line_index SMALLINT NOT NULL,
  name VARCHAR(220) NOT NULL,
  size_label VARCHAR(100) NOT NULL DEFAULT '',
  qty SMALLINT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

-- Payment tracking (test checkout vs Razorpay later). Safe to re-run on existing DBs.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) NOT NULL DEFAULT 'pending_payment';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) NOT NULL DEFAULT '';

-- Optional dispatch state (vendor can PATCH later). Default keeps existing rows valid.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(40) NOT NULL DEFAULT 'new';

CREATE TABLE IF NOT EXISTS vendor_inventory_items (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  sku VARCHAR(120) NOT NULL DEFAULT '',
  quantity NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  supplier VARCHAR(200) NOT NULL DEFAULT '',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_inventory_name ON vendor_inventory_items (name);

ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS category_id VARCHAR(80) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_vendor_inventory_category ON vendor_inventory_items (category_id);

ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS product_id VARCHAR(220) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_vendor_inventory_product ON vendor_inventory_items (product_id);

CREATE TABLE IF NOT EXISTS vendor_order_returns (
  id BIGSERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  reason VARCHAR(800) NOT NULL DEFAULT '',
  refund_amount NUMERIC(12, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_returns_order ON vendor_order_returns (order_id);
CREATE INDEX IF NOT EXISTS idx_vendor_returns_status ON vendor_order_returns (status);

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(80) PRIMARY KEY,
  label VARCHAR(200) NOT NULL,
  folder VARCHAR(200) NOT NULL DEFAULT '',
  subcategories JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(220) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  category_id VARCHAR(80) NOT NULL,
  subcategory_id VARCHAR(80) NOT NULL DEFAULT 'all',
  image_path VARCHAR(500) NOT NULL DEFAULT '',
  prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  long_description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS size_labels JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Storefront live prices (merged over data.js in the browser). One row per catalog product id.
CREATE TABLE IF NOT EXISTS catalog_price_overrides (
  product_id VARCHAR(220) PRIMARY KEY,
  price_s NUMERIC(12, 2),
  price_m NUMERIC(12, 2),
  price_l NUMERIC(12, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_price_overrides_updated ON catalog_price_overrides (updated_at DESC);

-- Optional per-size sellable stock (null = not tracked / unlimited). Managed on vendor inventory → storefront catalog.
ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS stock_s NUMERIC(14, 2);
ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS stock_m NUMERIC(14, 2);
ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS stock_l NUMERIC(14, 2);
ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS size_labels JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size_key VARCHAR(20) NOT NULL DEFAULT '';

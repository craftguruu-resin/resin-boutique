"use strict";

var poolMod = require("./pool.js");

/**
 * Older databases may miss columns added after the table was first created.
 * Idempotent ALTERs — safe to run on every startup when Postgres is enabled.
 * @returns {Promise<void>}
 */
function ensureVendorInventoryColumns() {
  var p = poolMod.getPool();
  if (!p) return Promise.resolve();
  return p
    .query(
      "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS category_id VARCHAR(80) NOT NULL DEFAULT ''"
    )
    .then(function () {
      return p.query(
        "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS product_id VARCHAR(220) NOT NULL DEFAULT ''"
      );
    })
    .then(function () {
      return p.query(
        "CREATE INDEX IF NOT EXISTS idx_vendor_inventory_category ON vendor_inventory_items (category_id)"
      );
    })
    .then(function () {
      return p.query(
        "CREATE INDEX IF NOT EXISTS idx_vendor_inventory_product ON vendor_inventory_items (product_id)"
      );
    })
    .then(function () {
      return p.query(
        "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS qty_s NUMERIC(14, 2)"
      );
    })
    .then(function () {
      return p.query(
        "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS qty_m NUMERIC(14, 2)"
      );
    })
    .then(function () {
      return p.query(
        "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS qty_l NUMERIC(14, 2)"
      );
    })
    .then(function () {
      return p.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS size_labels JSONB NOT NULL DEFAULT '{}'::jsonb");
    })
    .then(function () {
      return p.query(
        "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS out_of_stock BOOLEAN NOT NULL DEFAULT false"
      );
    })
    .then(function () {
      return p.query(
        "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT true"
      );
    })
    .then(function () {
      return p.query(
        "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS return_gift BOOLEAN NOT NULL DEFAULT false"
      );
    })
    .then(function () {
      return p.query(
        "CREATE TABLE IF NOT EXISTS storefront_hero_slides (" +
          "id SERIAL PRIMARY KEY," +
          "image_path VARCHAR(500) NOT NULL," +
          "animation VARCHAR(40) NOT NULL DEFAULT 'orbit'," +
          "sort_order INT NOT NULL DEFAULT 0," +
          "created_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
          ")"
      );
    })
    .then(function () {
      return p.query(
        "CREATE TABLE IF NOT EXISTS storefront_hero_settings (" +
          "id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)," +
          "display_mode VARCHAR(20) NOT NULL DEFAULT 'carousel'," +
          "carousel_interval_ms INT NOT NULL DEFAULT 2000," +
          "single_slide_id INT NULL REFERENCES storefront_hero_slides(id) ON DELETE SET NULL," +
          "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
          ")"
      );
    })
    .then(function () {
      return p.query(
        "INSERT INTO storefront_hero_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM storefront_hero_settings WHERE id = 1)"
      );
    })
    .then(function () {
      return p.query(
        "CREATE TABLE IF NOT EXISTS raw_materials (" +
          "id VARCHAR(120) PRIMARY KEY," +
          "name VARCHAR(500) NOT NULL," +
          "description TEXT NOT NULL DEFAULT ''," +
          "image_path VARCHAR(500) NOT NULL DEFAULT ''," +
          "note VARCHAR(300) NOT NULL DEFAULT ''," +
          "is_active BOOLEAN NOT NULL DEFAULT true," +
          "created_at TIMESTAMPTZ NOT NULL DEFAULT now()," +
          "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
          ")"
      );
    })
    .then(function () {
      return p.query("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku VARCHAR(120) NOT NULL DEFAULT ''");
    })
    .then(function () {
      return p.query(
        "CREATE TABLE IF NOT EXISTS guest_email_otps (" +
          "id BIGSERIAL PRIMARY KEY," +
          "email_lower VARCHAR(200) NOT NULL," +
          "code_hash VARCHAR(64) NOT NULL," +
          "expires_at TIMESTAMPTZ NOT NULL," +
          "consumed_at TIMESTAMPTZ," +
          "created_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
          ")"
      );
    })
    .then(function () {
      return p.query(
        "CREATE INDEX IF NOT EXISTS idx_guest_email_otps_lookup ON guest_email_otps (email_lower, expires_at DESC)"
      );
    })
    .then(function () {
      return p.query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_customers_email_lower_unique " +
          "ON guest_customers (LOWER(TRIM(email)))"
      );
    })
    .catch(function (err) {
      if (err && err.code === "42P01") return;
      console.warn("[db] vendor_inventory_items column hotfix:", err && err.message ? err.message : err);
    })
    .then(function () {
      return p.query(
        "SELECT 1 AS ok FROM information_schema.columns " +
          "WHERE table_schema = current_schema() AND table_name = 'vendor_inventory_items' AND column_name = 'product_id' " +
          "LIMIT 1"
      );
    })
    .then(function (r) {
      if (!r.rows || !r.rows.length) {
        console.warn(
          "[db] vendor_inventory_items.product_id is still missing (inventory list will error). " +
            "From server/ run: npm run db:migrate — or grant ALTER on vendor_inventory_items."
        );
      }
    })
    .catch(function (err) {
      if (err && err.code === "42P01") return;
      console.warn("[db] vendor_inventory_items column verify:", err && err.message ? err.message : err);
    });
}

module.exports = { ensureVendorInventoryColumns };

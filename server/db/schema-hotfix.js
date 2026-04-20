"use strict";

var poolMod = require("./pool.js");

/**
 * Run one idempotent DDL statement; log and continue if it fails so later steps still run.
 * @param {import("pg").Pool} p
 * @param {string} sql
 * @returns {Promise<void>}
 */
function runHotfixQuery(p, sql) {
  return p.query(sql).catch(function (err) {
    if (err && err.code === "42P01") return;
    console.warn("[db] schema-hotfix:", err && err.message ? err.message : err);
  });
}

/**
 * Older databases may miss columns added after the table was first created.
 * Idempotent ALTERs — safe to run on every startup when Postgres is enabled.
 * Each statement is isolated so one failure does not skip the rest (e.g. products.size_labels).
 * @returns {Promise<void>}
 */
function ensureVendorInventoryColumns() {
  var p = poolMod.getPool();
  if (!p) return Promise.resolve();

  var statements = [
    /* Run early: vendor catalog/inventory queries SELECT products.size_labels immediately after listen. */
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS size_labels JSONB NOT NULL DEFAULT '{}'::jsonb",
    /* listOverridesMap() reads these before products — was missing and caused column "size_labels" does not exist on prod */
    "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS stock_s NUMERIC(14, 2)",
    "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS stock_m NUMERIC(14, 2)",
    "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS stock_l NUMERIC(14, 2)",
    "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS size_labels JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS category_id VARCHAR(80) NOT NULL DEFAULT ''",
    "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS product_id VARCHAR(220) NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_vendor_inventory_category ON vendor_inventory_items (category_id)",
    "CREATE INDEX IF NOT EXISTS idx_vendor_inventory_product ON vendor_inventory_items (product_id)",
    "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS qty_s NUMERIC(14, 2)",
    "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS qty_m NUMERIC(14, 2)",
    "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS qty_l NUMERIC(14, 2)",
    "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS unit_cost_s NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS unit_cost_m NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "ALTER TABLE vendor_inventory_items ADD COLUMN IF NOT EXISTS unit_cost_l NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS out_of_stock BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE catalog_price_overrides ADD COLUMN IF NOT EXISTS return_gift BOOLEAN NOT NULL DEFAULT false",
    "CREATE TABLE IF NOT EXISTS storefront_hero_slides (" +
      "id SERIAL PRIMARY KEY," +
      "image_path TEXT NOT NULL," +
      "animation VARCHAR(40) NOT NULL DEFAULT 'orbit'," +
      "sort_order INT NOT NULL DEFAULT 0," +
      "created_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
      ")",
    "ALTER TABLE storefront_hero_slides ALTER COLUMN image_path TYPE TEXT USING image_path::text",
    "CREATE TABLE IF NOT EXISTS storefront_hero_settings (" +
      "id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)," +
      "display_mode VARCHAR(20) NOT NULL DEFAULT 'carousel'," +
      "carousel_interval_ms INT NOT NULL DEFAULT 5000," +
      "single_slide_id INT NULL REFERENCES storefront_hero_slides(id) ON DELETE SET NULL," +
      "custom_hero_enabled BOOLEAN NOT NULL DEFAULT true," +
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
      ")",
    "ALTER TABLE storefront_hero_settings ADD COLUMN IF NOT EXISTS custom_hero_enabled BOOLEAN NOT NULL DEFAULT true",
    "INSERT INTO storefront_hero_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM storefront_hero_settings WHERE id = 1)",
    "CREATE TABLE IF NOT EXISTS raw_materials (" +
      "id VARCHAR(120) PRIMARY KEY," +
      "name VARCHAR(500) NOT NULL," +
      "description TEXT NOT NULL DEFAULT ''," +
      "image_path VARCHAR(500) NOT NULL DEFAULT ''," +
      "note VARCHAR(300) NOT NULL DEFAULT ''," +
      "is_active BOOLEAN NOT NULL DEFAULT true," +
      "created_at TIMESTAMPTZ NOT NULL DEFAULT now()," +
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
      ")",
    "ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS price_inr NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS mrp_inr NUMERIC(12, 2)",
    "ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS options_json JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS sku VARCHAR(120) NOT NULL DEFAULT ''",
    "UPDATE raw_materials SET sku = regexp_replace(id, '^raw-mat--', 'RM-', 'i') WHERE trim(coalesce(sku, '')) = ''",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_materials_sku_lower ON raw_materials (lower(trim(sku)))",
    "ALTER TABLE raw_materials ALTER COLUMN image_path TYPE TEXT USING image_path::text",
    "ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS base_category_slug VARCHAR(80) NOT NULL DEFAULT ''",
    "ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS subcategory_slug VARCHAR(80) NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_raw_materials_base_cat ON raw_materials (base_category_slug)",
    "CREATE INDEX IF NOT EXISTS idx_raw_materials_sub_cat ON raw_materials (subcategory_slug)",
    "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku VARCHAR(120) NOT NULL DEFAULT ''",
    "CREATE TABLE IF NOT EXISTS guest_email_otps (" +
      "id BIGSERIAL PRIMARY KEY," +
      "email_lower VARCHAR(200) NOT NULL," +
      "code_hash VARCHAR(64) NOT NULL," +
      "expires_at TIMESTAMPTZ NOT NULL," +
      "consumed_at TIMESTAMPTZ," +
      "created_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
      ")",
    "CREATE INDEX IF NOT EXISTS idx_guest_email_otps_lookup ON guest_email_otps (email_lower, expires_at DESC)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_customers_email_lower_unique " +
      "ON guest_customers (LOWER(TRIM(email)))"
  ];

  var chain = Promise.resolve();
  statements.forEach(function (sql) {
    chain = chain.then(function () {
      return runHotfixQuery(p, sql);
    });
  });

  return chain
    .then(function () {
      return p
        .query(
          "SELECT 1 AS ok FROM information_schema.columns " +
            "WHERE table_schema = current_schema() AND table_name = 'vendor_inventory_items' AND column_name = 'product_id' " +
            "LIMIT 1"
        )
        .catch(function (err) {
          if (err && err.code === "42P01") return { rows: [] };
          console.warn("[db] vendor_inventory_items column verify:", err && err.message ? err.message : err);
          return { rows: [] };
        });
    })
    .then(function (r) {
      if (!r || !r.rows || !r.rows.length) {
        console.warn(
          "[db] vendor_inventory_items.product_id is still missing (inventory list will error). " +
            "From server/ run: npm run db:migrate — or grant ALTER on vendor_inventory_items."
        );
      }
    })
    .then(function () {
      return p
        .query(
          "SELECT 1 AS ok FROM information_schema.columns " +
            "WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'size_labels' " +
            "LIMIT 1"
        )
        .catch(function (err) {
          if (err && err.code === "42P01") return { rows: [] };
          console.warn("[db] products.size_labels column verify:", err && err.message ? err.message : err);
          return { rows: [] };
        });
    })
    .then(function (r) {
      if (!r || !r.rows || !r.rows.length) {
        console.warn(
          "[db] products.size_labels is still missing (vendor product list will error). " +
            "From server/ run: npm run db:migrate — or grant ALTER on products."
        );
      }
    });
}

module.exports = { ensureVendorInventoryColumns };

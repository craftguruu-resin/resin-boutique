"use strict";

/*
 * IMPORTANT — catalog ownership rule
 *
 * Git/data.js is DEFINITION-ONLY.
 *
 * This script is intentionally a complete NO-OP for the database:
 *   - NEVER insert products
 *   - NEVER upsert products
 *   - NEVER insert categories
 *   - NEVER upsert categories
 *   - NEVER recreate anything from data.js
 *
 * Products and categories are managed by the backend/Vendor Panel.
 * A product deleted from Postgres must stay deleted across git pull,
 * deploy, restart, and any catalog seed command.
 *
 * Keep this file as a guardrail. Do not add database writes here.
 */

console.log("Catalog seed skipped: Git/data.js is definition-only. No products or categories are created or upserted.");
process.exit(0);

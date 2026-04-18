"use strict";
/* Meta WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
   Add test recipients in Meta App Dashboard → WhatsApp → API setup. */

require("dotenv").config();

var path = require("path");
var fs = require("fs");
var crypto = require("crypto");
var express = require("express");
var cors = require("cors");
var nodemailer = require("nodemailer");
var { renderOrderBillJpeg } = require("./render-bill-jpeg.js");
var { renderOrderBillPdf } = require("./render-bill-pdf.js");
var ordersRepo = require("./orders-repository.js");
var vendorExtrasDb = require("./vendor-extras-db.js");
var catalogFromData = require("./catalog-from-data.js");
var vendorCatalogDb = require("./vendor-catalog-db.js");
var vendorProductsDb = require("./vendor-products-db.js");
var multer = require("multer");

var productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});
var poolMod = require("./db/pool.js");
var schemaHotfix = require("./db/schema-hotfix.js");
var vendorAuth = require("./vendor-auth.js");
var guestSessions = require("./guest-sessions.js");
var guestOtp = require("./guest-otp.js");
var guestDb = require("./guest-db.js");
var wa = require("./whatsapp-meta.js");

var PORT = Number(process.env.PORT) || 3847;
var TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
var PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
var GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
var ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
var NODE_ENV = String(process.env.NODE_ENV || "").trim();
var BILL_API_SECRET = process.env.BILL_API_SECRET || "";
var RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
var RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

var Razorpay = null;
try {
  Razorpay = require("razorpay");
} catch (_) {
  Razorpay = null;
}

function getRazorpayClient() {
  if (!Razorpay || !RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!RAZORPAY_KEY_SECRET || !orderId || !paymentId || !signature) return false;
  var body = String(orderId) + "|" + String(paymentId);
  var expected = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(body).digest("hex");
  try {
    var a = Buffer.from(expected, "hex");
    var b = Buffer.from(String(signature), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

var rateBucket = {};
var RATE_WINDOW_MS = 60 * 60 * 1000;
var RATE_MAX = 40;

function rateOk(ip) {
  var now = Date.now();
  var b = rateBucket[ip];
  if (!b || now - b.start > RATE_WINDOW_MS) {
    rateBucket[ip] = { start: now, n: 1 };
    return true;
  }
  if (b.n >= RATE_MAX) return false;
  b.n++;
  return true;
}

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function normalizeIndia10(raw) {
  var x = digitsOnly(raw);
  if (x.length === 12 && x.indexOf("91") === 0) x = x.slice(2);
  if (x.length === 11 && x.charAt(0) === "0") x = x.slice(1);
  return x.length === 10 ? x : "";
}

/** Line MRP / unit prices are GST-inclusive (18%). Shipping is added without extra GST in this model. */
function computeTotals(items) {
  var GST = 0.18;
  var sub = 0;
  items.forEach(function (x) {
    var q = Math.max(1, Math.min(999, Math.floor(Number(x.qty) || 1)));
    var u = Math.max(0, Math.min(999999, Number(x.unitPrice) || 0));
    sub += u * q;
  });
  var subIncl = Math.round(sub * 100) / 100;
  var ship = subIncl >= 150 ? 0 : 10;
  var taxable = Math.round((subIncl / (1 + GST)) * 100) / 100;
  var gst = Math.round((subIncl - taxable) * 100) / 100;
  var grand = Math.round((subIncl + ship) * 100) / 100;
  return {
    subtotal: subIncl,
    taxableValue: taxable,
    gstAmount: gst,
    shipping: ship,
    tax: gst,
    total: grand,
  };
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 60) return "Invalid items";
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || typeof it.name !== "string" || it.name.length > 220) return "Invalid item name";
    if (typeof it.sizeLabel !== "string" || it.sizeLabel.length > 100) return "Invalid size";
    var q = Math.floor(Number(it.qty));
    var u = Number(it.unitPrice);
    if (!Number.isFinite(q) || q < 1 || q > 999) return "Invalid qty";
    if (!Number.isFinite(u) || u < 0 || u > 999999) return "Invalid price";
    if (it.image != null && typeof it.image !== "string") return "Invalid image";
    if (typeof it.image === "string" && it.image.length > 500) return "Invalid image";
    if (it.productId != null && typeof it.productId !== "string" && typeof it.productId !== "number") {
      return "Invalid product id";
    }
    if (String(it.productId || "").length > 220) return "Invalid product id";
    if (it.sizeKey != null && typeof it.sizeKey !== "string" && typeof it.sizeKey !== "number") {
      return "Invalid size key";
    }
    if (String(it.sizeKey || "").length > 20) return "Invalid size key";
    if (it.sku != null && typeof it.sku !== "string") return "Invalid SKU";
    if (typeof it.sku === "string" && it.sku.length > 120) return "Invalid SKU";
  }
  return null;
}

function sanitizeBillItem(it) {
  return {
    name: String(it.name).slice(0, 220),
    sizeLabel: String(it.sizeLabel || "").slice(0, 100),
    qty: Math.max(1, Math.min(999, Math.floor(Number(it.qty) || 1))),
    unitPrice: Math.max(0, Math.min(999999, Number(it.unitPrice) || 0)),
    image: String(it.image || "").slice(0, 500),
    productId: String(it.productId != null ? it.productId : "").trim().slice(0, 220),
    sizeKey: String(it.sizeKey != null ? it.sizeKey : "")
      .trim()
      .toLowerCase()
      .slice(0, 20),
    sku: String(it.sku != null ? it.sku : "")
      .trim()
      .slice(0, 120),
  };
}

function withResolvedSkus(items, cb) {
  ordersRepo.resolveSkuMapPool(items, function (err, map) {
    if (err) return cb(err);
    var merged = (items || []).map(function (it) {
      var o = Object.assign({}, it);
      var pid = String(o.productId || "").trim();
      if (map && map[pid]) o.sku = map[pid];
      return o;
    });
    cb(null, merged);
  });
}

function readQrDataUri() {
  var QR_PATH = path.join(__dirname, "..", "media", "upi-payment-qr.jpg");
  if (!fs.existsSync(QR_PATH)) {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  }
  var b = fs.readFileSync(QR_PATH);
  return "data:image/jpeg;base64," + b.toString("base64");
}

function billSecretOk(req) {
  if (!BILL_API_SECRET) return true;
  return req.get("x-bill-api-secret") === BILL_API_SECRET;
}

function billSecretConfigured() {
  return Boolean(String(BILL_API_SECRET || "").trim());
}

function rejectBillApiSecret(res) {
  res.status(401).json({
    ok: false,
    code: "bill_api_secret",
    error:
      "Missing or wrong x-bill-api-secret. Set BILL_API_SECRET in server/.env and the same value as data-bill-api-secret on checkout (and vendor) <html>.",
  });
}

function normalizeSubcategoryEntry(x) {
  if (x == null) return null;
  if (typeof x === "string") {
    var ts = String(x).trim();
    return ts ? { id: ts.slice(0, 80), label: ts.slice(0, 200) } : null;
  }
  if (typeof x !== "object") return null;
  var id =
    (x.id != null && String(x.id).trim()) ||
    (x.subcategory_id != null && String(x.subcategory_id).trim()) ||
    (x.subcategoryId != null && String(x.subcategoryId).trim()) ||
    (x.slug != null && String(x.slug).trim()) ||
    (x.key != null && String(x.key).trim()) ||
    (x.value != null && String(x.value).trim()) ||
    "";
  id = id.slice(0, 80);
  if (!id) return null;
  var label =
    (x.label != null && String(x.label).trim()) ||
    (x.name != null && String(x.name).trim()) ||
    id;
  return { id: id, label: label.slice(0, 200) };
}

function normalizeCategorySubcategories(sub) {
  if (typeof sub === "string") {
    try {
      sub = JSON.parse(sub);
    } catch (_) {
      sub = [];
    }
  }
  if (!Array.isArray(sub)) return [];
  return sub.map(normalizeSubcategoryEntry).filter(Boolean);
}

/** Dedupe by subcategory id; DB list first, then catalog fills gaps and adds missing ids. */
function mergeSubcategoryListsUnion(dbSubs, catalogSubs) {
  var seen = Object.create(null);
  var out = [];
  function pushList(list) {
    (list || []).forEach(function (raw) {
      var s = normalizeSubcategoryEntry(raw);
      if (!s || !s.id) return;
      var id = String(s.id).trim().slice(0, 80);
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push({ id: id, label: String(s.label || id).slice(0, 200) });
    });
  }
  pushList(dbSubs);
  pushList(catalogSubs);
  return out;
}

function mergeCategoriesDbWithCatalog(dbRows) {
  var map = Object.create(null);
  (dbRows || []).forEach(function (row) {
    var id = String((row && row.id) || "").trim().slice(0, 80);
    if (!id) return;
    map[id] = {
      id: id,
      label: row.label,
      folder: row.folder || "",
      subcategories: normalizeCategorySubcategories(row.subcategories),
    };
  });
  var catalogList = [];
  try {
    catalogList = catalogFromData.getCategoriesList() || [];
  } catch (e) {
    console.error("[categories merge] getCategoriesList failed:", (e && e.message) || e);
  }
  catalogList.forEach(function (c) {
    if (!c || !c.id) return;
    var cid = String(c.id).trim().slice(0, 80);
    if (!cid) return;
    var fromDataSubs = Array.isArray(c.subcategories)
      ? c.subcategories.map(normalizeSubcategoryEntry).filter(Boolean)
      : [];
    if (!map[cid]) {
      map[cid] = {
        id: cid,
        label: c.label || cid,
        folder: c.folder || "",
        subcategories: fromDataSubs,
      };
    } else {
      map[cid].subcategories = mergeSubcategoryListsUnion(map[cid].subcategories || [], fromDataSubs);
      if (!String(map[cid].folder || "").trim() && String(c.folder || "").trim()) {
        map[cid].folder = c.folder;
      }
      if ((!map[cid].label || map[cid].label === map[cid].id) && c.label) {
        map[cid].label = c.label;
      }
    }
  });
  Object.keys(map).forEach(function (k) {
    var row = map[k];
    if (!row.subcategories || !row.subcategories.length) {
      row.subcategories = [{ id: "all", label: "All" }];
    }
  });
  return Object.keys(map)
    .map(function (k) {
      return map[k];
    })
    .sort(function (a, b) {
      return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
    });
}

function createMailTransport() {
  try {
    if (process.env.SMTP_HOST) {
      var tOpts = {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      };
      if (process.env.SMTP_USER != null && String(process.env.SMTP_USER).length > 0) {
        tOpts.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" };
      }
      return nodemailer.createTransport(tOpts);
    }
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      return nodemailer.createTransport({
        service: "Gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });
    }
  } catch (_) {
    return null;
  }
  return null;
}

function validateGuestParcel(g) {
  if (!g || typeof g !== "object") return "Invalid guest";
  if (typeof g.name !== "string" || g.name.trim().length < 1 || g.name.length > 200) return "Invalid name";
  if (typeof g.email !== "string" || g.email.indexOf("@") < 1 || g.email.length > 200) return "Invalid email";
  if (typeof g.phone !== "string" || g.phone.trim().length < 5 || g.phone.length > 60) return "Invalid phone";
  if (typeof g.addrLine1 !== "string" || g.addrLine1.trim().length < 1 || g.addrLine1.length > 300) {
    return "Invalid street address";
  }
  if (g.addrLine2 != null && typeof g.addrLine2 === "string" && g.addrLine2.length > 200) return "Invalid address line 2";
  if (typeof g.city !== "string" || g.city.trim().length < 1 || g.city.length > 120) return "Invalid city";
  if (typeof g.state !== "string" || g.state.trim().length < 1 || g.state.length > 120) return "Invalid state";
  if (typeof g.zip !== "string" || g.zip.trim().length < 1 || g.zip.length > 20) return "Invalid postal code";
  if (typeof g.country !== "string" || g.country.trim().length < 1 || g.country.length > 80) return "Invalid country";
  return null;
}

function normalizeGuestParcel(g) {
  return {
    name: String(g.name || "").trim().slice(0, 200),
    email: String(g.email || "").trim().slice(0, 200),
    phone: String(g.phone || "").trim().slice(0, 60),
    addrLine1: String(g.addrLine1 || "").trim().slice(0, 300),
    addrLine2: String(g.addrLine2 || "").trim().slice(0, 200),
    city: String(g.city || "").trim().slice(0, 120),
    state: String(g.state || "").trim().slice(0, 120),
    zip: String(g.zip || "").trim().slice(0, 20),
    country: String(g.country || "").trim().slice(0, 80),
  };
}

var app = express();
app.use(express.json({ limit: "400kb" }));

/** CORS: "*" is wide open. Otherwise merge env list with common Live Server / Vite ports on loopback (fixes vendor login from browser when .env only lists :5500 but Live Server uses :5501, etc.). */
function buildCorsOriginOption() {
  if (!ALLOWED_ORIGIN || ALLOWED_ORIGIN === "*") {
    return true;
  }
  var set = Object.create(null);
  ALLOWED_ORIGIN.split(",").forEach(function (s) {
    var t = String(s || "").trim();
    if (t) set[t] = 1;
  });
  var devPorts = [5500, 5501, 5173, 5174, 3000, 3001, 8080, 8888, 4173];
  devPorts.forEach(function (port) {
    set["http://127.0.0.1:" + port] = 1;
    set["http://localhost:" + port] = 1;
  });
  var allowed = Object.keys(set);
  return function (origin, cb) {
    if (!origin) {
      return cb(null, true);
    }
    if (set[origin]) {
      return cb(null, true);
    }
    if (NODE_ENV !== "production") {
      try {
        var u = new URL(origin);
        if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
          return cb(null, true);
        }
      } catch (_) {}
    }
    cb(new Error("Not allowed by CORS"));
  };
}

app.use(
  cors({
    origin: buildCorsOriginOption(),
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-vendor-token", "x-bill-api-secret"],
  })
);

function isVendorBillSecretExempt(req) {
  var full = String(req.originalUrl || req.url || "").split("?")[0];
  return /\/api\/vendor\/status\/?$/.test(full) || /\/api\/vendor\/categories\/?$/.test(full);
}

app.use("/api/vendor", function (req, res, next) {
  res.setHeader("Vary", "Authorization, x-vendor-token, x-bill-api-secret");
  if (isVendorBillSecretExempt(req)) {
    return next();
  }
  if (billSecretConfigured() && !billSecretOk(req)) {
    return rejectBillApiSecret(res);
  }
  next();
});

app.get("/api/health", function (_req, res) {
  var hasToken = Boolean(TOKEN && PHONE_NUMBER_ID);
  poolMod.ping(function (err, dbOk) {
    res.json({
      ok: true,
      whatsappConfigured: hasToken,
      razorpayConfigured: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && Razorpay),
      emailConfigured: Boolean(createMailTransport()),
      database: poolMod.isEnabled()
        ? { enabled: true, reachable: Boolean(dbOk), error: err ? String(err.message) : null }
        : { enabled: false, hint: "Set DATABASE_URL for Postgres (orders, guests, vendor, catalog)." },
    });
  });
});

/** JPEG preview — no WhatsApp token required (same renderer as API send). */
app.post("/api/preview-bill-jpeg", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);

  var body = req.body || {};
  var itemsErr = validateItems(body.items);
  if (itemsErr) {
    return res.status(400).json({ ok: false, error: itemsErr });
  }

  var items = body.items.map(sanitizeBillItem);

  withResolvedSkus(items, function (skuErr, itemsWithSku) {
    if (skuErr) {
      return res.status(500).json({ ok: false, error: String(skuErr.message || skuErr) });
    }
    var totals = computeTotals(itemsWithSku);
    var ten = normalizeIndia10(body.phone || "");
    var generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
    var customerPhone = ten ? "+91" + ten : "Preview (optional phone on checkout)";

    var renderOpts = {
      items: itemsWithSku,
      subtotal: totals.subtotal,
      taxableValue: totals.taxableValue,
      shipping: totals.shipping,
      tax: totals.tax,
      total: totals.total,
      customerPhone: customerPhone,
      generatedAt: generatedAt,
      qrDataUri: readQrDataUri(),
    };

    renderOrderBillJpeg(renderOpts)
      .then(function (buf) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Disposition", 'attachment; filename="Craftguru-order-bill.jpg"');
        res.send(buf);
      })
      .catch(function (err) {
        res.status(500).json({ ok: false, error: err && err.message ? err.message : "JPEG render failed" });
      });
  });
});

/** PDF preview — order summary layout with product images (no WhatsApp token). */
app.post("/api/preview-bill-pdf", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);

  var body = req.body || {};
  var itemsErr = validateItems(body.items);
  if (itemsErr) {
    return res.status(400).json({ ok: false, error: itemsErr });
  }

  var items = body.items.map(sanitizeBillItem);

  withResolvedSkus(items, function (skuErr, itemsWithSku) {
    if (skuErr) {
      return res.status(500).json({ ok: false, error: String(skuErr.message || skuErr) });
    }
    var totals = computeTotals(itemsWithSku);

    renderOrderBillPdf({
      items: itemsWithSku,
      subtotal: totals.subtotal,
      taxableValue: totals.taxableValue,
      shipping: totals.shipping,
      tax: totals.tax,
      total: totals.total,
    })
      .then(function (buf) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="Craftguru-order-bill.pdf"');
        res.send(buf);
      })
      .catch(function (err) {
        res.status(500).json({ ok: false, error: err && err.message ? err.message : "PDF render failed" });
      });
  });
});

/** Create Razorpay order from cart lines (amount fixed server-side). */
app.post("/api/razorpay-order", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);

  var rz = getRazorpayClient();
  if (!rz) {
    return res.status(503).json({
      ok: false,
      error: "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server .env",
    });
  }

  var body = req.body || {};
  var itemsErr = validateItems(body.items);
  if (itemsErr) {
    return res.status(400).json({ ok: false, error: itemsErr });
  }

  var items = body.items.map(sanitizeBillItem);

  var totals = computeTotals(items);
  var amountPaise = Math.round(totals.total * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    return res.status(400).json({ ok: false, error: "Order total must be at least ₹1 after fees." });
  }

  var receipt = ("cg" + Date.now()).replace(/\D/g, "").slice(0, 40);

  rz.orders
    .create({ amount: amountPaise, currency: "INR", receipt: receipt })
    .then(function (order) {
      res.json({
        ok: true,
        keyId: RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      });
    })
    .catch(function (err) {
      var desc =
        err &&
        err.error &&
        (err.error.description || err.error.reason || err.error.code || err.error.step);
      res.status(502).json({
        ok: false,
        error: String(desc || err.message || err || "Razorpay order failed"),
      });
    });
});

/** Verify payment signature after Razorpay Checkout success. When guest + items are included, creates a paid order (DB) and applies catalog stock rules. */
app.post("/api/razorpay-verify", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);

  if (!RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ ok: false, error: "Razorpay is not configured on the server." });
  }

  var b = req.body || {};
  var oid = b.razorpay_order_id;
  var payId = b.razorpay_payment_id;
  var sig = b.razorpay_signature;
  if (!verifyRazorpaySignature(oid, payId, sig)) {
    return res.status(400).json({ ok: false, error: "Invalid payment signature" });
  }

  var guest = b.guest;
  var rawItems = b.items;
  if (guest && Array.isArray(rawItems) && rawItems.length) {
    var gErr0 = validateGuestParcel(guest);
    if (gErr0) {
      return res.status(400).json({ ok: false, error: gErr0 });
    }
    var itemsErr0 = validateItems(rawItems);
    if (itemsErr0) {
      return res.status(400).json({ ok: false, error: itemsErr0 });
    }
    var items0 = rawItems.map(sanitizeBillItem);
    var totals0 = computeTotals(items0);
    var g0 = normalizeGuestParcel(guest);
    var tagRef0 =
      "CG-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      crypto.randomBytes(3).toString("hex").toUpperCase();

    function createPaidRazorpayOrder() {
      ordersRepo.createCheckoutParcelOrder(
        {
          guest: g0,
          items: items0,
          totals: totals0,
          orderType: "Checkout · Razorpay",
          tagRef: tagRef0,
          paymentStatus: "paid",
          paymentMethod: "razorpay",
        },
        function (err, orderRecord) {
          if (err) {
            return res.status(500).json({
              ok: false,
              error: String((err && err.message) || err || "Could not create order"),
            });
          }
          var payload = {
            ok: true,
            orderCreated: true,
            orderId: orderRecord.orderId,
            tagRef: orderRecord.tagRef,
            paymentStatus: orderRecord.paymentStatus,
            paymentMethod: orderRecord.paymentMethod,
            razorpayPaymentId: String(payId || ""),
          };
          jsonWithOptionalGuestSession(res, payload, orderRecord.guestId);
        }
      );
    }

    var tokenRv = readGuestBearer(req);
    if (!tokenRv) {
      return createPaidRazorpayOrder();
    }
    return guestSessions.verifyGuestToken(tokenRv, function (vErr, row) {
      if (vErr) {
        return res.status(500).json({ ok: false, error: String(vErr.message || vErr) });
      }
      if (!row) {
        return createPaidRazorpayOrder();
      }
      var emGuest = String(g0.email || "")
        .trim()
        .toLowerCase();
      var emSess = String(row.email || "")
        .trim()
        .toLowerCase();
      if (!emGuest || emGuest !== emSess) {
        return res.status(403).json({
          ok: false,
          code: "EMAIL_MISMATCH",
          error: "Checkout email must match the account you signed in with.",
        });
      }
      createPaidRazorpayOrder();
    });
  }

  res.json({ ok: true, orderCreated: false });
});

/** Guest + shipping address only (no order). Persists when DATABASE_URL is set. With Bearer: email must match session. Without Bearer: saves from form (creates/links guest by phone+email for later OTP login). */
function handleSaveGuestAddress(req, res) {
  var body = req.body || {};
  var gErr = validateGuestParcel(body.guest);
  if (gErr) {
    return res.status(400).json({ ok: false, error: gErr });
  }
  var guest = normalizeGuestParcel(body.guest);

  function respondSaveGuestAddress(err, out) {
    if (err) {
      var msg = String((err && err.message) || err || "Could not save address");
      var code = null;
      if (
        msg.indexOf("already registered") >= 0 ||
        msg.indexOf("different email") >= 0 ||
        msg.indexOf("different phone") >= 0 ||
        msg.indexOf("two different accounts") >= 0
      ) {
        code = "USE_LOGIN";
      }
      if (msg.indexOf("Database not configured") >= 0) {
        return res.status(503).json({
          ok: false,
          error: "Database not configured. Set DATABASE_URL and run npm run db:migrate to save guest addresses.",
        });
      }
      if (code) {
        return res.status(409).json({ ok: false, error: msg, code: code });
      }
      return res.status(500).json({ ok: false, error: msg });
    }
    res.json({
      ok: true,
      guestId: out && out.guestId != null ? out.guestId : null,
      fileMode: !(out && out.guestId != null),
    });
  }

  var token = readGuestBearer(req);
  if (!token) {
    return ordersRepo.saveGuestAddressOnly(guest, respondSaveGuestAddress);
  }
  guestSessions.verifyGuestToken(token, function (vErr, row) {
    if (vErr) {
      return res.status(500).json({ ok: false, error: String(vErr.message || vErr) });
    }
    if (!row) {
      return res.status(401).json({
        ok: false,
        code: "SIGN_IN_REQUIRED",
        error: "Session expired. Tap Send OTP and sign in again, then save your address.",
      });
    }
    var emGuest = String(guest.email || "")
      .trim()
      .toLowerCase();
    var emSess = String(row.email || "")
      .trim()
      .toLowerCase();
    if (!emGuest || emGuest !== emSess) {
      return res.status(403).json({
        ok: false,
        code: "EMAIL_MISMATCH",
        error: "The email in the form must match the account you signed in with (" + String(row.email || "").trim() + ").",
      });
    }
    ordersRepo.saveGuestAddressOnly(guest, respondSaveGuestAddress);
  });
}

app.post("/api/save-guest-address", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);
  handleSaveGuestAddress(req, res);
});

/** @deprecated Same as POST /api/save-guest-address (no longer creates an order). */
app.post("/api/send-vendor-parcel-tag", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);
  handleSaveGuestAddress(req, res);
});

/** Public: whether vendor APIs require a session (no secrets). Helps the browser show the right error. */
app.get("/api/vendor/status", function (_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    vendorAuthRequired: vendorAuth.vendorRequireAuth(),
    databaseConfigured: poolMod.isEnabled(),
    billSecretConfigured: billSecretConfigured(),
  });
});

/** Vendor portal login — Postgres: vendor_users + vendor_sessions; else env nammu/nammu + memory. */
app.post("/api/vendor/login", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  var b = req.body || {};
  var u = String(b.username || "").trim();
  var pw = String(b.password || "").trim();
  vendorAuth.login(u, pw, function (err, token, expiresInMs) {
    if (err) {
      return res.status(401).json({ ok: false, error: err.message || "Invalid username or password" });
    }
    res.json({ ok: true, token: token, expiresInMs: expiresInMs });
  });
});

/** Guest session (stored in Postgres). Optional until checkout wires this in. */
app.post("/api/guest/session", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  guestSessions.issueGuestSession(req.body || {}, function (err, out) {
    if (err) {
      var code = err.message && err.message.indexOf("required") >= 0 ? 400 : 503;
      return res.status(code).json({ ok: false, error: err.message || "Guest session failed" });
    }
    res.json({ ok: true, token: out.token, guestId: out.guestId, expiresInMs: out.expiresInMs });
  });
});

function readGuestBearer(req) {
  var h = String(req.get("Authorization") || "");
  var m = /^Bearer\s+(\S+)/i.exec(h);
  return m ? m[1] : "";
}

/** After paid checkout, mint a guest Bearer so My orders works without a separate OTP step. */
function jsonWithOptionalGuestSession(res, basePayload, guestId) {
  var gid = Number(guestId);
  if (!poolMod.isEnabled() || !Number.isFinite(gid) || gid < 1) {
    res.json(basePayload);
    return;
  }
  guestSessions.issueGuestTokenForGuestId(gid, function (e2, sess) {
    if (e2 || !sess || !sess.token) {
      res.json(basePayload);
      return;
    }
    var out = Object.assign({}, basePayload, {
      token: sess.token,
      expiresInMs: sess.expiresInMs,
      guestId: gid,
    });
    res.json(out);
  });
}

/** Email OTP — send 6-digit code (requires Postgres + prior guest row from checkout). */
app.post("/api/guest/otp/request", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);
  var email = (req.body || {}).email;
  guestOtp.requestGuestEmailOtp(email, createMailTransport(), function (err, out) {
    if (err) {
      var st = err.message && err.message.indexOf("No account") >= 0 ? 404 : err.message && err.message.indexOf("Invalid") >= 0 ? 400 : 503;
      return res.status(st).json({ ok: false, error: err.message || "Could not send code" });
    }
    res.json({ ok: true, devMailSkipped: Boolean(out && out.devMailSkipped) });
  });
});

/** Verify email OTP and return a guest session Bearer token. */
app.post("/api/guest/otp/verify", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);
  var b = req.body || {};
  guestOtp.verifyGuestEmailOtp(b.email, b.code, function (err, v) {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || "Verification failed" });
    }
    guestSessions.issueGuestTokenForGuestId(v.guestId, function (e2, sess) {
      if (e2) {
        return res.status(503).json({ ok: false, error: e2.message || "Could not create session" });
      }
      res.json({
        ok: true,
        token: sess.token,
        guestId: sess.guestId,
        expiresInMs: sess.expiresInMs,
      });
    });
  });
});

/** Public storefront / checkout: sign up with email OTP (rate-limited; no BILL_API_SECRET). */
app.post("/api/guest-auth/signup/request-otp", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  guestOtp.requestSignupGuestEmailOtp(req.body || {}, createMailTransport(), function (err, out) {
    if (err) {
      if (err.code === "USE_LOGIN") {
        return res.status(409).json({ ok: false, code: "USE_LOGIN", error: err.message || "Use Log in." });
      }
      var st = err.message && err.message.indexOf("Invalid") >= 0 ? 400 : 503;
      return res.status(st).json({ ok: false, error: err.message || "Could not send code" });
    }
    res.json({
      ok: true,
      devMailSkipped: Boolean(out && out.devMailSkipped),
      expiresInMs: guestOtp.OTP_EXPIRY_MS,
    });
  });
});

app.post("/api/guest-auth/signup/verify", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  guestOtp.verifySignupGuestEmailOtp(req.body || {}, function (err, v) {
    if (err) {
      if (err.code === "USE_LOGIN") {
        return res.status(409).json({ ok: false, code: "USE_LOGIN", error: err.message || "Use Log in." });
      }
      return res.status(400).json({ ok: false, error: err.message || "Verification failed" });
    }
    guestSessions.issueGuestTokenForGuestId(v.guestId, function (e2, sess) {
      if (e2) {
        return res.status(503).json({ ok: false, error: e2.message || "Could not create session" });
      }
      res.json({
        ok: true,
        token: sess.token,
        guestId: sess.guestId,
        expiresInMs: sess.expiresInMs,
      });
    });
  });
});

/** Public: log in with email OTP (existing guest only). */
app.post("/api/guest-auth/login/request-otp", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  var email = (req.body || {}).email;
  guestOtp.requestGuestEmailOtp(email, createMailTransport(), function (err, out) {
    if (err) {
      var st =
        err.message && err.message.indexOf("No account") >= 0
          ? 404
          : err.message && err.message.indexOf("Invalid") >= 0
            ? 400
            : 503;
      return res.status(st).json({ ok: false, error: err.message || "Could not send code" });
    }
    res.json({
      ok: true,
      devMailSkipped: Boolean(out && out.devMailSkipped),
      expiresInMs: guestOtp.OTP_EXPIRY_MS,
    });
  });
});

app.post("/api/guest-auth/login/verify", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  var b = req.body || {};
  guestOtp.verifyGuestEmailOtp(b.email, b.code, function (err, v) {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || "Verification failed" });
    }
    guestSessions.issueGuestTokenForGuestId(v.guestId, function (e2, sess) {
      if (e2) {
        return res.status(503).json({ ok: false, error: e2.message || "Could not create session" });
      }
      res.json({
        ok: true,
        token: sess.token,
        guestId: sess.guestId,
        expiresInMs: sess.expiresInMs,
      });
    });
  });
});

/** Signed-in guest profile + saved shipping addresses. */
app.get("/api/guest/me", function (req, res) {
  guestSessions.verifyGuestToken(readGuestBearer(req), function (err, row) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!row) {
      return res.status(401).json({ ok: false, error: "Sign in required", code: "NO_SESSION" });
    }
    guestDb.listGuestAddressesByGuestId(row.guestId, function (e2, addresses) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        guestId: row.guestId,
        email: row.email,
        displayName: row.displayName,
        phoneNorm: row.phoneNorm != null ? String(row.phoneNorm) : "",
        addresses: addresses,
      });
    });
  });
});

/** Past orders for the signed-in guest. */
app.get("/api/guest/orders", function (req, res) {
  guestSessions.verifyGuestToken(readGuestBearer(req), function (err, row) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!row) {
      return res.status(401).json({ ok: false, error: "Sign in required", code: "NO_SESSION" });
    }
    ordersRepo.listOrdersByGuestId(row.guestId, function (e2, list) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, orders: list || [] });
    });
  });
});

/** PDF bill for a paid order (guest session only; order must belong to guest). */
app.get("/api/guest/order/:orderId/bill-pdf", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).type("text/plain").send("Too many requests.");
  }
  guestSessions.verifyGuestToken(readGuestBearer(req), function (err, row) {
    if (err) {
      return res.status(500).type("text/plain").send(String(err.message || err));
    }
    if (!row) {
      return res.status(401).type("text/plain").send("Sign in required");
    }
    var oid = Number(req.params.orderId);
    if (!Number.isFinite(oid)) {
      return res.status(400).type("text/plain").send("Invalid order");
    }
    ordersRepo.loadPaidOrderForGuestBill(row.guestId, oid, function (e2, order) {
      if (e2) {
        return res.status(500).type("text/plain").send(String(e2.message || e2));
      }
      if (!order) {
        return res.status(404).type("text/plain").send("Bill not available");
      }
      var rawItems = order.items || [];
      var itemsErr = validateItems(rawItems);
      if (itemsErr) {
        return res.status(400).json({ ok: false, error: itemsErr });
      }
      var items = rawItems.map(sanitizeBillItem);
      withResolvedSkus(items, function (skuErr, itemsWithSku) {
        if (skuErr) {
          return res.status(500).type("text/plain").send(String(skuErr.message || skuErr));
        }
        var totals = computeTotals(itemsWithSku);
        renderOrderBillPdf({
          items: itemsWithSku,
          subtotal: totals.subtotal,
          taxableValue: totals.taxableValue,
          shipping: totals.shipping,
          tax: totals.tax,
          total: totals.total,
        })
          .then(function (buf) {
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", 'attachment; filename="Craftguru-order-' + oid + '-bill.pdf"');
            res.send(buf);
          })
          .catch(function (er) {
            res.status(500).type("text/plain").send(er && er.message ? er.message : "PDF render failed");
          });
      });
    });
  });
});

/** Cancel an unpaid order (guest only, fulfillment must still be "new"). */
app.post("/api/guest/order/cancel", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests." });
  }
  if (!billSecretOk(req)) return rejectBillApiSecret(res);
  guestSessions.verifyGuestToken(readGuestBearer(req), function (err, row) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!row) {
      return res.status(401).json({ ok: false, error: "Sign in required", code: "NO_SESSION" });
    }
    var oid = Number((req.body || {}).orderId);
    ordersRepo.cancelGuestOrder(row.guestId, oid, function (e2, out) {
      if (e2) {
        return res.status(400).json({ ok: false, error: e2.message || "Could not cancel" });
      }
      res.json({ ok: true, orderId: out.orderId, fulfillmentStatus: out.fulfillmentStatus });
    });
  });
});

/** Catalog row counts (vendor auth). */
app.get("/api/vendor/catalog-stats", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    if (!poolMod.isEnabled()) {
      res.setHeader("Cache-Control", "no-store");
      return res.json({ ok: true, database: false, products: 0, categories: 0 });
    }
    var pool = poolMod.getPool();
    Promise.all([
      pool.query("SELECT COUNT(*)::int AS n FROM products"),
      pool.query("SELECT COUNT(*)::int AS n FROM categories"),
    ])
      .then(function (rows) {
        res.setHeader("Cache-Control", "no-store");
        res.json({
          ok: true,
          database: true,
          products: rows[0].rows[0].n,
          categories: rows[1].rows[0].n,
        });
      })
      .catch(function (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
      });
  });
});

/** Today's orders for vendor dashboard (Bearer or x-vendor-token). */
app.get("/api/vendor/orders/today", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    ordersRepo.getOrdersToday(function (e2, list) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        count: list.length,
        orders: list.map(function (o) {
          return {
            orderId: o.orderId,
            tagRef: o.tagRef,
            createdAt: o.createdAt,
            orderType: o.orderType,
            guestName: o.guest && o.guest.name,
            guestPhone: o.guest && o.guest.phone,
            total: o.totals && o.totals.total,
            paymentStatus: o.paymentStatus,
            paymentMethod: o.paymentMethod,
            fulfillmentStatus: o.fulfillmentStatus || "new",
          };
        }),
      });
    });
  });
});

/** Recent orders (vendor token). Query: limit=1–200, default 50. */
app.get("/api/vendor/orders/recent", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var lim = Number(req.query && req.query.limit);
    ordersRepo.getOrdersRecent(lim, function (e2, list) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        count: list.length,
        orders: list.map(function (o) {
          return {
            orderId: o.orderId,
            tagRef: o.tagRef,
            createdAt: o.createdAt,
            orderType: o.orderType,
            guestName: o.guest && o.guest.name,
            guestPhone: o.guest && o.guest.phone,
            total: o.totals && o.totals.total,
            paymentStatus: o.paymentStatus,
            paymentMethod: o.paymentMethod,
            fulfillmentStatus: o.fulfillmentStatus || "new",
          };
        }),
      });
    });
  });
});

/** Dashboard KPIs, sparkline, notifications (vendor token). */
app.get("/api/vendor/dashboard-summary", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    ordersRepo.getVendorDashboardSummary(function (e2, summary) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      vendorExtrasDb.getDashboardExtras(function (e3, extras) {
        if (e3) {
          return res.status(500).json({ ok: false, error: String(e3.message || e3) });
        }
        summary.lowStockCount = extras.lowStockCount || 0;
        summary.returnsByStatus = extras.returnsByStatus || {};
        summary.returnsPending = (extras.returnsByStatus && extras.returnsByStatus.pending) || 0;
        res.setHeader("Cache-Control", "no-store");
        res.json({ ok: true, summary: summary });
      });
    });
  });
});

/** Orders + revenue KPIs, charts (IST), top base categories — vendor token. */
app.get("/api/vendor/analytics/order-insights", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var period = String((req.query && req.query.period) || "monthly").toLowerCase();
    if (period !== "daily" && period !== "weekly" && period !== "monthly") {
      period = "monthly";
    }
    ordersRepo.getVendorOrderInsights(period, function (e2, data) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code = msg.indexOf("not configured") >= 0 ? 503 : 500;
        return res.status(code).json({ ok: false, error: msg });
      }
      vendorExtrasDb.getDashboardExtras(function (e3, extras) {
        if (e3) {
          return res.status(500).json({ ok: false, error: String((e3 && e3.message) || e3) });
        }
        data.lowStockCount = extras.lowStockCount || 0;
        data.returnsPending = (extras.returnsByStatus && extras.returnsByStatus.pending) || 0;
        res.setHeader("Cache-Control", "no-store");
        res.json({ ok: true, insights: data });
      });
    });
  });
});

app.patch("/api/vendor/order/:orderId/fulfillment", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var st = req.body && req.body.fulfillmentStatus;
    ordersRepo.updateOrderFulfillment(req.params.orderId, st, function (e2, out) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code = msg.indexOf("not configured") >= 0 ? 503 : msg.indexOf("not found") >= 0 ? 404 : 400;
        return res.status(code).json({ ok: false, error: msg });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, orderId: out.orderId, fulfillmentStatus: out.fulfillmentStatus });
    });
  });
});

/** Category ids for inventory filters — no vendor login (same ids as storefront data.js). */
app.get("/api/vendor/categories", function (_req, res) {
  function fromDataJs() {
    try {
      var list = catalogFromData.getCategoriesList().map(function (c) {
        if (!c) return c;
        return {
          id: c.id,
          label: c.label,
          folder: c.folder || "",
          subcategories: normalizeCategorySubcategories(c.subcategories),
        };
      });
      list.sort(function (a, b) {
        return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
      });
      return { ok: true, source: "data_js", categories: list };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }
  if (!poolMod.isEnabled()) {
    var fd = fromDataJs();
    if (!fd.ok) return res.status(500).json(fd);
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.json(fd);
  }
  poolMod
    .getPool()
    .query("SELECT id, label, folder, subcategories FROM categories ORDER BY label ASC")
    .then(function (r) {
      var rows = r.rows.map(function (row) {
        return {
          id: row.id,
          label: row.label,
          folder: row.folder || "",
          subcategories: normalizeCategorySubcategories(row.subcategories),
        };
      });
      var merged = mergeCategoriesDbWithCatalog(rows);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        source: rows.length ? "database+merged" : "data_js",
        categories: merged,
      });
    })
    .catch(function (e) {
      var fd3 = fromDataJs();
      if (fd3.ok) {
        res.setHeader("Cache-Control", "public, max-age=60");
        return res.json(fd3);
      }
      res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    });
});

/** DB catalog products under a category (parent → child for studio inventory). */
app.get("/api/vendor/db-products", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var catId = String((req.query && req.query.categoryId) || "").trim().slice(0, 80);
    if (!catId) {
      return res.status(400).json({ ok: false, error: "categoryId query parameter is required" });
    }
    function mapStaticCatalogRows(omap) {
      omap = omap || {};
      return catalogFromData
        .getProductsSummary()
        .filter(function (p) {
          return p.category === catId && (omap[p.id] || {}).listed !== false;
        })
        .map(function (p) {
          return { id: p.id, name: p.name, subcategoryId: p.subcategory || "all", image: p.image || "" };
        });
    }
    if (!poolMod.isEnabled()) {
      return vendorCatalogDb.listOverridesMap(function (eMap, omap) {
        if (eMap) {
          return res.status(500).json({ ok: false, error: String(eMap.message || eMap) });
        }
        try {
          var items0 = mapStaticCatalogRows(omap);
          res.setHeader("Cache-Control", "no-store");
          return res.json({ ok: true, source: "data_js", items: items0 });
        } catch (e) {
          return res.status(500).json({ ok: false, error: String(e.message || e) });
        }
      });
    }
    vendorCatalogDb.listOverridesMap(function (eMap2, omap2) {
      if (eMap2) {
        return res.status(500).json({ ok: false, error: String(eMap2.message || eMap2) });
      }
      omap2 = omap2 || {};
      poolMod
        .getPool()
        .query(
          "SELECT id, name, subcategory_id AS \"subcategoryId\", image_path AS image FROM products WHERE category_id = $1 AND is_active = true ORDER BY name ASC",
          [catId]
        )
        .then(function (r) {
          if (r.rows.length) {
            res.setHeader("Cache-Control", "no-store");
            return res.json({ ok: true, source: "database", items: r.rows });
          }
          try {
            var items2 = mapStaticCatalogRows(omap2);
            res.setHeader("Cache-Control", "no-store");
            res.json({ ok: true, source: "data_js", items: items2 });
          } catch (e2) {
            res.status(500).json({ ok: false, error: String(e2.message || e2) });
          }
        })
        .catch(function (e) {
          res.status(500).json({ ok: false, error: String(e.message || e) });
        });
    });
  });
});

app.get("/api/vendor/inventory", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var invCat = String((req.query && req.query.categoryId) || "").trim().slice(0, 80);
    var invProd = String((req.query && req.query.productId) || "").trim().slice(0, 220);
    var invSku = String((req.query && req.query.sku) || "").trim().slice(0, 120);
    vendorExtrasDb.listInventory({ categoryId: invCat, productId: invProd, sku: invSku }, function (e2, list) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code = msg.indexOf("not configured") >= 0 ? 503 : 500;
        return res.status(code).json({ ok: false, error: msg });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, items: list });
    });
  });
});

app.post("/api/vendor/inventory", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    vendorExtrasDb.createInventory(req.body || {}, function (e2, row) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code = msg.indexOf("not configured") >= 0 ? 503 : msg.indexOf("required") >= 0 ? 400 : 500;
        return res.status(code).json({ ok: false, error: msg });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, item: row });
    });
  });
});

app.patch("/api/vendor/inventory/:id", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    vendorExtrasDb.updateInventory(req.params.id, req.body || {}, function (e2, row) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code = msg.indexOf("not configured") >= 0 ? 503 : msg.indexOf("Not found") >= 0 ? 404 : 400;
        return res.status(code).json({ ok: false, error: msg });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, item: row });
    });
  });
});

app.get("/api/vendor/returns", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    vendorExtrasDb.listReturns(function (e2, list) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code = msg.indexOf("not configured") >= 0 ? 503 : 500;
        return res.status(code).json({ ok: false, error: msg });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, returns: list });
    });
  });
});

app.post("/api/vendor/returns", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    vendorExtrasDb.createReturn(req.body || {}, function (e2, row) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code =
          msg.indexOf("not configured") >= 0 ? 503 : msg.indexOf("not found") >= 0 ? 404 : msg.indexOf("required") >= 0 ? 400 : 500;
        return res.status(code).json({ ok: false, error: msg });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, return: row });
    });
  });
});

app.patch("/api/vendor/returns/:id", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    vendorExtrasDb.updateReturnStatus(req.params.id, req.body || {}, function (e2, row) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code = msg.indexOf("not configured") >= 0 ? 503 : msg.indexOf("Not found") >= 0 ? 404 : 400;
        return res.status(code).json({ ok: false, error: msg });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, return: row });
    });
  });
});

/** Public: merged storefront prices (no auth). Cached briefly at CDN/browser. */
app.get("/api/catalog/price-overrides", function (req, res) {
  vendorCatalogDb.listOverridesMap(function (e, map) {
    if (e) {
      return res.status(500).json({ ok: false, error: String(e.message || e) });
    }
    var out = {};
    Object.keys(map).forEach(function (k) {
      var key = String(k != null ? k : "").trim();
      if (!key) return;
      var x = map[k];
      var o = {};
      if (x.s != null && Number.isFinite(Number(x.s))) o.s = Number(x.s);
      if (x.m != null && Number.isFinite(Number(x.m))) o.m = Number(x.m);
      if (x.l != null && Number.isFinite(Number(x.l))) o.l = Number(x.l);
      if (x.stockS != null && Number.isFinite(Number(x.stockS))) o.stockS = Number(x.stockS);
      if (x.stockM != null && Number.isFinite(Number(x.stockM))) o.stockM = Number(x.stockM);
      if (x.stockL != null && Number.isFinite(Number(x.stockL))) o.stockL = Number(x.stockL);
      o.outOfStock = !!x.outOfStock;
      if (x.listed === false) {
        o.listed = false;
      }
      var hasAny =
        o.s != null ||
        o.m != null ||
        o.l != null ||
        o.stockS != null ||
        o.stockM != null ||
        o.stockL != null ||
        o.outOfStock ||
        o.listed === false;
      if (hasAny) out[key] = o;
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, overrides: out });
  });
});

/** Public: vendor-added catalog rows (not in static data.js). */
app.get("/api/catalog/vendor-products", function (_req, res) {
  vendorProductsDb.listExtraProductsForStorefront(function (e, list) {
    if (e) {
      return res.status(500).json({ ok: false, error: String(e.message || e) });
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, products: list || [] });
  });
});

/** Vendor: create storefront product + save image under media/catalog/{category folder}/ */
app.post(
  "/api/vendor/products",
  productImageUpload.single("image"),
  function (req, res) {
    vendorAuth.tokenValid(req, function (err, ok) {
      if (err) {
        return res.status(500).json({ ok: false, error: String(err.message || err) });
      }
      if (!ok) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      var b = req.body || {};
      function firstField(v) {
        if (v == null) return null;
        return Array.isArray(v) ? v[0] : v;
      }
      vendorProductsDb.createVendorProduct(
        {
          name: firstField(b.name),
          categoryId: firstField(b.categoryId),
          priceS: firstField(b.priceS),
          priceM: firstField(b.priceM),
          priceL: firstField(b.priceL),
          sizeLabelS: firstField(b.sizeLabelS),
          sizeLabelM: firstField(b.sizeLabelM),
          sizeLabelL: firstField(b.sizeLabelL),
          imageBuffer: req.file && req.file.buffer,
          mime: req.file && req.file.mimetype,
        },
        function (e2, row) {
          if (e2) {
            var msg = String((e2 && e2.message) || e2);
            var code = msg.indexOf("required") >= 0 || msg.indexOf("Unknown") >= 0 ? 400 : 500;
            return res.status(code).json({ ok: false, error: msg });
          }
          res.setHeader("Cache-Control", "no-store");
          res.json({ ok: true, product: row });
        }
      );
    });
  }
);

/** Vendor: full storefront catalog for Products admin (data.js + vendor rows, prices/OOS merged; optional q = name, id, SKU). */
app.get("/api/vendor/products/manage", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var q = String((req.query && req.query.q) || "").trim();
    vendorProductsDb.listAllProductsForManage({ q: q }, function (e2, list) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, products: list || [] });
    });
  });
});

app.put(
  "/api/vendor/products/:productId",
  productImageUpload.single("image"),
  function (req, res) {
    vendorAuth.tokenValid(req, function (err, ok) {
      if (err) {
        return res.status(500).json({ ok: false, error: String(err.message || err) });
      }
      if (!ok) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      var productId = decodeURIComponent(String(req.params.productId || "").trim());
      var b = req.body || {};
      function firstField(v) {
        if (v == null) return null;
        return Array.isArray(v) ? v[0] : v;
      }
      vendorProductsDb.updateVendorProductById(
        productId,
        {
          name: firstField(b.name),
          priceS: firstField(b.priceS),
          priceM: firstField(b.priceM),
          priceL: firstField(b.priceL),
          sizeLabelS: firstField(b.sizeLabelS),
          sizeLabelM: firstField(b.sizeLabelM),
          sizeLabelL: firstField(b.sizeLabelL),
          imageBuffer: req.file && req.file.buffer,
          mime: req.file && req.file.mimetype,
        },
        function (e2, row) {
          if (e2) {
            var msg = String((e2 && e2.message) || e2);
            var code =
              msg.indexOf("required") >= 0 || msg.indexOf("Unknown") >= 0 || msg.indexOf("Built-in") >= 0 ? 400 : 500;
            return res.status(code).json({ ok: false, error: msg });
          }
          res.setHeader("Cache-Control", "no-store");
          res.json({ ok: true, product: row });
        }
      );
    });
  }
);

app.post("/api/vendor/products/:productId/active", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var productId = decodeURIComponent(String(req.params.productId || "").trim());
    var active = req.body && req.body.active;
    if (typeof active !== "boolean") {
      return res.status(400).json({ ok: false, error: "Body must include active: true or false" });
    }
    vendorProductsDb.setVendorProductActive(productId, active, function (e2) {
      if (e2) {
        var msg = String((e2 && e2.message) || e2);
        var code = msg.indexOf("Built-in") >= 0 || msg.indexOf("not found") >= 0 ? 400 : 500;
        return res.status(code).json({ ok: false, error: msg });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true });
    });
  });
});

/** Vendor: searchable catalog + effective prices (data.js + DB overrides). */
app.get("/api/vendor/catalog-products", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var q = String((req.query && req.query.q) || "")
      .toLowerCase()
      .trim();
    var catId = String((req.query && req.query.categoryId) || "").trim();
    var lim = Math.min(200, Math.max(1, parseInt(String((req.query && req.query.limit) || "80"), 10) || 80));
    var off = Math.max(0, parseInt(String((req.query && req.query.offset) || "0"), 10) || 0);
    vendorCatalogDb.listOverridesMap(function (e2, omap) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      vendorProductsDb.listExtraProductsForStorefront(function (eV, extras) {
        if (eV) {
          return res.status(500).json({ ok: false, error: String(eV.message || eV) });
        }
        var list;
        try {
          list = catalogFromData.getProductsSummary();
        } catch (e3) {
          return res.status(500).json({ ok: false, error: String(e3.message || e3) });
        }
        if (extras && extras.length) {
          extras.forEach(function (p) {
            list.push({
              id: p.id,
              name: p.name,
              category: p.category,
              subcategory: p.subcategory,
              image: p.image,
              prices: p.prices,
            });
          });
        }
        if (catId) {
          list = list.filter(function (p) {
            return p.category === catId;
          });
        }
        list = list.filter(function (p) {
          var ov = omap[p.id] || {};
          return ov.listed !== false;
        });
        vendorExtrasDb.getSkuMapForProductIds(
          list.map(function (p) {
            return p.id;
          }),
          function (eSku, skuMap) {
            if (eSku) {
              return res.status(500).json({ ok: false, error: String(eSku.message || eSku) });
            }
            skuMap = skuMap || {};
            var filtered = !q
              ? list
              : list.filter(function (p) {
                  var sku = skuMap[p.id] || "";
                  var hay = (p.id + " " + p.name + " " + p.category + " " + p.subcategory + " " + sku).toLowerCase();
                  return hay.indexOf(q) !== -1;
                });
            var total = filtered.length;
            var slice = filtered.slice(off, off + lim);
            vendorExtrasDb.countInventoryRows(function (eMat, matCount) {
              if (eMat) {
                return res.status(500).json({ ok: false, error: String(eMat.message || eMat) });
              }
              var overrideCount = Object.keys(omap).length;
              var sliceIds = slice.map(function (p) {
                return p.id;
              });
              vendorExtrasDb.aggregateSellableStockByProductIds(sliceIds, function (eAgg, aggMap) {
                if (eAgg) {
                  return res.status(500).json({ ok: false, error: String(eAgg.message || eAgg) });
                }
                aggMap = aggMap || {};
                res.setHeader("Cache-Control", "no-store");
                res.json({
                  ok: true,
                  productCount: list.length,
                  overrideCount: overrideCount,
                  materialSkuCount: matCount,
                  total: total,
                  offset: off,
                  limit: lim,
                  items: slice.map(function (p) {
                var ov = omap[p.id] || {};
                var eff = {
                  s: ov.s != null ? Number(ov.s) : p.prices.s,
                  m: ov.m != null ? Number(ov.m) : p.prices.m,
                  l: ov.l != null ? Number(ov.l) : p.prices.l,
                };
                var ovHasStock = ov.stockS != null || ov.stockM != null || ov.stockL != null;
                var agg = aggMap[p.id];
                var st = ovHasStock
                  ? {
                      s: ov.stockS != null ? Number(ov.stockS) : null,
                      m: ov.stockM != null ? Number(ov.stockM) : null,
                      l: ov.stockL != null ? Number(ov.stockL) : null,
                    }
                  : agg
                    ? { s: agg.s, m: agg.m, l: agg.l }
                    : { s: null, m: null, l: null };
                var hasAggStock = !!(agg && (agg.s != null || agg.m != null || agg.l != null));
                return {
                  id: p.id,
                  name: p.name,
                  category: p.category,
                  subcategory: p.subcategory,
                  image: p.image,
                  basePrices: p.prices,
                  effectivePrices: eff,
                  effectiveStock: st,
                  listingOutOfStock: !!(ov && ov.outOfStock),
                  hasOverride: !!(
                    ov &&
                    (ov.s != null ||
                      ov.m != null ||
                      ov.l != null ||
                      ov.outOfStock === true ||
                      ov.listed === false)
                  ),
                  hasStockOverride: !!(ovHasStock || hasAggStock),
                };
              }),
            });
          });
        });
      });
    });
  });
  });
});

app.put("/api/vendor/catalog-products/:productId/prices", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    var pid = String((req.params && req.params.productId) || "").trim();
    var b = req.body || {};
    vendorCatalogDb.upsertOverride(
      pid,
      {
        s: b.priceS != null ? Number(b.priceS) : b.s != null ? Number(b.s) : undefined,
        m: b.priceM != null ? Number(b.priceM) : b.m != null ? Number(b.m) : undefined,
        l: b.priceL != null ? Number(b.priceL) : b.l != null ? Number(b.l) : undefined,
        stockS: b.stockS !== undefined ? b.stockS : b.stock_s !== undefined ? b.stock_s : undefined,
        stockM: b.stockM !== undefined ? b.stockM : b.stock_m !== undefined ? b.stock_m : undefined,
        stockL: b.stockL !== undefined ? b.stockL : b.stock_l !== undefined ? b.stock_l : undefined,
        outOfStock: b.outOfStock !== undefined ? !!b.outOfStock : b.out_of_stock !== undefined ? !!b.out_of_stock : undefined,
        listed: b.listed !== undefined ? !!b.listed : undefined,
      },
      function (e2, row) {
        if (e2) {
          var msg = String((e2 && e2.message) || e2);
          var code = msg.indexOf("not configured") >= 0 ? 503 : msg.indexOf("required") >= 0 ? 400 : 500;
          return res.status(code).json({ ok: false, error: msg });
        }
        res.setHeader("Cache-Control", "no-store");
        res.json({ ok: true, row: row });
      }
    );
  });
});

/** Paid totals by month (IST) + all-order counts — vendor token. */
app.get("/api/vendor/analytics/monthly", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    ordersRepo.getVendorMonthlySummary(function (e2, summary) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, months: summary.months });
    });
  });
});

/** Full order JSON for print sheet (vendor token required). */
app.get("/api/vendor/order/:orderId", function (req, res) {
  vendorAuth.tokenValid(req, function (err, ok) {
    if (err) {
      return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    ordersRepo.getOrderById(req.params.orderId, function (e2, o) {
      if (e2) {
        return res.status(500).json({ ok: false, error: String(e2.message || e2) });
      }
      if (!o) {
        return res.status(404).json({ ok: false, error: "Order not found" });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, order: o });
    });
  });
});

app.post("/api/whatsapp-bill", function (req, res) {
  var ip = req.ip || req.connection.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests. Try again later." });
  }

  if (!billSecretOk(req)) return rejectBillApiSecret(res);

  if (!TOKEN || !PHONE_NUMBER_ID) {
    return res.status(503).json({
      ok: false,
      error: "Server missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID in .env",
    });
  }

  var body = req.body || {};
  var ten = normalizeIndia10(body.phone);
  if (!ten) {
    return res.status(400).json({ ok: false, error: "Provide a valid 10-digit Indian mobile (WhatsApp)." });
  }

  var itemsErr = validateItems(body.items);
  if (itemsErr) {
    return res.status(400).json({ ok: false, error: itemsErr });
  }

  var items = body.items.map(sanitizeBillItem);

  var totals = computeTotals(items);
  var format = String(body.format || "jpeg").toLowerCase();
  if (format !== "jpeg" && format !== "jpg" && format !== "pdf" && format !== "both") {
    format = "jpeg";
  }

  var toDigits = "91" + ten;
  var generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
  var customerPhone = "+91" + ten;
  var caption = "Craftguru — your order bill (totals match checkout). Help: +91-8824350056";

  var qrDataUri = readQrDataUri();
  var renderOpts = {
    items: items,
    subtotal: totals.subtotal,
    taxableValue: totals.taxableValue,
    shipping: totals.shipping,
    tax: totals.tax,
    total: totals.total,
    customerPhone: customerPhone,
    generatedAt: generatedAt,
    qrDataUri: qrDataUri,
  };

  var sentParts = [];

  function sendJpeg() {
    return renderOrderBillJpeg(renderOpts).then(function (jpegBuf) {
      return wa
        .uploadMedia({
          token: TOKEN,
          phoneNumberId: PHONE_NUMBER_ID,
          graphVersion: GRAPH_VERSION,
          buffer: jpegBuf,
          mime: "image/jpeg",
          filename: "Craftguru-order-bill.jpg",
        })
        .then(function (mediaId) {
          return wa.sendImageMessage({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,
            graphVersion: GRAPH_VERSION,
            toDigits: toDigits,
            mediaId: mediaId,
            caption: format === "both" ? caption + " (summary image)" : caption,
          });
        })
        .then(function () {
          sentParts.push("jpeg");
        });
    });
  }

  function sendPdf() {
    return renderOrderBillPdf({
      items: items,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      tax: totals.tax,
      total: totals.total,
    }).then(function (pdfBuf) {
      return wa
        .uploadMedia({
          token: TOKEN,
          phoneNumberId: PHONE_NUMBER_ID,
          graphVersion: GRAPH_VERSION,
          buffer: pdfBuf,
          mime: "application/pdf",
          filename: "Craftguru-order-bill.pdf",
        })
        .then(function (mediaId) {
          return wa.sendDocumentMessage({
            token: TOKEN,
            phoneNumberId: PHONE_NUMBER_ID,
            graphVersion: GRAPH_VERSION,
            toDigits: toDigits,
            mediaId: mediaId,
            filename: "Craftguru-order-bill.pdf",
            caption: format === "both" ? caption + " (PDF)" : caption,
          });
        })
        .then(function () {
          sentParts.push("pdf");
        });
    });
  }

  var flow = Promise.resolve();
  if (format === "jpeg" || format === "jpg") {
    flow = flow.then(sendJpeg);
  } else if (format === "pdf") {
    flow = flow.then(sendPdf);
  } else if (format === "both") {
    flow = flow.then(sendJpeg).then(sendPdf);
  }

  flow
    .then(function () {
      res.json({ ok: true, sent: sentParts, to: toDigits });
    })
    .catch(function (err) {
      var detail = err && err.detail ? err.detail : { message: err && err.message };
      var inner = detail && detail.error;
      var msg =
        (inner && inner.message) ||
        (inner && inner.error_user_msg) ||
        (typeof detail === "string" ? detail : null) ||
        err.message ||
        "WhatsApp send failed";
      res.status(502).json({ ok: false, error: String(msg), meta: detail });
    });
});

var siteRoot = path.join(__dirname, "..");
app.get("/vendor", function (_req, res) {
  res.redirect(302, "/vendor-dashboard.html");
});
app.get("/vendor/dashboard", function (_req, res) {
  res.redirect(302, "/vendor-dashboard.html");
});
app.get("/vendor/tags", function (_req, res) {
  res.redirect(302, "/vendor-tags.html");
});
app.get("/vendor/inventory", function (_req, res) {
  res.redirect(302, "/vendor-inventory.html");
});
app.get("/vendor/returns", function (_req, res) {
  res.redirect(302, "/vendor-returns.html");
});
app.get("/vendororder", function (_req, res) {
  res.redirect(302, "/vendor-tags.html");
});
app.use(express.static(siteRoot));

function onServerListen() {
  console.log("Craftguru server on http://127.0.0.1:" + PORT);
  console.log("Storefront + API: open http://127.0.0.1:" + PORT + "/checkout.html (same origin fixes PDF POST).");
  console.log("API: GET /api/health  ·  POST /api/save-guest-address  ·  POST /api/razorpay-order  ·  POST /api/razorpay-verify  ·  vendor/*");
  if (poolMod.isEnabled()) {
    console.log("Postgres: DATABASE_URL set — run npm run db:migrate && npm run db:seed (from server/) once.");
  } else {
    console.log("Postgres: not configured — orders use server/data/orders.json (file mode).");
  }
}

function startHttpServer() {
  app.listen(PORT, onServerListen);
}

if (poolMod.isEnabled()) {
  schemaHotfix.ensureVendorInventoryColumns().then(startHttpServer).catch(function (err) {
    console.warn("[db] vendor_inventory_items hotfix before listen:", err && err.message ? err.message : err);
    startHttpServer();
  });
} else {
  startHttpServer();
}

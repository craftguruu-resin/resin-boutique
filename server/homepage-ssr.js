"use strict";

var fs = require("fs");
var path = require("path");
var storefrontBootstrap = require("./storefront-bootstrap.js");
var cloudinaryDelivery = require("./cloudinary-delivery.js");
var storefrontHeroDb = require("./storefront-hero-db.js");

var FEATURED_SKIP = { "craftguru-details": true };
var INDEX_PATH = path.join(__dirname, "..", "index.html");
var indexTemplate = null;
var indexTemplateMtime = 0;

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return escHtml(s);
}

function publicOrigin(req) {
  try {
    var proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
    var host = String(req.headers["x-forwarded-host"] || req.get("host") || "").split(",")[0].trim();
    if (host) return proto + "://" + host;
  } catch (_) {}
  return "";
}

function deliveryOpts(req) {
  return {
    apiBase: publicOrigin(req),
    cloudName: String(process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
  };
}

function imgUrl(req, rel, width) {
  return cloudinaryDelivery.deliveryUrl(rel, width, deliveryOpts(req));
}

function imgSrcSet(req, rel, widths) {
  return cloudinaryDelivery.srcSet(rel, widths, deliveryOpts(req));
}

function minPrice(product) {
  var p = product && product.prices;
  if (!p) return null;
  var vals = [Number(p.s), Number(p.m), Number(p.l)].filter(function (n) {
    return Number.isFinite(n) && n > 0;
  });
  if (!vals.length) return null;
  return Math.min.apply(null, vals);
}

function buildProductIndex(staticData, bootstrap) {
  var byId = Object.create(null);
  var byCat = Object.create(null);
  var suppressed = Object.create(null);
  (bootstrap.suppressedProductIds || []).forEach(function (id) {
    suppressed[String(id)] = 1;
  });

  function addProduct(p) {
    if (!p || !p.id) return;
    if (suppressed[p.id]) return;
    var ov = bootstrap.overrides && bootstrap.overrides[p.id];
    if (ov && ov.delisted) return;
    byId[p.id] = p;
    var cat = String(p.category || "");
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(p);
  }

  (staticData.allProducts || []).forEach(addProduct);
  (bootstrap.products || []).forEach(addProduct);
  return { byId: byId, byCat: byCat };
}

function categoryPreviewImage(cat, index) {
  var list = index.byCat[cat.id] || [];
  for (var i = 0; i < list.length; i++) {
    var img = String(list[i].image || "").trim();
    if (img && img.indexOf("placeholder-product") < 0) return img;
  }
  if (cat.nav_image) return String(cat.nav_image).trim();
  return "";
}

function renderCategoryRail(categories) {
  var parts = [];
  categories.forEach(function (cat) {
    var id = String(cat.id || "");
    if (!id) return;
    parts.push(
      '<a class="category-pill category-pill--rail" href="category.html?cat=' +
        escAttr(encodeURIComponent(id)) +
        '" data-cat-id="' +
        escAttr(id) +
        '" data-search-text="' +
        escAttr((cat.label + " " + id).toLowerCase()) +
        '"><span class="category-pill__icon" aria-hidden="true"></span><span class="category-pill__label">' +
        escHtml(cat.label || id) +
        "</span></a>"
    );
  });
  return parts.join("");
}

function renderFeaturedCard(req, cat, index, stagger) {
  var imgRel = categoryPreviewImage(cat, index);
  var count = (index.byCat[cat.id] || []).length;
  if (!count) return "";
  var minFrom = null;
  (index.byCat[cat.id] || []).forEach(function (p) {
    var m = minPrice(p);
    if (m != null && (minFrom === null || m < minFrom)) minFrom = m;
  });
  var catHref = "category.html?cat=" + encodeURIComponent(cat.id);
  var countLabel = String(count) + (count === 1 ? " product" : " products");
  var bits = [(cat.label || "").toLowerCase(), (cat.id || "").toLowerCase(), String(count), "products", "category"];
  if (minFrom != null) bits.push(String(minFrom));

  var mediaInner;
  if (imgRel) {
    var src = imgUrl(req, imgRel, 640);
    var srcset = imgSrcSet(req, imgRel, [320, 480, 640, 960]);
    mediaInner =
      '<img src="' +
      escAttr(src) +
      '" srcset="' +
      escAttr(srcset) +
      '" sizes="' +
      escAttr(cloudinaryDelivery.sizesAttr("card")) +
      '" alt="" width="640" height="457" loading="lazy" decoding="async" data-image-fit="contain" />';
  } else {
    mediaInner = '<div class="craft-cat-card__media-empty" aria-hidden="true"></div>';
  }

  return (
    '<article class="craft-cat-card is-inview" style="--stagger:' +
    stagger +
    '" data-min-price="' +
    escAttr(minFrom != null ? String(minFrom) : "") +
    '" data-search-text="' +
    escAttr(bits.join(" ")) +
    '" data-has-preview="' +
    (imgRel ? "1" : "0") +
    '"><a class="craft-cat-card__hit" href="' +
    escAttr(catHref) +
    '" aria-label="Explore ' +
    escAttr(cat.label) +
    ' collection"><div class="craft-cat-card__shell"><div class="craft-cat-card__media">' +
    mediaInner +
    "</div><div class=\"craft-cat-card__body\"><h3 class=\"craft-cat-card__name\">" +
    escHtml(cat.label) +
    "</h3><p class=\"craft-cat-card__count\">" +
    escHtml(countLabel) +
    "</p><span class=\"craft-cat-card__cta\">Explore collection →</span></div></div></a></article>"
  );
}

function renderFeaturedGrid(req, categories, index) {
  var cats = categories.filter(function (c) {
    if (FEATURED_SKIP[c.id]) return false;
    return (index.byCat[c.id] || []).length > 0;
  });
  cats.sort(function (a, b) {
    return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
  });
  var parts = [];
  cats.forEach(function (cat, i) {
    var card = renderFeaturedCard(req, cat, index, i);
    if (card) parts.push(card);
  });
  return parts.join("");
}

function renderHeroPromo(req, pack) {
  if (!pack || !pack.slides || !pack.slides.length) return { html: "", showPromo: false };
  var settings = pack.heroSettings || {};
  if (!settings.customHeroEnabled) return { html: "", showPromo: false };
  var slide = pack.slides[0];
  var src = imgUrl(req, slide.image, 1280);
  var srcset = imgSrcSet(req, slide.image, [640, 960, 1280]);
  var html =
    '<div class="hero-promo-carousel" id="heroPromoCarousel" data-cg-ssr-hero="1" aria-roledescription="carousel" aria-label="Featured offers and announcements">' +
    '<div class="hero-promo-carousel__frame">' +
    '<img class="hero-promo-carousel__img" id="heroPromoImg" src="' +
    escAttr(src) +
    '" srcset="' +
    escAttr(srcset) +
    '" sizes="' +
    escAttr(cloudinaryDelivery.sizesAttr("hero")) +
    '" alt="Homepage promotion" width="1200" height="640" loading="eager" decoding="async" fetchpriority="high" />' +
    "</div></div>";
  return { html: html, showPromo: true };
}

function readIndexTemplate() {
  try {
    var stat = fs.statSync(INDEX_PATH);
    if (!indexTemplate || stat.mtimeMs !== indexTemplateMtime) {
      indexTemplate = fs.readFileSync(INDEX_PATH, "utf8");
      indexTemplateMtime = stat.mtimeMs;
    }
    return indexTemplate;
  } catch (e) {
    return null;
  }
}

function injectHomepage(html, injections) {
  var out = html;
  if (injections.categoryRail) {
    out = out.replace(
      /(<nav class="category-grid category-grid--rail" id="categoryGrid")([^>]*>)([\s\S]*?)(<\/nav>)/,
      "$1 data-cg-ssr=\"1\"$2" + injections.categoryRail + "$4"
    );
  }
  if (injections.featuredGrid) {
    out = out.replace(
      /(<div class="featured-collections-grid" id="productGrid")([^>]*>)([\s\S]*?)(<\/div>)/,
      "$1 data-cg-ssr=\"1\"$2" + injections.featuredGrid + "$4"
    );
  }
  if (injections.showPromoHero && injections.heroPromo) {
    out = out.replace(
      /class="hero-atelier" id="heroStage"/,
      "class=\"hero-atelier hero-atelier--promo\" id=\"heroStage\""
    );
    out = out.replace(
      /<div class="hero-atelier__builtin-wrap" id="heroAtelierBuiltin">/,
      '<div class="hero-atelier__builtin-wrap" id="heroAtelierBuiltin" hidden>'
    );
    out = out.replace(
      /<div\s+class="hero-promo-carousel"[\s\S]*?<\/div>\s*(?=<\/div>\s*<div class="hero-spotlight")/,
      injections.heroPromo
    );
  }
  return out;
}

function serveHomepage(req, res, next) {
  var p = String(req.path || "");
  if (p !== "/" && p !== "/index.html") return next();

  var template = readIndexTemplate();
  if (!template) return next();

  storefrontBootstrap.loadStorefrontBootstrap(function (bootErr, bootstrap) {
    if (bootErr) {
      console.error("[homepage-ssr] bootstrap failed:", bootErr.message || bootErr);
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      return res.type("html").send(template);
    }

    storefrontHeroDb.listSlidesWithSettings(function (heroErr, heroPack) {
      if (heroErr) heroPack = { slides: [], heroSettings: { customHeroEnabled: false } };

      var staticData = storefrontBootstrap.getStaticCatalog();
      var index = buildProductIndex(staticData, bootstrap);
      var categoryRail = renderCategoryRail(bootstrap.categories || []);
      var featuredGrid = renderFeaturedGrid(req, bootstrap.categories || [], index);
      var hero = renderHeroPromo(req, heroPack);

      var html = injectHomepage(template, {
        categoryRail: categoryRail,
        featuredGrid: featuredGrid,
        heroPromo: hero.html,
        showPromoHero: hero.showPromo,
      });

      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.setHeader("Vary", "Accept-Encoding");
      res.type("html").send(html);
    });
  });
}

module.exports = {
  serveHomepage: serveHomepage,
};

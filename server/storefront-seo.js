"use strict";
const fs = require("fs");
const path = require("path");
const routes = require("../seo-routes.js");
const content = require("./seo-content.js");
const delivery = require("./cloudinary-delivery.js");
const root = path.join(__dirname, "..");
const ORIGIN = "https://www.craftguruindia.com";
const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const json = value => JSON.stringify(value).replace(/</g, "\\u003c");
const absoluteImage = value => { try { const u = new URL(value, ORIGIN + "/"); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch (_) { return ""; } };
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const pageFiles = Object.keys(routes.pages);
const organization = { "@type": "Organization", "@id": ORIGIN + "/#organization", name: "Craftguru India", url: ORIGIN + "/", logo: ORIGIN + "/media/brand-craftguru.png", telephone: "+918824350056", email: "craftguruu@gmail.com", sameAs: ["https://www.instagram.com/craftguruindia/", "https://www.youtube.com/@Craftguru_india"] };
function metadata(html, info) {
  const canonical = ORIGIN + info.url;
  const image = absoluteImage(info.image || "/media/brand-craftguru.png");
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  html = html.replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, "");
  html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  html = html.replace(/<script\b[^>]*id="cgStructuredData"[^>]*>[\s\S]*?<\/script>/gi, "");
  const graph = [organization, { "@type": "WebSite", "@id": ORIGIN + "/#website", url: ORIGIN + "/", name: "Craftguru India", publisher: { "@id": organization["@id"] } }];
  if (info.breadcrumbs) graph.push({ "@type": "BreadcrumbList", itemListElement: info.breadcrumbs.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item[0], item: ORIGIN + item[1] })) });
  if (info.schema) graph.push(info.schema);
  const head = `<title>${esc(info.title)}</title>
  <meta name="description" content="${esc(info.description)}" />
  <meta name="robots" content="${info.noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:site_name" content="Craftguru India" />
  <meta property="og:locale" content="en_IN" />
  <meta property="og:type" content="${info.article ? "article" : "website"}" />
  <meta property="og:title" content="${esc(info.title)}" />
  <meta property="og:description" content="${esc(info.description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:image:alt" content="${esc(info.imageAlt || info.title)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(info.title)}" />
  <meta name="twitter:description" content="${esc(info.description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <script id="cgStructuredData" type="application/ld+json">${json({ "@context": "https://schema.org", "@graph": graph })}</script>`;
  const assets = ["app", "catalog-experience", "catalog-merge", "category", "craftguru-share", "craftguru-whatsapp", "global-find", "guest-layout", "header", "photo-frame-nav", "photo-frame-product", "photo-frame-shop", "photo-frame-shop-nav", "photo-frames-browse", "product", "raw-material-product", "raw-material-shop-nav", "raw-material", "resin-product-pdp", "return-gifts", "shell", "checkout", "premium-product-listing"];
  if (info.versionAssets) html = html.replace(new RegExp('(src="/?(?:' + assets.join("|") + ')\\.js)(?:\\?[^"<>]*)?"', "g"), '$1?v=20261015seo1"');
  html = html.replace(/<\/head>/i, head + "\n</head>");
  return html.replace(/<head>[\s\S]*?<\/head>/i, block => block.replace(/[ \t]+$/gm, "").replace(/\n(?:[ \t]*\n){2,}/g, "\n\n"));
}
function mergeProducts(bootstrap, staticData) {
  const hidden = new Set(bootstrap.suppressedProductIds || []);
  const byId = new Map();
  [...(staticData.allProducts || []), ...(bootstrap.products || [])].forEach(product => {
    const o = (bootstrap.overrides || {})[product.id] || {};
    if (hidden.has(product.id) || o.delisted || o.listed === false || product.listed === false || product.isActive === false) { byId.delete(product.id); return; }
    const p = { ...product, prices: { ...product.prices }, options: o.options || product.options, outOfStock: o.outOfStock === true || product.outOfStock === true };
    for (const k of ["s", "m", "l"]) if (o[k] != null) p.prices[k] = Number(o[k]);
    if (o.name) p.name = o.name;
    if (p.options && p.options.heroImage) p.image = p.options.heroImage;
    if (p.options && p.options.detailBody) p.description = p.options.detailBody;
    byId.set(p.id, p);
  });
  return Array.from(byId.values());
}
function publicBootstrap(boot, products) {
  const active = new Set(products.map(p => p.id));
  return { ...boot, products: (boot.products || []).filter(p => active.has(p.id)), overrides: Object.fromEntries(Object.entries(boot.overrides || {}).filter(([id]) => active.has(id))) };
}
function prices(p) {
  // Match the visible base/from price. Variant-dependent prices are confirmed on the PDP.
  const values = p.priceInr != null ? [Number(p.priceInr)] : Object.values(p.prices || {}).map(Number);
  if (p.options && p.options.useSize && Array.isArray(p.options.sizes)) p.options.sizes.forEach(size => values.push(Number(size.priceInr)));
  return values.filter(n => Number.isFinite(n) && n > 0);
}
function productUrl(p, kind) { return routes.product(p.id, kind); }
function cards(products, kind) {
  return '<div class="seo-product-grid">' + products.map(p => {
    const values = prices(p);
    const image = p.image ? absoluteImage(delivery.deliveryUrl(p.image, 480, { apiBase: ORIGIN })) : "";
    const srcset = p.image ? delivery.srcSet(p.image, [240, 480, 720], { apiBase: ORIGIN }) : "";
    return `<article class="seo-product-card"><a href="${esc(productUrl(p, kind))}">${image ? `<img src="${esc(image)}" srcset="${esc(srcset)}" sizes="(max-width: 700px) 45vw, 320px" alt="${esc(p.name)}" width="480" height="480" loading="lazy" decoding="async" />` : ""}<h3>${esc(p.name)}</h3></a>${values.length ? `<p>From ₹${esc(Math.min(...values).toLocaleString("en-IN"))}</p>` : "<p>Contact us for pricing</p>"}<a class="seo-text-link" href="${esc(productUrl(p, kind))}">View product</a></article>`;
  }).join("") + "</div>";
}
function categorySection(id, label, products) {
  const copy = content.categoryCopy(id, label);
  const related = Object.keys(content.categoryDetails).filter(key => key !== id).slice(0, 4);
  return `<section class="seo-section" aria-labelledby="collectionGuide"><h2 id="collectionGuide">Choosing ${esc(label.toLowerCase())}</h2>${copy.paragraphs.map(p => `<p>${esc(p)}</p>`).join("")}<h2>Questions before you order</h2>${copy.faq.map(pair => `<details><summary>${esc(pair[0])}</summary><p>${esc(pair[1])}</p></details>`).join("")}<p><a href="/wholesale/">Wholesale and custom enquiries</a> · <a href="/contact/">Contact our Jaipur team</a> · <a href="/blog/">Buying and care guides</a></p><h2>Related collections</h2><ul>${related.map(key => `<li><a href="${routes.category(key)}">${esc(content.categoryDetails[key][0])}</a></li>`).join("")}</ul></section>`;
}
function productSchema(p, kind) {
  const values = prices(p), image = absoluteImage(p.image);
  const result = { "@type": "Product", "@id": ORIGIN + productUrl(p, kind) + "#product", name: p.name, sku: p.sku || p.id, url: ORIGIN + productUrl(p, kind), brand: { "@type": "Brand", name: "Craftguru India" } };
  if (p.description) result.description = p.description;
  if (image) result.image = [image];
  // Never infer stock or reviews from a missing value. Variant availability remains on the PDP.
  if (values.length) result.offers = { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: Math.min(...values), highPrice: Math.max(...values), url: result.url, seller: { "@id": organization["@id"] } };
  if (result.offers && p.outOfStock === true) result.offers.availability = "https://schema.org/OutOfStock";
  return result;
}
function injectBeforeMainEnd(html, markup) { return html.replace(/<\/main>/i, markup + "\n</main>"); }
function createMiddleware(deps = {}) {
  const bootstrap = deps.bootstrap || require("./storefront-bootstrap.js");
  const raw = deps.raw || require("./raw-materials-db.js");
  const photo = deps.photo || require("./photo-frames-db.js");
  const homepage = deps.homepage || require("./homepage-ssr.js");
  function load(fn) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Catalog timeout")), 5000);
      try { fn((err, data) => { clearTimeout(timer); err ? reject(err) : resolve(data); }); } catch (err) { clearTimeout(timer); reject(err); }
    });
  }
  async function resin() {
    const boot = await load(cb => bootstrap.loadStorefrontBootstrap(cb));
    return { boot, products: mergeProducts(boot, bootstrap.getStaticCatalog()) };
  }
  function send(res, html, status = 200) { return res.status(status).set("Cache-Control", "no-store").type("html").send(html); }
  function notFound(res) { return send(res, read("404.html"), 404); }
  const middleware = async function (req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const pathname = req.path;
    if (/^\/(api|health|media)(\/|$)/.test(pathname) || /^\/vendor(?:order)?(?:\/|$)/.test(pathname)) return next();
    // Only the owned public hosts are normalised. Preview/local/API hosts remain usable.
    const host = String(req.get("host") || "").split(":")[0].toLowerCase();
    const knownHost = host === "craftguruindia.com" || host === "www.craftguruindia.com";
    const legacy = routes.clean(req.originalUrl, ORIGIN);
    if (knownHost && (host !== "www.craftguruindia.com" || req.protocol !== "https")) return res.redirect(301, ORIGIN + (legacy !== req.originalUrl ? legacy : req.originalUrl));
    if (legacy !== req.originalUrl) return res.redirect(301, legacy);
    if (pathname === "/mini-resin-deshboard/" || pathname === "/mini-resin-deshboard") return res.redirect(301, routes.category("mini-resin-deshboard") + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
    if (/^\/(?:account|checkout|wishlist|vendor[^/]*)\.html$/.test(pathname)) res.set("X-Robots-Tag", "noindex, follow");
    if (pathname === "/photo-frame-shop") return res.redirect(301, "/photo-frames.html" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
    if (pathname === "/robots.txt") return res.type("text").send(read("robots.txt"));
    try {
      if (pathname === "/sitemap.xml") {
        const [catalog, materials, frames] = await Promise.all([resin(), load(cb => raw.listActive({}, cb)), load(cb => photo.listActive({}, cb))]);
        const urls = ["/", ...pageFiles.filter(f => f !== "index.html").map(f => routes.pages[f]), "/photo-frames.html", "/raw-material-shop.html", "/return-gifts.html", ...catalog.boot.categories.map(c => routes.category(c.id)), ...catalog.products.map(p => productUrl(p)), ...materials.map(p => productUrl(p, "raw")), ...frames.map(p => productUrl(p, "photo")), ...content.guides.map(g => "/blog/" + g.slug + "/")];
        return res.set("Cache-Control", "public, max-age=300").type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + [...new Set(urls)].map(url => `<url><loc>${esc(ORIGIN + url)}</loc></url>`).join("") + "</urlset>");
      }
      const guide = content.guides.find(g => pathname.replace(/\/$/, "") === "/blog/" + g.slug);
      if (guide) {
        if (!pathname.endsWith("/")) return res.redirect(301, pathname + "/" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
        return send(res, read("blog/" + guide.slug + "/index.html"));
      }
      if (["/raw-material-shop.html", "/raw-material.html", "/photo-frames.html"].includes(pathname)) {
        const kind = pathname === "/photo-frames.html" ? "photo" : "raw";
        const db = kind === "photo" ? photo : raw;
        const items = await load(cb => db.listActive({ base: req.query.base, sub: req.query.sub, q: req.query.q }, cb));
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        if (page > Math.max(1, Math.ceil(items.length / 48))) return notFound(res);
        const canonicalPath = kind === "photo" ? "/photo-frames.html" : "/raw-material-shop.html";
        let html = read(pathname.slice(1));
        const title = kind === "photo" ? "Photo frames" : "Resin raw materials and craft supplies";
        const pagination = Array.from({ length: Math.ceil(items.length / 48) }, (_, i) => `<a href="${canonicalPath}${i ? "?page=" + (i + 1) : ""}">${i + 1}</a>`).join(" ");
        html = injectBeforeMainEnd(html, '<section class="seo-section" aria-labelledby="catalogProductsTitle"><h2 id="catalogProductsTitle">' + title + '</h2>' + cards(items.slice((page - 1) * 48, page * 48), kind) + (pagination ? '<nav aria-label="Catalog pages">' + pagination + '</nav>' : '') + '</section>');
        return send(res, metadata(html, { title: title + (page > 1 ? " - Page " + page : "") + " | Craftguru India", description: `Explore ${title.toLowerCase()} from Craftguru India. Compare current product details and prices, or contact our Jaipur team for product and bulk order enquiries.`, url: canonicalPath + (page > 1 ? "?page=" + page : ""), noindex: Boolean(req.query.base || req.query.sub || req.query.q), breadcrumbs: [["Home", "/"], [title, canonicalPath]] }));
      }
      const route = routes.resolve(pathname);
      if (!route) {
        if (pathname === "/category.html" || /\/(?:product|raw-material-product|photo-frame-product)\.html$/.test(pathname)) return notFound(res);
        return next();
      }
      if (route.page !== "category.html" && pathname !== "/" && !pathname.endsWith("/")) return res.redirect(301, pathname + "/" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
      if (route.page === "index.html") {
        return homepage.serveHomepage(req, res, next);
      }
      if (pageFiles.includes(route.page)) return send(res, read(route.page));
      if (route.page === "category.html") {
        const { boot, products } = await resin();
        const cat = boot.categories.find(c => c.id === route.cat);
        if (!cat) return notFound(res);
        if (!pathname.endsWith("/")) return res.redirect(301, routes.category(cat.id) + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
        const copy = content.categoryCopy(cat.id, cat.label);
        const items = products.filter(p => p.category === cat.id);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1), pageSize = 48;
        if (page > Math.max(1, Math.ceil(items.length / pageSize))) return notFound(res);
        const url = routes.category(cat.id) + (page > 1 ? "?page=" + page : "");
        let html = read("category.html").replace(/(<h1\b[^>]*id="categoryHeading"[^>]*>)[\s\S]*?<\/h1>/, (_, start) => start + esc(cat.label) + "</h1>");
        html = html.replace('<div class="plp-grid product-grid" id="productGrid"></div>', '<div class="plp-grid product-grid" id="productGrid">' + cards(items.slice((page - 1) * pageSize, page * pageSize)) + "</div>");
        const pagination = Array.from({ length: Math.ceil(items.length / pageSize) }, (_, i) => `<a href="${routes.category(cat.id)}${i ? "?page=" + (i + 1) : ""}">${i + 1}</a>`).join(" ");
        html = injectBeforeMainEnd(html, (pagination ? '<nav class="seo-section" aria-label="Collection pages">' + pagination + "</nav>" : "") + categorySection(cat.id, cat.label, items));
        html = html.replace("</head>", '<script id="cgCatalogBootstrap" type="application/json">' + json(publicBootstrap(boot, products)) + '</script></head>');
        return send(res, metadata(html, { title: copy.title + (page > 1 ? " - Page " + page : "") + " | Craftguru India", description: copy.description, url, noindex: Boolean(req.query.q || req.query.sort || req.query.minp || req.query.maxp), breadcrumbs: [["Home", "/"], [cat.label, routes.category(cat.id)]] }));
      }
      if (route.id) {
        const kind = route.page === "raw-material-product.html" ? "raw" : route.page === "photo-frame-product.html" ? "photo" : "resin";
        let p, boot, publicProducts;
        if (kind === "resin") { const catalog = await resin(); boot = catalog.boot; publicProducts = catalog.products; p = catalog.products.find(row => row.id === route.id); }
        else p = await load(cb => (kind === "raw" ? raw : photo).getActiveById(route.id, cb));
        if (!p) return notFound(res);
        const values = prices(p);
        const overview = `<section class="seo-section seo-product-overview" id="cgProductOverview"><h2>${esc(p.name)}</h2>${p.image ? `<img src="${esc(absoluteImage(p.image))}" alt="${esc(p.name)}" width="480" height="480" decoding="async" />` : ""}${p.description ? `<p>${esc(p.description)}</p>` : ""}${values.length ? `<p>From ₹${esc(Math.min(...values).toLocaleString("en-IN"))}</p>` : ""}${p.outOfStock ? "<p>Currently out of stock</p>" : ""}<p>Choose from the available options above. <a href="/contact/">Contact us</a> for product details or <a href="/wholesale/">request a bulk quotation</a>.</p></section>`;
        let html = read(route.page);
        html = html.replace(/href="\/(?:product|raw-material-product|photo-frame-product)\.html#([^"<>]+)"/g, (_, fragment) => 'href="' + esc(productUrl(p, kind)) + '#' + fragment + '"');
        if (boot) html = html.replace("</head>", '<script id="cgCatalogBootstrap" type="application/json">' + json(publicBootstrap(boot, publicProducts)) + '</script></head>');
        if (kind !== "resin") html = html.replace('<div id="rmPdpRoot"></div>', '<div id="rmPdpRoot"><h1>' + esc(p.name) + '</h1></div>');
        if (kind === "resin") html = html.replace(/(<h1\b[^>]*id="productTitle"[^>]*>)[\s\S]*?<\/h1>/, (_, start) => start + esc(p.name) + "</h1>");
        // The visible server overview remains usable if catalog scripts cannot load.
        html = injectBeforeMainEnd(html, overview);
        const categoryUrl = kind === "raw" ? "/raw-material-shop.html" : kind === "photo" ? "/photo-frames.html" : routes.category(p.category);
        return send(res, metadata(html, { title: p.name + " | Craftguru India", description: String(p.description || `Explore ${p.name} from Craftguru India. Check available options and pricing, or contact our Jaipur team for product and bulk order enquiries.`).replace(/\s+/g, " ").slice(0, 160), url: productUrl(p, kind), image: p.image, imageAlt: p.name, schema: productSchema(p, kind), breadcrumbs: [["Home", "/"], [kind === "raw" ? "Raw materials" : kind === "photo" ? "Photo frames" : content.categoryCopy(p.category, p.category).title, categoryUrl], [p.name, productUrl(p, kind)]] }));
      }
      return next();
    } catch (err) {
      console.error("[storefront-seo]", err.message);
      // A database outage must not masquerade as a deleted product or an empty valid sitemap.
      res.set("Retry-After", "60");
      return send(res, read("503.html"), 503);
    }
  };
  middleware.notFound = (req, res, next) => {
    if ((req.method === "GET" || req.method === "HEAD") && !req.path.startsWith("/api/")) return notFound(res);
    next();
  };
  return middleware;
}
module.exports = { publicBootstrap, ORIGIN, esc, json, metadata, mergeProducts, cards, categorySection, productSchema, createMiddleware, content };

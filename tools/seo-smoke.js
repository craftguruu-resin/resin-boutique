"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const seo = require("../server/storefront-seo.js");
const routes = require("../seo-routes.js");
const homepage = require("../server/homepage-ssr.js");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const fixture = {
  ok: true,
  categories: [{ id: "resin-clocks", label: "Resin Clocks" }, { id: "mini-resin-deshboard", label: "Mini Resin Dashboard" }],
  products: [{ id: "test-clock", name: "Example Clock", category: "resin-clocks", image: "media/brand-craftguru.png", prices: { s: 500, m: 750 }, description: "An example catalog description." }, { id: "hidden", name: "Hidden piece", category: "resin-clocks", prices: { s: 1 } }, { id: "deleted", name: "Deleted piece", category: "resin-clocks", prices: { s: 1 } }],
  overrides: { "test-clock": { s: 550, options: { useSize: true, sizes: [{ id: "mini", priceInr: 400 }], heroImage: "media/brand-craftguru.png" } }, hidden: { listed: false } },
  suppressedProductIds: ["deleted"]
};
function deps({ fail = false, many = false } = {}) {
  const boot = JSON.parse(JSON.stringify(fixture));
  if (many) boot.products = Array.from({ length: 49 }, (_, i) => ({ ...boot.products[0], id: "item-" + i, name: "Clock " + i }));
  return { bootstrap: { loadStorefrontBootstrap: cb => cb(fail ? new Error("offline") : null, boot), getStaticCatalog: () => ({ allProducts: [] }) }, raw: { listActive: (_, cb) => cb(null, [{ id: "epoxy", name: "Example supply" }]), getActiveById: (id, cb) => cb(null, id === "epoxy" ? { id, name: "Example supply", priceInr: 250 } : null) }, photo: { listActive: (_, cb) => cb(null, [{ id: "frame", name: "Example frame" }]), getActiveById: (id, cb) => cb(null, id === "frame" ? { id, name: "Example frame", priceInr: 350 } : null) }, homepage: { serveHomepage: (req, res) => res.type("html").send(homepage.renderCatalogHomepage(req, read("index.html"), boot, {})) } };
}
async function server(t, options) {
  // Exercise the production middleware directly: this test also runs in sandboxes without sockets.
  const middleware = seo.createMiddleware(deps(options));
  return async function (url, options = {}) {
    const parsed = new URL(url, "http://127.0.0.1");
    const inputHeaders = options.headers || {};
    const headers = new Map();
    const req = { method: "GET", path: parsed.pathname, originalUrl: url, url, query: Object.fromEntries(parsed.searchParams), headers: inputHeaders, protocol: inputHeaders["x-forwarded-proto"] || "http", get: name => inputHeaders[name] || (name === "host" ? "127.0.0.1" : "") };
    let status = 200, body = "";
    const res = {
      status(code) { status = code; return this; },
      set(name, value) { headers.set(name.toLowerCase(), value); return this; },
      setHeader(name, value) { return this.set(name, value); },
      type(value) { return this.set("Content-Type", value === "html" ? "text/html" : value); },
      send(value) { body = value; return this; },
      redirect(code, value) { status = code; headers.set("location", value); body = "Redirect"; return this; }
    };
    await middleware(req, res, () => {
      const file = path.join(root, parsed.pathname);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) res.send(fs.readFileSync(file, "utf8"));
      else middleware.notFound(req, res, () => {});
    });
    return { status, headers: { get: name => headers.get(name.toLowerCase()) || null }, text: async () => body };
  };
}

function graph(html) { return JSON.parse(html.match(/<script id="cgStructuredData"[^>]*>([\s\S]*?)<\/script>/)[1])["@graph"]; }
test("old URLs redirect permanently to one clean canonical destination and preserve query values", async t => {
  const get = await server(t);
  for (const [old, expected] of [["/index.html?utm_source=test", "/?utm_source=test"], ["/category.html?cat=resin-clocks&page=2", "/resin-clocks/?page=2"], ["/category.html?cat=mini-resin-deshboard", "/mini-resin-dashboard/"], ["/products/test-clock", "/products/test-clock/"], ["/product.html?id=test-clock&utm_campaign=gifts", "/products/test-clock/?utm_campaign=gifts"], ["/raw-material-product.html?id=epoxy", "/raw-materials/epoxy/"], ["/photo-frame-product.html?id=frame", "/photo-frame-products/frame/"], ["/about.html", "/about/"]]) {
    const res = await get(old); assert.equal(res.status, 301, old); assert.equal(res.headers.get("location"), expected, old);
  }
  const res = await get("/index.html?utm_source=x", { headers: { host: "craftguruindia.com", "x-forwarded-proto": "http" } });
  assert.equal(res.headers.get("location"), seo.ORIGIN + "/?utm_source=x");
});
test("category source includes real product links, unique copy and canonical metadata before JavaScript", async t => {
  const get = await server(t); const res = await get("/resin-clocks/"); const html = await res.text();
  assert.equal(res.status, 200); assert.match(html, /<h1[^>]*>Resin Clocks<\/h1>/);
  assert.match(html, /href="\/products\/test-clock\/"/); assert.match(html, /From ₹400/);
  assert.match(html, /Choosing resin clocks/i); assert.match(html, /Questions before you order/);
  assert.match(html, /rel="canonical" href="https:\/\/www.craftguruindia.com\/resin-clocks\/"/);
  assert.ok(!html.includes("Hidden piece")); assert.ok(!html.includes("Deleted piece"));
  assert.equal(graph(html).filter(row => row["@type"] === "BreadcrumbList").length, 1);
  const filtered = await (await get("/resin-clocks/?q=clock")).text(); assert.match(filtered, /content="noindex, follow"/);
});
test("product source and schema use authoritative override and variant pricing without invented ratings or stock", async t => {
  const get = await server(t); const html = await (await get("/products/test-clock/")).text();
  const product = graph(html).find(row => row["@type"] === "Product");
  assert.equal(product.name, "Example Clock"); assert.equal(product.offers.lowPrice, 400);
  assert.equal(product.offers.highPrice, 750); assert.equal(product.offers.priceCurrency, "INR");
  assert.ok(!product.aggregateRating); assert.ok(!product.offers.availability);
  assert.match(html, /An example catalog description/); assert.match(html, /<script id="cgCatalogBootstrap"/);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.equal((html.match(/id="cgStructuredData"/g) || []).length, 1);
  assert.match(html, /href="\/products\/test-clock\/#qtyDock"/);
  for (const [url, productPath] of [["/raw-material-shop.html", "/raw-materials/epoxy/"], ["/photo-frames.html", "/photo-frame-products/frame/"]]) {
    const listing = await get(url); assert.equal(listing.status, 200); assert.ok((await listing.text()).includes(productPath));
  }
  for (const [url, name] of [["/raw-materials/epoxy/", "Example supply"], ["/photo-frame-products/frame/", "Example frame"]]) {
    const response = await get(url), source = await response.text(); assert.equal(response.status, 200); assert.match(source, new RegExp("<h1>" + name)); assert.equal(graph(source).find(row => row["@type"] === "Product").name, name);
  }
});
test("sitemap lists canonical pages and active products across all catalogs, excluding private/deleted URLs", async t => {
  const get = await server(t); const res = await get("/sitemap.xml"), xml = await res.text();
  assert.equal(res.status, 200); assert.match(res.headers.get("content-type"), /xml/);
  for (const url of ["/resin-clocks/", "/products/test-clock/", "/raw-materials/epoxy/", "/photo-frame-products/frame/", "/contact/", "/wholesale/", "/blog/resin-gift-ideas-for-diwali/"]) assert.ok(xml.includes(seo.ORIGIN + url), url);
  for (const text of ["/index.html", "?cat=", "?id=", "/products/hidden/", "/products/deleted/", "/account.html", "/checkout.html"]) assert.ok(!xml.includes(text), text);
});
test("unknown or removed products return real 404 responses; database failures return retryable 503 responses", async t => {
  const get = await server(t);
  for (const url of ["/products/unknown/", "/products/hidden/", "/raw-materials/missing/", "/category.html", "/unknown-page.html"]) assert.equal((await get(url)).status, 404, url);
  assert.equal((await get("/account.html")).headers.get("x-robots-tag"), "noindex, follow");
  const failing = await server(t, { fail: true }); const res = await failing("/products/test-clock/"); assert.equal(res.status, 503); assert.equal(res.headers.get("retry-after"), "60");
  assert.equal((await failing("/sitemap.xml")).status, 503);
});
test("paginated collections expose links to every page and preserve each page's canonical", async t => {
  const get = await server(t, { many: true });
  assert.match(await (await get("/resin-clocks/")).text(), /href="\/resin-clocks\/\?page=2"/);
  const html = await (await get("/resin-clocks/?page=2")).text(); assert.match(html, /href="https:\/\/www.craftguruindia.com\/resin-clocks\/\?page=2"/); assert.match(html, /Clock 48/);
  assert.equal((await get("/resin-clocks/?page=3")).status, 404);
});
test("homepage has crawlable featured products with live override prices and all category links", async t => {
  const get = await server(t); const html = await (await get("/")).text();
  assert.match(html, /id="featuredProductsTitle"/); assert.match(html, /href="\/products\/test-clock\/"/); assert.match(html, /From ₹400/);
  assert.match(html, /href="\/mini-resin-dashboard\/"/); assert.match(html, /Explore corporate gifts/);
  assert.ok(!html.includes("Hidden piece")); assert.ok(!html.includes("Deleted piece"));
});
test("clean routes preserve database IDs and browser parameters without changing the URL", () => {
  const window = { location: { pathname: "/mini-resin-dashboard/", search: "?page=2" } };
  vm.runInNewContext(read("seo-routes.js"), { window, URLSearchParams, URL });
  assert.equal(window.CraftguruRoutes.params().get("cat"), "mini-resin-deshboard"); assert.equal(window.CraftguruRoutes.params().get("page"), "2");
  window.location.pathname = "/products/test-clock/"; assert.equal(window.CraftguruRoutes.params().get("id"), "test-clock");
  assert.equal(window.location.pathname, "/products/test-clock/");
});
test("structured data safely escapes catalog text, and all new pages have source metadata and accessible forms", () => {
  const html = seo.metadata("<html><head></head></html>", { title: "A </script> title", description: 'Text " here', url: "/", schema: { "@type": "Product", name: "</script><script>bad()</script>" } });
  assert.equal(graph(html).find(row => row["@type"] === "Product").name, "</script><script>bad()</script>"); assert.ok(!html.includes("<script>bad()"));
  for (const file of Object.keys(routes.pages).concat(["404.html", "503.html"])) {
    const source = read(file); assert.equal((source.match(/rel="canonical"/g) || []).length, 1, file); assert.match(source, /name="description"/, file); assert.match(source, /property="og:title"/, file); assert.match(source, /name="twitter:card"/, file); assert.match(source, /<base href="\/"/, file); assert.ok(source.includes("craftguruu@gmail.com"), file);
  }
  for (const file of ["contact.html", "wholesale.html"]) { const source = read(file); assert.match(source, /<label for="enquiryEmail"/); assert.match(source, /Prepare email enquiry/); }
  const deployed = seo.metadata('<head><script src="category.js?v=deployment-123"></script></head>', { title: "Category", description: "A category", url: "/resin-clocks/" });
  assert.ok(deployed.includes("category.js?v=deployment-123"), "Server rendering preserves deploy-specific asset versions");
  assert.match(read("robots.txt"), /Sitemap: https:\/\/www.craftguruindia.com\/sitemap.xml/);
});

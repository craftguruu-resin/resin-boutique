/* Shared by the browser and Express: public URLs never rename database IDs. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CraftguruRoutes = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var pages = {
    "index.html": "/", "about.html": "/about/", "contact.html": "/contact/",
    "wholesale.html": "/wholesale/", "corporate-gifting.html": "/corporate-gifting/",
    "blog.html": "/blog/", "shipping-policy.html": "/shipping-policy/",
    "return-policy.html": "/return-policy/", "privacy-policy.html": "/privacy-policy/",
    "terms-and-conditions.html": "/terms-and-conditions/"
  };
  function category(id) { return "/" + encodeURIComponent(id === "mini-resin-deshboard" ? "mini-resin-dashboard" : id) + "/"; }
  function product(id, kind) { return "/" + (kind === "raw" ? "raw-materials" : kind === "photo" ? "photo-frame-products" : "products") + "/" + encodeURIComponent(id) + "/"; }
  function resolve(pathname) {
    var parts;
    try { parts = pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch (_) { return null; }
    if (!parts.length) return { page: "index.html" };
    var file = Object.keys(pages).find(function (key) { return pages[key] === pathname.replace(/\/?$/, "/"); });
    if (file) return { page: file };
    var types = { products: "product.html", "raw-materials": "raw-material-product.html", "photo-frame-products": "photo-frame-product.html" };
    if (parts.length === 2 && types[parts[0]]) return { page: types[parts[0]], id: parts[1] };
    if (parts.length === 1 && !/\./.test(parts[0])) return { page: "category.html", cat: parts[0] === "mini-resin-dashboard" ? "mini-resin-deshboard" : parts[0] };
    return null;
  }
  function params() {
    var p = new URLSearchParams(window.location.search);
    var route = resolve(window.location.pathname);
    if (route && route.cat) p.set("cat", route.cat);
    if (route && route.id) p.set("id", route.id);
    return p;
  }
  function clean(href, origin) {
    var u;
    try { u = new URL(href, origin + "/"); } catch (_) { return href; }
    if (u.origin !== origin) return href;
    var file = u.pathname.replace(/^\//, "");
    var target = pages[file];
    if (file === "index.html" && u.hash === "#footer-connect") { target = "/contact/"; u.hash = ""; }
    if (file === "category.html" && u.searchParams.get("cat")) { target = category(u.searchParams.get("cat")); u.searchParams.delete("cat"); }
    var kinds = { "product.html": "resin", "raw-material-product.html": "raw", "photo-frame-product.html": "photo" };
    if (kinds[file] && u.searchParams.get("id")) { target = product(u.searchParams.get("id"), kinds[file]); u.searchParams.delete("id"); }
    if (file === "policies.html") {
      target = { "#shipping": "/shipping-policy/", "#privacy": "/privacy-policy/", "#returns": "/return-policy/", "#terms": "/terms-and-conditions/" }[u.hash];
      if (target) u.hash = "";
    }
    return target ? target + (u.searchParams.toString() ? "?" + u.searchParams : "") + u.hash : href;
  }
  return { pages: pages, category: category, product: product, resolve: resolve, params: params, clean: clean };
});

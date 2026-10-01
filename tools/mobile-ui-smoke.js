/* Lightweight source-level guard for customer mobile regressions.
   It runs without a browser so it can be used before every deployment. */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requireText = (file, needle, label) => {
  if (!read(file).includes(needle)) throw new Error(label + " is missing from " + file);
};

const customerPages = [
  "index.html", "category.html", "product.html", "raw-material.html",
  "raw-material-shop.html", "raw-material-product.html", "photo-frames.html",
  "photo-frame-shop.html", "photo-frame-product.html", "wishlist.html",
  "checkout.html", "account.html", "about.html", "policies.html", "return-gifts.html"
];

customerPages.forEach((page) => requireText(page, "guest-layout.js?v=20261001mobile17", "Current mobile shell"));
requireText("guest-layout.js", "ensureMobileHeaderNavigation", "Mobile navigation");
requireText("guest-layout.js", "ensureMobileCatalogQuickBar", "Mobile catalogue controls");
requireText("guest-layout.js", "ensureMobilePdpPurchaseBar", "Mobile purchase bar");
requireText("guest-layout.js", "ensureCustomerUiFinishScript", "Customer UI completion layer");
requireText("customer-ui-finish.js", "cg-ui-finish-ready", "Customer UI accessibility/media layer");
requireText("guest-layout.js", "if (proxy.textContent !== label)", "Purchase-bar mutation-loop guard");
requireText("guest-layout.js", "max-width: 640px", "Mobile-only purchase bar");
requireText("guest-layout.js", "cg-social-fallback", "Social fallback");
requireText("guest-layout.js", "CraftguruOverlayLock", "Overlay scroll lock");
requireText("mobile-storefront-fixes.css", "grid-template-columns: minmax(0, 1fr) !important", "One-column product cards");
requireText("mobile-storefront-fixes.css", "touch-action: pan-y pinch-zoom", "Product gallery touch handling");
requireText("whatsapp-widget.js", "window.open", "WhatsApp direct action");
requireText("instagram-widget.js", "max-width: 899px", "Instagram mobile widget");

console.log("Mobile storefront smoke checks passed for " + customerPages.length + " customer pages.");

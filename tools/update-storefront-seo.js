"use strict";
const fs = require("fs");
const path = require("path");
const seo = require("../server/storefront-seo.js");
const routes = require("../seo-routes.js");
const buildMetadata = (html, info) => seo.metadata(html, { ...info, versionAssets: true });
const root = path.resolve(__dirname, "..");
const descriptions = {
  "index.html": ["Handmade Resin Clocks, Frames & Gifts | Craftguru India, Jaipur", "Shop handmade resin wall clocks, spiritual frames, coasters and personalised gifts from Craftguru India, Jaipur. Explore retail designs and bulk order options."],
  "about.html": ["About Our Jaipur Resin Studio | Craftguru India", "Meet Craftguru India, a Jaipur resin studio for clocks, frames and personalised gifts. Learn about our making process, packaging, retail and wholesale orders."],
  "category.html": ["Resin Gift Collections | Craftguru India", "Explore resin clocks, coasters, mantra frames, keychains and personalised gifts from Craftguru India, Jaipur. Compare collections and discuss custom or bulk orders."],
  "product.html": ["Handmade Resin Gifts & Decor | Craftguru India", "Explore handmade resin gifts and decor from Craftguru India, Jaipur. Compare available product options and pricing, or contact our team for custom and bulk orders."],
  "raw-material.html": ["Resin Raw Materials & Craft Supplies | Craftguru India", "Explore resin raw materials and craft supplies from Craftguru India. Browse the available products and contact our Jaipur team for product details and bulk enquiries."],
  "raw-material-shop.html": ["Resin Raw Materials & Craft Supplies | Craftguru India", "Browse resin raw materials and craft supplies at Craftguru India. Compare available products, view current options and contact our Jaipur team with order enquiries."],
  "raw-material-product.html": ["Resin Craft Supplies | Craftguru India", "Explore resin craft supplies from Craftguru India. Check the selected material's product details, available options and pricing, or ask our Jaipur team for guidance."],
  "photo-frames.html": ["Photo Frames & Personalised Gifts | Craftguru India", "Explore photo frames at Craftguru India, Jaipur. Compare the available designs and product options, or contact our team about personalisation and bulk gift orders."],
  "photo-frame-shop.html": ["Photo Frame Collection | Craftguru India", "Browse the photo frame collection from Craftguru India. Compare the available designs and contact our Jaipur team for product details, customisation and bulk orders."],
  "photo-frame-product.html": ["Photo Frames & Keepsakes | Craftguru India", "Explore photo frames and keepsakes from Craftguru India, Jaipur. Check available product options and pricing or contact our team for custom and bulk order enquiries."],
  "return-gifts.html": ["Return Gifts & Resin Keepsakes | Craftguru India", "Discover resin return gifts for celebrations and guest thank-you gifts at Craftguru India. Browse designs and ask our Jaipur team about quantities and customisation."],
  "policies.html": ["Customer Policies | Craftguru India", "Read Craftguru India's customer policies for privacy, shipping, returns and terms. Contact our team with questions about an order or the applicable product details."],
  "account.html": ["Your Account | Craftguru India", "Manage your Craftguru India account and orders."],
  "checkout.html": ["Checkout | Craftguru India", "Review your cart and complete your Craftguru India order."],
  "wishlist.html": ["Your Wishlist | Craftguru India", "View the products saved to your Craftguru India wishlist."]
};
const policyUrls = { privacy: "/privacy-policy/", shipping: "/shipping-policy/", returns: "/return-policy/", terms: "/terms-and-conditions/" };
const footerLinks = '<nav class="seo-footer-links" aria-label="More information"><a href="/contact/">Contact</a><a href="/wholesale/">Wholesale</a><a href="/corporate-gifting/">Corporate gifting</a><a href="/blog/">Buying guides</a><a href="/shipping-policy/">Shipping</a><a href="/return-policy/">Returns</a><a href="/privacy-policy/">Privacy</a><a href="/terms-and-conditions/">Terms</a></nav>';
for (const [file, [title, description]] of Object.entries(descriptions)) {
  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, "utf8");
  html = html.replace(/<html\b([^>]*)>/, (match, attrs) => '<html' + attrs.replace(/\sdata-cg-page="[^"]*"/, "") + ' data-cg-page="' + file + '">');
  html = html.replace(/<base\b[^>]*>/g, "");
  html = html.replace(/<head>/i, '<head>\n  <base href="/" />');
  if (!html.includes('src="/seo-routes.js')) html = html.replace(/<\/head>/i, '<script src="/seo-routes.js?v=20261015seo1"></script>\n<link rel="stylesheet" href="/seo-content.css?v=20261015seo1" />\n</head>');
  if (!html.includes('src="/seo-client.js')) html = html.replace(/<\/body>/i, '<script defer src="/seo-client.js?v=20261015seo1"></script>\n</body>');
  html = html.replace(/href="policies\.html#(privacy|shipping|returns|terms)"/g, (_, anchor) => 'href="' + policyUrls[anchor] + '"');
  html = html.replace(/href="index\.html#footer-connect"/g, 'href="/contact/"');
  html = html.replace(/href="return-gifts.html"([^>]*>\s*)Corporate Gifting/g, 'href="/corporate-gifting/"$1Corporate Gifting');
  html = html.replace(/href="([^"#][^"]*)"/g, (match, href) => 'href="' + routes.clean(href.replace(/&amp;/g, "&"), seo.ORIGIN).replace(/&/g, "&amp;") + '"');
  html = html.replace(/<span id="year"><\/span>/g, '<span id="year">2026</span>');
  html = html.replace(/Craft Guru/g, "Craftguru India").replace(/Craftguru India · Jaipur/g, "Craftguru India · Jaipur").replace(/Craftguru handmade resin/g, "Craftguru India handmade resin");
  html = html.replace(/alt="Craftguru"/g, 'alt="Craftguru India"').replace(/aria-label="Craftguru(?: — home| home)"/g, 'aria-label="Craftguru India home"');
  // With a root base, fragment-only links must explicitly retain their document path.
  html = html.replace(/href="#([^\"]+)"/g, (_, anchor) => 'href="' + (file === "policies.html" && policyUrls[anchor] ? policyUrls[anchor] : (routes.pages[file] || "/" + file) + "#" + anchor) + '"');
  if (!html.includes('aria-label="More information"')) html = html.replace(/<\/footer>/i, footerLinks + '\n</footer>');
  if (file === "index.html") {
    html = html.replace(/href="return-gifts.html" aria-label="Corporate Gifting"/g, 'href="/corporate-gifting/" aria-label="Corporate Gifting"');
    html = html.replace(/(aria-label="Corporate Gifting">)<\/a>/, '$1<span class="seo-hero-label">Explore corporate gifts</span></a>');
    if (!html.includes('id="allCollectionsTitle"')) html = html.replace(/<\/main>/i, '<!-- cg-featured-products -->\n<section class="seo-section" aria-labelledby="allCollectionsTitle"><h2 id="allCollectionsTitle">Explore all resin collections</h2><nav class="seo-category-links" aria-label="All resin collections">' + Object.entries(seo.content.categoryDetails).map(([id, d]) => '<a href="' + routes.category(id) + '">' + seo.esc(d[0]) + '</a>').join("") + '</nav><p>Looking for gifts for a team or an occasion? <a href="/wholesale/">Request a wholesale quotation</a> or explore our <a href="/blog/">buying and care guides</a>.</p></section>\n</main>');
  }
  const url = routes.pages[file] || (file === "photo-frame-shop.html" ? "/photo-frames.html" : file === "raw-material.html" ? "/raw-material-shop.html" : "/" + file);
  html = buildMetadata(html, { title, description, url, noindex: ["account.html", "checkout.html", "wishlist.html"].includes(file), breadcrumbs: file === "index.html" ? undefined : [["Home", "/"], [title.split(" | ")[0], url]] });
  fs.writeFileSync(filePath, html);
}
for (const file of fs.readdirSync(root).filter(f => /^vendor.*\.html$/.test(f))) {
  const p = path.join(root, file);
  let html = fs.readFileSync(p, "utf8");
  if (!/name="robots"/.test(html)) html = html.replace(/<head>/i, '<head>\n<meta name="robots" content="noindex, nofollow" />');
  fs.writeFileSync(p, html);
}
console.log("Updated source HTML metadata, crawlable navigation and footer information.");

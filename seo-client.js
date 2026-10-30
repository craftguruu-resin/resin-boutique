(function () {
  "use strict";
  var R = window.CraftguruRoutes;
  if (!R) return;
  function updateLinks(root) {
    var links = [];
    if (root.nodeType !== 1 && root !== document) return;
    if (root.matches && root.matches("a[href]")) links.push(root);
    if (root.querySelectorAll) links = links.concat(Array.from(root.querySelectorAll("a[href]")));
    links.forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || /^(#|mailto:|tel:|javascript:)/.test(href)) return;
      var next = R.clean(href, window.location.origin);
      if (next !== href) a.setAttribute("href", next);
    });
  }
  function setup() {
    updateLinks(document);
    new MutationObserver(function (changes) {
      changes.forEach(function (change) {
        if (change.type === "attributes") updateLinks(change.target);
        else change.addedNodes.forEach(updateLinks);
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    document.querySelectorAll(".seo-enquiry").forEach(function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        var fields = new FormData(form);
        var subject = form.dataset.enquiry === "wholesale" ? "Wholesale resin gift enquiry" : "Craftguru India customer enquiry";
        var body = "Name: " + fields.get("name") + "\nEmail: " + fields.get("email") + "\nBusiness: " + (fields.get("company") || "") + "\n\n" + fields.get("body");
        window.location.href = "mailto:craftguruu@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        form.querySelector(".seo-form-status").textContent = "Please review and send the enquiry in your email app. If it does not open, email craftguruu@gmail.com or use the WhatsApp link above.";
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup); else setup();
})();

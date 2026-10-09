(function () {
  "use strict";
  var phones = window.matchMedia("(max-width: 640px)");
  function resetMobileDock() {
    if (!phones.matches) return;
    requestAnimationFrame(function () {
      if (!phones.matches) return;
      var dock = document.querySelector(".site-top > .nav-dock");
      if (dock) dock.scrollLeft = 0;
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", resetMobileDock, { once: true });
  } else {
    resetMobileDock();
  }
  window.addEventListener("pageshow", resetMobileDock);
  if (phones.addEventListener) phones.addEventListener("change", resetMobileDock);
  else if (phones.addListener) phones.addListener(resetMobileDock);
})();

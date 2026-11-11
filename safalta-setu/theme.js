(function () {
  "use strict";
  var theme = "light";
  try {
    var saved =
      localStorage.getItem("safalta-theme") || localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      theme = saved;
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }
  } catch (error) {
    // The website remains usable when browser storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
})();

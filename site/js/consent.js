/* =========================================================
   B19 — Google Analytics 4 with cookie consent (basic consent mode)
   ---------------------------------------------------------
   Nothing from Google is loaded until the visitor clicks ACCEPT.
   The choice is remembered in localStorage ("b19-consent").
   The COOKIES link in the footer reopens the banner.
   ========================================================= */
(function () {
  "use strict";
  var GA_ID = "G-3HHDGR2F75";
  var KEY = "b19-consent";
  var loaded = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  function getChoice() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }
  function setChoice(v) { try { localStorage.setItem(KEY, v); } catch (_) {} }

  function loadGA() {
    if (loaded) return;
    loaded = true;
    gtag("consent", "default", {
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
      analytics_storage: "granted"
    });
    gtag("js", new Date());
    gtag("config", GA_ID);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
  }

  function dropGACookies() {
    var host = location.hostname.replace(/^www\./, "");
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (!/^_ga/.test(name)) return;
      ["", "; domain=" + host, "; domain=." + host].forEach(function (d) {
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + d;
      });
    });
  }

  /* Events from the rest of the site: window.b19track("play_track", {...}) */
  window.b19track = function (name, params) {
    if (loaded) gtag("event", name, params || {});
  };

  var banner = document.querySelector("[data-consent]");

  function openBanner() { if (banner) banner.hidden = false; }
  function closeBanner() { if (banner) banner.hidden = true; }

  if (banner) {
    banner.querySelector("[data-consent-accept]").addEventListener("click", function () {
      setChoice("granted");
      closeBanner();
      loadGA();
    });
    banner.querySelector("[data-consent-reject]").addEventListener("click", function () {
      var wasOn = loaded;
      setChoice("denied");
      closeBanner();
      if (wasOn) gtag("consent", "update", { analytics_storage: "denied" });
      dropGACookies();
      window["ga-disable-" + GA_ID] = true;
    });
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-consent-open], a[href^='mailto:'], a[href^='tel:']");
    if (!t) return;
    if (t.hasAttribute("data-consent-open")) { e.preventDefault(); openBanner(); return; }
    var href = t.getAttribute("href");
    window.b19track("contact_click", { method: href.indexOf("mailto:") === 0 ? "email" : "phone" });
  });

  var choice = getChoice();
  if (choice === "granted") loadGA();
  else if (choice !== "denied") openBanner();
})();

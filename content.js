(() => {
  const STYLE_ID = "edgeshield-cosmetic-style";

  const COSMETIC_SELECTORS = [
    "ins.adsbygoogle",
    ".adsbygoogle",
    "[id^='google_ads_iframe']",
    "[id^='div-gpt-ad']",
    "[data-ad-slot]",
    "[data-ad-client]",
    "[data-google-query-id]",
    ".taboola-container",
    "#taboola-below-article-thumbnails",
    "[id^='taboola-']",
    ".OUTBRAIN",
    ".ob-widget",
    "[data-widget-id^='OUTBRAIN']",
    ".mgid-widget",
    "[id^='M'][id$='ScriptRootC']",
    "iframe[src*='doubleclick.net']",
    "iframe[src*='googlesyndication.com']",
    "iframe[src*='adnxs.com']",
    "iframe[src*='criteo.com']",
    "iframe[src*='criteo.net']",
    "iframe[src*='taboola.com']",
    "iframe[src*='outbrain.com']",
    "iframe[src*='reklamstore.com']",
    "iframe[src*='admatic.com.tr']",
    ".ad-banner",
    ".ad-container",
    ".ad-wrapper",
    ".ad-placeholder",
    ".sponsored-ad",
    ".reklam-alani",
    ".reklam_alani",
    "#reklam-alani"
  ];

  const COMBINED_SELECTOR = COSMETIC_SELECTORS.join(", ");

  let observer = null;
  let scanTimer = null;
  let isActive = false;

  function getCurrentHostname() {
    return (window.location.hostname || "").replace(/^www\./, "").toLowerCase();
  }

  function isWhitelisted(hostname, whitelist) {
    if (!hostname || !Array.isArray(whitelist)) return false;
    return whitelist.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${COMBINED_SELECTOR} { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle() {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
  }

  function scanAndReport() {
    if (!isActive || !document.body) return;
    let newlyHidden = 0;

    try {
      const elements = document.querySelectorAll(COMBINED_SELECTOR);
      for (const el of elements) {
        if (!el.dataset.edgeshieldCounted) {
          el.dataset.edgeshieldCounted = "1";
          newlyHidden += 1;
        }
      }
    } catch {
      // Ignore selector errors on malformed DOMs
    }

    if (newlyHidden > 0) {
      chrome.runtime
        .sendMessage({ type: "COSMETIC_BLOCKED", count: newlyHidden })
        .catch(() => {});
    }
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanAndReport();
    }, 350);
  }

  function startObserver() {
    if (observer) return;
    const target = document.documentElement;
    if (!target) return;

    observer = new MutationObserver(() => {
      scheduleScan();
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
  }

  function applyState(settings) {
    const hostname = getCurrentHostname();
    const shouldBlock =
      Boolean(settings.enabled) &&
      Boolean(settings.cosmeticFiltering) &&
      !isWhitelisted(hostname, settings.whitelist);

    isActive = shouldBlock;

    if (shouldBlock) {
      injectStyle();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scanAndReport, {
          once: true
        });
      } else {
        scanAndReport();
      }
      startObserver();
    } else {
      removeStyle();
      stopObserver();
    }
  }

  chrome.storage.local.get(
    { enabled: true, cosmeticFiltering: true, whitelist: [] },
    (settings) => {
      applyState(settings);
    }
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.enabled || changes.cosmeticFiltering || changes.whitelist) {
      chrome.storage.local.get(
        { enabled: true, cosmeticFiltering: true, whitelist: [] },
        (settings) => {
          applyState(settings);
        }
      );
    }
  });
})();

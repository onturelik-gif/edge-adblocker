(() => {
  const STYLE_ID = "edgeshield-cosmetic-style";
  const AGGRESSIVE_STYLE_ID = "edgeshield-aggressive-style";

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

  // Safe selectors only (avoid substring *= 'ad-' which breaks #masthead-container, #upload-box, etc.)
  const AGGRESSIVE_SELECTORS = [
    "amp-ad",
    "amp-sticky-ad",
    "amp-auto-ads",
    ".ad-slot",
    ".ad_slot",
    ".ad-unit",
    ".ad-box",
    ".ad_box",
    ".ad_container",
    "[id^='ad-container']",
    "[id^='ad_container']",
    "[id^='ad-slot']",
    "[id^='ad_slot']",
    "[class*='reklam']",
    "[id*='reklam']",
    "[data-ad]",
    "[data-ads]",
    "[data-ad-unit]",
    "[data-testid^='ad-']",
    "[data-testid^='ads-']",
    ".sticky-ad",
    ".floating-ad",
    ".interstitial-ad",
    ".popup-ad",
    ".overlay-ad",
    ".fc-ab-root",
    ".fc-dialog-overlay",
    "#onetrust-consent-sdk",
    "#CybotCookiebotDialog",
    ".didomi-popup-container",
    ".qc-cmp2-container",
    "[class*='adblock-modal']",
    "[id*='adblock-modal']",
    ".video-ads",
    ".ytp-ad-module",
    ".ytp-ad-overlay-container",
    "ytd-ad-slot-renderer",
    "ytd-banner-promo-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-display-ad-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-action-companion-ad-renderer",
    "#player-ads"
  ];

  const BASE_SELECTOR = COSMETIC_SELECTORS.join(", ");
  const AGGRESSIVE_SELECTOR = AGGRESSIVE_SELECTORS.join(", ");

  let observer = null;
  let scanTimer = null;
  let ytTimer = null;
  let isCosmeticActive = false;
  let isAggressiveActive = false;
  let isPopGuardActive = true;

  function getCurrentHostname() {
    return (window.location.hostname || "").replace(/^www\./, "").toLowerCase();
  }

  function isWhitelisted(hostname, whitelist) {
    if (!hostname || !Array.isArray(whitelist)) return false;
    return whitelist.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
  }

  function injectStyle(id, cssText) {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = cssText;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle(id) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
  }

  function unlockScrollIfLocked() {
    if (!isAggressiveActive) return;
    const html = document.documentElement;
    const body = document.body;
    if (html && getComputedStyle(html).overflow === "hidden") {
      const hasNag = document.querySelector(
        ".fc-ab-root, #onetrust-consent-sdk, #CybotCookiebotDialog, .didomi-popup-container, .qc-cmp2-container, [class*='adblock-modal']"
      );
      if (hasNag) {
        html.style.setProperty("overflow", "auto", "important");
        if (body) body.style.setProperty("overflow", "auto", "important");
      }
    }
  }

  function handleYouTubeAds() {
    if (!isAggressiveActive) return;
    const host = getCurrentHostname();
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return;

    const player = document.querySelector("#movie_player");
    const isAdShowing = player && player.classList.contains("ad-showing");
    if (!isAdShowing) return;

    const skipBtn = document.querySelector(
      ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern"
    );
    if (skipBtn) {
      skipBtn.click();
      chrome.runtime
        .sendMessage({ type: "COSMETIC_BLOCKED", count: 1 })
        .catch(() => {});
      return;
    }

    const video = document.querySelector("video.html5-main-video");
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      video.muted = true;
      video.currentTime = Math.max(0, video.duration - 0.1);
    }
  }

  function startYouTubeWatcher() {
    const host = getCurrentHostname();
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return;
    if (ytTimer) return;
    ytTimer = setInterval(handleYouTubeAds, 400);
  }

  function stopYouTubeWatcher() {
    if (ytTimer) {
      clearInterval(ytTimer);
      ytTimer = null;
    }
  }

  function scanAndReport() {
    if ((!isCosmeticActive && !isAggressiveActive) || !document.body) return;
    let newlyHidden = 0;

    const activeSelector = isAggressiveActive
      ? `${BASE_SELECTOR}, ${AGGRESSIVE_SELECTOR}`
      : BASE_SELECTOR;

    try {
      const elements = document.querySelectorAll(activeSelector);
      for (const el of elements) {
        if (!el.dataset.edgeshieldCounted) {
          el.dataset.edgeshieldCounted = "1";
          newlyHidden += 1;
        }
      }
    } catch {
      // Ignore selector errors on malformed DOMs
    }

    unlockScrollIfLocked();

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
    }, 300);
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
    const allowed =
      Boolean(settings.enabled) && !isWhitelisted(hostname, settings.whitelist);

    isCosmeticActive = allowed && Boolean(settings.cosmeticFiltering);
    isAggressiveActive = allowed && Boolean(settings.aggressiveMode);
    isPopGuardActive = allowed && Boolean(settings.blockPopups);

    if (document.documentElement) {
      document.documentElement.setAttribute(
        "data-edgeshield-popguard",
        isPopGuardActive ? "1" : "0"
      );
    }

    const hideCss =
      " { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }";

    if (isCosmeticActive) {
      injectStyle(STYLE_ID, `${BASE_SELECTOR}${hideCss}`);
    } else {
      removeStyle(STYLE_ID);
    }

    if (isAggressiveActive) {
      injectStyle(AGGRESSIVE_STYLE_ID, `${AGGRESSIVE_SELECTOR}${hideCss}`);
      startYouTubeWatcher();
    } else {
      removeStyle(AGGRESSIVE_STYLE_ID);
      stopYouTubeWatcher();
    }

    if (isCosmeticActive || isAggressiveActive) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scanAndReport, {
          once: true
        });
      } else {
        scanAndReport();
      }
      startObserver();
    } else {
      stopObserver();
    }
  }

  // Tell background when user clicks on a video player / non-link so rogue spawned tabs can be closed immediately
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!isPopGuardActive) return;
      const el = e.target;
      if (!(el instanceof Element)) return;

      const isVideoArea = Boolean(
        el.closest(
          "video, iframe, .vjs-tech, .video-js, .jwplayer, .plyr, [class*='player'], [id*='player']"
        )
      );
      const anchor = el.closest("a[href]");
      const isEmptyOverlayAnchor =
        anchor &&
        anchor.textContent.trim() === "" &&
        !anchor.querySelector("img, svg");

      if (isVideoArea || isEmptyOverlayAnchor || !anchor) {
        chrome.runtime
          .sendMessage({ type: "USER_VIDEO_CLICK" })
          .catch(() => {});
      }
    },
    true
  );

  const STORAGE_KEYS = {
    enabled: true,
    cosmeticFiltering: true,
    aggressiveMode: true,
    blockPopups: true,
    whitelist: []
  };

  window.addEventListener("edgeshield-popup-blocked", () => {
    chrome.runtime
      .sendMessage({ type: "COSMETIC_BLOCKED", count: 1 })
      .catch(() => {});
  });

  chrome.storage.local.get(STORAGE_KEYS, (settings) => {
    applyState(settings);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (
      changes.enabled ||
      changes.cosmeticFiltering ||
      changes.aggressiveMode ||
      changes.blockPopups ||
      changes.whitelist
    ) {
      chrome.storage.local.get(STORAGE_KEYS, (settings) => {
        applyState(settings);
      });
    }
  });
})();

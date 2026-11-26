(() => {
  const ATTR_GUARD = "data-edgeshield-popguard";
  const EVENT_BLOCKED = "edgeshield-popup-blocked";

  const SAFE_POPUP_PATTERNS = [
    /accounts\.google\.com/i,
    /login\.microsoftonline\.com/i,
    /login\.live\.com/i,
    /appleid\.apple\.com/i,
    /github\.com\/login/i,
    /\/oauth/i,
    /\/authorize/i,
    /\/sso\b/i,
    /\/checkout/i,
    /3dsecure/i
  ];

  const AD_POPUP_PATTERNS = [
    /popads/i,
    /popcash/i,
    /propellerads/i,
    /adsterra/i,
    /clickadu/i,
    /monetag/i,
    /exoclick/i,
    /hilltopads/i,
    /adcash/i,
    /admaven/i,
    /trafficjunky/i,
    /juicyads/i,
    /galaksion/i,
    /evadav/i,
    /onclickalgo/i,
    /richpush/i,
    /reklamstore/i,
    /admatic/i,
    /doubleclick/i,
    /googlesyndication/i,
    /popunder/i,
    /click\.(php|aspx|html)/i,
    /redirect/i,
    /\/afu\.php/i,
    /\/go\.php/i
  ];

  let lastUserClickTarget = null;
  let lastUserClickTime = 0;

  document.addEventListener(
    "pointerdown",
    (e) => {
      lastUserClickTarget = e.target;
      lastUserClickTime = Date.now();
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      lastUserClickTarget = e.target;
      lastUserClickTime = Date.now();
    },
    true
  );

  function isGuardActive() {
    return document.documentElement?.getAttribute(ATTR_GUARD) === "1";
  }

  function notifyBlocked() {
    window.dispatchEvent(new CustomEvent(EVENT_BLOCKED));
  }

  function createFakeWindow() {
    const fakeLocation = {
      href: "about:blank",
      assign() {},
      replace() {},
      reload() {}
    };
    return {
      closed: false,
      opener: window,
      location: fakeLocation,
      document: {
        write() {},
        writeln() {},
        open() {},
        close() {},
        createElement: () => ({ style: {} })
      },
      focus() {},
      blur() {},
      close() {
        this.closed = true;
      },
      postMessage() {}
    };
  }

  function resolveUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
      return new URL(String(rawUrl), window.location.href);
    } catch {
      return null;
    }
  }

  function isSafeAuthUrl(urlStr) {
    return SAFE_POPUP_PATTERNS.some((re) => re.test(urlStr));
  }

  function isKnownAdUrl(urlStr) {
    return AD_POPUP_PATTERNS.some((re) => re.test(urlStr));
  }

  function clickedOnVideoOrNonLink() {
    if (Date.now() - lastUserClickTime > 1500) return true;
    const el = lastUserClickTarget;
    if (!el || !(el instanceof Element)) return true;
    if (el.closest("video, .vjs-tech, .jwplayer, .plyr, [class*='player']")) {
      return true;
    }
    const anchor = el.closest("a[href]");
    if (!anchor) return true;
    return false;
  }

  function shouldBlockPopup(rawUrl) {
    if (!isGuardActive()) return false;

    const urlStr = rawUrl == null ? "" : String(rawUrl).trim();
    if (urlStr && isSafeAuthUrl(urlStr)) return false;

    // Classic pop-under setup: window.open("") or window.open("about:blank")
    if (!urlStr || urlStr === "about:blank") {
      return clickedOnVideoOrNonLink();
    }

    if (isKnownAdUrl(urlStr)) return true;

    const parsed = resolveUrl(urlStr);
    if (!parsed) return true;

    // Classic pop-under trick: site opens its own current URL in tab 2 and redirects tab 1 to ad
    if (parsed.href === window.location.href) {
      return true;
    }

    // Cross-origin popup triggered from a video or non-link click
    const isCrossOrigin = parsed.origin !== window.location.origin;
    if (isCrossOrigin && clickedOnVideoOrNonLink()) {
      return true;
    }

    return false;
  }

  // 1. Intercept window.open
  const nativeOpen = window.open;
  window.open = function (url, target, features) {
    if (shouldBlockPopup(url)) {
      notifyBlocked();
      return createFakeWindow();
    }
    return nativeOpen.apply(this, arguments);
  };

  // 2. Intercept synthetic hidden/detached <a target="_blank"> clicks
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isGuardActive()) {
      const target = (this.getAttribute("target") || "").toLowerCase();
      const href = this.href || "";
      const isBlank = target === "_blank" || target === "_new";
      const isHiddenOrDetached =
        !this.isConnected || (this.offsetWidth === 0 && this.offsetHeight === 0);

      if (isBlank && isHiddenOrDetached && shouldBlockPopup(href)) {
        notifyBlocked();
        return;
      }
    }
    return nativeAnchorClick.apply(this, arguments);
  };

  // 3. Intercept invisible transparent full-screen click-hijack overlays over videos
  function neutralizeInvisibleOverlays() {
    if (!isGuardActive() || !document.body) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 200 || vh < 200) return;

    const candidates = document.querySelectorAll("div, a, ins");
    for (const el of candidates) {
      if (el.dataset.edgeshieldCheckedOverlay) continue;
      el.dataset.edgeshieldCheckedOverlay = "1";

      const style = getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "absolute") continue;
      const z = parseInt(style.zIndex, 10);
      if (!Number.isFinite(z) || z < 999) continue;

      const rect = el.getBoundingClientRect();
      const coversLargeArea = rect.width >= vw * 0.6 && rect.height >= vh * 0.5;
      if (!coversLargeArea) continue;

      const isTransparent =
        parseFloat(style.opacity) === 0 ||
        (style.backgroundColor === "rgba(0, 0, 0, 0)" &&
          style.backgroundImage === "none" &&
          el.textContent.trim() === "" &&
          el.children.length === 0);

      if (isTransparent) {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("pointer-events", "none", "important");
        notifyBlocked();
      }
    }
  }

  let overlayTimer = null;
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      neutralizeInvisibleOverlays();
      const obs = new MutationObserver(() => {
        if (overlayTimer) return;
        overlayTimer = setTimeout(() => {
          overlayTimer = null;
          neutralizeInvisibleOverlays();
        }, 450);
      });
      if (document.body) {
        obs.observe(document.body, { childList: true, subtree: true });
      }
    },
    { once: true }
  );
})();

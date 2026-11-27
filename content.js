(() => {
  const STYLE_ID = "edgeshield-cosmetic-style";
  const AGGRESSIVE_STYLE_ID = "edgeshield-aggressive-style";
  const CUSTOM_STYLE_ID = "edgeshield-custom-style";
  const COMMUNITY_COSMETIC_STYLE_ID = "edgeshield-community-cosmetic-style";

  const BETTING_AD_RE =
    /(bet\b|bahis|casino|slot|bonus|jackpot|poker|rulet|freespin|denemebonus|canlibahis|pusulabet|venusbet|truvabet|showbahis|evetabi|reklam|sponsor|728x90|468x60|300x250|300x600|160x600|970x90|970x250)/i;
  const REDIRECT_PATH_RE =
    /(\/go\/|\/out\/|\/git\/|\/click\/|\/redirect|\/partner|\/aff|\/r\/|bit\.ly|cutt\.ly|t\.ly|tinyurl|rebrand\.ly|rb\.gy|is\.gd|heylink\.me|linktr\.ee)/i;

  // Bait-prone generic selectors hidden off-screen so offsetHeight stays > 0 (defeats anti-adblock checks)
  const STEALTH_HIDE_SELECTORS = [
    "ins.adsbygoogle",
    ".adsbygoogle",
    ".ad-banner",
    ".ad-container",
    ".ad-wrapper",
    ".ad-placeholder",
    ".ad-slot",
    ".ad_slot",
    ".ad-unit",
    ".ad-box",
    ".ad_box",
    ".ad_container"
  ];

  const COSMETIC_SELECTORS = [
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
    "iframe[src*='trafficjunky']",
    "iframe[src*='adtng.com']",
    "iframe[src*='exosrv.com']",
    "iframe[src*='tjstatic.com']",
    "a[href*='trafficjunky']",
    "a[href*='adtng.com']",
    "a[href*='exoclick.com']",
    "a[href*='juicyads.com']",
    "ins.adsbytrafficjunky",
    ".adsbytrafficjunky",
    ".trafficjunky-float-right",
    "div:has(> ins.adsbytrafficjunky)",
    "div:has(> .adsbytrafficjunky)",
    "li:has(> .adsbytrafficjunky)",
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
    "html > iframe",
    "html > div[style*='2147483647']",
    "[data-cl-overlay]",
    "div[style*='R0lGODlhAQABAIAAAAAAAP']",
    ".samCodeUnit",
    ".samBannerUnit",
    ".samItem",
    ".samTextUnit",
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
    "ytd-enforcement-message-view-model",
    "ytd-rich-item-renderer:has(ytd-ad-slot-renderer)",
    "ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer)",
    "ytd-rich-item-renderer:has(ytd-display-ad-renderer)",
    "ytd-rich-section-renderer:has(ytd-ad-slot-renderer)",
    "ytd-rich-section-renderer:has(ytd-banner-promo-renderer)",
    "#player-ads"
  ];

  const STEALTH_SELECTOR = STEALTH_HIDE_SELECTORS.join(", ");
  const BASE_SELECTOR = COSMETIC_SELECTORS.join(", ");
  const AGGRESSIVE_SELECTOR = AGGRESSIVE_SELECTORS.join(", ");

  let observer = null;
  let scanTimer = null;
  let ytTimer = null;
  let iframeAdTimer = null;
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

  let ytMutedByUs = false;
  let ytSpedUpByUs = false;

  function handleYouTubeAds() {
    if (!isAggressiveActive) return;
    const host = getCurrentHostname();
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return;

    const player = document.querySelector("#movie_player");
    const video = document.querySelector("video.html5-main-video");
    const isAdShowing =
      Boolean(player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")));

    if (!isAdShowing) {
      if (video) {
        if (ytSpedUpByUs) {
          video.playbackRate = 1;
          ytSpedUpByUs = false;
        }
        if (ytMutedByUs) {
          video.muted = false;
          ytMutedByUs = false;
        }
      }
      return;
    }

    const skipBtn = document.querySelector(
      ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button"
    );
    if (skipBtn) {
      skipBtn.click();
      chrome.runtime
        .sendMessage({ type: "COSMETIC_BLOCKED", count: 1 })
        .catch(() => {});
      return;
    }

    if (video) {
      if (!video.muted) {
        video.muted = true;
        ytMutedByUs = true;
      }
      if (video.playbackRate < 16) {
        try {
          video.playbackRate = 16;
          ytSpedUpByUs = true;
        } catch {}
      }
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.max(0, video.duration - 0.05);
      }
    }
  }

  function startYouTubeWatcher() {
    const host = getCurrentHostname();
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return;
    if (ytTimer) return;
    ytTimer = setInterval(handleYouTubeAds, 150);
  }

  function stopYouTubeWatcher() {
    if (ytTimer) {
      clearInterval(ytTimer);
      ytTimer = null;
    }
  }

  const AD_LABEL_ONLY_RE = /^(ad|ads|reklam|reklamlar|advertisement|sponsored|sponsorlu)?$/i;
  const PROTECTED_TAGS = new Set([
    "HTML",
    "BODY",
    "MAIN",
    "HEADER",
    "NAV",
    "FOOTER",
    "FORM",
    "TABLE",
    "TBODY",
    "THEAD",
    "TR"
  ]);

  function isElementHidden(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT") {
      return true;
    }
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) {
      return true;
    }
    const rect = el.getBoundingClientRect();
    return rect.width === 0 || rect.height === 0;
  }

  function collapseEmptyAdAncestors(el) {
    if (!el || !(el instanceof Element)) return;
    let parent = el.parentElement;
    for (let depth = 0; depth < 3 && parent; depth++) {
      if (PROTECTED_TAGS.has(parent.tagName)) break;
      if (parent.id && /^(root|app|__next|content|page|main|wrapper)$/i.test(parent.id)) {
        break;
      }

      const text = (parent.textContent || "").trim();
      if (text.length > 18 || !AD_LABEL_ONLY_RE.test(text)) break;

      const hasVisibleChild = Array.from(parent.children).some((child) => {
        if (child === el) return false;
        const cText = (child.textContent || "").trim();
        if (cText && AD_LABEL_ONLY_RE.test(cText) && child.children.length === 0) {
          return false;
        }
        return !isElementHidden(child);
      });
      if (hasVisibleChild) break;

      parent.style.setProperty("display", "none", "important");
      parent.style.setProperty("min-height", "0", "important");
      parent.style.setProperty("margin", "0", "important");
      parent.style.setProperty("padding", "0", "important");
      parent = parent.parentElement;
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
          collapseEmptyAdAncestors(el);
        }
      }
    } catch {
      // Ignore selector errors on malformed DOMs
    }

    unlockScrollIfLocked();
    hideHeuristicBanners();
    hideAdBadgedCards();
    dismissInPlayerAdOverlays();

    if (newlyHidden > 0) {
      chrome.runtime
        .sendMessage({ type: "COSMETIC_BLOCKED", count: newlyHidden })
        .catch(() => {});
    }
  }

  function hideAdBadgedCards() {
    if (!isAggressiveActive || !document.body) return;
    const BADGE_RE = /^(ad|ads|reklam|ad by .+|ads by .+)$/i;
    const IFRAME_AD_TEXT_RE = /(traffic\s*junky|ad\s+by\s+|ads\s+by\s+|exoclick|juicyads|adsterra)/i;
    let hiddenCount = 0;

    // 1. Inspect accessible same-origin / about:blank / srcdoc iframes from parent page
    try {
      const iframes = document.querySelectorAll("iframe");
      for (const frame of iframes) {
        if (frame.dataset.edgeshieldAdFrameHidden) continue;
        try {
          const doc = frame.contentDocument;
          if (!doc || !doc.body) continue;
          if (doc.querySelector("video")) continue;
          const html = doc.body.innerHTML || "";
          const txt = doc.body.innerText || "";
          if (
            IFRAME_AD_TEXT_RE.test(txt) ||
            /trafficjunky|adtng\.com|exosrv\.com|tjstatic\.com/i.test(html)
          ) {
            frame.dataset.edgeshieldAdFrameHidden = "1";
            frame.style.setProperty("display", "none", "important");
            frame.style.setProperty("pointer-events", "none", "important");
            frame.style.setProperty("height", "0", "important");
            frame.style.setProperty("width", "0", "important");
            collapseEmptyAdAncestors(frame);
            hiddenCount += 1;
          }
        } catch {
          // Cross-origin iframe; handled by content.js running inside that iframe
        }
      }
    } catch {}

    // 2. Scan for Ad / Ad By ... badge elements in current document
    try {
      const nodes = document.querySelectorAll("span, div, a, small, label");
      for (const el of nodes) {
        if (el.dataset.edgeshieldBadgeChecked) continue;
        if (el.children.length > 2) continue;
        const text = (el.textContent || "").trim();
        if (!text || text.length > 32 || !BADGE_RE.test(text)) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || rect.width > 180 || rect.height > 34) {
          continue;
        }

        // If inside a dedicated ad iframe, hide the whole iframe body
        if (window.self !== window.top && !document.querySelector("video")) {
          document.documentElement.style.setProperty("display", "none", "important");
          el.dataset.edgeshieldBadgeChecked = "1";
          hiddenCount += 1;
          continue;
        }

        // Climb to the enclosing square/rectangle ad card containing an image/iframe
        let card = null;
        let cur = el.parentElement;
        for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
          if (PROTECTED_TAGS.has(cur.tagName) || cur.tagName === "ARTICLE") break;
          if (cur.querySelector("video")) break;
          const r = cur.getBoundingClientRect();
          const hasVisual = Boolean(cur.querySelector("img, iframe, picture, canvas"));
          if (
            hasVisual &&
            r.width >= 120 &&
            r.width <= 520 &&
            r.height >= 60 &&
            r.height <= 460
          ) {
            card = cur;
          }
          cur = cur.parentElement;
        }

        el.dataset.edgeshieldBadgeChecked = "1";
        if (card) {
          card.style.setProperty("display", "none", "important");
          card.style.setProperty("pointer-events", "none", "important");
          card.style.setProperty("height", "0", "important");
          card.style.setProperty("width", "0", "important");
          collapseEmptyAdAncestors(card);
          hiddenCount += 1;
        }
      }
    } catch {}

    if (hiddenCount > 0) {
      chrome.runtime
        .sendMessage({ type: "COSMETIC_BLOCKED", count: hiddenCount })
        .catch(() => {});
    }
  }

  const LOCKED_AD_STYLE_ID = "edgeshield-locked-ad-style";
  const lockedAdSelectors = new Set();

  function lockAdSelector(el) {
    // Only lock explicit ad-related IDs/classes; never lock generic :nth-of-type selectors that can hit video controls
    const id = el.id || "";
    if (id && /ad|banner|promo|reklam|sponsor/i.test(id) && !/\d{4,}/.test(id)) {
      const sel = `#${CSS.escape(id)}`;
      if (lockedAdSelectors.has(sel)) return;
      lockedAdSelectors.add(sel);
    } else {
      const adClass = Array.from(el.classList || []).find((c) =>
        /ad[-_]|[-_]ad\b|adbox|adwrap|adoverlay|banner|promo|reklam|sponsor/i.test(c)
      );
      if (!adClass) return;
      const sel = `.${CSS.escape(adClass)}`;
      if (lockedAdSelectors.has(sel)) return;
      lockedAdSelectors.add(sel);
    }
    removeStyle(LOCKED_AD_STYLE_ID);
    injectStyle(
      LOCKED_AD_STYLE_ID,
      `${Array.from(lockedAdSelectors).join(", ")} { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; width: 0 !important; height: 0 !important; }`
    );
  }

  function containsPlayerControls(node) {
    if (!node || node.nodeType !== 1) return false;
    return Boolean(
      node.querySelector(
        "video, input[type='range'], [class*='control'], [class*='progress'], [class*='seek'], [class*='volume'], [class*='fullscreen'], [class*='play-btn'], [aria-label*='Play'], [aria-label*='Pause'], [aria-label*='Mute']"
      )
    );
  }

  function dismissInPlayerAdOverlays() {
    if (!isAggressiveActive || !document.body) return;
    const CLOSE_AD_RE =
      /^(close ad|reklamı kapat|reklami kapat|skip ad|reklamı atla)\s*[×x✕]?$/i;
    let dismissed = 0;
    const now = Date.now();

    try {
      const nodes = document.querySelectorAll("button, a, div, span");
      for (const el of nodes) {
        if (el.children.length > 2) continue;
        const text = (el.textContent || "").trim();
        if (!text || text.length > 22) continue;
        if (!CLOSE_AD_RE.test(text)) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const lastClick = Number(el.dataset.edgeshieldLastClick || 0);
        if (now - lastClick < 500) continue;
        el.dataset.edgeshieldLastClick = String(now);

        // Trigger the player's own close handler so it unlocks video playback & controls cleanly
        try {
          el.click();
        } catch {}

        if (!el.dataset.edgeshieldCloseCounted) {
          el.dataset.edgeshieldCloseCounted = "1";
          dismissed += 1;
        }
      }
    } catch {}

    if (dismissed > 0) {
      chrome.runtime
        .sendMessage({ type: "COSMETIC_BLOCKED", count: dismissed })
        .catch(() => {});
    }
  }

  function hideHeuristicBanners() {
    if (!isAggressiveActive || !document.body) return;
    let hiddenCount = 0;

    try {
      const anchors = document.querySelectorAll("a[href]");
      for (const a of anchors) {
        if (a.dataset.edgeshieldBannerHidden) continue;
        if (a.closest("nav, header")) continue;

        const media = a.querySelector("img, video, picture, canvas");
        const style = getComputedStyle(a);
        const hasBgImage =
          style.backgroundImage && style.backgroundImage !== "none";
        if (!media && !hasBgImage) continue;

        const href = a.href || "";
        const rel = (a.getAttribute("rel") || "").toLowerCase();
        const target = (a.getAttribute("target") || "").toLowerCase();
        const imgSrc = media
          ? media.getAttribute("src") ||
            media.getAttribute("data-src") ||
            media.getAttribute("data-lazy-src") ||
            ""
          : style.backgroundImage;
        const imgAlt = media ? media.getAttribute("alt") || "" : "";

        const isCrossOrigin = (() => {
          try {
            return new URL(href, location.href).origin !== location.origin;
          } catch {
            return false;
          }
        })();

        const matchesBetOrAd =
          BETTING_AD_RE.test(href) ||
          BETTING_AD_RE.test(imgSrc) ||
          BETTING_AD_RE.test(imgAlt);

        const isExternalOrBlank =
          target === "_blank" ||
          target === "_new" ||
          isCrossOrigin ||
          rel.includes("sponsored") ||
          rel.includes("nofollow");

        const isSponsoredRedirect =
          isExternalOrBlank &&
          (REDIRECT_PATH_RE.test(href) || /\.gif(\?|$)/i.test(imgSrc));

        // Wide horizontal image-only banner heuristic (catches self-hosted casino/betting banners with random URLs)
        const rect = (media || a).getBoundingClientRect();
        const isEmptyText = a.textContent.trim().length <= 2;
        const isWideBannerShape =
          rect.width >= 260 &&
          rect.height >= 40 &&
          rect.height <= 165 &&
          rect.width / rect.height >= 2.8;

        const isExternalBannerShape =
          isEmptyText && isWideBannerShape && isExternalOrBlank;

        if (matchesBetOrAd || isSponsoredRedirect || isExternalBannerShape) {
          a.dataset.edgeshieldBannerHidden = "1";
          a.style.setProperty("display", "none", "important");
          a.style.setProperty("pointer-events", "none", "important");
          a.style.setProperty("height", "0", "important");
          a.style.setProperty("width", "0", "important");
          collapseEmptyAdAncestors(a);
          hiddenCount += 1;
        }
      }
    } catch {}

    if (hiddenCount > 0) {
      chrome.runtime
        .sendMessage({ type: "COSMETIC_BLOCKED", count: hiddenCount })
        .catch(() => {});
    }
  }

  // Interactive Element Picker (uBlock-style, with full-screen shield so iframes can be picked too)
  let pickerActive = false;
  let pickerShield = null;
  let pickerOverlay = null;
  let pickerToolbar = null;
  let pickerHoveredEl = null;

  function buildCssSelector(el) {
    if (!el || !(el instanceof Element)) return "";
    if (el.tagName === "IFRAME") {
      const src = el.getAttribute("src") || "";
      try {
        const host = new URL(src, location.href).hostname;
        if (host && host !== location.hostname) {
          return `iframe[src*="${CSS.escape(host)}"]`;
        }
      } catch {}
    }
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && !/\d{4,}/.test(el.id)) {
      return `#${CSS.escape(el.id)}`;
    }
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement && depth < 4) {
      let part = cur.tagName.toLowerCase();
      if (cur.id && /^[a-zA-Z][\w-]*$/.test(cur.id)) {
        part = `#${CSS.escape(cur.id)}`;
        parts.unshift(part);
        break;
      }
      const classes = Array.from(cur.classList)
        .filter((c) => c && !c.startsWith("edgeshield") && c.length < 40)
        .slice(0, 2);
      if (classes.length > 0) {
        part += "." + classes.map((c) => CSS.escape(c)).join(".");
      } else if (cur.parentElement) {
        const siblings = Array.from(cur.parentElement.children).filter(
          (s) => s.tagName === cur.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
      depth += 1;
    }
    return parts.join(" > ");
  }

  function stopElementPicker() {
    if (!pickerActive) return;
    pickerActive = false;
    pickerHoveredEl = null;
    if (pickerShield) {
      pickerShield.remove();
      pickerShield = null;
    }
    if (pickerOverlay) {
      pickerOverlay.remove();
      pickerOverlay = null;
    }
    if (pickerToolbar) {
      pickerToolbar.remove();
      pickerToolbar = null;
    }
    document.removeEventListener("keydown", onPickerKeydown, true);
  }

  function resolvePickTarget(el) {
    if (!el || !(el instanceof Element)) return null;
    const enclosingAnchor = el.closest("a[href]");
    if (enclosingAnchor && enclosingAnchor !== document.body) {
      return enclosingAnchor;
    }
    return el;
  }

  function elementUnderPoint(x, y) {
    if (pickerShield) pickerShield.style.pointerEvents = "none";
    const raw = document.elementFromPoint(x, y);
    if (pickerShield) pickerShield.style.pointerEvents = "auto";
    return raw;
  }

  function onPickerMove(e) {
    if (!pickerActive || !pickerOverlay) return;
    const raw = elementUnderPoint(e.clientX, e.clientY);
    if (!raw || raw === pickerOverlay || raw === pickerShield || raw === pickerToolbar || pickerToolbar?.contains(raw)) {
      return;
    }
    if (raw === document.body || raw === document.documentElement) return;
    const el = resolvePickTarget(raw);
    if (!el) return;
    pickerHoveredEl = el;
    const rect = el.getBoundingClientRect();
    pickerOverlay.style.left = `${rect.left}px`;
    pickerOverlay.style.top = `${rect.top}px`;
    pickerOverlay.style.width = `${rect.width}px`;
    pickerOverlay.style.height = `${rect.height}px`;
    pickerOverlay.style.display = "block";
  }

  function onPickerClick(e) {
    if (!pickerActive) return;
    if (pickerToolbar && pickerToolbar.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const raw = elementUnderPoint(e.clientX, e.clientY);
    const target = resolvePickTarget(pickerHoveredEl || raw);
    stopElementPicker();

    if (target && target instanceof Element) {
      const selector = buildCssSelector(target);
      target.style.setProperty("display", "none", "important");
      target.style.setProperty("pointer-events", "none", "important");
      target.style.setProperty("width", "0", "important");
      target.style.setProperty("height", "0", "important");
      collapseEmptyAdAncestors(target);
      if (selector) {
        const hostname = getCurrentHostname();
        chrome.runtime
          .sendMessage({
            type: "ADD_CUSTOM_SELECTOR",
            domain: hostname,
            selector
          })
          .catch(() => {});
      }
    }
  }

  function onPickerKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      stopElementPicker();
    }
  }

  function startElementPicker() {
    if (window.self !== window.top) return;
    if (pickerActive) return;
    pickerActive = true;

    pickerShield = document.createElement("div");
    pickerShield.id = "edgeshield-picker-shield";
    pickerShield.style.cssText =
      "position:fixed;inset:0;z-index:2147483645;background:transparent;cursor:crosshair;";
    pickerShield.addEventListener("mousemove", onPickerMove, true);
    pickerShield.addEventListener("click", onPickerClick, true);
    document.documentElement.appendChild(pickerShield);

    pickerOverlay = document.createElement("div");
    pickerOverlay.id = "edgeshield-picker-overlay";
    pickerOverlay.style.cssText =
      "position:fixed;z-index:2147483646;pointer-events:none;background:rgba(239,68,68,0.22);border:2px solid #ef4444;border-radius:4px;display:none;box-sizing:border-box;";
    document.documentElement.appendChild(pickerOverlay);

    pickerToolbar = document.createElement("div");
    pickerToolbar.id = "edgeshield-picker-toolbar";
    pickerToolbar.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:10px 14px;font-family:'Segoe UI',sans-serif;font-size:13px;box-shadow:0 10px 25px rgba(0,0,0,0.45);display:flex;align-items:center;gap:10px;";
    pickerToolbar.innerHTML =
      "<span><strong>EdgeShield Öğe Seçici:</strong> Gizlemek istediğin reklama tıkla</span><button id='edgeshield-picker-cancel' style='background:#ef4444;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600;font-size:12px;'>İptal (ESC)</button>";
    document.documentElement.appendChild(pickerToolbar);

    pickerToolbar
      .querySelector("#edgeshield-picker-cancel")
      ?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        stopElementPicker();
      });

    document.addEventListener("keydown", onPickerKeydown, true);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "START_ELEMENT_PICKER") {
      startElementPicker();
    }
  });

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
      " { display: none !important; visibility: hidden !important; pointer-events: none !important; width: 0 !important; height: 0 !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }";
    const stealthCss =
      " { opacity: 0 !important; pointer-events: none !important; position: fixed !important; left: -99999px !important; top: -99999px !important; z-index: -1 !important; }";

    if (isCosmeticActive) {
      injectStyle(STYLE_ID, `${BASE_SELECTOR}${hideCss}\n${STEALTH_SELECTOR}${stealthCss}`);
      chrome.runtime
        .sendMessage({ type: "GET_SITE_COSMETICS", domain: hostname })
        .then((res) => {
          removeStyle(COMMUNITY_COSMETIC_STYLE_ID);
          if (res?.selectors && res.selectors.length > 0 && isCosmeticActive) {
            injectStyle(
              COMMUNITY_COSMETIC_STYLE_ID,
              `${res.selectors.join(", ")}${hideCss}`
            );
          }
        })
        .catch(() => {});
    } else {
      removeStyle(STYLE_ID);
      removeStyle(COMMUNITY_COSMETIC_STYLE_ID);
    }

    if (isAggressiveActive) {
      injectStyle(AGGRESSIVE_STYLE_ID, `${AGGRESSIVE_SELECTOR}${hideCss}`);
      startYouTubeWatcher();
    } else {
      removeStyle(AGGRESSIVE_STYLE_ID);
      stopYouTubeWatcher();
    }

    const siteSelectors =
      allowed && settings.customSelectors && Array.isArray(settings.customSelectors[hostname])
        ? settings.customSelectors[hostname]
        : [];
    removeStyle(CUSTOM_STYLE_ID);
    if (siteSelectors.length > 0) {
      injectStyle(CUSTOM_STYLE_ID, `${siteSelectors.join(", ")}${hideCss}`);
    }

    if (isCosmeticActive || isAggressiveActive) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scanAndReport, {
          once: true
        });
      } else {
        scanAndReport();
      }
      window.addEventListener("load", scanAndReport, { once: true });
      startObserver();
      if (isAggressiveActive && window.self !== window.top && !iframeAdTimer) {
        iframeAdTimer = setInterval(() => {
          dismissInPlayerAdOverlays();
          hideAdBadgedCards();
        }, 300);
      }
    } else {
      stopObserver();
      if (iframeAdTimer) {
        clearInterval(iframeAdTimer);
        iframeAdTimer = null;
      }
    }
  }

  // Tell background when user left-clicks on a video player / non-link so rogue spawned tabs can be closed immediately
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!isPopGuardActive || e.button !== 0) return;
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

      const isInternalNormalLink = (() => {
        if (!anchor) return false;
        const target = (anchor.getAttribute("target") || "").toLowerCase();
        if (target === "_blank" || target === "_new") return false;
        try {
          return new URL(anchor.href, location.href).origin === location.origin;
        } catch {
          return false;
        }
      })();

      if (isVideoArea || isEmptyOverlayAnchor || isInternalNormalLink || !anchor) {
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
    whitelist: [],
    customSelectors: {}
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
      changes.whitelist ||
      changes.customSelectors
    ) {
      chrome.storage.local.get(STORAGE_KEYS, (settings) => {
        applyState(settings);
      });
    }
  });
})();

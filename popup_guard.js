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

  // Active by default until content.js explicitly sets "0" (disabled/whitelisted)
  function isGuardActive() {
    return document.documentElement?.getAttribute(ATTR_GUARD) !== "0";
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

  function isInsideIframe() {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }

  function clickedOnVideoOrNonLink() {
    if (Date.now() - lastUserClickTime > 1500) return true;
    const el = lastUserClickTarget;
    if (!el || !(el instanceof Element)) return true;
    if (
      el.closest(
        "video, .vjs-tech, .video-js, .jwplayer, .plyr, [class*='player'], [id*='player']"
      )
    ) {
      return true;
    }
    const anchor = el.closest("a[href]");
    if (!anchor) return true;
    if (anchor.textContent.trim() === "" && !anchor.querySelector("img, svg")) {
      return true;
    }
    return false;
  }

  function shouldBlockPopup(rawUrl) {
    if (!isGuardActive()) return false;

    const urlStr = rawUrl == null ? "" : String(rawUrl).trim();
    if (urlStr && isSafeAuthUrl(urlStr)) return false;

    if (!urlStr || urlStr === "about:blank") {
      return isInsideIframe() || clickedOnVideoOrNonLink();
    }

    if (isKnownAdUrl(urlStr)) return true;

    const parsed = resolveUrl(urlStr);
    if (!parsed) return true;

    // Pop-under trick: site opens its own current URL in tab 2 and redirects tab 1 to ad
    if (parsed.href === window.location.href) {
      return true;
    }

    const isCrossOrigin = parsed.origin !== window.location.origin;
    if (isCrossOrigin && (isInsideIframe() || clickedOnVideoOrNonLink())) {
      return true;
    }

    return false;
  }

  function maskAsNative(fn, name) {
    try {
      Object.defineProperty(fn, "toString", {
        value: () => `function ${name}() { [native code] }`,
        configurable: true
      });
    } catch {}
    return fn;
  }

  // Anti-adblock JS bait defuser (runs at document_start)
  (function defuseAntiAdblock() {
    try {
      const defineReadOnly = (obj, prop, val) => {
        try {
          Object.defineProperty(obj, prop, {
            get: () => val,
            set: () => {},
            configurable: true
          });
        } catch {}
      };

      defineReadOnly(window, "canRunAds", true);
      defineReadOnly(window, "isAdBlockActive", false);
      defineReadOnly(window, "adblockDetected", false);
      defineReadOnly(window, "adBlockDetected", false);

      const fakeDetector = {
        onDetected() {
          return this;
        },
        onNotDetected(fn) {
          if (typeof fn === "function") setTimeout(fn, 1);
          return this;
        },
        on(detected, fn) {
          if (!detected && typeof fn === "function") setTimeout(fn, 1);
          return this;
        },
        setOption() {
          return this;
        },
        check() {
          return false;
        },
        emitEvent() {
          return this;
        },
        clearEvent() {}
      };

      for (const key of ["fuckAdBlock", "blockAdBlock", "sniffAdBlock"]) {
        defineReadOnly(window, key, fakeDetector);
      }

      // Stealth fetch wrapper + YouTube player JSON ad-stripper
      if (typeof window.fetch === "function") {
        const nativeFetch = window.fetch.bind(window);
        const BAIT_FETCH_RE =
          /(ads|adserver|adservice|pagead|googlesyndication|doubleclick|popads|popcash|propeller|adsterra|exoclick|monetag|clickadu|hilltopads|adcash|admaven|prebid|reklam|adblock|analytics|tracker)/i;
        const isYouTube =
          location.hostname === "youtube.com" ||
          location.hostname.endsWith(".youtube.com");

        const stripYouTubeAds = (obj) => {
          if (!obj || typeof obj !== "object") return obj;
          let stripped = false;
          for (const key of [
            "adPlacements",
            "playerAds",
            "adSlots",
            "adBreakHeartbeatParams"
          ]) {
            if (key in obj) {
              delete obj[key];
              stripped = true;
            }
          }
          if (stripped) notifyBlocked();
          return obj;
        };

        if (isYouTube) {
          let ytPlayerResp = window.ytInitialPlayerResponse;
          if (ytPlayerResp && typeof ytPlayerResp === "object") {
            stripYouTubeAds(ytPlayerResp);
          }
          try {
            Object.defineProperty(window, "ytInitialPlayerResponse", {
              configurable: true,
              get() {
                return ytPlayerResp;
              },
              set(val) {
                ytPlayerResp =
                  isGuardActive() && val && typeof val === "object"
                    ? stripYouTubeAds(val)
                    : val;
              }
            });
          } catch {}
        }

        window.fetch = maskAsNative(function fetch(input, init) {
          const urlStr =
            typeof input === "string"
              ? input
              : input && typeof input.url === "string"
              ? input.url
              : "";

          const promise = nativeFetch(input, init);

          if (
            isYouTube &&
            isGuardActive() &&
            urlStr &&
            /\/youtubei\/v1\/player/i.test(urlStr)
          ) {
            return promise.then(async (res) => {
              try {
                const clone = res.clone();
                const data = await clone.json();
                stripYouTubeAds(data);
                const headers = new Headers(res.headers);
                headers.delete("content-length");
                headers.delete("content-encoding");
                return new Response(JSON.stringify(data), {
                  status: res.status,
                  statusText: res.statusText,
                  headers
                });
              } catch {
                return res;
              }
            });
          }

          return promise.catch((err) => {
            if (isGuardActive() && urlStr && BAIT_FETCH_RE.test(urlStr)) {
              return new Response("/* ok */", {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/javascript" }
              });
            }
            throw err;
          });
        }, "fetch");
      }
    } catch {}
  })();

  // 1. Intercept window.open
  const nativeOpen = window.open;
  window.open = maskAsNative(function open(url) {
    if (shouldBlockPopup(url)) {
      notifyBlocked();
      return createFakeWindow();
    }
    return nativeOpen.apply(this, arguments);
  }, "open");

  // 2. Intercept synthetic hidden/detached <a target="_blank"> clicks
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = maskAsNative(function click() {
    if (isGuardActive()) {
      const target = (this.getAttribute("target") || "").toLowerCase();
      const href = this.href || "";
      const isBlank = target === "_blank" || target === "_new";
      const isHiddenOrDetached =
        !this.isConnected || (this.offsetWidth === 0 && this.offsetHeight === 0);

      if (isBlank && (isHiddenOrDetached || isInsideIframe()) && shouldBlockPopup(href)) {
        notifyBlocked();
        return;
      }
    }
    return nativeAnchorClick.apply(this, arguments);
  }, "click");

  // 3. Intercept <form target="_blank"> ad submissions
  const nativeFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = maskAsNative(function submit() {
    if (isGuardActive()) {
      const target = (this.getAttribute("target") || "").toLowerCase();
      const action = this.getAttribute("action") || "";
      if ((target === "_blank" || target === "_new") && shouldBlockPopup(action)) {
        notifyBlocked();
        return;
      }
    }
    return nativeFormSubmit.apply(this, arguments);
  }, "submit");

  // 4. Intercept real user clicks on invisible/empty <a target="_blank"> overlays over video players
  document.addEventListener(
    "click",
    (e) => {
      lastUserClickTarget = e.target;
      lastUserClickTime = Date.now();
      if (!isGuardActive()) return;
      const el = e.target;
      if (!(el instanceof Element)) return;

      const anchor = el.closest("a[href]");
      if (!anchor) return;

      const target = (anchor.getAttribute("target") || "").toLowerCase();
      const href = anchor.href || "";
      if (!href || isSafeAuthUrl(href)) return;

      const parsed = resolveUrl(href);
      const isCrossOrigin = parsed && parsed.origin !== window.location.origin;
      const isEmptyOverlay =
        anchor.textContent.trim() === "" && !anchor.querySelector("img, svg");

      if (
        (target === "_blank" || target === "_new" || isInsideIframe()) &&
        isCrossOrigin &&
        (isEmptyOverlay || isKnownAdUrl(href))
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        anchor.style.setProperty("display", "none", "important");
        anchor.style.setProperty("pointer-events", "none", "important");
        notifyBlocked();
      }
    },
    true
  );

  // 5. Neutralize invisible transparent click-hijack / leftover blocked-ad overlays
  function isPlayerControlNode(el) {
    if (!el || !(el instanceof Element)) return false;
    return Boolean(
      el.querySelector(
        "video, button, svg, input[type='range'], [class*='control'], [class*='progress'], [class*='volume'], [class*='fullscreen'], [class*='time'], [class*='bar'], [class*='plyr'], [class*='vjs'], [class*='jw-']"
      )
    );
  }

  function hasOnlyEmptyOrHiddenChildren(el) {
    if (el.children.length === 0) return true;
    for (const child of el.children) {
      const r = child.getBoundingClientRect();
      const st = getComputedStyle(child);
      if (st.display !== "none" && st.visibility !== "hidden" && parseFloat(st.opacity) > 0 && r.width > 0 && r.height > 0) {
        return false;
      }
    }
    return true;
  }

  function neutralizeInvisibleOverlays() {
    if (!isGuardActive() || !document.body) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 150 || vh < 150) return;

    const hasVideoOnPage = Boolean(document.querySelector("video"));
    const candidates = document.querySelectorAll("div, a, ins");
    for (const el of candidates) {
      if (el.dataset.edgeshieldCheckedOverlay) continue;
      if (isPlayerControlNode(el)) continue;

      const style = getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "absolute") continue;

      const rect = el.getBoundingClientRect();
      const isLargeOverlay =
        rect.width >= vw * 0.45 && rect.height >= vh * 0.4;
      if (!isLargeOverlay) continue;

      const z = parseInt(style.zIndex, 10) || 0;
      const idClass = `${el.id || ""} ${typeof el.className === "string" ? el.className : ""}`;
      const looksLikeAd = /ad[-_]|[-_]ad\b|adbox|adwrap|adoverlay|banner|promo|pop|reklam/i.test(idClass);

      // On video pages, preserve low-zIndex non-ad <div> layers (player's own play/pause surface)
      if (hasVideoOnPage && el.tagName === "DIV" && !looksLikeAd && z < 50) {
        continue;
      }

      const isEmpty =
        el.textContent.trim() === "" && hasOnlyEmptyOrHiddenChildren(el);
      const isTransparent =
        isEmpty &&
        (parseFloat(style.opacity) === 0 ||
          (style.backgroundColor === "rgba(0, 0, 0, 0)" &&
            style.backgroundImage === "none"));

      if (
        (isTransparent && (el.tagName === "A" || z >= 50 || looksLikeAd)) ||
        (looksLikeAd && isEmpty)
      ) {
        el.dataset.edgeshieldCheckedOverlay = "1";
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("pointer-events", "none", "important");
        notifyBlocked();
      }
    }
  }

  // Also neutralize any high-zIndex empty transparent overlay the instant user tries to click through it
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!isGuardActive() || e.button !== 0) return;
      const el = e.target;
      if (!(el instanceof Element) || el.tagName !== "DIV") return;
      if (isPlayerControlNode(el)) return;
      const st = getComputedStyle(el);
      if (st.position !== "fixed" && st.position !== "absolute") return;
      const z = parseInt(st.zIndex, 10) || 0;
      if (z < 50) return;
      const isEmpty =
        el.textContent.trim() === "" && hasOnlyEmptyOrHiddenChildren(el);
      const isTransparent =
        parseFloat(st.opacity) === 0 ||
        (st.backgroundColor === "rgba(0, 0, 0, 0)" && st.backgroundImage === "none");
      if (isEmpty && isTransparent) {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("pointer-events", "none", "important");
        notifyBlocked();
      }
    },
    true
  );

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

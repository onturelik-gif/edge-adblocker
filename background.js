const DEFAULT_SETTINGS = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  cosmeticFiltering: true,
  aggressiveMode: true,
  blockPopups: true,
  whitelist: [],
  customBlocked: [],
  customSelectors: {},
  totalBlocked: 0
};

const POPUP_AD_PATTERNS = [
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
  /doubleclick\.net/i,
  /googlesyndication\.com/i,
  /popunder/i,
  /\/afu\.php/i,
  /\/go\.php/i
];

const SAFE_NEW_TAB_PATTERNS = [
  /youtube\.com/i,
  /youtu\.be/i,
  /vimeo\.com/i,
  /twitch\.tv/i,
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

const WHITELIST_RULE_START = 10000;
const CUSTOM_BLOCK_RULE_START = 20000;

const tabBlockedCounts = new Map();
const recentSpawnedTabs = new Map();
const lastVideoClickByTab = new Map();
let siteCosmeticsCache = null;

async function getSiteCosmeticsMap() {
  if (siteCosmeticsCache) return siteCosmeticsCache;
  try {
    const res = await fetch(chrome.runtime.getURL("rules/site_cosmetics.json"));
    siteCosmeticsCache = await res.json();
  } catch {
    siteCosmeticsCache = {};
  }
  return siteCosmeticsCache;
}

async function getCosmeticsForDomain(hostname) {
  if (!hostname) return [];
  const map = await getSiteCosmeticsMap();
  const clean = hostname.replace(/^www\./, "").toLowerCase();
  const parts = clean.split(".");
  const selectors = [];
  for (let i = 0; i <= parts.length - 2; i++) {
    const candidate = parts.slice(i).join(".");
    if (Array.isArray(map[candidate])) {
      selectors.push(...map[candidate]);
    }
  }
  return selectors;
}

function isPopupAdUrl(url) {
  if (!url || typeof url !== "string") return false;
  return POPUP_AD_PATTERNS.some((re) => re.test(url));
}

function isSafeNewTabUrl(url) {
  if (!url || typeof url !== "string") return false;
  return SAFE_NEW_TAB_PATTERNS.some((re) => re.test(url));
}

function isCrossSite(urlA, urlB) {
  const hostA = getHostnameFromUrl(urlA);
  const hostB = getHostnameFromUrl(urlB);
  if (!hostA || !hostB) return false;
  return hostA !== hostB && !hostA.endsWith("." + hostB) && !hostB.endsWith("." + hostA);
}

function normalizeDomain(input) {
  if (!input || typeof input !== "string") return "";
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return "";
  return value;
}

function getHostnameFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isDomainWhitelisted(hostname, whitelist) {
  if (!hostname || !Array.isArray(whitelist)) return false;
  return whitelist.some(
    (domain) => hostname === domain || hostname.endsWith("." + domain)
  );
}

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function syncRules(settings) {
  const enableRulesetIds = [];
  const disableRulesetIds = [];

  if (settings.enabled && settings.blockAds) {
    enableRulesetIds.push(
      "ruleset_ads",
      "ruleset_community",
      "ruleset_ublock",
      "ruleset_turkish",
      "ruleset_easylist"
    );
  } else {
    disableRulesetIds.push(
      "ruleset_ads",
      "ruleset_community",
      "ruleset_ublock",
      "ruleset_turkish",
      "ruleset_easylist"
    );
  }

  if (settings.enabled && settings.blockTrackers) {
    enableRulesetIds.push("ruleset_trackers");
  } else {
    disableRulesetIds.push("ruleset_trackers");
  }

  if (settings.enabled && settings.aggressiveMode) {
    enableRulesetIds.push("ruleset_aggressive");
  } else {
    disableRulesetIds.push("ruleset_aggressive");
  }

  if (settings.enabled) {
    enableRulesetIds.push("ruleset_stealth");
  } else {
    disableRulesetIds.push("ruleset_stealth");
  }

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds
  });

  const existingDynamic = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingDynamic.map((r) => r.id);
  const addRules = [];

  if (settings.enabled) {
    settings.whitelist.forEach((domain, idx) => {
      addRules.push({
        id: WHITELIST_RULE_START + idx,
        priority: 100,
        action: { type: "allow" },
        condition: {
          initiatorDomains: [domain, "www." + domain]
        }
      });
    });

    settings.customBlocked.forEach((domain, idx) => {
      addRules.push({
        id: CUSTOM_BLOCK_RULE_START + idx,
        priority: 50,
        action: { type: "block" },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: [
            "script",
            "image",
            "sub_frame",
            "xmlhttprequest",
            "ping",
            "media",
            "other"
          ]
        }
      });
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

async function updateBadgeForTab(tabId, url) {
  if (typeof tabId !== "number" || tabId < 0) return;

  const settings = await getSettings();
  const hostname = getHostnameFromUrl(url);

  try {
    if (!settings.enabled) {
      await chrome.action.setBadgeText({ tabId, text: "OFF" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#64748b" });
      return;
    }

    if (hostname && isDomainWhitelisted(hostname, settings.whitelist)) {
      await chrome.action.setBadgeText({ tabId, text: "" });
      return;
    }

    const count = tabBlockedCounts.get(tabId) || 0;
    const text = count > 999 ? "999+" : count > 0 ? String(count) : "";
    const badgeColor = settings.aggressiveMode ? "#f97316" : "#10b981";
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor });
  } catch {
    // Tab may have been closed before badge update completed
  }
}

async function incrementBlocked(tabId, delta = 1) {
  if (delta <= 0) return;
  const settings = await getSettings();
  const newTotal = (settings.totalBlocked || 0) + delta;
  await chrome.storage.local.set({ totalBlocked: newTotal });

  if (typeof tabId === "number" && tabId >= 0) {
    const prev = tabBlockedCounts.get(tabId) || 0;
    tabBlockedCounts.set(tabId, prev + delta);
    try {
      const tab = await chrome.tabs.get(tabId);
      await updateBadgeForTab(tabId, tab.url);
    } catch {
      // Tab no longer exists
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set(settings);
  await syncRules(settings);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await syncRules(settings);
});

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const ruleId = info?.rule?.ruleId;
    const isAllowRule =
      ruleId >= WHITELIST_RULE_START && ruleId < CUSTOM_BLOCK_RULE_START;
    if (isAllowRule) return;

    const tabId = info?.request?.tabId;
    incrementBlocked(tabId, 1);
  });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    tabBlockedCounts.set(tabId, 0);
  }

  if (changeInfo.url) {
    const now = Date.now();
    const spawned = recentSpawnedTabs.get(tabId);
    if (spawned && now - spawned.createdAt < 4000) {
      const shouldKill =
        isPopupAdUrl(changeInfo.url) ||
        (spawned.suspicious &&
          isCrossSite(spawned.sourceUrl, changeInfo.url) &&
          !isSafeNewTabUrl(changeInfo.url));

      if (shouldKill) {
        recentSpawnedTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
        chrome.tabs.update(spawned.sourceTabId, { active: true }).catch(() => {});
        incrementBlocked(spawned.sourceTabId, 1);
        return;
      }
    }

    // Pop-under reversal: if source tab spawned a clone of itself and then redirected to another domain (ad), close the ad tab
    for (const [childTabId, info] of recentSpawnedTabs.entries()) {
      if (
        info.sourceTabId === tabId &&
        info.sameUrlAsSource &&
        now - info.createdAt < 2500
      ) {
        const prevHost = getHostnameFromUrl(info.sourceUrl);
        const nextHost = getHostnameFromUrl(changeInfo.url);
        if (prevHost && nextHost && prevHost !== nextHost) {
          recentSpawnedTabs.delete(childTabId);
          chrome.tabs.remove(tabId).catch(() => {});
          chrome.tabs.update(childTabId, { active: true }).catch(() => {});
          incrementBlocked(childTabId, 1);
          return;
        }
      }
    }
  }

  if (changeInfo.status === "loading" || changeInfo.status === "complete") {
    updateBadgeForTab(tabId, tab.url);
  }
});

if (chrome.webNavigation && chrome.webNavigation.onCreatedNavigationTarget) {
  chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
    const settings = await getSettings();
    if (!settings.enabled || !settings.blockPopups) return;

    const sourceTab = await chrome.tabs.get(details.sourceTabId).catch(() => null);
    if (!sourceTab?.url) return;

    const sourceHost = getHostnameFromUrl(sourceTab.url);
    if (isDomainWhitelisted(sourceHost, settings.whitelist)) return;

    const fromSubframe = details.sourceFrameId !== 0;
    const lastVideoClick = lastVideoClickByTab.get(details.sourceTabId) || 0;
    const fromRecentVideoClick = Date.now() - lastVideoClick < 1500;
    const suspicious = fromSubframe || fromRecentVideoClick;

    const targetIsCrossSite = isCrossSite(sourceTab.url, details.url);
    const shouldBlockImmediately =
      isPopupAdUrl(details.url) ||
      (suspicious && targetIsCrossSite && !isSafeNewTabUrl(details.url));

    if (shouldBlockImmediately) {
      chrome.tabs.remove(details.tabId).catch(() => {});
      chrome.tabs.update(details.sourceTabId, { active: true }).catch(() => {});
      incrementBlocked(details.sourceTabId, 1);
      return;
    }

    recentSpawnedTabs.set(details.tabId, {
      sourceTabId: details.sourceTabId,
      sourceUrl: sourceTab.url,
      sameUrlAsSource: details.url === sourceTab.url,
      suspicious,
      createdAt: Date.now()
    });
  });
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateBadgeForTab(tabId, tab.url);
  } catch {
    // Ignore inaccessible tabs
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabBlockedCounts.delete(tabId);
  recentSpawnedTabs.delete(tabId);
  lastVideoClickByTab.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const settings = await getSettings();

    switch (message?.type) {
      case "GET_STATE": {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        const hostname = getHostnameFromUrl(activeTab?.url || "");
        const tabId = activeTab?.id ?? -1;
        const tabCount = tabBlockedCounts.get(tabId) || 0;
        sendResponse({
          settings,
          hostname,
          tabId,
          tabCount,
          isWhitelisted: isDomainWhitelisted(hostname, settings.whitelist)
        });
        break;
      }

      case "UPDATE_SETTINGS": {
        const updated = { ...settings, ...message.patch };
        await chrome.storage.local.set(updated);
        await syncRules(updated);

        const tabs = await chrome.tabs.query({});
        for (const t of tabs) {
          if (t.id !== undefined) {
            updateBadgeForTab(t.id, t.url);
          }
        }
        sendResponse({ ok: true, settings: updated });
        break;
      }

      case "TOGGLE_WHITELIST": {
        const domain = normalizeDomain(message.domain);
        if (!domain) {
          sendResponse({ ok: false, error: "Geçersiz alan adı." });
          return;
        }
        const exists = settings.whitelist.includes(domain);
        const whitelist = exists
          ? settings.whitelist.filter((d) => d !== domain)
          : [...settings.whitelist, domain];

        const updated = { ...settings, whitelist };
        await chrome.storage.local.set(updated);
        await syncRules(updated);

        if (typeof message.tabId === "number" && message.tabId >= 0) {
          tabBlockedCounts.set(message.tabId, 0);
          const tab = await chrome.tabs.get(message.tabId).catch(() => null);
          if (tab) {
            await updateBadgeForTab(message.tabId, tab.url);
          }
        }

        sendResponse({
          ok: true,
          whitelisted: !exists,
          settings: updated
        });
        break;
      }

      case "ADD_CUSTOM_DOMAIN": {
        const domain = normalizeDomain(message.domain);
        if (!domain) {
          sendResponse({
            ok: false,
            error: "Geçerli bir alan adı girin (ör. reklam.com)."
          });
          return;
        }
        if (settings.customBlocked.includes(domain)) {
          sendResponse({
            ok: false,
            error: "Bu alan adı zaten engelleme listesinde."
          });
          return;
        }
        const updated = {
          ...settings,
          customBlocked: [domain, ...settings.customBlocked]
        };
        await chrome.storage.local.set(updated);
        await syncRules(updated);
        sendResponse({ ok: true, settings: updated });
        break;
      }

      case "REMOVE_CUSTOM_DOMAIN": {
        const domain = normalizeDomain(message.domain);
        const updated = {
          ...settings,
          customBlocked: settings.customBlocked.filter((d) => d !== domain)
        };
        await chrome.storage.local.set(updated);
        await syncRules(updated);
        sendResponse({ ok: true, settings: updated });
        break;
      }

      case "GET_SITE_COSMETICS": {
        const selectors = await getCosmeticsForDomain(message.domain);
        sendResponse({ selectors });
        break;
      }

      case "USER_VIDEO_CLICK": {
        const tabId = sender?.tab?.id;
        if (typeof tabId === "number" && tabId >= 0) {
          lastVideoClickByTab.set(tabId, Date.now());
        }
        sendResponse({ ok: true });
        break;
      }

      case "ADD_CUSTOM_SELECTOR": {
        const domain = normalizeDomain(message.domain);
        const selector =
          typeof message.selector === "string" ? message.selector.trim() : "";
        if (!domain || !selector) {
          sendResponse({ ok: false });
          return;
        }
        const map = { ...(settings.customSelectors || {}) };
        const existing = Array.isArray(map[domain]) ? map[domain] : [];
        if (!existing.includes(selector)) {
          map[domain] = [...existing, selector];
          await chrome.storage.local.set({ ...settings, customSelectors: map });
        }
        const tabId = sender?.tab?.id;
        if (typeof tabId === "number") {
          await incrementBlocked(tabId, 1);
        }
        sendResponse({ ok: true });
        break;
      }

      case "CLEAR_SITE_SELECTORS": {
        const domain = normalizeDomain(message.domain);
        if (!domain) {
          sendResponse({ ok: false });
          return;
        }
        const map = { ...(settings.customSelectors || {}) };
        delete map[domain];
        const updated = { ...settings, customSelectors: map };
        await chrome.storage.local.set(updated);
        sendResponse({ ok: true, settings: updated });
        break;
      }

      case "COSMETIC_BLOCKED": {
        const count = Number(message.count) || 0;
        const tabId = sender?.tab?.id;
        if (count > 0 && typeof tabId === "number") {
          await incrementBlocked(tabId, count);
        }
        sendResponse({ ok: true });
        break;
      }

      case "RESET_STATS": {
        const updated = { ...settings, totalBlocked: 0 };
        await chrome.storage.local.set(updated);
        sendResponse({ ok: true, settings: updated });
        break;
      }

      default:
        sendResponse({ ok: false, error: "Bilinmeyen işlem." });
    }
  })();

  return true;
});

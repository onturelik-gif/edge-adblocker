const DEFAULT_SETTINGS = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  cosmeticFiltering: true,
  aggressiveMode: true,
  whitelist: [],
  customBlocked: [],
  totalBlocked: 0
};

const WHITELIST_RULE_START = 10000;
const CUSTOM_BLOCK_RULE_START = 20000;

const tabBlockedCounts = new Map();

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
    enableRulesetIds.push("ruleset_ads");
  } else {
    disableRulesetIds.push("ruleset_ads");
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    tabBlockedCounts.set(tabId, 0);
  }
  if (changeInfo.status === "loading" || changeInfo.status === "complete") {
    updateBadgeForTab(tabId, tab.url);
  }
});

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

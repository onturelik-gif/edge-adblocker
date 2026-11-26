const els = {
  logoBadge: document.getElementById("logoBadge"),
  aggressiveBadge: document.getElementById("aggressiveBadge"),
  globalToggle: document.getElementById("globalToggle"),
  siteDomain: document.getElementById("siteDomain"),
  statusPill: document.getElementById("statusPill"),
  whitelistBtn: document.getElementById("whitelistBtn"),
  pickerBtn: document.getElementById("pickerBtn"),
  clearPickedBtn: document.getElementById("clearPickedBtn"),
  pickedCount: document.getElementById("pickedCount"),
  pageBlockedCount: document.getElementById("pageBlockedCount"),
  totalBlockedCount: document.getElementById("totalBlockedCount"),
  resetStatsBtn: document.getElementById("resetStatsBtn"),
  aggressiveToggle: document.getElementById("aggressiveToggle"),
  popupsToggle: document.getElementById("popupsToggle"),
  adsToggle: document.getElementById("adsToggle"),
  trackersToggle: document.getElementById("trackersToggle"),
  cosmeticToggle: document.getElementById("cosmeticToggle"),
  addDomainForm: document.getElementById("addDomainForm"),
  customDomainInput: document.getElementById("customDomainInput"),
  formError: document.getElementById("formError"),
  customList: document.getElementById("customList"),
  customCount: document.getElementById("customCount"),
  whitelistList: document.getElementById("whitelistList"),
  whitelistCount: document.getElementById("whitelistCount"),
  tabs: document.querySelectorAll(".tab"),
  panels: {
    protection: document.getElementById("panel-protection"),
    rules: document.getElementById("panel-rules")
  }
};

let currentState = null;

function formatNumber(n) {
  return Number(n || 0).toLocaleString("tr-TR");
}

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      resolve(response);
    });
  });
}

function renderList(container, items, emptyText, onRemove) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = emptyText;
    container.appendChild(li);
    return;
  }

  items.forEach((domain) => {
    const li = document.createElement("li");
    li.className = "domain-item";

    const span = document.createElement("span");
    span.textContent = domain;

    const btn = document.createElement("button");
    btn.className = "btn-remove";
    btn.type = "button";
    btn.title = "Kaldır";
    btn.textContent = "×";
    btn.addEventListener("click", () => onRemove(domain));

    li.appendChild(span);
    li.appendChild(btn);
    container.appendChild(li);
  });
}

function render(state) {
  currentState = state;
  const { settings, hostname, tabCount, isWhitelisted } = state;

  els.globalToggle.checked = settings.enabled;
  const isAggOn = settings.enabled && Boolean(settings.aggressiveMode);
  els.logoBadge.classList.toggle("paused", !settings.enabled);
  els.logoBadge.classList.toggle("aggressive", isAggOn);
  els.aggressiveBadge.classList.toggle("hidden", !isAggOn);

  els.aggressiveToggle.checked = Boolean(settings.aggressiveMode);
  els.popupsToggle.checked = Boolean(settings.blockPopups);
  els.adsToggle.checked = settings.blockAds;
  els.trackersToggle.checked = settings.blockTrackers;
  els.cosmeticToggle.checked = settings.cosmeticFiltering;

  els.aggressiveToggle.disabled = !settings.enabled;
  els.popupsToggle.disabled = !settings.enabled;
  els.adsToggle.disabled = !settings.enabled;
  els.trackersToggle.disabled = !settings.enabled;
  els.cosmeticToggle.disabled = !settings.enabled;

  els.pageBlockedCount.textContent = formatNumber(tabCount);
  els.totalBlockedCount.textContent = formatNumber(settings.totalBlocked);

  if (!hostname) {
    els.siteDomain.textContent = "Tarayıcı Sayfası";
    els.whitelistBtn.disabled = true;
    els.pickerBtn.disabled = true;
    els.clearPickedBtn.classList.add("hidden");
    els.whitelistBtn.textContent = "Kullanılamaz";
    els.statusPill.textContent = settings.enabled ? "Hazır" : "Duraklatıldı";
    els.statusPill.className =
      "status-pill" + (settings.enabled ? "" : " paused");
  } else {
    els.siteDomain.textContent = hostname;
    els.whitelistBtn.disabled = !settings.enabled;
    els.pickerBtn.disabled = !settings.enabled || isWhitelisted;

    const picked =
      settings.customSelectors && Array.isArray(settings.customSelectors[hostname])
        ? settings.customSelectors[hostname].length
        : 0;
    els.pickedCount.textContent = String(picked);
    els.clearPickedBtn.classList.toggle("hidden", picked === 0);

    if (!settings.enabled) {
      els.statusPill.textContent = "Duraklatıldı";
      els.statusPill.className = "status-pill paused";
      els.whitelistBtn.textContent = "Koruma Kapalı";
    } else if (isWhitelisted) {
      els.statusPill.textContent = "İzin Verildi";
      els.statusPill.className = "status-pill whitelisted";
      els.whitelistBtn.textContent = "Korumayı Aç";
    } else {
      els.statusPill.textContent = "Korunuyor";
      els.statusPill.className = "status-pill";
      els.whitelistBtn.textContent = "Sitede Duraklat";
    }
  }

  els.customCount.textContent = String(settings.customBlocked.length);
  els.whitelistCount.textContent = String(settings.whitelist.length);

  renderList(
    els.customList,
    settings.customBlocked,
    "Özel engellenen alan adı yok.",
    async (domain) => {
      await sendMessage({ type: "REMOVE_CUSTOM_DOMAIN", domain });
      await loadState();
    }
  );

  renderList(
    els.whitelistList,
    settings.whitelist,
    "Beyaz listede site yok.",
    async (domain) => {
      await sendMessage({ type: "TOGGLE_WHITELIST", domain });
      await loadState();
    }
  );
}

async function loadState() {
  const state = await sendMessage({ type: "GET_STATE" });
  if (state) render(state);
}

els.tabs.forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    const target = tabBtn.dataset.tab;
    els.tabs.forEach((t) => t.classList.toggle("active", t === tabBtn));
    Object.entries(els.panels).forEach(([key, panel]) => {
      panel.classList.toggle("active", key === target);
    });
  });
});

els.globalToggle.addEventListener("change", async () => {
  await sendMessage({
    type: "UPDATE_SETTINGS",
    patch: { enabled: els.globalToggle.checked }
  });
  await loadState();
});

els.aggressiveToggle.addEventListener("change", async () => {
  await sendMessage({
    type: "UPDATE_SETTINGS",
    patch: { aggressiveMode: els.aggressiveToggle.checked }
  });
  await loadState();
});

els.popupsToggle.addEventListener("change", async () => {
  await sendMessage({
    type: "UPDATE_SETTINGS",
    patch: { blockPopups: els.popupsToggle.checked }
  });
  await loadState();
});

els.adsToggle.addEventListener("change", async () => {
  await sendMessage({
    type: "UPDATE_SETTINGS",
    patch: { blockAds: els.adsToggle.checked }
  });
  await loadState();
});

els.trackersToggle.addEventListener("change", async () => {
  await sendMessage({
    type: "UPDATE_SETTINGS",
    patch: { blockTrackers: els.trackersToggle.checked }
  });
  await loadState();
});

els.cosmeticToggle.addEventListener("change", async () => {
  await sendMessage({
    type: "UPDATE_SETTINGS",
    patch: { cosmeticFiltering: els.cosmeticToggle.checked }
  });
  await loadState();
});

els.whitelistBtn.addEventListener("click", async () => {
  if (!currentState?.hostname) return;
  const res = await sendMessage({
    type: "TOGGLE_WHITELIST",
    domain: currentState.hostname,
    tabId: currentState.tabId
  });
  if (res?.ok && currentState.tabId >= 0) {
    chrome.tabs.reload(currentState.tabId);
  }
  await loadState();
});

els.pickerBtn.addEventListener("click", async () => {
  if (!currentState || currentState.tabId < 0) return;
  chrome.tabs.sendMessage(currentState.tabId, { type: "START_ELEMENT_PICKER" }).catch(() => {});
  window.close();
});

els.clearPickedBtn.addEventListener("click", async () => {
  if (!currentState?.hostname) return;
  await sendMessage({
    type: "CLEAR_SITE_SELECTORS",
    domain: currentState.hostname
  });
  if (currentState.tabId >= 0) {
    chrome.tabs.reload(currentState.tabId);
  }
  await loadState();
});

els.resetStatsBtn.addEventListener("click", async () => {
  await sendMessage({ type: "RESET_STATS" });
  await loadState();
});

els.addDomainForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.formError.textContent = "";
  const domain = els.customDomainInput.value.trim();
  if (!domain) return;

  const res = await sendMessage({ type: "ADD_CUSTOM_DOMAIN", domain });
  if (!res?.ok) {
    els.formError.textContent = res?.error || "Alan adı eklenemedi.";
    return;
  }

  els.customDomainInput.value = "";
  await loadState();
});

loadState();

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const RULES_DIR = path.join(ROOT, "rules");

const SOURCES = [
  {
    name: "ublock",
    urls: [
      "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
      "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt",
      "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt"
    ],
    outFile: "ublock_rules.json",
    startId: 50000,
    maxRules: 10000,
    collectCosmetics: true
  },
  {
    name: "turkish",
    urls: ["https://filters.adtidy.org/extension/ublock/filters/13.txt"],
    outFile: "turkish_rules.json",
    startId: 70000,
    maxRules: 4000,
    collectCosmetics: true
  },
  {
    name: "easylist",
    urls: ["https://easylist.to/easylist/easylist.txt"],
    outFile: "easylist_rules.json",
    startId: 80000,
    maxRules: 10000,
    collectCosmetics: false
  }
];

const RESOURCE_MAP = {
  script: "script",
  image: "image",
  stylesheet: "stylesheet",
  subdocument: "sub_frame",
  frame: "sub_frame",
  xmlhttprequest: "xmlhttprequest",
  xhr: "xmlhttprequest",
  media: "media",
  font: "font",
  ping: "ping",
  other: "other"
};

const DEFAULT_TYPES = [
  "script",
  "image",
  "sub_frame",
  "xmlhttprequest",
  "ping",
  "media",
  "other"
];

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    https
      .get(
        url,
        { headers: { "User-Agent": "EdgeShield-FilterBuilder/2.0" }, timeout: 25000 },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            return resolve(fetchText(res.headers.location, redirects + 1));
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        }
      )
      .on("error", reject);
  });
}

function isAscii(str) {
  return /^[\x20-\x7E]+$/.test(str);
}

function isValidDomain(d) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d);
}

function isPureCssSelector(sel) {
  if (!sel || sel.length > 220) return false;
  if (
    /(:has-text|:xpath|:upward|:matches-css|:style\(|:remove\(|:min-text-length|\+js\(|##\^|#@#)/i.test(
      sel
    )
  ) {
    return false;
  }
  return true;
}

function parseNetworkRule(line, id) {
  if (
    !line ||
    line.startsWith("!") ||
    line.startsWith("[") ||
    line.startsWith("@@") ||
    line.includes("##") ||
    line.includes("#@#") ||
    line.includes("#?#") ||
    line.includes("#$#")
  ) {
    return null;
  }

  let pattern = line;
  let optionsStr = "";
  const dollarIdx = line.lastIndexOf("$");
  if (dollarIdx > 0) {
    pattern = line.slice(0, dollarIdx);
    optionsStr = line.slice(dollarIdx + 1);
  }

  // Skip regex rules (/.../) and overly generic short patterns
  if (
    !pattern ||
    (pattern.startsWith("/") && pattern.endsWith("/")) ||
    pattern.length < 6 ||
    !isAscii(pattern)
  ) {
    return null;
  }

  // Prefer clean domain/anchored rules (||domain^ or ||domain/path)
  if (!pattern.startsWith("||")) return null;
  if (pattern.includes(" ") || pattern.includes("|", 2)) return null;

  const condition = { urlFilter: pattern };
  const types = new Set();
  const excludedTypes = new Set();
  const incDomains = [];
  const excDomains = [];

  if (optionsStr) {
    const opts = optionsStr.split(",");
    for (const rawOpt of opts) {
      const opt = rawOpt.trim();
      if (!opt) continue;
      const lower = opt.toLowerCase();

      // Skip unsupported/complex uBlock modifiers
      if (
        lower.startsWith("redirect") ||
        lower.startsWith("csp") ||
        lower.startsWith("removeparam") ||
        lower.startsWith("replace") ||
        lower === "document" ||
        lower === "doc" ||
        lower === "popup" ||
        lower === "popunder" ||
        lower === "badfilter" ||
        lower === "important" && false
      ) {
        if (lower !== "important") return null;
      }

      if (lower === "third-party" || lower === "3p") {
        condition.domainType = "thirdParty";
      } else if (lower === "~third-party" || lower === "first-party" || lower === "1p") {
        condition.domainType = "firstParty";
      } else if (lower.startsWith("domain=")) {
        const list = opt.slice(7).split("|");
        for (const item of list) {
          const d = item.trim().toLowerCase();
          if (!d || d.includes("*") || d.includes("/")) continue;
          if (d.startsWith("~")) {
            const clean = d.slice(1);
            if (isValidDomain(clean)) excDomains.push(clean);
          } else if (isValidDomain(d)) {
            incDomains.push(d);
          }
        }
      } else if (lower.startsWith("~") && RESOURCE_MAP[lower.slice(1)]) {
        excludedTypes.add(RESOURCE_MAP[lower.slice(1)]);
      } else if (RESOURCE_MAP[lower]) {
        types.add(RESOURCE_MAP[lower]);
      }
    }
  }

  if (types.size > 0) {
    condition.resourceTypes = Array.from(types);
  } else if (excludedTypes.size > 0) {
    const filtered = DEFAULT_TYPES.filter((t) => !excludedTypes.has(t));
    if (filtered.length === 0) return null;
    condition.resourceTypes = filtered;
  } else {
    condition.resourceTypes = DEFAULT_TYPES;
  }

  if (incDomains.length > 0) condition.initiatorDomains = incDomains;
  if (excDomains.length > 0) condition.excludedInitiatorDomains = excDomains;

  return {
    id,
    priority: 1,
    action: { type: "block" },
    condition
  };
}

async function main() {
  const globalSeen = new Set();
  const siteCosmetics = {};

  // Seed with existing rules so we don't duplicate
  for (const existingFile of [
    "ad_rules.json",
    "tracker_rules.json",
    "aggressive_rules.json",
    "community_rules.json"
  ]) {
    const full = path.join(RULES_DIR, existingFile);
    if (fs.existsSync(full)) {
      for (const r of JSON.parse(fs.readFileSync(full, "utf8"))) {
        if (r.condition?.urlFilter) globalSeen.add(r.condition.urlFilter);
      }
    }
  }

  for (const src of SOURCES) {
    console.log(`Downloading ${src.name}...`);
    let combinedText = "";
    for (const url of src.urls) {
      const txt = await fetchText(url);
      combinedText += "\n" + txt;
    }

    const lines = combinedText.split(/\r?\n/);
    const compiled = [];
    let id = src.startId;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("!") || line.startsWith("[")) continue;

      // Collect site-specific pure CSS cosmetic rules
      if (src.collectCosmetics && line.includes("##") && !line.includes("#@#") && !line.includes("#?#")) {
        const idx = line.indexOf("##");
        const domainsPart = line.slice(0, idx).trim();
        const selector = line.slice(idx + 2).trim();
        if (domainsPart && isPureCssSelector(selector)) {
          const domains = domainsPart
            .split(",")
            .map((d) => d.trim().toLowerCase())
            .filter((d) => d && !d.startsWith("~") && isValidDomain(d));
          for (const d of domains) {
            if (!siteCosmetics[d]) siteCosmetics[d] = [];
            if (siteCosmetics[d].length < 25 && !siteCosmetics[d].includes(selector)) {
              siteCosmetics[d].push(selector);
            }
          }
        }
        continue;
      }

      if (compiled.length >= src.maxRules) continue;
      const rule = parseNetworkRule(line, id);
      if (!rule) continue;

      const dedupKey =
        rule.condition.urlFilter +
        "|" +
        (rule.condition.domainType || "") +
        "|" +
        (rule.condition.initiatorDomains || []).join(",");
      if (globalSeen.has(dedupKey) || globalSeen.has(rule.condition.urlFilter)) {
        continue;
      }

      globalSeen.add(dedupKey);
      compiled.push(rule);
      id += 1;
    }

    const outPath = path.join(RULES_DIR, src.outFile);
    fs.writeFileSync(outPath, JSON.stringify(compiled) + "\n", "utf8");
    console.log(`Wrote ${src.outFile}: ${compiled.length} network rules`);
  }

  const cosmeticOut = path.join(RULES_DIR, "site_cosmetics.json");
  fs.writeFileSync(cosmeticOut, JSON.stringify(siteCosmetics) + "\n", "utf8");
  console.log(
    `Wrote site_cosmetics.json: ${Object.keys(siteCosmetics).length} domains`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

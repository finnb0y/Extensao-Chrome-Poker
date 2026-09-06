const TABLE_SELECTOR = "#table_cash_registros";
const OBS_CACHE = new Map();
const DEBUG = false;
let observer = null;
let latestRows = [];

function log(...args) {
  if (DEBUG) console.log("[PokerExtractor]", ...args);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatMoney(value) {
  const text = cleanText(value);
  if (!text) return "";
  const only = text.replace(/[^\d,.\-]/g, "");
  const num = Number(only.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(num)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num)
    : text;
}

function hasPhoneLike(value) {
  return /\d{2}\s?\d{4,5}-?\d{4}/.test(String(value || ""));
}

function getCandidateKeysFromElement(element) {
  if (!element) return [];
  const keys = [];
  const attrs = element.getAttributeNames ? element.getAttributeNames() : [];
  for (const attr of attrs) {
    const v = cleanText(element.getAttribute(attr));
    if (v) keys.push(v);
  }
  if (element.dataset) {
    for (const v of Object.values(element.dataset)) {
      const text = cleanText(v);
      if (text) keys.push(text);
    }
  }
  return [...new Set(keys)];
}

function extractObsFromDomCell(cell) {
  if (!cell) return "";
  const attrCandidates = [
    "title",
    "data-bs-original-title",
    "data-original-title",
    "data-content",
    "aria-label",
    "data-obs"
  ];

  for (const attr of attrCandidates) {
    const value = cleanText(cell.getAttribute(attr));
    if (value && value !== "..." && value !== "-") return value;
  }

  const inner = cell.querySelector(
    "[title],[data-bs-original-title],[data-original-title],[data-content],[aria-label],[data-obs]"
  );
  if (inner) {
    for (const attr of attrCandidates) {
      const value = cleanText(inner.getAttribute(attr));
      if (value && value !== "..." && value !== "-") return value;
    }
  }

  const hiddenNode = cell.querySelector(
    "[hidden], .sr-only, .visually-hidden, [style*='display:none'], [style*='visibility:hidden']"
  );
  if (hiddenNode) {
    const hiddenText = cleanText(hiddenNode.textContent);
    if (hiddenText && hiddenText !== "...") return hiddenText;
  }

  const text = cleanText(cell.textContent);
  return text && text !== "..." ? text : "";
}

function rememberObs(keys, obs) {
  const value = cleanText(obs);
  if (!value) return;
  for (const key of keys) {
    const normalized = normalize(key);
    if (normalized) OBS_CACHE.set(normalized, value);
  }
}

function readObsFromCache(keys) {
  for (const key of keys) {
    const found = OBS_CACHE.get(normalize(key));
    if (found) return found;
  }
  return "";
}

function splitName(registro) {
  const text = cleanText(registro);
  if (!text) return "";
  return text.split(" - ")[0].trim();
}

function getRows() {
  const table = document.querySelector(TABLE_SELECTOR);
  if (!table) return [];
  const rows = Array.from(table.querySelectorAll("tbody tr"));

  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (!cells.length) return null;

      const hrE = cleanText(cells[0]?.textContent);
      const registro = cleanText(cells[1]?.textContent);
      const mesa = cleanText(cells[2]?.textContent);
      const gameID = cleanText(cells[3]?.textContent);
      const c = cleanText(cells[4]?.textContent);
      const d = cleanText(cells[5]?.textContent);
      const s = cleanText(cells[6]?.textContent);
      const saldoCashGame = formatMoney(cells[10]?.textContent);
      const saldosOutros = formatMoney(cells[11]?.textContent);
      const saldoFinal = formatMoney(cells[12]?.textContent);
      const obsCell = cells[13];

      const directObs = extractObsFromDomCell(obsCell);
      const trKeys = getCandidateKeysFromElement(row);
      const obsKeys = getCandidateKeysFromElement(obsCell);
      const name = splitName(registro);

      const lookupKeys = [
        ...trKeys,
        ...obsKeys,
        registro,
        name,
        gameID,
        `${name}:${gameID}`
      ].filter(Boolean);

      if (directObs) rememberObs(lookupKeys, directObs);
      const cachedObs = readObsFromCache(lookupKeys);
      const obs = cleanText(directObs || cachedObs);

      return {
        HrE: hrE,
        Mesa: mesa,
        GameID: gameID,
        Nome: name || registro,
        C: c,
        D: d,
        S: s,
        "Saldo/CashGame": saldoCashGame,
        "Saldos/Outros": saldosOutros,
        "Saldo/Final": saldoFinal,
        Obs: obs
      };
    })
    .filter(Boolean);
}

function injectPageHook() {
  if (document.getElementById("__pokerExtractorHook")) return;
  const script = document.createElement("script");
  script.id = "__pokerExtractorHook";
  script.src = chrome.runtime.getURL("page-hook.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function handlePageMessages(event) {
  if (event.source !== window) return;
  if (event.data?.type !== "POKER_OBS_DISCOVERED") return;
  const entries = event.data.entries || [];
  for (const entry of entries) {
    if (!entry?.obs) continue;
    const keys = Array.isArray(entry.keys) ? entry.keys : [];
    rememberObs([...keys, entry.obs], entry.obs);
  }
  latestRows = getRows();
  log("Obs cache updated from network:", entries.length);
}

async function isEnabledForCurrentOrigin() {
  const { enabledOrigins = [] } = await chrome.storage.local.get("enabledOrigins");
  return enabledOrigins.includes(window.location.origin);
}

async function collectIfEnabled() {
  if (!(await isEnabledForCurrentOrigin())) return;
  latestRows = getRows();
}

function setupObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    collectIfEnabled();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "COLLECT_NOW") return false;
  isEnabledForCurrentOrigin()
    .then((enabled) => {
      if (!enabled) {
        sendResponse({ ok: false, error: "Ative a coleta para este site no popup." });
        return;
      }
      latestRows = getRows();
      sendResponse({ ok: true, rows: latestRows });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

window.addEventListener("message", handlePageMessages);
injectPageHook();
collectIfEnabled();
setupObserver();

const TABLE_SELECTOR = "#table_cash_registros";
const OBS_CACHE = new Map();
const DEBUG = false;
let observer = null;
let latestRows = [];
const SECOND_TABLE_SECTION_LABEL = "registros com participacao encerrada";

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

function isMeaningfulObs(value) {
  const text = cleanText(value);
  if (!text) return false;
  const normalized = normalize(text);
  return !["...", "-", "obs", "observacao", "observações", "observacoes"].includes(normalized);
}

function parseObsPayload(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    const keyPriority = ["obs", "observacao", "observação", "telefone", "phone", "celular", "contato", "acao", "ação"];
    const normalizedMap = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [normalize(k), cleanText(v)]));

    for (const key of keyPriority) {
      const candidate = normalizedMap[normalize(key)];
      if (isMeaningfulObs(candidate)) return candidate;
    }

    for (const candidate of Object.values(normalizedMap)) {
      if (hasPhoneLike(candidate)) return candidate;
    }
  } catch (_) {}
  return "";
}

function getCandidateKeysFromElement(element) {
  if (!element) return [];
  const keys = [];
  const attrs = element.getAttributeNames ? element.getAttributeNames() : [];
  const allowedAttrs = new Set(["id", "data-id", "data-jogadorid", "data-playerid", "data-registroid", "data-gameid", "data-nome", "data-name"]);
  for (const attr of attrs) {
    if (!allowedAttrs.has(attr)) continue;
    const v = cleanText(element.getAttribute(attr));
    if (v) keys.push(v);
  }
  if (element.dataset) {
    for (const [datasetKey, datasetValue] of Object.entries(element.dataset)) {
      const normalizedKey = normalize(datasetKey);
      if (!["id", "jogadorid", "playerid", "registroid", "gameid", "nome", "name"].some((key) => normalizedKey.includes(key))) {
        continue;
      }
      const text = cleanText(datasetValue);
      if (text) keys.push(text);
    }
  }
  return [...new Set(keys)];
}

function buildObsLookupKeys({ elementKeys = [], registro = "", name = "", gameID = "" }) {
  const base = [...new Set(elementKeys.map(cleanText).filter(Boolean))];
  const keys = [];
  const normalizedGameID = cleanText(gameID);
  const normalizedRegistro = cleanText(registro);
  const normalizedName = cleanText(name);

  if (normalizedGameID) keys.push(`gameid:${normalizedGameID}`);
  if (normalizedName && normalizedGameID) keys.push(`nome_gameid:${normalizedName}|${normalizedGameID}`);
  if (normalizedRegistro && normalizedGameID) keys.push(`registro_gameid:${normalizedRegistro}|${normalizedGameID}`);

  for (const item of base) {
    if (normalizedGameID) keys.push(`item_gameid:${item}|${normalizedGameID}`);
  }

  for (let i = 0; i < base.length; i += 1) {
    for (let j = i + 1; j < base.length; j += 1) {
      keys.push(`pair:${base[i]}|${base[j]}`);
    }
  }

  return [...new Set(keys)];
}

function extractObsFromDomCell(cell) {
  if (!cell) return "";
  const attrCandidates = ["data-json", "title", "data-bs-original-title", "data-original-title", "data-content", "aria-label", "data-obs"];

  for (const attr of attrCandidates) {
    const value = attr === "data-json" ? parseObsPayload(cell.getAttribute(attr)) : cleanText(cell.getAttribute(attr));
    if (isMeaningfulObs(value)) return value;
  }

  const inner = cell.querySelector("[data-json],[title],[data-bs-original-title],[data-original-title],[data-content],[aria-label],[data-obs]");
  if (inner) {
    for (const attr of attrCandidates) {
      const value = attr === "data-json" ? parseObsPayload(inner.getAttribute(attr)) : cleanText(inner.getAttribute(attr));
      if (isMeaningfulObs(value)) return value;
    }
  }

  const hiddenNodes = cell.querySelectorAll(
    ".xls_show, [class*='xls_show'], [hidden], .sr-only, .visually-hidden, [style*='display:none'], [style*='visibility:hidden']"
  );
  for (const hiddenNode of hiddenNodes) {
    const hiddenText = cleanText(hiddenNode.textContent);
    if (isMeaningfulObs(hiddenText)) return hiddenText;
  }

  const text = cleanText(cell.textContent);
  return isMeaningfulObs(text) ? text : "";
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

function normalizeHeader(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function getHeaderInfo(table) {
  if (!table) return null;
  const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
  if (!headerRow) return null;
  const headerCells = Array.from(headerRow.querySelectorAll("th,td"));
  if (!headerCells.length) return null;

  const indexMap = {};
  headerCells.forEach((cell, index) => {
    const key = normalizeHeader(cell.textContent);
    if (!key || indexMap[key] !== undefined) return;
    indexMap[key] = index;
  });

  return { headerRow, headerCells, indexMap };
}

function findIndex(indexMap, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (indexMap[key] !== undefined) return indexMap[key];
  }
  return -1;
}

function isCashTable(indexMap) {
  const gameIDIndex = findIndex(indexMap, ["GameID"]);
  const nameIndex = findIndex(indexMap, ["Registro", "Nome"]);
  const cIndex = findIndex(indexMap, ["C"]);
  const dIndex = findIndex(indexMap, ["D"]);
  const sIndex = findIndex(indexMap, ["S"]);
  const saldoFinalIndex = findIndex(indexMap, ["Saldo/Final"]);
  return [gameIDIndex, nameIndex, cIndex, dIndex, sIndex, saldoFinalIndex].every((idx) => idx >= 0);
}

function isTournamentTable(indexMap) {
  const nameIndex = findIndex(indexMap, ["Nome", "Registro"]);
  const saldoFinalIndex = findIndex(indexMap, ["Saldo/Final"]);
  const indicators = ["BI", "ST", "RC", "TC", "JP", "Compras", "Saldo/Torneio"];
  const hasIndicator = indicators.some((header) => findIndex(indexMap, [header]) >= 0);
  return nameIndex >= 0 && saldoFinalIndex >= 0 && hasIndicator;
}

function isSupportedTable(indexMap) {
  return isCashTable(indexMap) || isTournamentTable(indexMap);
}

function detectTableType(indexMap) {
  if (isTournamentTable(indexMap)) return "Torneio";
  if (isCashTable(indexMap)) return "Cash";
  return "Desconhecido";
}

function detectStatusFromContext(table) {
  const candidates = [
    table.previousElementSibling,
    table.parentElement?.previousElementSibling,
    table.closest("section,article,fieldset,div")?.previousElementSibling
  ];
  for (const node of candidates) {
    const text = normalize(node?.textContent || "");
    if (text.includes(SECOND_TABLE_SECTION_LABEL) || text.includes("encerrad")) return "Fechado";
  }
  return "Aberto";
}

function getCandidateTables() {
  const tableMap = new Map();

  function setTable(table, status) {
    if (!table) return;
    const previous = tableMap.get(table);
    if (!previous || status === "Fechado") tableMap.set(table, status);
  }

  const primaryTable = document.querySelector(TABLE_SELECTOR);
  if (primaryTable) setTable(primaryTable, "Aberto");

  const labels = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,strong,b,legend,label,span,div"));
  for (const label of labels) {
    if (!normalize(label.textContent).includes(SECOND_TABLE_SECTION_LABEL)) continue;
    const container = label.closest("section,article,fieldset,div") || label.parentElement;
    const inContainer = container?.querySelector("table");
    if (inContainer) setTable(inContainer, "Fechado");

    let sibling = label.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === "TABLE") {
        setTable(sibling, "Fechado");
        break;
      }
      const nested = sibling.querySelector?.("table");
      if (nested) {
        setTable(nested, "Fechado");
        break;
      }
      sibling = sibling.nextElementSibling;
    }
  }

  for (const table of document.querySelectorAll("table")) {
    const headerInfo = getHeaderInfo(table);
    if (headerInfo && isSupportedTable(headerInfo.indexMap)) {
      setTable(table, detectStatusFromContext(table));
    }
  }

  return Array.from(tableMap.entries()).map(([table, status]) => ({ table, status }));
}

function shouldFormatAsMoney(headerName) {
  const key = normalizeHeader(headerName);
  return key.includes("saldo") || key.includes("compra") || key.includes("compras");
}

function parseTableRows(table, status) {
  const headerInfo = getHeaderInfo(table);
  if (!headerInfo || !isSupportedTable(headerInfo.indexMap)) return [];

  const { headerRow, headerCells, indexMap } = headerInfo;
  const tableType = detectTableType(indexMap);
  const registroIndex = findIndex(indexMap, ["Registro"]);
  const nomeIndex = findIndex(indexMap, ["Nome"]);
  const gameIDIndex = findIndex(indexMap, ["GameID"]);
  const obsIndex = findIndex(indexMap, ["Obs", "Observacao", "Observação"]);

  let rows = Array.from(table.querySelectorAll("tbody tr"));
  if (!rows.length) rows = Array.from(table.querySelectorAll("tr")).filter((row) => row !== headerRow);

  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (!cells.length) return null;

      const registro = registroIndex >= 0 ? cleanText(cells[registroIndex]?.textContent) : "";
      const nome = nomeIndex >= 0 ? cleanText(cells[nomeIndex]?.textContent) : "";
      const gameID = gameIDIndex >= 0 ? cleanText(cells[gameIDIndex]?.textContent) : "";
      const finalName = nome || splitName(registro);
      const obsCell = obsIndex >= 0 ? cells[obsIndex] : cells[headerCells.length - 1] || cells[cells.length - 1];

      const trKeys = getCandidateKeysFromElement(row);
      const obsKeys = getCandidateKeysFromElement(obsCell);
      const lookupKeys = buildObsLookupKeys({
        elementKeys: [...trKeys, ...obsKeys],
        registro,
        name: finalName,
        gameID
      });

      const directObs = extractObsFromDomCell(obsCell);
      if (directObs) rememberObs(lookupKeys, directObs);
      const cachedObs = readObsFromCache(lookupKeys);
      const obs = cleanText(directObs || cachedObs);

      const parsedRow = {};
      headerCells.forEach((headerCell, index) => {
        const headerName = cleanText(headerCell.textContent) || `Coluna ${index + 1}`;
        const rawValue = cleanText(cells[index]?.textContent);
        parsedRow[headerName] = shouldFormatAsMoney(headerName) ? formatMoney(rawValue) : rawValue;
      });

      if (registro && !parsedRow.Nome && !parsedRow.Registro) parsedRow.Nome = splitName(registro) || registro;
      if (obs) parsedRow.Obs = obs;

      parsedRow.StatusRegistro = status;
      parsedRow.TipoRegistro = tableType;

      const hasData = Object.entries(parsedRow).some(
        ([key, value]) => key !== "StatusRegistro" && key !== "TipoRegistro" && cleanText(value)
      );
      return hasData ? parsedRow : null;
    })
    .filter(Boolean);
}

function getRows() {
  return getCandidateTables().flatMap(({ table, status }) => parseTableRows(table, status));
}

function collectNow() {
  latestRows = getRows();
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
    const lookupKeys = buildObsLookupKeys({ elementKeys: keys });
    rememberObs(lookupKeys, entry.obs);
  }
  collectNow();
  log("Obs cache updated from network:", entries.length);
}

function setupObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    collectNow();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "COLLECT_NOW") return false;
  try {
    collectNow();
    sendResponse({ ok: true, rows: latestRows });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
  return true;
});

window.addEventListener("message", handlePageMessages);
injectPageHook();
collectNow();
setupObserver();

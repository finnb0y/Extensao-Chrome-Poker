const collectBtn = document.getElementById("collect");
const filterOpenEl = document.getElementById("filterOpen");
const filterClosedEl = document.getElementById("filterClosed");
const hideNoObsEl = document.getElementById("hideNoObs");
const filterOpenLabelEl = document.getElementById("filterOpenLabel");
const filterClosedLabelEl = document.getElementById("filterClosedLabel");
const hideNoObsLabelEl = document.getElementById("hideNoObsLabel");
const statusFiltersRowEl = document.getElementById("statusFiltersRow");
const cashDateWrapEl = document.getElementById("cashDateWrap");
const cashDateEl = document.getElementById("cashDate");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

let latestData = [];
const selectedIds = new Set();

const STORAGE_KEYS = {
  filters: "filters",
  hiddenPlayers: "hiddenPlayers",
  cashDateBySite: "cashDateBySite"
};

// A data do Cash é lembrada por site (host da aba ativa), já que cada site
// pode estar num dia diferente de referência para os saques.
let currentSiteHost = null;

// Chaves persistidas (jogadores ocultados) sobrevivem a trocar de aba, fechar o
// popup e recoletar — por isso não podem depender do índice da linha (__id),
// que muda a cada coleta. Usamos Nome + Tipo (+ Torneio) como identidade estável.
let hiddenPlayerKeys = new Set();

function getRowKey(row) {
  const tipo = normalize(row.TipoRegistro);
  const nome = normalize(row.Nome);
  const torneio = tipo === "torneio" ? normalize(row.TorneioNome) : "";
  return `${tipo}|${torneio}|${nome}`;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function loadFilterState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.filters], (result) => {
      const saved = result[STORAGE_KEYS.filters] || {};
      filterOpenEl.checked = saved.filterOpen ?? true;
      filterClosedEl.checked = saved.filterClosed ?? true;
      hideNoObsEl.checked = saved.hideNoObs ?? true;
      resolve();
    });
  });
}

function saveFilterState() {
  chrome.storage.local.set({
    [STORAGE_KEYS.filters]: {
      filterOpen: filterOpenEl.checked,
      filterClosed: filterClosedEl.checked,
      hideNoObs: hideNoObsEl.checked
    }
  });
}

function loadHiddenPlayers() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.hiddenPlayers], (result) => {
      hiddenPlayerKeys = new Set(result[STORAGE_KEYS.hiddenPlayers] || []);
      resolve();
    });
  });
}

function saveHiddenPlayers() {
  chrome.storage.local.set({ [STORAGE_KEYS.hiddenPlayers]: Array.from(hiddenPlayerKeys) });
}

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isoToBR(iso) {
  const parts = String(iso || "").split("-");
  if (parts.length !== 3) return formatDateBR(new Date());
  const [y, m, d] = parts;
  if (!y || !m || !d) return formatDateBR(new Date());
  return `${d}/${m}/${y}`;
}

function getHostFromTab(tab) {
  try {
    return tab?.url ? new URL(tab.url).hostname : null;
  } catch (_error) {
    return null;
  }
}

function loadCashDateForSite(host) {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.cashDateBySite], (result) => {
      const bySite = result[STORAGE_KEYS.cashDateBySite] || {};
      cashDateEl.value = (host && bySite[host]) || todayIso();
      resolve();
    });
  });
}

function saveCashDateForSite() {
  if (!currentSiteHost) return;
  chrome.storage.local.get([STORAGE_KEYS.cashDateBySite], (result) => {
    const bySite = result[STORAGE_KEYS.cashDateBySite] || {};
    bySite[currentSiteHost] = cashDateEl.value;
    chrome.storage.local.set({ [STORAGE_KEYS.cashDateBySite]: bySite });
  });
}

function setStatus(message) {
  statusEl.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function isTorneio(row) {
  return normalizeStatus(row.TipoRegistro) === "torneio";
}

function hasObs(row) {
  const value = String(row.Obs || "").trim();
  if (!value) return false;
  const normalized = value.toLowerCase();
  return !["...", "-", "obs", "observacao", "observação", "observacoes"].includes(normalized);
}

function formatDateBR(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// Extrai o valor numérico de um texto de moeda formatado em pt-BR (ex.: "R$ 1.234,56", "-R$ 12,00")
function parseSaldoValue(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const isNegative = raw.includes("-");
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/-/g, "");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return isNegative ? -Math.abs(num) : num;
}

function saldoClass(saldoText) {
  const value = parseSaldoValue(saldoText);
  if (value === null) return "saldo-zero";
  if (value > 0) return "saldo-positive";
  if (value < 0) return "saldo-negative";
  return "saldo-zero";
}

function buildCopyText(row) {
  const pixValue = String(row.Obs || "").replace(/\s+/g, "");

  if (isTorneio(row)) {
    return [
      "_*Solicitação de Saque*_ ",
      "*TORNEIO* ",
      `*${row.TorneioNome || ""}*`,
      "",
      `*_Nome:_* ${row.Nome || ""}`,
      "",
      `*_Valor:_* ${row.SaldoFinal || ""}`,
      "",
      `*_PIX:_* ${pixValue}`
    ].join("\n");
  }

  const dateBR = isoToBR(cashDateEl.value);
  return [
    "_*Solicitação de Saque*_",
    `*Cash* *_${dateBR}_* `,
    "",
    `_*Nome*_: ${row.Nome || ""}`,
    "",
    `_*Valor*_: ${row.SaldoFinal || ""}`,
    "",
    `_*PIX*_: ${pixValue}`
  ].join("\n");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_error) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch (_fallbackError) {
      return false;
    }
  }
}

function toggleSelection(row, tr) {
  const key = row.__key;
  const wasSelected = hiddenPlayerKeys.has(key);
  const nowSelected = !wasSelected;

  if (wasSelected) {
    hiddenPlayerKeys.delete(key);
    selectedIds.delete(row.__id);
  } else {
    hiddenPlayerKeys.add(key);
    selectedIds.add(row.__id);
  }
  saveHiddenPlayers();

  if (tr) {
    tr.classList.toggle("row-selected", nowSelected);
    const checkbox = tr.querySelector(".row-check");
    if (checkbox) checkbox.checked = nowSelected;
    const copyBtn = tr.querySelector(".copy-btn");
    if (copyBtn) copyBtn.disabled = nowSelected;
  }
}

function renderTable(rows, title) {
  if (!rows.length) return `<section><div class="table-title">${title}</div><em>Nenhum dado encontrado.</em></section>`;

  const head = `<tr>
    <th class="col-check">✓</th>
    <th>Nome</th>
    <th>Saldo Final</th>
    <th>Obs</th>
    <th class="col-actions">Ação</th>
  </tr>`;

  const body = rows
    .map((row) => {
      const isSelected = selectedIds.has(row.__id);
      const checked = isSelected ? "checked" : "";
      const selectedClass = isSelected ? "row-selected" : "";
      const disabledAttr = isSelected ? "disabled" : "";
      return `<tr data-id="${row.__id}" class="${selectedClass}">
        <td class="col-check"><input type="checkbox" class="row-check" data-id="${row.__id}" ${checked} /></td>
        <td>${escapeHtml(row.Nome)}</td>
        <td class="${saldoClass(row.SaldoFinal)}">${escapeHtml(row.SaldoFinal)}</td>
        <td>${escapeHtml(row.Obs)}</td>
        <td class="col-actions"><button class="copy-btn" data-id="${row.__id}" ${disabledAttr}>Copiar</button></td>
      </tr>`;
    })
    .join("");

  return `<section><div class="table-title">${title} (${rows.length})</div><table><thead>${head}</thead><tbody>${body}</tbody></table></section>`;
}

function updateToggleLabels() {
  filterOpenLabelEl.textContent = filterOpenEl.checked ? "Ocultar Abertos" : "Mostrar Abertos";
  filterClosedLabelEl.textContent = filterClosedEl.checked ? "Ocultar Fechados" : "Mostrar Fechados";
  hideNoObsLabelEl.textContent = hideNoObsEl.checked ? "Mostrar sem Obs" : "Ocultar sem Obs";
}

function renderData() {
  updateToggleLabels();
  const showOpen = filterOpenEl.checked;
  const showClosed = filterClosedEl.checked;
  const hideNoObs = hideNoObsEl.checked;

  const visibleData = hideNoObs ? latestData.filter(hasObs) : latestData;

  const hasCash = latestData.some((row) => !isTorneio(row));
  const hasTorneio = latestData.some((row) => isTorneio(row));

  // O filtro Aberto/Fechado e a data só fazem sentido para Cash — em Torneio não existem.
  statusFiltersRowEl.style.display = hasCash ? "flex" : "none";
  cashDateWrapEl.style.display = hasCash ? "flex" : "none";

  const cashRows = visibleData.filter((row) => !isTorneio(row));
  const torneioRows = visibleData.filter((row) => isTorneio(row));

  const sections = [];

  if (hasCash) {
    if (!showOpen && !showClosed) {
      sections.push("<em>Selecione ao menos um filtro de status.</em>");
    } else {
      const openRows = cashRows.filter((row) => normalizeStatus(row.StatusRegistro) !== "fechado");
      const closedRows = cashRows.filter((row) => normalizeStatus(row.StatusRegistro) === "fechado");
      if (showOpen) sections.push(renderTable(openRows, "🟢 Registros Abertos"));
      if (showClosed) sections.push(renderTable(closedRows, "🔴 Registros Fechados"));
    }
  }

  if (hasTorneio) {
    sections.push(renderTable(torneioRows, "🏆 Registros"));
  }

  if (!hasCash && !hasTorneio) {
    sections.push("<em>Nenhum dado encontrado.</em>");
  }

  resultEl.innerHTML = sections.join('<div class="table-divider"></div>');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function collectNow() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("Aba ativa inválida.");
    return;
  }

  setStatus("Coletando...");
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_NOW" });
    if (!response?.ok) {
      setStatus(response?.error || "Falha ao coletar.");
      return;
    }

    selectedIds.clear();
    latestData = (response.rows || []).map((row, index) => {
      const withId = { ...row, __id: index };
      withId.__key = getRowKey(withId);
      if (hiddenPlayerKeys.has(withId.__key)) selectedIds.add(index);
      return withId;
    });
    renderData();
    setStatus(`✅ Coletado: ${latestData.length} linha(s).`);
  } catch (_error) {
    setStatus("Abra uma página compatível para coletar dados.");
    latestData = [];
    renderData();
  }
}

// Clique em qualquer parte da linha (nome, saldo, obs ou a própria caixinha)
// alterna a seleção — só a coluna de ação (botão Copiar) fica de fora disso.
resultEl.addEventListener("click", async (event) => {
  const copyBtn = event.target.closest(".copy-btn");
  if (copyBtn) {
    const id = Number(copyBtn.dataset.id);
    const row = latestData.find((item) => item.__id === id);
    if (!row) return;

    const text = buildCopyText(row);
    const ok = await copyToClipboard(text);
    const originalLabel = copyBtn.textContent;
    copyBtn.textContent = ok ? "Copiado" : "Falhou";
    copyBtn.classList.toggle("copied", ok);
    copyBtn.classList.toggle("failed", !ok);
    setTimeout(() => {
      copyBtn.textContent = originalLabel;
      copyBtn.classList.remove("copied", "failed");
    }, 1500);
    return;
  }

  const tr = event.target.closest("tr[data-id]");
  if (!tr) return;
  if (event.target.closest(".col-actions")) return;

  const id = Number(tr.dataset.id);
  const row = latestData.find((item) => item.__id === id);
  if (!row) return;
  toggleSelection(row, tr);
});

function onFilterChange() {
  saveFilterState();
  renderData();
}

collectBtn.addEventListener("click", collectNow);
filterOpenEl.addEventListener("change", onFilterChange);
filterClosedEl.addEventListener("change", onFilterChange);
hideNoObsEl.addEventListener("change", onFilterChange);
cashDateEl.addEventListener("change", saveCashDateForSite);

async function init() {
  const tab = await getActiveTab();
  currentSiteHost = getHostFromTab(tab);
  await Promise.all([loadFilterState(), loadHiddenPlayers(), loadCashDateForSite(currentSiteHost)]);
  updateToggleLabels();
  collectNow();
}

init();

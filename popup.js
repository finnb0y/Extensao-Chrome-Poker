const collectBtn = document.getElementById("collect");
const filterOpenEl = document.getElementById("filterOpen");
const filterClosedEl = document.getElementById("filterClosed");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

let latestData = [];

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

function getHeaders(rows) {
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) seen.add(key);
  }
  return Array.from(seen);
}

function renderTable(rows, title) {
  if (!rows.length) return `<section><div class="table-title">${title}</div><em>Nenhum dado encontrado.</em></section>`;

  const headers = getHeaders(rows);
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows
    .map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`)
    .join("");

  return `<section><div class="table-title">${title} (${rows.length})</div><table><thead>${head}</thead><tbody>${body}</tbody></table></section>`;
}

function renderData() {
  const showOpen = filterOpenEl.checked;
  const showClosed = filterClosedEl.checked;

  if (!showOpen && !showClosed) {
    resultEl.innerHTML = "<em>Selecione ao menos um filtro.</em>";
    return;
  }

  const openRows = latestData.filter((row) => normalizeStatus(row.StatusRegistro) !== "fechado");
  const closedRows = latestData.filter((row) => normalizeStatus(row.StatusRegistro) === "fechado");

  const sections = [];
  if (showOpen) sections.push(renderTable(openRows, "Registros Abertos"));
  if (showClosed) sections.push(renderTable(closedRows, "Registros Fechados"));

  resultEl.innerHTML = sections.join(showOpen && showClosed ? '<div class="table-divider"></div>' : "");
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

    latestData = response.rows || [];
    renderData();
    setStatus(`Coletado: ${latestData.length} linha(s).`);
  } catch (_error) {
    setStatus("Abra uma página compatível para coletar dados.");
    latestData = [];
    renderData();
  }
}

collectBtn.addEventListener("click", collectNow);
filterOpenEl.addEventListener("change", renderData);
filterClosedEl.addEventListener("change", renderData);

collectNow();

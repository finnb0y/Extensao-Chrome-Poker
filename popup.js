const toggleBtn = document.getElementById("toggle");
const refreshBtn = document.getElementById("refresh");
const copyCsvBtn = document.getElementById("copyCsv");
const copyJsonBtn = document.getElementById("copyJson");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

let latestData = [];
let currentOrigin = "";

function setStatus(message) {
  statusEl.textContent = message;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

function renderTable(rows) {
  if (!rows.length) {
    resultEl.innerHTML = "<em>Nenhum dado encontrado.</em>";
    copyCsvBtn.disabled = true;
    copyJsonBtn.disabled = true;
    return;
  }

  const headers = Object.keys(rows[0]);
  const head = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const body = rows
    .map(
      (row) =>
        `<tr>${headers
          .map((h) => `<td>${String(row[h] ?? "").replaceAll("<", "&lt;")}</td>`)
          .join("")}</tr>`
    )
    .join("");
  resultEl.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  copyCsvBtn.disabled = false;
  copyJsonBtn.disabled = false;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getEnabledOrigins() {
  const { enabledOrigins = [] } = await chrome.storage.local.get("enabledOrigins");
  return enabledOrigins;
}

async function updateToggleLabel() {
  const origins = await getEnabledOrigins();
  const enabled = origins.includes(currentOrigin);
  toggleBtn.textContent = enabled ? "Desativar neste site" : "Ativar neste site";
}

async function toggleSite() {
  if (!currentOrigin) return;
  const origins = await getEnabledOrigins();
  const enabled = origins.includes(currentOrigin);
  const next = enabled
    ? origins.filter((origin) => origin !== currentOrigin)
    : [...new Set([...origins, currentOrigin])];
  await chrome.storage.local.set({ enabledOrigins: next });
  await updateToggleLabel();
  setStatus(enabled ? "Coleta desativada para este site." : "Coleta ativada para este site.");
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
    renderTable(latestData);
    setStatus(`Coletado: ${latestData.length} linha(s).`);
  } catch (error) {
    setStatus("Abra uma página válida do site configurado no manifest.");
  }
}

async function copyCsv() {
  await navigator.clipboard.writeText(toCsv(latestData));
  setStatus("CSV copiado.");
}

async function copyJson() {
  await navigator.clipboard.writeText(JSON.stringify(latestData, null, 2));
  setStatus("JSON copiado.");
}

async function init() {
  const tab = await getActiveTab();
  if (!tab?.url) {
    setStatus("Sem URL ativa.");
    return;
  }
  currentOrigin = new URL(tab.url).origin;
  await updateToggleLabel();
}

toggleBtn.addEventListener("click", toggleSite);
refreshBtn.addEventListener("click", collectNow);
copyCsvBtn.addEventListener("click", copyCsv);
copyJsonBtn.addEventListener("click", copyJson);

init();

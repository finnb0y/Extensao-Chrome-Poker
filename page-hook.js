(function () {
  if (window.__pokerExtractorHookInstalled) return;
  window.__pokerExtractorHookInstalled = true;

  const OBS_KEYS = ["obs", "observacao", "observação", "telefone", "phone", "celular", "contato"];
  const ID_KEYS = ["id", "jogadorid", "playerid", "registroid", "gameid", "nome", "name"];

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function hasObsLikeValue(value) {
    if (typeof value !== "string") return false;
    const text = value.trim();
    if (!text) return false;
    return /\d{2}\s?\d{4,5}-?\d{4}/.test(text) || text.length > 5;
  }

  function extractObsEntries(node, out = []) {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      for (const item of node) extractObsEntries(item, out);
      return out;
    }

    const entries = Object.entries(node);
    const flat = {};
    for (const [k, v] of entries) flat[normalize(k)] = v;

    let obsValue = "";
    for (const key of OBS_KEYS) {
      if (hasObsLikeValue(flat[key])) {
        obsValue = String(flat[key]).trim();
        break;
      }
    }

    if (obsValue) {
      const keys = [];
      for (const key of ID_KEYS) {
        if (flat[key] != null && String(flat[key]).trim()) {
          keys.push(String(flat[key]).trim());
        }
      }
      out.push({ obs: obsValue, keys });
    }

    for (const value of Object.values(node)) extractObsEntries(value, out);
    return out;
  }

  function emitFromText(text, source) {
    if (!text || text.length > 300000) return;
    try {
      const json = JSON.parse(text);
      const entries = extractObsEntries(json);
      if (entries.length) {
        window.postMessage({ type: "POKER_OBS_DISCOVERED", source, entries }, "*");
      }
    } catch (_) {}
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const clone = response.clone();
      emitFromText(await clone.text(), "fetch");
    } catch (_) {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__pokerExtractorUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (this.responseType && this.responseType !== "text") return;
        emitFromText(this.responseText, `xhr:${this.__pokerExtractorUrl || ""}`);
      } catch (_) {}
    });
    return originalSend.apply(this, args);
  };
})();

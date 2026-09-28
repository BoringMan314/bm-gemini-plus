(() => {
  const STYLE_ID = "gemini-plus-style";
  const SHADOW_STYLE_ID = "gemini-plus-shadow-style";
  const DEFAULTS = {
    enabled: true,
    widthPercent: 80,
  };
  const NATIVE_WIDTH_PX = 768;
  const SCROLLBAR_GAP_PX = 16;
  const MAX_INSET_PX = 48;
  const MIN_PERCENT = 0;
  const MAX_PERCENT = 100;
  const STEP_PERCENT = 5;

  function snapWidthPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS.widthPercent;
    const snapped = Math.round(n / STEP_PERCENT) * STEP_PERCENT;
    return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, snapped));
  }

  const KEY_CONTAINERS = [
    ".conversation-container",
    '[class*="conversation-container"]',
    ".input-area-container",
    ".bottom-container",
    "input-area-v2",
  ];

  const FILL_SELECTORS = [
    "chat-window",
    ".chat-container",
    "chat-window-content",
    ".chat-history-scroll-container",
    ".chat-history",
    "infinite-scroller",
    "input-container",
    "model-response",
    ".model-response",
    ".model-response-container",
    "response-container",
    ".presented-response-container",
    "table-block",
    ".table-block",
    ".table-content",
    "structured-content-container",
    ".horizontal-scroll-wrapper",
  ];

  let settings = { ...DEFAULTS };
  let debounceTimer = 0;
  let nativeWidthPx = 0;

  const observer = new MutationObserver(() => {
    if (!settings.enabled || usesNativeWidth()) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(apply, 160);
  });

  function conversationEl() {
    return document.querySelector(".conversation-container");
  }

  function layoutScrollbarWidth(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    return Math.max(0, Math.round(el.offsetWidth - el.clientWidth - border));
  }

  function getScrollContainer() {
    const selectors = [
      ".content-container:has(chat-window)",
      ".content-container:has(.conversation-container)",
      ".content-container",
      ".chat-history-scroll-container",
      "chat-window-content",
      "chat-window",
      "main",
      '[role="main"]',
    ];

    for (const selector of selectors) {
      let el = null;
      try {
        el = document.querySelector(selector);
      } catch (_error) {
        el = null;
      }
      if (el && el.clientWidth > 0) return el;
    }
    return document.documentElement;
  }

  function syncScrollbarLane(el) {
    if (!el || el === document.documentElement || el === document.body) return;
    // 傳統捲軸已從 clientWidth 扣除。疊加捲軸不會佔版面，改在末端留白。
    if (layoutScrollbarWidth(el) >= 8) {
      if (el.dataset.gwpScrollbarPad === "1") {
        el.style.removeProperty("padding-inline-end");
        delete el.dataset.gwpScrollbarPad;
      }
      return;
    }
    el.style.setProperty("padding-inline-end", `${SCROLLBAR_GAP_PX}px`, "important");
    el.dataset.gwpScrollbarPad = "1";
    void el.offsetWidth;
  }

  function clearScrollbarLane() {
    document.querySelectorAll("[data-gwp-scrollbar-pad]").forEach((el) => {
      el.style.removeProperty("padding-inline-end");
      delete el.dataset.gwpScrollbarPad;
    });
  }

  function getAvailableWidth() {
    const host = getScrollContainer();
    syncScrollbarLane(host);
    const cs = host ? getComputedStyle(host) : null;
    const pad = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 0;
    const hostWidth = host?.clientWidth || document.documentElement.clientWidth || 0;
    return Math.max(0, Math.round(hostWidth - pad - MAX_INSET_PX));
  }

  function readDesignContentWidth() {
    const host = document.querySelector(
      "chat-window-content.enable-luminous-content-width-update, .enable-luminous-content-width-update"
    );
    if (!host) return 0;
    const px = parseFloat(
      getComputedStyle(host).getPropertyValue("--bard-chat-window-content-width-default")
    );
    return Number.isFinite(px) && px >= 280 ? Math.round(px) : 0;
  }

  function captureNativeWidth() {
    if (nativeWidthPx > 0) return nativeWidthPx;

    // 新版 conversation-container 已是全寬，真正的預設欄寬在 708px 這層。
    const design = readDesignContentWidth();
    if (design) {
      nativeWidthPx = design;
      return nativeWidthPx;
    }

    const el = conversationEl() || document.querySelector("user-query, .input-area-container");
    if (!el) return NATIVE_WIDTH_PX;

    const html = document.documentElement;
    const style = document.getElementById(STYLE_ID);
    const wasWide = html.classList.contains("gwp-wide");
    html.classList.remove("gwp-wide", "gwp-enabled");
    if (style) style.disabled = true;
    clearInline();
    void el.offsetWidth;

    const probe = document.querySelector("user-query, .response-container-header, .input-area-container");
    const probeMax = probe ? parseFloat(getComputedStyle(probe).maxWidth) : NaN;
    const shell = Math.round(el.getBoundingClientRect().width);
    const available = Math.max(shell, getAvailableWidth());
    if (Number.isFinite(probeMax) && probeMax >= 280 && probeMax < available * 0.95) {
      nativeWidthPx = Math.round(probeMax);
    } else if (shell >= 280 && shell < available * 0.95) {
      nativeWidthPx = shell;
    } else if (shell >= 280) {
      nativeWidthPx = shell;
    } else {
      nativeWidthPx = NATIVE_WIDTH_PX;
    }

    if (style) style.disabled = false;
    if (wasWide) html.classList.add("gwp-wide");
    return nativeWidthPx;
  }

  function widthValue() {
    const percent = snapWidthPercent(settings.widthPercent);
    if (percent <= MIN_PERCENT) return null;

    const native = captureNativeWidth();
    const available = getAvailableWidth();
    const span = Math.max(0, available - native);
    const t = percent / MAX_PERCENT;
    const px = Math.round(native + span * t);
    return `${Math.max(native, px)}px`;
  }

  function usesNativeWidth() {
    return snapWidthPercent(settings.widthPercent) <= MIN_PERCENT;
  }

  function buildCss() {
    const width = widthValue();
    if (!width) return "";
    return `
html.gwp-wide {
  --gwp-width: ${width};
  --thread-content-max-width: 100%;
  --conversation-max-width: 100%;
}
html.gwp-wide .conversation-container,
html.gwp-wide [class*="conversation-container"],
html.gwp-wide .input-area-container,
html.gwp-wide .bottom-container,
html.gwp-wide input-container .input-area-container,
html.gwp-wide input-area-v2 {
  max-width: 100% !important;
  width: min(100%, ${width}) !important;
  min-width: 0 !important;
  margin-left: auto !important;
  margin-right: auto !important;
  box-sizing: border-box !important;
}
`.trim();
  }

  function buildShadowCss() {
    const width = widthValue();
    if (!width) return "";
    return `
.conversation-container,
[class*="conversation-container"],
.input-area-container,
.bottom-container,
input-area-v2 {
  max-width: 100% !important;
  width: min(100%, ${width}) !important;
  min-width: 0 !important;
  margin-left: auto !important;
  margin-right: auto !important;
  box-sizing: border-box !important;
}
model-response,
.model-response,
.response-container,
.presented-response-container,
.table-block,
.table-block,
.table-content,
structured-content-container,
.horizontal-scroll-wrapper,
table {
  max-width: 100% !important;
  width: 100% !important;
}
.response-container-header,
.response-container-footer,
.response-footer,
.response-container-content,
message-actions,
.markdown,
message-content,
.md-content > * {
  max-width: var(--gwp-width, 100%) !important;
  width: min(100%, var(--gwp-width, 100%)) !important;
  margin-inline: auto !important;
  box-sizing: border-box !important;
}
message-actions {
  margin-inline: 0 !important;
}
.table-content,
.horizontal-scroll-wrapper {
  overflow-x: auto !important;
}
`.trim();
  }

  function ensureDocumentStyle() {
    const root = document.head || document.documentElement;
    if (!root) return;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      root.appendChild(style);
    } else if (style.parentNode !== root) {
      root.appendChild(style);
    }

    const css = buildCss();
    if (style.textContent !== css) {
      style.textContent = css;
    }
  }

  function injectShadowStyles(root) {
    if (!root) return;
    const nodes = root.querySelectorAll("*");
    for (const el of nodes) {
      const shadow = el.shadowRoot;
      if (!shadow) continue;

      let style = shadow.getElementById(SHADOW_STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = SHADOW_STYLE_ID;
        shadow.appendChild(style);
      }
      const css = buildShadowCss();
      if (style.textContent !== css) {
        style.textContent = css;
      }
      injectShadowStyles(shadow);
    }
  }

  function setImportant(el, prop, value) {
    if (
      el.style.getPropertyValue(prop) === value &&
      el.style.getPropertyPriority(prop) === "important"
    ) {
      return;
    }
    el.style.setProperty(prop, value, "important");
  }

  function applyInline(root = document) {
    const width = widthValue();
    if (!width) return;
    for (const selector of KEY_CONTAINERS) {
      root.querySelectorAll(selector).forEach((el) => {
        setImportant(el, "max-width", "100%");
        setImportant(el, "width", `min(100%, ${width})`);
        setImportant(el, "min-width", "0");
        setImportant(el, "margin-left", "auto");
        setImportant(el, "margin-right", "auto");
        setImportant(el, "box-sizing", "border-box");
      });
    }

    for (const selector of FILL_SELECTORS) {
      root.querySelectorAll(selector).forEach((el) => {
        setImportant(el, "max-width", "100%");
        setImportant(el, "width", "100%");
        setImportant(el, "box-sizing", "border-box");
      });
    }

    root.querySelectorAll("model-response, .conversation-container").forEach((el) => {
      relaxNarrowAncestors(el);
    });
  }

  function relaxNarrowAncestors(start) {
    let node = start.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const tag = node.tagName.toLowerCase();
      if (
        tag === "body" ||
        tag === "html" ||
        tag === "chat-app" ||
        tag === "bard-app" ||
        node.classList.contains("content-container")
      ) {
        break;
      }

      const maxWidth = getComputedStyle(node).maxWidth;
      if (maxWidth && maxWidth !== "none") {
        const px = parseFloat(maxWidth);
        // 只放寬對話欄常見的 768~1200px 限制，避免誤傷小元件
        if (!Number.isNaN(px) && px >= 480 && px < window.innerWidth * 0.92) {
          setImportant(node, "max-width", "100%");
          setImportant(node, "width", "100%");
          setImportant(node, "min-width", "0");
        }
      }

      if (tag === "main" || node.getAttribute("role") === "main") {
        break;
      }
      node = node.parentElement;
    }
  }

  function clearInline(root = document) {
    const selectors = [...KEY_CONTAINERS, ...FILL_SELECTORS].join(",");
    root.querySelectorAll(selectors).forEach((el) => {
      ["max-width", "width", "min-width", "margin-left", "margin-right", "box-sizing"].forEach((prop) => {
        el.style.removeProperty(prop);
      });
    });
  }

  function apply() {
    const html = document.documentElement;
    if (!html) return;

    observer.disconnect();
    try {
      const percent = snapWidthPercent(settings.widthPercent);
      settings.widthPercent = percent;
      const native = !settings.enabled || usesNativeWidth();

      if (!native && !nativeWidthPx) {
        html.classList.remove("gwp-wide", "gwp-enabled");
        const style = document.getElementById(STYLE_ID);
        if (style) style.disabled = true;
        clearInline();
        captureNativeWidth();
        if (style) style.disabled = false;
      }

      html.classList.toggle("gwp-disabled", !settings.enabled);
      html.classList.toggle("gwp-wide", settings.enabled && !native);
      html.classList.toggle("gwp-enabled", settings.enabled && !native);

      if (settings.enabled && !native) {
        html.style.setProperty("--gwp-width", widthValue());
        ensureDocumentStyle();
        applyInline();
        injectShadowStyles(document);
      } else {
        html.style.removeProperty("--gwp-width");
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
        clearInline();
        clearScrollbarLane();
      }
    } finally {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  function loadSettings(callback) {
    try {
      chrome.storage.sync.get(DEFAULTS, (result) => {
        settings = {
          enabled: result.enabled !== false,
          widthPercent: snapWidthPercent(result.widthPercent),
        };
        callback();
      });
    } catch (error) {
      settings = { ...DEFAULTS };
      callback();
    }
  }

  loadSettings(apply);

  window.addEventListener("resize", () => {
    if (!settings.enabled || usesNativeWidth()) return;
    nativeWidthPx = 0;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(apply, 160);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enabled) {
      settings.enabled = changes.enabled.newValue !== false;
    }
    if (changes.widthPercent) {
      settings.widthPercent = snapWidthPercent(changes.widthPercent.newValue);
    }
    apply();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "gwp:update") return;
    if (typeof message.enabled === "boolean") settings.enabled = message.enabled;
    if (typeof message.widthPercent === "number") {
      settings.widthPercent = snapWidthPercent(message.widthPercent);
    }
    apply();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("DOMContentLoaded", apply, { once: true });
  window.addEventListener("load", apply, { once: true });
})();

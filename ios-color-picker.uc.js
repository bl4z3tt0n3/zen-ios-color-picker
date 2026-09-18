(() => {
  "use strict";

  const MOD_ID = "zen-ios-color-picker";
  const ROOT_ID = "zen-ios-color-picker-root";
  const SWATCH_PREF = "zen.ios-color-picker.swatches";
  const HTML_NS = "http://www.w3.org/1999/xhtml";

  if (window.__zenIOSColorPicker?.version) return;

  const state = {
    r: 10,
    g: 132,
    b: 255,
    a: 100,
    tab: "grid",
    draggingSpectrum: false,
    swatches: [],
  };

  const DEFAULT_SWATCHES = [
    "#000000",
    "#FFFFFF",
    "#0A84FF",
    "#5E5CE6",
    "#BF5AF2",
    "#FF375F",
    "#FF453A",
    "#FF9F0A",
    "#FFD60A",
    "#30D158",
    "#64D2FF",
  ];

  let panel = null;
  let root = null;
  let spectrumCanvas = null;
  let spectrumMarker = null;
  let statusTimer = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rp = 0, gp = 0, bp = 0;
    if (h < 60) [rp, gp, bp] = [c, x, 0];
    else if (h < 120) [rp, gp, bp] = [x, c, 0];
    else if (h < 180) [rp, gp, bp] = [0, c, x];
    else if (h < 240) [rp, gp, bp] = [0, x, c];
    else if (h < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    return [
      Math.round((rp + m) * 255),
      Math.round((gp + m) * 255),
      Math.round((bp + m) * 255),
    ];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, max === 0 ? 0 : d / max, max];
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let rp = 0, gp = 0, bp = 0;
    if (h < 60) [rp, gp, bp] = [c, x, 0];
    else if (h < 120) [rp, gp, bp] = [x, c, 0];
    else if (h < 180) [rp, gp, bp] = [0, c, x];
    else if (h < 240) [rp, gp, bp] = [0, x, c];
    else if (h < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    return [
      Math.round((rp + m) * 255),
      Math.round((gp + m) * 255),
      Math.round((bp + m) * 255),
    ];
  }

  function componentToHex(v) {
    return clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  }

  function rgbHex() {
    return `#${componentToHex(state.r)}${componentToHex(state.g)}${componentToHex(state.b)}`;
  }

  function rgbaHex() {
    const base = rgbHex();
    if (state.a >= 100) return base;
    return `${base}${componentToHex((state.a / 100) * 255)}`;
  }

  function parseColor(value) {
    if (Array.isArray(value)) {
      const [r = 0, g = 0, b = 0, a = 255] = value;
      return { r, g, b, a: a <= 1 ? a * 100 : (a / 255) * 100 };
    }
    if (typeof value !== "string") return null;
    const v = value.trim();
    let m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) {
      return {
        r: parseInt(m[1].slice(0, 2), 16),
        g: parseInt(m[1].slice(2, 4), 16),
        b: parseInt(m[1].slice(4, 6), 16),
        a: m[2] ? (parseInt(m[2], 16) / 255) * 100 : 100,
      };
    }
    m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)/i);
    if (m) {
      let alpha = m[4] == null ? 100 : Number(m[4]);
      if (!v.includes("%") && alpha <= 1) alpha *= 100;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
    }
    return null;
  }

  function setColor(r, g, b, a = state.a) {
    state.r = clamp(Math.round(r), 0, 255);
    state.g = clamp(Math.round(g), 0, 255);
    state.b = clamp(Math.round(b), 0, 255);
    state.a = clamp(Math.round(a), 0, 100);
    updateUI();
  }

  function showStatus(message, isError = false) {
    const el = root?.querySelector("#ioscp-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.add("visible");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => el.classList.remove("visible"), 1800);
  }

  function loadSwatches() {
    try {
      const raw = Services.prefs.getStringPref(SWATCH_PREF, "[]");
      const parsed = JSON.parse(raw);
      state.swatches = Array.isArray(parsed)
        ? parsed.filter(v => /^#[0-9A-Fa-f]{6}$/.test(v)).slice(0, 24)
        : [];
    } catch {
      state.swatches = [];
    }
  }

  function saveSwatches() {
    try {
      Services.prefs.setStringPref(SWATCH_PREF, JSON.stringify(state.swatches));
    } catch {}
  }

  function addSwatch() {
    const hex = rgbHex();
    if (!state.swatches.includes(hex) && !DEFAULT_SWATCHES.includes(hex)) {
      state.swatches.unshift(hex);
      state.swatches = state.swatches.slice(0, 24);
      saveSwatches();
      renderSwatches();
    }
  }

  function renderSwatches() {
    const container = root?.querySelector("#ioscp-swatches");
    if (!container) return;
    container.replaceChildren();
    const all = [...DEFAULT_SWATCHES, ...state.swatches];
    for (const color of all) {
      const btn = document.createElementNS(HTML_NS, "button");
      btn.className = "ioscp-swatch";
      btn.type = "button";
      btn.dataset.color = color;
      btn.title = color;
      btn.style.setProperty("--swatch-color", color);
      if (color.toUpperCase() === rgbHex()) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        const c = parseColor(color);
        if (c) setColor(c.r, c.g, c.b, state.a);
      });
      if (state.swatches.includes(color)) {
        btn.title = `${color} — tasto destro per rimuovere`;
        btn.addEventListener("contextmenu", event => {
          event.preventDefault();
          state.swatches = state.swatches.filter(v => v !== color);
          saveSwatches();
          renderSwatches();
        });
      }
      container.appendChild(btn);
    }
    const add = document.createElementNS(HTML_NS, "button");
    add.className = "ioscp-swatch ioscp-add-swatch";
    add.type = "button";
    add.textContent = "+";
    add.title = "Salva il colore nella palette";
    add.addEventListener("click", addSwatch);
    container.appendChild(add);
  }

  function renderGrid() {
    const grid = root.querySelector("#ioscp-grid");
    grid.replaceChildren();
    const colors = [];

    for (let i = 0; i < 12; i++) {
      const v = Math.round(255 - (255 * i) / 11);
      colors.push([v, v, v]);
    }

    const lightness = [92, 84, 75, 66, 57, 49, 41, 33, 25];
    const saturation = [82, 84, 86, 88, 90, 92, 94, 96, 98];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 12; col++) {
        const hue = (col * 30 + 0) % 360;
        colors.push(hslToRgb(hue, saturation[row], lightness[row]));
      }
    }

    for (const [r, g, b] of colors) {
      const btn = document.createElementNS(HTML_NS, "button");
      const color = `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
      btn.type = "button";
      btn.className = "ioscp-grid-color";
      btn.style.setProperty("--grid-color", color);
      btn.dataset.color = color;
      btn.title = color;
      btn.addEventListener("click", () => setColor(r, g, b, state.a));
      grid.appendChild(btn);
    }
  }

  function spectrumColorAt(xNorm, yNorm) {
    const hue = (((1 - yNorm) * 360) + 0) % 360;
    const base = hsvToRgb(hue, 1, 1);
    if (xNorm <= 0.5) {
      const t = xNorm / 0.5;
      return base.map(c => Math.round(255 + (c - 255) * t));
    }
    const t = (xNorm - 0.5) / 0.5;
    return base.map(c => Math.round(c * (1 - t)));
  }

  function renderSpectrum() {
    if (!spectrumCanvas) return;
    const width = 360;
    const height = 190;
    spectrumCanvas.width = width;
    spectrumCanvas.height = height;
    const ctx = spectrumCanvas.getContext("2d", { alpha: false });
    const image = ctx.createImageData(width, height);
    let i = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = spectrumColorAt(x / (width - 1), y / (height - 1));
        image.data[i++] = r;
        image.data[i++] = g;
        image.data[i++] = b;
        image.data[i++] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function updateSpectrumMarker() {
    if (!spectrumMarker) return;
    const [, s, v] = rgbToHsv(state.r, state.g, state.b);
    const [h] = rgbToHsv(state.r, state.g, state.b);
    let x;
    if (s < 0.999 && v > 0.999) x = 0.5 * s;
    else if (s > 0.999) x = 0.5 + 0.5 * (1 - v);
    else {
      const whiteDistance = 1 - s;
      const blackDistance = 1 - v;
      x = whiteDistance >= blackDistance ? 0.5 * s : 0.5 + 0.5 * (1 - v);
    }
    const y = 1 - h / 360;
    spectrumMarker.style.left = `${clamp(x, 0, 1) * 100}%`;
    spectrumMarker.style.top = `${clamp(y, 0, 1) * 100}%`;
    spectrumMarker.style.setProperty("--marker-color", rgbHex());
  }

  function pickFromSpectrum(event) {
    const rect = spectrumCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const [r, g, b] = spectrumColorAt(x, y);
    setColor(r, g, b, state.a);
    spectrumMarker.style.left = `${x * 100}%`;
    spectrumMarker.style.top = `${y * 100}%`;
  }

  function updateUI() {
    if (!root) return;
    const hex = rgbHex();
    root.style.setProperty("--ioscp-current", hex);
    root.style.setProperty("--ioscp-alpha", `${state.a / 100}`);
    root.style.setProperty("--ioscp-current-rgba", `rgba(${state.r}, ${state.g}, ${state.b}, ${state.a / 100})`);

    for (const channel of ["r", "g", "b"]) {
      const range = root.querySelector(`#ioscp-${channel}-range`);
      const number = root.querySelector(`#ioscp-${channel}-number`);
      if (range) range.value = state[channel];
      if (number) number.value = state[channel];
    }

    const hexInput = root.querySelector("#ioscp-hex");
    if (hexInput && document.activeElement !== hexInput) hexInput.value = hex.slice(1);

    const opacityRange = root.querySelector("#ioscp-opacity-range");
    const opacityNumber = root.querySelector("#ioscp-opacity-number");
    if (opacityRange) opacityRange.value = state.a;
    if (opacityNumber && document.activeElement !== opacityNumber) opacityNumber.value = state.a;

    const rRange = root.querySelector("#ioscp-r-range");
    const gRange = root.querySelector("#ioscp-g-range");
    const bRange = root.querySelector("#ioscp-b-range");
    rRange?.style.setProperty("--range-gradient", `linear-gradient(90deg, rgb(0 ${state.g} ${state.b}), rgb(255 ${state.g} ${state.b}))`);
    gRange?.style.setProperty("--range-gradient", `linear-gradient(90deg, rgb(${state.r} 0 ${state.b}), rgb(${state.r} 255 ${state.b}))`);
    bRange?.style.setProperty("--range-gradient", `linear-gradient(90deg, rgb(${state.r} ${state.g} 0), rgb(${state.r} ${state.g} 255))`);

    root.querySelectorAll(".ioscp-grid-color").forEach(el => {
      el.classList.toggle("selected", el.dataset.color?.toUpperCase() === hex);
    });
    renderSwatches();
    updateSpectrumMarker();
  }

  function selectTab(tab) {
    state.tab = tab;
    root.querySelectorAll(".ioscp-tab").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.tab === tab);
      btn.setAttribute("aria-selected", btn.dataset.tab === tab ? "true" : "false");
    });
    root.querySelectorAll(".ioscp-page").forEach(page => {
      page.hidden = page.dataset.page !== tab;
    });
  }

  function currentZenPicker() {
    return window.gZenThemePicker || null;
  }

  function syncFromZen() {
    const picker = currentZenPicker();
    try {
      const colors = picker?.workspaceBeingEdited?.theme?.gradientColors || [];
      const candidate = colors.find(c => c.isPrimary) || colors[0];
      if (candidate?.c != null) {
        const parsed = parseColor(candidate.c);
        if (parsed) {
          state.r = clamp(Math.round(parsed.r), 0, 255);
          state.g = clamp(Math.round(parsed.g), 0, 255);
          state.b = clamp(Math.round(parsed.b), 0, 255);
          state.a = clamp(Math.round(parsed.a), 0, 100);
        }
      }
    } catch {}
    updateUI();
  }

  function makeCustomDot(color, primary = true) {
    const dot = document.createElementNS(HTML_NS, "div");
    dot.className = `zen-theme-picker-dot hidden custom${primary ? " primary" : ""}`;
    dot.style.opacity = "0";
    dot.style.setProperty("--zen-theme-picker-dot-color", color);
    return dot;
  }

  function applyAsSingleColor() {
    const picker = currentZenPicker();
    const customList = panel?.querySelector("#PanelUI-zen-gradient-generator-custom-list");
    if (!picker || !customList) {
      showStatus("Picker Zen non disponibile", true);
      return;
    }

    try {
      panel.querySelectorAll(".zen-theme-picker-dot").forEach(dot => dot.remove());
      picker.dots = [];
      customList.replaceChildren();
      customList.appendChild(makeCustomDot(rgbaHex(), true));
      picker.useAlgo = "";
      picker.updateCurrentWorkspace(false);
      showStatus("Colore applicato al tema");
    } catch (error) {
      console.error(`[${MOD_ID}]`, error);
      showStatus("Impossibile applicare il colore", true);
    }
  }

  function addToGradient() {
    const picker = currentZenPicker();
    const nativeInput = panel?.querySelector("#PanelUI-zen-gradient-generator-custom-input");
    const nativeOpacity = panel?.querySelector("#PanelUI-zen-gradient-generator-custom-opacity");
    const nativeAdd = panel?.querySelector("#PanelUI-zen-gradient-generator-color-custom-add");
    if (!picker || !nativeInput || !nativeOpacity || !nativeAdd) {
      showStatus("Controlli Zen non disponibili", true);
      return;
    }

    const currentCount = panel.querySelectorAll(".zen-theme-picker-dot").length;
    if (currentCount >= 3) {
      showStatus("Zen supporta fino a 3 colori nel gradiente", true);
      return;
    }

    try {
      nativeInput.value = rgbHex();
      nativeOpacity.value = String(state.a / 100);
      nativeAdd.dispatchEvent(new Event("command", { bubbles: true }));
      picker.updateCurrentWorkspace(false);
      showStatus("Colore aggiunto al gradiente");
    } catch (error) {
      console.error(`[${MOD_ID}]`, error);
      showStatus("Impossibile aggiungere il colore", true);
    }
  }

  function bindRange(channel) {
    const range = root.querySelector(`#ioscp-${channel}-range`);
    const number = root.querySelector(`#ioscp-${channel}-number`);
    range.addEventListener("input", () => {
      state[channel] = clamp(range.value, 0, 255);
      updateUI();
    });
    number.addEventListener("input", () => {
      state[channel] = clamp(number.value, 0, 255);
      updateUI();
    });
  }

  function buildUI() {
    root = document.createElementNS(HTML_NS, "div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="ioscp-header">
        <button class="ioscp-icon-button ioscp-eyedropper" type="button" title="Pipetta a schermo non esposta da Zen/Firefox" disabled aria-label="Pipetta">
          <span class="ioscp-pipette-glyph">⌁</span>
        </button>
        <div class="ioscp-title">Colori</div>
        <button class="ioscp-done" type="button">Fine</button>
      </div>

      <div class="ioscp-tabs" role="tablist" aria-label="Modalità selettore colore">
        <button class="ioscp-tab selected" type="button" data-tab="grid" role="tab" aria-selected="true">Griglia</button>
        <button class="ioscp-tab" type="button" data-tab="spectrum" role="tab" aria-selected="false">Spettro</button>
        <button class="ioscp-tab" type="button" data-tab="sliders" role="tab" aria-selected="false">Cursori</button>
      </div>

      <div class="ioscp-pages">
        <section class="ioscp-page" data-page="grid">
          <div id="ioscp-grid" class="ioscp-grid" aria-label="Griglia colori"></div>
        </section>

        <section class="ioscp-page" data-page="spectrum" hidden>
          <div class="ioscp-spectrum-wrap">
            <canvas id="ioscp-spectrum" class="ioscp-spectrum" aria-label="Spettro colore"></canvas>
            <div id="ioscp-spectrum-marker" class="ioscp-spectrum-marker" aria-hidden="true"></div>
          </div>
        </section>

        <section class="ioscp-page ioscp-sliders-page" data-page="sliders" hidden>
          <div class="ioscp-slider-row">
            <span class="ioscp-channel-label">R</span>
            <input id="ioscp-r-range" class="ioscp-range" type="range" min="0" max="255" step="1">
            <input id="ioscp-r-number" class="ioscp-number" type="number" min="0" max="255" step="1">
          </div>
          <div class="ioscp-slider-row">
            <span class="ioscp-channel-label">G</span>
            <input id="ioscp-g-range" class="ioscp-range" type="range" min="0" max="255" step="1">
            <input id="ioscp-g-number" class="ioscp-number" type="number" min="0" max="255" step="1">
          </div>
          <div class="ioscp-slider-row">
            <span class="ioscp-channel-label">B</span>
            <input id="ioscp-b-range" class="ioscp-range" type="range" min="0" max="255" step="1">
            <input id="ioscp-b-number" class="ioscp-number" type="number" min="0" max="255" step="1">
          </div>
          <div class="ioscp-hex-row">
            <span>sRGB Hex Color #</span>
            <input id="ioscp-hex" class="ioscp-hex" type="text" maxlength="6" spellcheck="false" autocomplete="off" value="0A84FF">
          </div>
        </section>
      </div>

      <div class="ioscp-common-controls">
        <div class="ioscp-opacity-row">
          <div class="ioscp-current-well" aria-label="Colore selezionato"></div>
          <div class="ioscp-opacity-control">
            <div class="ioscp-control-caption"><span>Opacità</span><span><input id="ioscp-opacity-number" type="number" min="0" max="100" step="1">%</span></div>
            <input id="ioscp-opacity-range" class="ioscp-opacity-range" type="range" min="0" max="100" step="1">
          </div>
        </div>

        <div class="ioscp-palette-title">Preferiti</div>
        <div id="ioscp-swatches" class="ioscp-swatches"></div>

        <div class="ioscp-actions">
          <button id="ioscp-apply" class="ioscp-primary-action" type="button">Applica colore</button>
          <button id="ioscp-add-gradient" class="ioscp-secondary-action" type="button">Aggiungi al gradiente</button>
        </div>
        <button id="ioscp-toggle-native" class="ioscp-native-toggle" type="button">Mostra controlli Zen</button>
        <div id="ioscp-status" class="ioscp-status" role="status" aria-live="polite"></div>
      </div>
    `;

    const view = panel.querySelector("#PanelUI-zen-gradient-generator-view");
    view.prepend(root);

    const nativeGradient = panel.querySelector(".zen-theme-picker-gradient");
    const pageLeft = panel.querySelector("#PanelUI-zen-gradient-generator-color-page-left");
    const nativeControls = panel.querySelector("#PanelUI-zen-gradient-generator-controls");
    const nativeCustom = panel.querySelector("#PanelUI-zen-gradient-generator-custom-colors");
    nativeGradient?.classList.add("ioscp-native-section");
    pageLeft?.parentElement?.classList.add("ioscp-native-section");
    nativeControls?.classList.add("ioscp-native-section");
    nativeCustom?.classList.add("ioscp-native-section");
    panel.classList.add("ioscp-enhanced");

    spectrumCanvas = root.querySelector("#ioscp-spectrum");
    spectrumMarker = root.querySelector("#ioscp-spectrum-marker");

    renderGrid();
    renderSpectrum();
    loadSwatches();

    root.querySelectorAll(".ioscp-tab").forEach(btn => {
      btn.addEventListener("click", () => selectTab(btn.dataset.tab));
    });

    bindRange("r");
    bindRange("g");
    bindRange("b");

    const hex = root.querySelector("#ioscp-hex");
    hex.addEventListener("input", () => {
      const cleaned = hex.value.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6).toUpperCase();
      hex.value = cleaned;
      if (cleaned.length === 6) {
        const parsed = parseColor(`#${cleaned}`);
        if (parsed) setColor(parsed.r, parsed.g, parsed.b, state.a);
      }
    });
    hex.addEventListener("blur", updateUI);

    const opacityRange = root.querySelector("#ioscp-opacity-range");
    const opacityNumber = root.querySelector("#ioscp-opacity-number");
    opacityRange.addEventListener("input", () => {
      state.a = clamp(opacityRange.value, 0, 100);
      updateUI();
    });
    opacityNumber.addEventListener("input", () => {
      state.a = clamp(opacityNumber.value, 0, 100);
      updateUI();
    });

    spectrumCanvas.addEventListener("pointerdown", event => {
      state.draggingSpectrum = true;
      spectrumCanvas.setPointerCapture?.(event.pointerId);
      pickFromSpectrum(event);
    });
    spectrumCanvas.addEventListener("pointermove", event => {
      if (state.draggingSpectrum) pickFromSpectrum(event);
    });
    spectrumCanvas.addEventListener("pointerup", event => {
      state.draggingSpectrum = false;
      spectrumCanvas.releasePointerCapture?.(event.pointerId);
    });
    spectrumCanvas.addEventListener("pointercancel", () => {
      state.draggingSpectrum = false;
    });

    root.querySelector("#ioscp-apply").addEventListener("click", applyAsSingleColor);
    root.querySelector("#ioscp-add-gradient").addEventListener("click", addToGradient);
    root.querySelector(".ioscp-done").addEventListener("click", () => panel.hidePopup?.());

    const nativeToggle = root.querySelector("#ioscp-toggle-native");
    nativeToggle.addEventListener("click", () => {
      const shown = panel.classList.toggle("ioscp-show-native");
      nativeToggle.textContent = shown ? "Nascondi controlli Zen" : "Mostra controlli Zen";
    });

    panel.addEventListener("popupshowing", () => {
      setTimeout(syncFromZen, 0);
    });

    updateUI();
  }

  function destroy() {
    root?.remove();
    panel?.classList.remove("ioscp-enhanced", "ioscp-show-native");
    panel?.querySelectorAll(".ioscp-native-section").forEach(el => el.classList.remove("ioscp-native-section"));
    root = null;
    panel = null;
    spectrumCanvas = null;
    spectrumMarker = null;
    delete window.__zenIOSColorPicker;
  }

  function init() {
    panel = document.getElementById("PanelUI-zen-gradient-generator");
    if (!panel || panel.querySelector(`#${ROOT_ID}`)) return false;
    buildUI();
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (init() || attempts > 120) clearInterval(timer);
  }, 250);

  window.__zenIOSColorPicker = {
    version: "0.1.0",
    destroy,
    applyAsSingleColor,
    addToGradient,
  };
})();


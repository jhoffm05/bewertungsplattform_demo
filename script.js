/*========================================
  SICHTBARKEITSSTEUERUNG
  Setze auf "on" um Tracking-UI anzuzeigen,
  oder "off" um sie zu verstecken
========================================*/
const TRACKING_VISIBILITY = "off"; // "on" oder "off"

/*========================================
  KONFIGURATION & KONSTANTEN
========================================*/
const CONFIG = {
  maxTrackingTimeMs: 7 * 60 * 1000,  // Max. Tracking-Dauer: 7 Minuten
  mouseSampleInterval: 200,           // Maus-Sampling alle 200ms
  parentOrigin: "https://sosci.rlp.net"
};

// Trackbare CSS-Selektoren
const TRACKABLE_SELECTORS = [
  ".star-rating", ".total-rating", ".total-scale", ".reviewstar",
  ".reviewtext", ".corporate", ".ki-box", ".authorname",
  ".authorinformation", ".reviewdate", ".avatar", ".hilfreich", ".verifizierung", ".usercontent"
];

/*========================================
  REVEAL-FUNKTIONEN (CONFIG)
========================================*/

// Mapping: Key -> { selector, blurClass, label, overlayText }
const REVEAL_CONFIG = {
  stars:             { selector: ".star-rating",       blur: "blurred",   label: "Sternebewertung",             overlayText: "★★★★★" },
  reviewstar:        { selector: ".reviewstar",        blur: "blurredx5", label: "Einzelne Sternebewertung",    overlayText: "★★★★★" },
  reviewtext:        { selector: ".reviewtext",        blur: "blurred",   label: "Einzelrezension Text",        overlayText: "Rezensionstext" },
  totalrating:       { selector: ".total-rating",      blur: "blurred",   label: "Gesamtbewertung",             overlayText: "Anzahl" },
  totalscale:        { selector: ".total-scale",       blur: "blurredx5", label: "Bewertungsskala",             overlayText: "Bewertungsskala" },
  corporate:         { selector: ".corporate",         blur: "blurred",   label: "Unternehmenskommentar",       overlayText: "Unternehmenskommentar" },
  ki:                { selector: ".ki-box",            blur: "blurred",   label: "KI-Zusammenfassung",          overlayText: "KI‑Zusammenfassung" },
  authorname:        { selector: ".authorname",        blur: "blurred",   label: "Rezensent:in Name",           overlayText: "Autor/in" },
  authorinformation: { selector: ".authorinformation", blur: "blurred",   label: "Rezensent:in Informationen",  overlayText: "Autor/in Informationen" },
  reviewdate:        { selector: ".reviewdate",        blur: "blurred",   label: "Rezension Datum",             overlayText: "Veröffentlichung" },
  hilfreich:         { selector: ".hilfreich",         blur: "blurred",   label: "Hilfreich",                   overlayText: "..." },
  avatar:            { selector: ".avatar",            blur: "blurredx5", label: "Profilbild",                  overlayText: "Profilbild" },
  verifizierung:     { selector: ".verifizierung",     blur: "blurred",   label: "Rezensent:in Verifizierung",  overlayText: "Verifizierung" },
  usercontent:       { selector: ".usercontent",       blur: "blurredx10", label: "Beitragsbilder",              overlayText: "Beitragsbilder" }
};

/*========================================
  ZUSTANDSVARIABLEN
========================================*/
const trackingStartTime = Date.now();
let pageLoadTime = Date.now();
let layoutState = getLayoutState();

// Reveal-Status für alle Elemente
const revealedElements = {
  stars: false, reviewstar: false, reviewtext: false, totalrating: false,
  totalscale: false, corporate: false, ki: false, authorname: false,
  authorinformation: false, reviewdate: false, hilfreich: false,
  avatar: false, verifizierung: false, usercontent: false
};

// Tracking-Daten
let revealOrder = [];
let revealTimes = {};
let interactionOrder = [];
let interactionCounter = 0;
let mouseHeatmapElements = {};
let lastMouseSample = 0;

// Button-Timing
let startButtonShownAt = null;
let startButtonClickedAt = null;
let startButtonDurationMs = null;
let startButtonClicked = false;
let endButtonClickedAt = null;
let endButtonDurationMs = null;
let endButtonClicked = false;

/*========================================
  HILFSFUNKTIONEN
========================================*/

// Prüft ob Tracking-UI sichtbar sein soll
function isTrackingVisible() {
  return TRACKING_VISIBILITY === "on";
}

// Prüft ob Tracking noch aktiv (innerhalb Zeitlimit)
function isTrackingActive() {
  return Date.now() - trackingStartTime <= CONFIG.maxTrackingTimeMs;
}

// Ermittelt Layout: mobile | 2-hotels | 3-hotels
function getLayoutState() {
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  return w < 1200 ? "2-hotels" : "3-hotels";
}

// Sendet Daten an Parent-Frame (SoSciSurvey)
function postToParent(type, payload) {
  if (window.parent !== window) {
    window.parent.postMessage({ type, payload }, CONFIG.parentOrigin);
    console.log(`Iframe -> Parent (${type}) gesendet:`, payload);
  }
}

/*========================================
  BLUR-LABELS (Overlay über geblurrten Feldern)
========================================*/
function isBlurredElement(el) {
  return el.classList.contains("blurred") || 
         el.classList.contains("blurredx5") || 
         el.classList.contains("blurredx10");
}

function ensureBlurLabelWrapper(el) {
  const parent = el.parentElement;
  if (parent && parent.classList.contains("blur-label-wrapper")) return parent;

  const wrapper = document.createElement("div");
  wrapper.className = "blur-label-wrapper";

  // Wrapper-Display möglichst layoutschonend wählen
  const display = getComputedStyle(el).display;
  if (["inline", "inline-block", "inline-flex"].includes(display)) {
    wrapper.style.display = "inline-block";
  } else {
    wrapper.style.display = "block";
    wrapper.style.width = "100%";
  }

  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

// Geändert: Dritter Parameter "key" für Klick-Handler
function addBlurLabel(el, text, key) {
  const wrapper = ensureBlurLabelWrapper(el);

  let label = wrapper.querySelector(":scope > .blur-label");
  if (!label) {
    label = document.createElement("div");
    label.className = "blur-label";
    label.innerHTML = `<span class="blur-label__text"></span>`;
    
    // NEU: Label wird klickbarer Button zum Enthüllen
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      if (key && !revealedElements[key]) {
        reveal(key);
      }
    });
    
    wrapper.appendChild(label);
  }

  label.querySelector(".blur-label__text").textContent = text;

  // Nur anzeigen, wenn wirklich geblurrt
  label.style.display = isBlurredElement(el) ? "flex" : "none";
  
  if (
    el.closest(".authorinfo") || 
    el.classList.contains("avatar") || 
    el.classList.contains("total-scale")
  ) {
    label.classList.add("blur-label--left-aligned");
  } else {
    label.classList.remove("blur-label--left-aligned");
  }
}

function removeBlurLabel(el) {
  const wrapper = el.parentElement;
  if (!wrapper || !wrapper.classList.contains("blur-label-wrapper")) return;

  const label = wrapper.querySelector(":scope > .blur-label");
  if (label) label.remove();
}

// Geändert: Übergibt Key an addBlurLabel
function initBlurLabels() {
  for (const [key, cfg] of Object.entries(REVEAL_CONFIG)) {
    document.querySelectorAll(cfg.selector).forEach(el => {
      if (isBlurredElement(el)) {
        addBlurLabel(el, cfg.overlayText || cfg.label, key);
      }
    });
  }
}

/*========================================
  DATEN-FORMATIERUNGSFUNKTIONEN
========================================*/

/**
 * Konvertiert revealTimes von Millisekunden zu Sekunden (4 Dezimalstellen)
 * relativ zu pageLoadTime
 */
function formatRevealTimes() {
  const formatted = {};
  for (const [elementName, timestamp] of Object.entries(revealTimes)) {
    const secondsSincePageLoad = ((timestamp - pageLoadTime) / 1000).toFixed(4);
    formatted[elementName] = parseFloat(secondsSincePageLoad);
  }
  return formatted;
}

/**
 * Erstellt revealOrder als nummeriertes Objekt
 * {1: "Element1", 2: "Element2", ...}
 */
function formatRevealOrder() {
  return revealOrder.reduce((acc, element, index) => {
    acc[index + 1] = element;
    return acc;
  }, {});
}

/**
 * Erstellt numerische Rangvariablen
 * für jedes eWOM-Element (SoSci-kompatibel)
 *
 * Ergebnis:
 * {
 *   rank_stars: 1,
 *   rank_reviewtext: 3,
 *   rank_ki: 0
 * }
 */
function formatRevealRanksNumeric() {

  const ranks = {};

  // alle Elemente initial = 0 (nicht geöffnet)
  Object.keys(REVEAL_CONFIG).forEach(key => {
    ranks[`rank_${key}`] = 0;
  });

  // tatsächliche Rangposition eintragen
  revealOrder.forEach((label, index) => {

    // Label → Key zurückübersetzen
    const entry = Object.entries(REVEAL_CONFIG)
      .find(([k, v]) => v.label === label);

    if (entry) {
      const key = entry[0];
      ranks[`rank_${key}`] = index + 1;
    }
  });

  return ranks;
}

/*========================================
  INTERAKTIONS-LOGGING
========================================*/

// Loggt Interaktion (z.B. Button-Klick)
function logInteraction(elementName) {
  if (!isTrackingActive()) return;

  const timestamp = Date.now();
  interactionOrder.push({
    order: ++interactionCounter,
    element: elementName,
    time: timestamp
  });

  console.log(`[Tracking] #${interactionCounter} – ${elementName} – ${new Date(timestamp).toLocaleTimeString()}`);
}

// Loggt Reveal mit Zeitdifferenz
function logReveal(elementName) {
  if (!isTrackingActive()) return;

  const now = Date.now();
  const lastTime = revealOrder.length ? revealTimes[revealOrder.at(-1)] : pageLoadTime;
  const duration = ((now - lastTime) / 1000).toFixed(1);

  revealOrder.push(elementName);
  revealTimes[elementName] = now;

  // UI nur aktualisieren wenn sichtbar
  if (isTrackingVisible()) {
    const list = ensureRevealList();
    const li = document.createElement("li");
    li.innerHTML = `${revealOrder.length}. ${elementName} <em>(${duration}s)</em>`;
    list.appendChild(li);
  }

  // ===== CONSOLE-AUSGABE =====
  const position = revealOrder.length;
  const secondsNow = ((now - pageLoadTime) / 1000).toFixed(4);

  const formattedData = {
    revealOrder_Position: position,
    revealOrder_Element: elementName,
    revealOrder_Complete: formatRevealOrder(),
    revealTimes_seconds: formatRevealTimes(),
    secondsSincePageLoad_current: parseFloat(secondsNow)
  };

  console.log(`[Tracking-Daten] #${position} "${elementName}" @ ${secondsNow}s:`, formattedData);

  // Sende formatierte Daten an Parent
  postToParent("revealTracking", {
    revealOrder: formatRevealOrder(),
    revealTimes: formatRevealTimes(),
    revealRanks: formatRevealRanksNumeric(),
    pageLoadTime: 0.0
  });
}

/*========================================
  REVEAL (Generisch)
========================================*/
function reveal(key) {
  if (!key) return;
  if (revealedElements[key]) return;

  const config = REVEAL_CONFIG[key];
  if (!config) return;

  document.querySelectorAll(config.selector).forEach(el => {
    el.classList.remove(config.blur);
    removeBlurLabel(el);
  });

  revealedElements[key] = true;
  logReveal(config.label);
}

/*========================================
  MAUS-HEATMAP
========================================*/

// Baut eindeutigen Key: "Hotelname | Selector"
function buildElementKey(el, selector) {
  const hotel = el.closest(".hotel-card");
  const name = hotel?.querySelector(".card-title")?.innerText.trim() || "unknown";
  return `${name} | ${selector}`;
}

// Fügt Heatmap-Overlay zu Element hinzu (nur wenn sichtbar)
function ensureHeatmapOverlay(el) {
  if (!isTrackingVisible()) return;
  if (el.classList.contains("heatmap-wrapper")) return;
  el.classList.add("heatmap-wrapper");
  const overlay = document.createElement("div");
  overlay.className = "heatmap-overlay";
  el.appendChild(overlay);
}

// Aktualisiert visuelle Heatmap (nur wenn sichtbar)
function updateVisualHeatmap() {
  if (!isTrackingVisible()) return;
  
  const values = Object.values(mouseHeatmapElements);
  if (!values.length) return;

  const maxVal = Math.max(...values);
  TRACKABLE_SELECTORS.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      ensureHeatmapOverlay(el);
      const key = buildElementKey(el, sel);
      const intensity = Math.min((mouseHeatmapElements[key] || 0) / maxVal, 1);
      const overlay = el.querySelector(".heatmap-overlay");
      if (overlay) overlay.style.background = `rgba(255,0,0,${intensity * 0.45})`;
    });
  });
}

// Trackt Mausbewegung über Elemente
function trackMouse(event) {
  if (!isTrackingActive() || layoutState === "mobile") return;
  if (Date.now() - lastMouseSample < CONFIG.mouseSampleInterval) return;
  lastMouseSample = Date.now();

  for (const sel of TRACKABLE_SELECTORS) {
    const el = event.target.closest(sel);
    if (el) {
      const key = buildElementKey(el, sel);
      mouseHeatmapElements[key] = (mouseHeatmapElements[key] || 0) + 1;
      if (isTrackingVisible()) {
        updateHeatmapDisplay();
        updateVisualHeatmap();
      }
      break;
    }
  }
}

/*========================================
  UI-ELEMENTE
========================================*/

// Erstellt Reveal-Liste (nur wenn sichtbar)
function ensureRevealList() {
  if (!isTrackingVisible()) return null;
  
  let list = document.getElementById("reveal-order-list");
  if (!list) {
    const box = document.createElement("div");
    box.id = "reveal-order-box";
    box.style.cssText = "position:fixed;right:10px;top:10px;max-width:260px;z-index:9999;background:#fff;padding:8px;border:1px solid #ccc;font-size:12px";
    box.innerHTML = "<strong>Unblur-Reihenfolge</strong><ol id='reveal-order-list' style='margin:6px 0;padding-left:20px'></ol>";
    document.body.appendChild(box);
    list = document.getElementById("reveal-order-list");
  }
  return list;
}

// Erstellt/aktualisiert Heatmap-Box (nur wenn sichtbar)
function updateHeatmapDisplay() {
  if (!isTrackingVisible()) return;
  
  let box = document.getElementById("heatmap-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "heatmap-box";
    box.style.cssText = "position:fixed;right:10px;bottom:10px;width:260px;max-height:200px;overflow:auto;background:#fff;border:1px solid #ccc;padding:6px;font-size:11px;z-index:9999";
    box.innerHTML = "<strong>Live-Heatmap</strong><div id='heatmap-content'></div>";
    document.body.appendChild(box);
  }
  document.getElementById("heatmap-content").innerHTML =
    Object.entries(mouseHeatmapElements)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join("<br>");
}

/*========================================
  SHUFFLE-FUNKTIONEN
========================================*/

// Fisher-Yates Shuffle für Array
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Shuffelt Hotel-Karten
function shuffleHotels() {
  const container = document.querySelector(".row.g-4");
  if (!container) {
    console.warn("Container .row.g-4 nicht gefunden — Shuffle übersprungen");
    return;
  }
  shuffleArray([...container.children]).forEach(c => container.appendChild(c));
}

// Shuffelt Reviews innerhalb jeder Scrollbar
function shuffleReviews() {
  const scrollbars = document.querySelectorAll(".scrollbar");
  if (!scrollbars.length) {
    console.warn("Keine .scrollbar-Elemente gefunden — Review-Shuffle übersprungen");
    return;
  }
  scrollbars.forEach(sb => {
    const reviews = [...sb.querySelectorAll(":scope > .reviewall")];
    if (reviews.length > 1) {
      shuffleArray(reviews).forEach(r => sb.appendChild(r));
    }
  });
}

/*========================================
  END-TRACKING
========================================*/
function endTracking() {
  if (endButtonClicked) return;
  endButtonClicked = true;

  // Zeitberechnung
  endButtonClickedAt = Date.now();
  endButtonDurationMs = endButtonClickedAt - (startButtonClickedAt || pageLoadTime);

  // Interaktion loggen
  logInteraction("Fenster schließen");

  // Console-Ausgaben
  console.log("=== TRACKING BEENDET ===");
  console.log("Gesamtdauer nach Start-Button (ms):", endButtonDurationMs);
  console.log("Live-Heatmap Daten:", mouseHeatmapElements);

  // ===== FINALE DATEN MIT FORMATIERUNG =====
  const finalPayload = {
    mouseHeatmapElements,
    revealOrder: formatRevealOrder(),
    revealTimes: formatRevealTimes(),
    revealRanks: formatRevealRanksNumeric(),
    pageLoadTime: 0.0,
    startButtonDurationMs,
    endButtonDurationMs,
    interactionOrder
  };

  console.log("=== FINALE DATEN AN PARENT ===", finalPayload);
  postToParent("heatmapTracking", finalPayload);

  // Weißer End-Screen
  const screen = document.createElement("div");
  screen.id = "endWhiteScreen";
  screen.style.cssText = `
    position:fixed;inset:0;background:#fff;z-index:999999;
    display:flex;align-items:center;justify-content:center;
    flex-direction:column;font-family:system-ui,sans-serif;
    transition:opacity 0.6s ease;
  `;
  screen.innerHTML = `<h2 style="font-size:28px;margin-bottom:16px;color:#333">Sie können nun mit "weiter" fortfahren.</h2>`;
  document.body.appendChild(screen);

  // Sanftes Einblenden
  requestAnimationFrame(() => {
    screen.style.opacity = "0";
    requestAnimationFrame(() => {
      screen.style.opacity = "1";
    });
  });

  // Cleanup
  document.removeEventListener("mousemove", trackMouse);
  const closeBtn = document.getElementById("closeTrackingButton");
  if (closeBtn) closeBtn.style.display = "none";
}

/*========================================
  CSS INJECTION
========================================*/
const style = document.createElement("style");
style.textContent = `
  .heatmap-wrapper { position: relative; }
  .heatmap-overlay {
    position: absolute; inset: 0;
    pointer-events: none; z-index: 2;
    background: rgba(255,0,0,0);
    transition: background 0.2s ease;
  }

  /* ===== Blur-Labels ===== */
  .blur-label-wrapper { position: relative; }

  .blur-label {
    position: absolute; 
    inset: 0;
    align-items: center;
    justify-content: center;
    text-align: center;
    /* NEU: Labels sind klickbar */
    pointer-events: auto;
    cursor: pointer;
    z-index: 3; /* Über dem geblurrtem Inhalt */
  }

  /* Linkszentriert für authorinfo, avatar und total-scale */
  .blur-label--left-aligned {
    justify-content: flex-start;
    text-align: left;
    padding-left: 8px;
  }

  .blur-label__text {
    color: rgba(50, 50, 50, 0.95);
    font-size: 9px;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.85);
    box-shadow: 0 3px 9px rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    padding: 1px 3px;
    margin: 2px;
    /* NEU: Korrigierte rgba-Syntax */
    background-color: rgba(255, 255, 255, 0.85);
    font-weight: 500;
  }

  .blur-label--left-aligned .blur-label__text {
    margin: 0;
  }

  /* Hover-Effekt für bessere Erkennbarkeit als Button */
  .blur-label:hover .blur-label__text {
    background-color: rgba(255, 255, 255, 0.95);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  }
`;
document.head.appendChild(style);

/*========================================
  INITIALISIERUNG
========================================*/
document.addEventListener("DOMContentLoaded", () => {
  startButtonShownAt = Date.now();
  layoutState = getLayoutState();

  // Shuffle Hotels & Reviews
  shuffleHotels();
  shuffleReviews();

  // Labels auf alle geblurrten Felder legen (nach Shuffle!)
  // Übergibt jetzt Keys für klickbare Labels
  initBlurLabels();

  // Close-Button erstellen
  const closeBtn = document.createElement("button");
  closeBtn.id = "closeTrackingButton";
  closeBtn.textContent = "Fenster schließen";
  closeBtn.style.cssText = `
    position:fixed;bottom:10px;left:50%;transform:translateX(-50%);
    z-index:99999;padding:8px 18px;background:#dc3545;color:#fff;
    border:none;border-radius:12px;cursor:pointer;font-size:14px;
    font-weight:bold;box-shadow:0 6px 20px rgba(0,0,0,0.3);display:none;
  `;
  closeBtn.addEventListener("click", endTracking);
  document.body.appendChild(closeBtn);

  // Click-Handler für Reveals (Selector -> Key Mapping)
  // Wird nun hauptsächlich für nicht-geblurrtete Elemente genutzt
  const selectorToKey = Object.fromEntries(
    Object.entries(REVEAL_CONFIG).map(([k, v]) => [v.selector, k])
  );

  document.body.addEventListener("click", e => {
    // Verhindert doppeltes Auslösen bei Klick auf Label
    if (e.target.closest(".blur-label")) return;
    
    for (const sel of TRACKABLE_SELECTORS) {
      if (e.target.closest(sel)) {
        const key = selectorToKey[sel];
        if (key && !revealedElements[key]) {
          reveal(key);
        }
        break;
      }
    }
  });

  // Start-Button Handler
  const startBtn = document.getElementById("startButton");
  const startOverlay = document.getElementById("startOverlay");

  startBtn?.addEventListener("click", () => {
    if (startButtonClicked) return;
    startButtonClicked = true;

    startButtonClickedAt = Date.now();
    startButtonDurationMs = startButtonClickedAt - startButtonShownAt;

    logInteraction("Start-Button");
    console.log("Start-Button Verweildauer (ms):", startButtonDurationMs);

    if (startOverlay) startOverlay.style.display = "none";

    if (layoutState !== "mobile") {
      document.addEventListener("mousemove", trackMouse, { passive: true });
    }
    closeBtn.style.display = "block";
  });
});
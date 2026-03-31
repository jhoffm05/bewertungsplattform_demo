// ============================================================
// SICHTBARKEITSSTEUERUNG
// "on" zeigt die Tracking-UI an, "off" versteckt sie
// ============================================================
const TRACKING_VISIBILITY = "off";

// ============================================================
// KONFIGURATION
// ============================================================
const CONFIG = {
  maxTrackingTimeMs: 7 * 60 * 1000, // Maximale Tracking-Dauer: 7 Minuten
  mouseSampleInterval: 200,          // Maus-Position wird alle 200 ms geloggt
  parentOrigin: "https://sosci.rlp.net"
};

// CSS-Selektoren aller trackbaren Seitenelemente
const TRACKABLE_SELECTORS = [
  ".star-rating",
  ".total-rating",
  ".total-scale",
  ".reviewstar",
  ".reviewtext",
  ".corporate",
  ".ki-box",
  ".authorname",
  ".authorinformation",
  ".reviewdate",
  ".avatar",
  ".hilfreich",
  ".verifizierung",
  ".usercontent"
];

// ============================================================
// REVEAL-KONFIGURATION
// Single Source of Truth: Selektor, Blur-Klasse, Label und
// Overlay-Text je enthüllbarem Element
// ============================================================
const REVEAL_CONFIG = {
  stars:             { selector: ".star-rating",       blur: "blurred",    label: "Sternebewertung",            overlayText: "★★★★★" },
  reviewstar:        { selector: ".reviewstar",         blur: "blurredx5",  label: "Einzelne Sternebewertung",   overlayText: "★★★★★" },
  reviewtext:        { selector: ".reviewtext",         blur: "blurred",    label: "Einzelrezension Text",       overlayText: "Rezensionstext" },
  totalrating:       { selector: ".total-rating",       blur: "blurred",    label: "Gesamtbewertung",            overlayText: "Anzahl" },
  totalscale:        { selector: ".total-scale",        blur: "blurredx5",  label: "Bewertungsskala",            overlayText: "Bewertungsskala" },
  corporate:         { selector: ".corporate",          blur: "blurred",    label: "Unternehmenskommentar",      overlayText: "Unternehmenskommentar" },
  ki:                { selector: ".ki-box",             blur: "blurred",    label: "KI-Zusammenfassung",         overlayText: "KI‑Zusammenfassung" },
  authorname:        { selector: ".authorname",         blur: "blurred",    label: "Rezensent:in Name",          overlayText: "Autor/in" },
  authorinformation: { selector: ".authorinformation",  blur: "blurred",    label: "Rezensent:in Informationen", overlayText: "Autor/in Informationen" },
  reviewdate:        { selector: ".reviewdate",         blur: "blurred",    label: "Rezension Datum",            overlayText: "Veröffentlichung" },
  hilfreich:         { selector: ".hilfreich",          blur: "blurred",    label: "Hilfreich",                  overlayText: "..." },
  avatar:            { selector: ".avatar",             blur: "blurredx5",  label: "Profilbild",                 overlayText: "Profilbild" },
  verifizierung:     { selector: ".verifizierung",      blur: "blurred",    label: "Rezensent:in Verifizierung", overlayText: "Verifizierung" },
  usercontent:       { selector: ".usercontent",        blur: "blurredx10", label: "Beitragsbilder",             overlayText: "Beitragsbilder" }
};

// ============================================================
// ZUSTANDSVARIABLEN
// ============================================================

// pageLoadTime wird in DOMContentLoaded gesetzt (korrekter Messzeitpunkt)
let pageLoadTime = null;
let layoutState  = null; // wird ebenfalls in DOMContentLoaded initialisiert

// FIX: revealedElements wird aus REVEAL_CONFIG abgeleitet — keine manuelle Synchronisation nötig
const revealedElements = Object.fromEntries(Object.keys(REVEAL_CONFIG).map(k => [k, false]));

// Reveal-Tracking
let revealOrder = []; // Enthüllungsreihenfolge als Array von Keys
let revealTimes = {}; // Absoluter Timestamp je enthülltem Element (ms)

// Interaktions-Tracking
let interactionOrder   = []; // Alle geloggten Interaktionen mit Reihenfolge und Zeit
let interactionCounter = 0;

// Maus-Heatmap: { "Hotelname | Selektor" -> Anzahl Maussamples }
let mouseHeatmapElements = {};
let lastMouseSample      = 0; // Timestamp des letzten Samples (Throttle)

// Start-/End-Button Timing
let startButtonShownAt    = null;
let startButtonClickedAt  = null;
let startButtonDurationMs = null;
let startButtonClicked    = false;
let endButtonClickedAt    = null;
let endButtonDurationMs   = null;
let endButtonClicked      = false;

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

// Gibt true zurück, wenn die Tracking-UI angezeigt werden soll
function isTrackingVisible() {
  return TRACKING_VISIBILITY === "on";
}

// Gibt true zurück, solange das Zeitlimit noch nicht erreicht ist
function isTrackingActive() {
  return Date.now() - pageLoadTime <= CONFIG.maxTrackingTimeMs;
}

// Ermittelt das aktuelle Layout anhand der Fensterbreite
function getLayoutState() {
  const w = window.innerWidth;
  if (w < 768)  return "mobile";
  if (w < 1200) return "2-hotels";
  return "3-hotels";
}

// Sendet eine Nachricht per postMessage an den einbettenden SoSciSurvey-Frame
function postToParent(type, payload) {
  if (window.parent !== window) {
    window.parent.postMessage({ type, payload }, CONFIG.parentOrigin);
    console.log(`Iframe -> Parent (${type}) gesendet:`, payload);
  }
}

// ============================================================
// BLUR-LABELS
// Legt einen klickbaren Overlay-Text über geblurrte Felder
// ============================================================

// Prüft, ob ein Element eine der drei Blur-Klassen trägt
function isBlurredElement(el) {
  return el.classList.contains("blurred")
    || el.classList.contains("blurredx5")
    || el.classList.contains("blurredx10");
}

// Stellt sicher, dass das Element in einem .blur-label-wrapper liegt;
// legt diesen Wrapper bei Bedarf im DOM an
function ensureBlurLabelWrapper(el) {
  const parent = el.parentElement;
  if (parent && parent.classList.contains("blur-label-wrapper")) return parent;

  const wrapper = document.createElement("div");
  wrapper.className = "blur-label-wrapper";

  // Display des Wrappers an das Element anpassen, um das Layout nicht zu brechen
  const display = getComputedStyle(el).display;
  wrapper.style.display = ["inline", "inline-block", "inline-flex"].includes(display)
    ? "inline-block"
    : "block";
  if (wrapper.style.display === "block") wrapper.style.width = "100%";

  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

// Fügt einem geblurrten Element ein klickbares Label hinzu;
// ein Klick darauf ruft reveal(key) auf
function addBlurLabel(el, text, key) {
  const wrapper = ensureBlurLabelWrapper(el);

  let label = wrapper.querySelector(":scope > .blur-label");
  if (!label) {
    label = document.createElement("div");
    label.className = "blur-label";
    label.innerHTML = `<span class="blur-label__text"></span>`;

    label.addEventListener("click", (e) => {
      e.stopPropagation();
      if (key && !revealedElements[key]) reveal(key);
    });

    wrapper.appendChild(label);
  }

  label.querySelector(".blur-label__text").textContent = text;
  label.style.display = isBlurredElement(el) ? "flex" : "none";

  // Linksbündige Ausrichtung für Autor-/Avatar-/Skalenelemente
  const leftAligned = el.closest(".authorinfo")
    || el.classList.contains("avatar")
    || el.classList.contains("total-scale");
  label.classList.toggle("blur-label--left-aligned", !!leftAligned);
}

// Entfernt das Blur-Label eines Elements nach dem Enthüllen
function removeBlurLabel(el) {
  const wrapper = el.parentElement;
  if (!wrapper || !wrapper.classList.contains("blur-label-wrapper")) return;
  wrapper.querySelector(":scope > .blur-label")?.remove();
}

// Initialisiert Blur-Labels für alle beim Laden bereits geblurrten Elemente
function initBlurLabels() {
  for (const [key, cfg] of Object.entries(REVEAL_CONFIG)) {
    document.querySelectorAll(cfg.selector).forEach((el) => {
      if (isBlurredElement(el)) addBlurLabel(el, cfg.overlayText || cfg.label, key);
    });
  }
}

// ============================================================
// DATENFORMATIERUNG (für SoSciSurvey-Export)
// ============================================================

// Wandelt revealTimes von Millisekunden in Sekunden relativ
// zum Seitenlade-Zeitpunkt um (4 Dezimalstellen)
function formatRevealTimes() {
  const formatted = {};
  for (const [key, ts] of Object.entries(revealTimes)) {
    formatted[key] = parseFloat(((ts - pageLoadTime) / 1000).toFixed(4));
  }
  return formatted;
}

// Gibt revealOrder als nummeriertes Objekt zurück: { 1: "stars", 2: "ki", … }
function formatRevealOrder() {
  return revealOrder.reduce((acc, el, i) => {
    acc[i + 1] = el;
    return acc;
  }, {});
}

// Erstellt für jedes Element eine rank_*-Variable (0 = nicht enthüllt)
// Beispiel: { rank_stars: 1, rank_ki: 3, rank_avatar: 0 }
function formatRevealRanksNumeric() {
  const ranks = {};
  Object.keys(REVEAL_CONFIG).forEach(key => (ranks[`rank_${key}`] = 0));
  revealOrder.forEach((key, i) => (ranks[`rank_${key}`] = i + 1));
  return ranks;
}

// Erstellt binäre Revealed-Flags für jedes Element (0 = nicht enthüllt, 1 = enthüllt)
// Beispiel: { revealed_stars: 1, revealed_ki: 0 }
function formatRevealedFlags() {
  return Object.fromEntries(
    Object.keys(REVEAL_CONFIG).map(key => [`revealed_${key}`, revealedElements[key] ? 1 : 0])
  );
}

// Formatiert die Heatmap-Daten als flaches Objekt für SoSci
// Beispiel: { "heatmap_Hotel Ibis | .star-rating": 12 }
function formatHeatmapFlat() {
  return Object.fromEntries(
    Object.entries(mouseHeatmapElements).map(([k, v]) => [`heatmap_${k}`, v])
  );
}

// Formatiert interactionOrder für SoSci als nummeriertes Objekt
// Beispiel: { 1: "Start-Button @ 0.000s", 2: "stars @ 4.213s" }
function formatInteractionOrder() {
  return interactionOrder.reduce((acc, entry) => {
    const secs = ((entry.time - pageLoadTime) / 1000).toFixed(3);
    acc[entry.order] = `${entry.element} @ ${secs}s`;
    return acc;
  }, {});
}

// Gibt Gesamtanzahl enthüllter Elemente zurück
function countRevealed() {
  return revealOrder.length;
}

// Gibt die Studiendauer in Sekunden zurück (ab Start-Button-Klick bis End-Button)
function calcStudyDurationSec() {
  if (!startButtonClickedAt || !endButtonClickedAt) return null;
  return parseFloat(((endButtonClickedAt - startButtonClickedAt) / 1000).toFixed(3));
}

// Baut die vollständige finale Payload für SoSci zusammen
function buildFinalPayload() {
  return {
    // Reveal-Daten
    revealOrder:        formatRevealOrder(),
    revealTimes:        formatRevealTimes(),
    revealRanks:        formatRevealRanksNumeric(),
    revealedFlags:      formatRevealedFlags(),
    revealCount:        countRevealed(),

    // Heatmap
    mouseHeatmap:       formatHeatmapFlat(),

    // Zeitwerte (alle in Sekunden, relativ zu pageLoadTime)
    pageLoadTime:       0.0,
    startButtonDelaySec: startButtonDurationMs !== null
                          ? parseFloat((startButtonDurationMs / 1000).toFixed(3))
                          : null,
    studyDurationSec:   calcStudyDurationSec(),
    endButtonDelaySec:  endButtonDurationMs !== null
                          ? parseFloat((endButtonDurationMs / 1000).toFixed(3))
                          : null,

    // Interaktionsprotokoll
    interactionOrder:   formatInteractionOrder(),
    interactionCount:   interactionCounter,

    // Kontext
    layoutState,
  };
}

// ============================================================
// INTERAKTIONS-LOGGING
// ============================================================

// Loggt eine benannte Interaktion (z.B. Button-Klick) mit Timestamp
function logInteraction(elementName) {
  if (!isTrackingActive()) return;
  const timestamp = Date.now();
  interactionOrder.push({ order: ++interactionCounter, element: elementName, time: timestamp });
  console.log(`[Tracking] #${interactionCounter} – ${elementName} – ${new Date(timestamp).toLocaleTimeString()}`);
}

// Loggt die Enthüllung eines Elements inkl. Zeitabstand zur vorherigen Enthüllung
function logReveal(elementName) {
  // FIX: isTrackingActive()-Check auch hier, damit revealOrder und
  // revealedElements nach Zeitablauf konsistent bleiben
  if (!isTrackingActive()) {
    console.warn(`[Tracking] Zeitlimit erreicht — "${elementName}" wird nicht geloggt`);
    return false; // Rückgabewert signalisiert, ob Log erfolgreich war
  }

  const now      = Date.now();
  const lastTime = revealOrder.length ? revealTimes[revealOrder.at(-1)] : pageLoadTime;
  const duration = ((now - lastTime) / 1000).toFixed(1);

  revealOrder.push(elementName);
  revealTimes[elementName] = now;

  // Reveal-Liste in der Debug-UI aktualisieren (nur wenn Tracking-UI aktiv)
  if (isTrackingVisible()) {
    const list = ensureRevealList();
    if (list) {
      const li = document.createElement("li");
      li.innerHTML = `${revealOrder.length}. ${elementName} <em>(${duration}s)</em>`;
      list.appendChild(li);
    }
  }

  // Nach jeder Enthüllung aktuellen Stand an Parent übermitteln (Delta-Ansatz:
  // nur neue Enthüllung + kumulierter Stand, keine vollständige Payload)
  postToParent("revealTracking", {
    latest:      elementName,
    latestTimeSec: parseFloat(((now - pageLoadTime) / 1000).toFixed(4)),
    revealOrder: formatRevealOrder(),
    revealTimes: formatRevealTimes(),
    revealRanks: formatRevealRanksNumeric(),
    revealedFlags: formatRevealedFlags(),
    revealCount: countRevealed(),
    pageLoadTime: 0.0
  });

  console.log(`[Tracking] #${revealOrder.length} "${elementName}" @ ${((now - pageLoadTime) / 1000).toFixed(4)}s (+${duration}s)`);
  return true;
}

// ============================================================
// REVEAL
// ============================================================

// Enthüllt alle DOM-Elemente des gegebenen Keys:
// Entfernt Blur-Klasse und Label, setzt revealedElements-Flag
function reveal(key) {
  if (!key || revealedElements[key]) return;
  const config = REVEAL_CONFIG[key];
  if (!config) return;

  // FIX: revealedElements wird nur gesetzt, wenn logReveal erfolgreich war —
  // verhindert inkonsistenten Zustand nach Zeitlimitablauf
  const logged = logReveal(key);
  if (!logged) return;

  document.querySelectorAll(config.selector).forEach((el) => {
    el.classList.remove(config.blur);
    removeBlurLabel(el);
  });

  revealedElements[key] = true;
}

// ============================================================
// MAUS-HEATMAP
// ============================================================

// Erstellt den Heatmap-Key aus Hotelname und CSS-Selektor
function buildElementKey(el, selector) {
  const hotel = el.closest(".hotel-card");
  const name  = hotel?.querySelector(".card-title")?.innerText.trim() || "unknown";
  return `${name} | ${selector}`;
}

// Fügt einem Element ein transparentes Overlay für die Heatmap-Visualisierung hinzu
function ensureHeatmapOverlay(el) {
  if (!isTrackingVisible()) return;
  if (el.classList.contains("heatmap-wrapper")) return;
  el.classList.add("heatmap-wrapper");
  const overlay = document.createElement("div");
  overlay.className = "heatmap-overlay";
  el.appendChild(overlay);
}

// Färbt alle Heatmap-Overlays proportional zur maximalen Hover-Anzahl ein
function updateVisualHeatmap() {
  if (!isTrackingVisible()) return;
  const values = Object.values(mouseHeatmapElements);
  if (!values.length) return;

  const maxVal = Math.max(...values);
  TRACKABLE_SELECTORS.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      ensureHeatmapOverlay(el);
      const intensity = Math.min((mouseHeatmapElements[buildElementKey(el, sel)] || 0) / maxVal, 1);
      const overlay   = el.querySelector(".heatmap-overlay");
      if (overlay) overlay.style.background = `rgba(255,0,0,${intensity * 0.45})`;
    });
  });
}

// Erfasst die aktuelle Mausposition und zählt Samples je Element hoch;
// wird via mousemove ausgelöst und auf CONFIG.mouseSampleInterval gedrosselt
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
      break; // Pro Sample nur ein Element zählen
    }
  }
}

// ============================================================
// DEBUG-UI-ELEMENTE (nur bei TRACKING_VISIBILITY "on")
// ============================================================

// Erstellt die fixierte Reveal-Reihenfolge-Box (oben rechts)
function ensureRevealList() {
  if (!isTrackingVisible()) return null;
  let list = document.getElementById("reveal-order-list");
  if (!list) {
    const box = document.createElement("div");
    box.id = "reveal-order-box";
    box.style.cssText =
      "position:fixed;right:10px;top:10px;max-width:260px;z-index:9999;" +
      "background:#fff;padding:8px;border:1px solid #ccc;font-size:12px";
    box.innerHTML =
      "<strong>Unblur-Reihenfolge</strong>" +
      "<ol id='reveal-order-list' style='margin:6px 0;padding-left:20px'></ol>";
    document.body.appendChild(box);
    list = document.getElementById("reveal-order-list");
  }
  return list;
}

// Erstellt und aktualisiert die Live-Heatmap-Box (unten rechts)
function updateHeatmapDisplay() {
  if (!isTrackingVisible()) return;
  let box = document.getElementById("heatmap-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "heatmap-box";
    box.style.cssText =
      "position:fixed;right:10px;bottom:10px;width:260px;max-height:200px;" +
      "overflow:auto;background:#fff;border:1px solid #ccc;padding:6px;" +
      "font-size:11px;z-index:9999";
    box.innerHTML = "<strong>Live-Heatmap</strong><div id='heatmap-content'></div>";
    document.body.appendChild(box);
  }
  // Top-8-Elemente nach Hover-Häufigkeit anzeigen
  document.getElementById("heatmap-content").innerHTML = Object.entries(mouseHeatmapElements)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}: ${v}`)
    .join("<br>");
}

// ============================================================
// SHUFFLE-FUNKTIONEN
// ============================================================

// Fisher-Yates In-Place-Shuffle
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Mischt die Reihenfolge der Hotel-Karten im Grid
function shuffleHotels() {
  const container = document.querySelector(".row.g-4");
  if (!container) {
    console.warn("Container .row.g-4 nicht gefunden — Shuffle übersprungen");
    return;
  }
  shuffleArray([...container.children]).forEach(c => container.appendChild(c));
}

// Mischt die Reviews innerhalb jeder Scrollbar-Sektion
function shuffleReviews() {
  const scrollbars = document.querySelectorAll(".scrollbar");
  if (!scrollbars.length) {
    console.warn("Keine .scrollbar-Elemente gefunden — Review-Shuffle übersprungen");
    return;
  }
  scrollbars.forEach(sb => {
    const reviews = [...sb.querySelectorAll(":scope > .reviewall")];
    if (reviews.length > 1) shuffleArray(reviews).forEach(r => sb.appendChild(r));
  });
}

// ============================================================
// END-TRACKING
// ============================================================

// Beendet die Studie: berechnet finale Zeiten, sendet alle Daten
// an den Parent-Frame und blendet einen weißen Abschlussscreen ein
function endTracking() {
  if (endButtonClicked) return; // Doppelklick verhindern
  endButtonClicked = true;

  endButtonClickedAt  = Date.now();
  endButtonDurationMs = endButtonClickedAt - (startButtonClickedAt || pageLoadTime);

  // Mousemove-Listener sofort entfernen, damit keine weiteren Samples einfließen
  document.removeEventListener("mousemove", trackMouse);

  logInteraction("Fenster schließen");

  // Finale Payload bauen und senden
  const finalPayload = buildFinalPayload();
  console.log("=== FINALE DATEN AN PARENT ===", finalPayload);
  postToParent("heatmapTracking", finalPayload);

  // Close-Button ausblenden (Referenz aus dem DOM holen, da außerhalb der Closure)
  document.getElementById("closeTrackingButton")?.style.setProperty("display", "none");

  // Weißen Abschlussscreen einblenden
  const screen = document.createElement("div");
  screen.id = "endWhiteScreen";
  screen.style.cssText = `
    position:fixed;inset:0;background:#fff;z-index:999999;
    display:flex;align-items:center;justify-content:center;
    flex-direction:column;font-family:system-ui,sans-serif;
    transition:opacity 0.6s ease;opacity:0;
  `;
  screen.innerHTML = `<h2 style="font-size:28px;margin-bottom:16px;color:#333">Sie können nun mit "weiter" fortfahren.</h2>`;
  document.body.appendChild(screen);

  // Fade-In via zwei aufeinanderfolgenden rAF-Calls
  requestAnimationFrame(() => requestAnimationFrame(() => (screen.style.opacity = "1")));
}

// ============================================================
// CSS-INJECTION
// ============================================================
const style = document.createElement("style");
style.textContent = `
  /* Heatmap-Overlay: liegt über dem Element, blockiert keine Klicks */
  .heatmap-wrapper { position: relative; }
  .heatmap-overlay {
    position: absolute; inset: 0;
    pointer-events: none; z-index: 2;
    background: rgba(255,0,0,0);
    transition: background 0.2s ease;
  }

  /* Blur-Label-Wrapper: umschließt das geblurrte Element */
  .blur-label-wrapper { position: relative; }

  .blur-label {
    position: absolute; inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    pointer-events: auto; /* klickbar zum Enthüllen */
    cursor: pointer;
    z-index: 3;
  }

  /* Linksbündige Variante für Autor, Avatar und Bewertungsskala */
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
    background-color: rgba(255, 255, 255, 0.85);
    font-weight: 500;
  }

  .blur-label--left-aligned .blur-label__text { margin: 0; }

  /* Hover-Feedback: Label hebt sich stärker hervor */
  .blur-label:hover .blur-label__text {
    background-color: rgba(255, 255, 255, 0.95);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  }
`;
document.head.appendChild(style);

// ============================================================
// INITIALISIERUNG
// ============================================================
document.addEventListener("DOMContentLoaded", () => {

  // FIX: pageLoadTime erst hier setzen — nach tatsächlichem DOM-Ready
  pageLoadTime       = Date.now();
  startButtonShownAt = pageLoadTime;
  layoutState        = getLayoutState();

  // FIX: Layout bei Größenänderung aktualisieren (z.B. Tablet-Rotation);
  // Mousemove-Listener wird bei Wechsel auf Mobile entfernt
  window.addEventListener("resize", () => {
    const newState = getLayoutState();
    if (newState === layoutState) return;
    layoutState = newState;
    if (layoutState === "mobile") {
      document.removeEventListener("mousemove", trackMouse);
    }
  });

  // Hotels und Reviews zufällig anordnen (vor Label-Init, damit DOM-Reihenfolge stimmt)
  shuffleHotels();
  shuffleReviews();

  // Blur-Labels auf alle bereits geblurrten Elemente legen
  initBlurLabels();

  // "Fenster schließen"-Button erzeugen (zunächst versteckt, wird nach Start-Klick sichtbar)
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

  // Mapping Selektor -> Key für den delegierten Klick-Handler
  const selectorToKey = Object.fromEntries(
    Object.entries(REVEAL_CONFIG).map(([k, v]) => [v.selector, k])
  );

  // Delegierter Klick-Handler: enthüllt beim Klick auf nicht-geblurrte Elemente;
  // Klicks auf .blur-label werden ignoriert (haben eigenen Handler)
  document.body.addEventListener("click", (e) => {
    if (e.target.closest(".blur-label")) return;
    for (const sel of TRACKABLE_SELECTORS) {
      if (e.target.closest(sel)) {
        const key = selectorToKey[sel];
        if (key && !revealedElements[key]) reveal(key);
        break;
      }
    }
  });

  // Start-Button: blendet Overlay aus, startet Maus-Tracking und zeigt Close-Button
  const startBtn     = document.getElementById("startButton");
  const startOverlay = document.getElementById("startOverlay");

  startBtn?.addEventListener("click", () => {
    if (startButtonClicked) return;
    startButtonClicked = true;

    startButtonClickedAt  = Date.now();
    startButtonDurationMs = startButtonClickedAt - startButtonShownAt;

    logInteraction("Start-Button");
    console.log("Start-Button Verweildauer (ms):", startButtonDurationMs);

    if (startOverlay) startOverlay.style.display = "none";

    // Maus-Tracking nur auf Desktop aktivieren
    if (layoutState !== "mobile") {
      document.addEventListener("mousemove", trackMouse, { passive: true });
    }

    closeBtn.style.display = "block";
  });
});
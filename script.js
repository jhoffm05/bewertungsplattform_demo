let numButtonClicks = 0;
let starsRevealed = false;
let reviewsRevealed = false;
let authorboxRevealed = false;
let totalratingRevealed = false;
let totalscaleRevealed = false;
let corporateRevealed = false;

// =======================
// Maus-Tracking (datenarm)
// =======================
let mouseTrack = [];
let lastMouseSampleTime = 0;
const MOUSE_SAMPLE_INTERVAL = 200; // 5 Hz

// =======================
// Reveal-Tracking
// =======================
let revealOrder = [];
let revealTimes = {};
let pageLoadTime = Date.now();
let lastRevealTime = pageLoadTime;

// =======================
// SoSci / iFrame Kommunikation
// =======================
const PARENT_ORIGIN = "https://sosci.rlp.net";

function sendTrackingToParent() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        type: "revealTracking",
        payload: {
          revealOrder,
          revealTimes,
          mouseTrack
        }
      },
      PARENT_ORIGIN
    );
  }
}

// =======================
// Logging Reveal + Dauer
// =======================
function logReveal(elementName) {
  const now = Date.now();
  let duration;

  if (revealOrder.length === 0) {
    duration = (now - pageLoadTime) / 1000;
  } else {
    duration = (now - lastRevealTime) / 1000;
  }

  revealOrder.push(elementName);
  revealTimes[elementName] = Number(duration.toFixed(1));
  lastRevealTime = now;

  // Übergabe an SoSci
  sendTrackingToParent();

  // Mouse-Tracking beenden, wenn alles offen
  if (
    starsRevealed &&
    reviewsRevealed &&
    authorboxRevealed &&
    totalratingRevealed &&
    totalscaleRevealed &&
    corporateRevealed
  ) {
    document.removeEventListener("mousemove", trackMouseMovement);
  }
}

// =======================
// Reveal-Funktionen
// =======================
function revealStars() {
  if (!starsRevealed) {
    document.querySelectorAll(".star-rating").forEach(el => el.classList.remove("blurred"));
    starsRevealed = true;
    logReveal("Sternebewertung");
  }
}

function revealReviews() {
  if (!reviewsRevealed) {
    document.querySelectorAll(".review").forEach(el => el.classList.remove("blurred"));
    reviewsRevealed = true;
    logReveal("Einzelrezensionen");
  }
}

function revealAuthor() {
  if (!authorboxRevealed) {
    document.querySelectorAll(".authorbox").forEach(el => el.classList.remove("blurred"));
    authorboxRevealed = true;
    logReveal("Autoreninformationen");
  }
}

function revealTotalrating() {
  if (!totalratingRevealed) {
    document.querySelectorAll(".total-rating").forEach(el => el.classList.remove("blurred"));
    totalratingRevealed = true;
    logReveal("Gesamtbewertungen");
  }
}

function revealTotalscale() {
  if (!totalscaleRevealed) {
    document.querySelectorAll(".total-scale").forEach(el => el.classList.remove("blurred"));
    totalscaleRevealed = true;
    logReveal("Bewertungsskala");
  }
}

function revealCorporate() {
  if (!corporateRevealed) {
    document.querySelectorAll(".corporate").forEach(el => el.classList.remove("blurred"));
    corporateRevealed = true;
    logReveal("Unternehmenskommentar");
  }
}

// =======================
// Mouse-Tracking Funktion
// =======================
function trackMouseMovement(event) {
  const now = Date.now();
  if (now - lastMouseSampleTime < MOUSE_SAMPLE_INTERVAL) return;
  lastMouseSampleTime = now;

  mouseTrack.push({
    t: Math.round((now - pageLoadTime) / 1000),
    x: Number((event.clientX / window.innerWidth).toFixed(3)),
    y: Number((event.clientY / window.innerHeight).toFixed(3)),
    phase: revealOrder.length
  });
}

// =======================
// Initialisierung
// =======================
document.addEventListener("DOMContentLoaded", () => {

  // Mouse-Tracking starten
  document.addEventListener("mousemove", trackMouseMovement);

  // Event-Delegation für Reveals
  document.body.addEventListener("click", (e) => {
    if (e.target.closest(".star-rating")) revealStars();
    else if (e.target.closest(".review")) revealReviews();
    else if (e.target.closest(".authorbox")) revealAuthor();
    else if (e.target.closest(".total-rating")) revealTotalrating();
    else if (e.target.closest(".total-scale")) revealTotalscale();
    else if (e.target.closest(".corporate")) revealCorporate();
  });
});

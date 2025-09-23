let numButtonClicks = 0;
let starsRevealed = false;
let reviewsRevealed = false;
let authorboxRevealed = false;
let totalratingRevealed = false;
let totalscaleRevealed = false;
let corporateRevealed = false;

// Parent-Origin = SoSciSurvey
const PARENT_ORIGIN = "https://www.soscisurvey.de"; // ggf. anpassen

function sendTrackingToParent() {
  if (window.parent && window.parent !== window) {
    const payload = {
      revealOrder,
      revealTimes,
      pageLoadTime
    };
    window.parent.postMessage(
      { type: "revealTracking", payload },
      PARENT_ORIGIN
    );
    console.log("Iframe -> Parent gesendet:", payload);
  }
}

// Array für die Unblur-Reihenfolge
let revealOrder = [];

// Zeittracking: Startzeiten
let revealTimes = {};
let pageLoadTime = Date.now();

// Sichtbare Liste im DOM anlegen (falls noch nicht vorhanden)
function ensureRevealList(){
  let list = document.getElementById('reveal-order-list');
  if (!list) {
    const container = document.createElement('div');
    container.id = 'reveal-order-container';

    container.style.position = 'fixed';
    container.style.right = '10px';
    container.style.top = '10px';
    container.style.maxWidth = '240px';
    container.style.zIndex = '9999';
    container.style.background = 'rgba(255,255,255,0.95)';
    container.style.padding = '8px';
    container.style.border = '1px solid #ccc';
    container.style.fontSize = '12px';
    container.innerHTML = '<strong>Unblur Reihenfolge:</strong><ol id="reveal-order-list" style="margin:6px 0; padding-left:20px;"></ol>';
    document.body.appendChild(container);
    list = document.getElementById('reveal-order-list');
  }
  return list;
}

// Hilfsfunktion: Reihenfolge loggen (Konsole + DOM) + Dauer
function logReveal(elementName) {
  const now = Date.now();
  let duration = 0;

  if (revealOrder.length === 0) {
    // Erste Dauer: Zeit seit Seitenaufruf
    duration = ((now - pageLoadTime) / 1000).toFixed(1);
    console.log(`Erstes Unblur: "${elementName}" nach ${duration} Sekunden`);
  } else {
    const lastElement = revealOrder[revealOrder.length - 1];
    if (revealTimes[lastElement]) {
      duration = ((now - revealTimes[lastElement]) / 1000).toFixed(1);
      console.log(`Verweildauer auf "${lastElement}": ${duration} Sekunden`);
    }
  }

  // Neues Element ins Array pushen
  revealOrder.push(elementName);
  revealTimes[elementName] = now;

  // DOM-Liste aktualisieren mit Dauer
  const list = ensureRevealList();
  const li = document.createElement('li');
  li.innerHTML = `${revealOrder.length}. ${elementName} <em>(${duration}s)</em>`;
  list.appendChild(li);
  
  // Tracking-Daten an SoSci übergeben
  sendTrackingToParent();
}

function buttonClicked() {
  numButtonClicks += 1;
  const main = document.getElementById("mainDiv");
  if (main) main.textContent = "Button Clicked times: " + numButtonClicks;
  console.log("buttonClicked:", numButtonClicks);
}

// Reveal-Funktionen mit zusätzlichen Logs
function revealStars() {
  if (!starsRevealed) {
    document.querySelectorAll(".star-rating").forEach((el) => el.classList.remove("blurred"));
    starsRevealed = true;
    logReveal("Sternebewertung");
  } else {
    console.log("Sterne schon offen");
  }
}

function revealReviews() {
  if (!reviewsRevealed) {
    document.querySelectorAll('.review').forEach(el => el.classList.remove('blurred'));
    reviewsRevealed = true;
    logReveal("Einzelrezensionen");
  } else {
    console.log("Reviews schon offen");
  }
}

function revealAuthor() {
  if (!authorboxRevealed) {
    document.querySelectorAll(".authorbox").forEach((el) => el.classList.remove("blurred"));
    authorboxRevealed = true;
    logReveal("Autoreninformationen");
  } else {
    console.log("Authorbox schon offen");
  }
}

function revealTotalrating() {
  if (!totalratingRevealed) {
    document.querySelectorAll(".total-rating").forEach((el) => el.classList.remove("blurred"));
    totalratingRevealed = true;
    logReveal("Gesamtbewertungen");
  } else {
    console.log("Totalrating schon offen");
  }
}

function revealTotalscale() {
  if (!totalscaleRevealed) {
    document.querySelectorAll(".total-scale").forEach((el) => el.classList.remove("blurred"));
    totalscaleRevealed = true;
    logReveal("Bewertungsskala");
  } else {
    console.log("Totalscale schon offen");
  }
}

function revealCorporate() {
  if (!corporateRevealed) {
    document.querySelectorAll(".corporate").forEach((el) => el.classList.remove("blurred"));
    corporateRevealed = true;
    logReveal("Unternehmenskommentar");
  } else {
    console.log("Corporate schon offen");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM ready - initialisiere Listener und prüfe Elemente");

  // Debug: Zähle vorhandene Elemente
  const counts = {
    stars: document.querySelectorAll('.star-rating').length,
    reviews: document.querySelectorAll('.review').length,
    authorbox: document.querySelectorAll('.authorbox').length,
    totalrating: document.querySelectorAll('.total-rating').length,
    totalscale: document.querySelectorAll('.total-scale').length,
    corporate: document.querySelectorAll('.corporate').length,
  };
  console.log("Elementcounts:", counts);

  // Event-Delegation: ein Listener am body
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('.star-rating')) {
      revealStars();
    } else if (e.target.closest('.review')) {
      revealReviews();
    } else if (e.target.closest('.authorbox')) {
      revealAuthor();
    } else if (e.target.closest('.total-rating')) {
      revealTotalrating();
    } else if (e.target.closest('.total-scale')) {
      revealTotalscale();
    } else if (e.target.closest('.corporate')) {
      revealCorporate();
    }
  });

  // Shuffle der Hotelkarten nur, wenn Container existiert
  const container = document.querySelector(".row.g-4");
  if (!container) {
    console.warn("Container .row.g-4 nicht gefunden — Shuffle übersprungen");
    return;
  }
  const cards = Array.from(container.children);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  container.innerHTML = "";
  cards.forEach((card) => container.appendChild(card));
});

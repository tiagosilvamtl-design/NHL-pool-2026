// "Shame" animation — triggered when someone picks against the Montreal Canadiens.

function triggerShame() {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'shame-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  // Bell sound via Web Audio API (simple ding)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);
  } catch (_) {
    // Audio not available — no problem, visual still plays
  }

  // Spawn falling "SHAME" words
  const WORD_COUNT = 40;
  for (let i = 0; i < WORD_COUNT; i++) {
    const span = document.createElement('span');
    span.className = 'shame-word';
    span.textContent = 'SHAME';

    // Randomize horizontal position, delay, duration, font size
    const left = Math.random() * 95;
    const delay = Math.random() * 2.5;
    const duration = 1.5 + Math.random() * 2;
    const size = 1.2 + Math.random() * 2.5;

    span.style.cssText = `
      left: ${left}%;
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      font-size: ${size}rem;
    `;

    overlay.appendChild(span);
  }

  // Bell ringer figure (text art)
  const ringer = document.createElement('div');
  ringer.className = 'shame-ringer';
  ringer.innerHTML = '🔔<br><strong>SHAME!</strong><br>You picked against<br>the Habs?!';
  overlay.appendChild(ringer);

  // Dismiss on click or after 5 seconds
  const dismiss = () => {
    overlay.classList.add('shame-fade-out');
    setTimeout(() => overlay.remove(), 600);
  };

  overlay.addEventListener('click', dismiss);
  setTimeout(dismiss, 5000);

  document.body.appendChild(overlay);
}

// Check if any of the submitted (non-locked) picks are against MTL
function checkForShame(seriesList, submittedResults) {
  for (const result of submittedResults) {
    if (result.status !== 'saved' && result.status !== 'updated') continue;

    const series = seriesList.find(s => s.series_id === result.series_id);
    if (!series) continue;

    const involvesMTL = series.team1_abbr === 'MTL' || series.team2_abbr === 'MTL';
    if (!involvesMTL) continue;

    // They picked against MTL
    if (result.pick_team && result.pick_team !== 'MTL') {
      return true;
    }
  }
  return false;
}

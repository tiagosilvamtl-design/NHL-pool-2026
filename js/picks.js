// Picks submission form logic

let bracketData = null; // { series, currentRound }

async function loadPicksForm() {
  const formContainer = document.getElementById('picks-form-container');

  try {
    formContainer.innerHTML = '<p class="loading">Loading current series...</p>';
    bracketData = await getBracket();

    const { series, currentRound } = bracketData;

    if (!series || series.length === 0) {
      formContainer.innerHTML = '<p class="empty">No active series found. Check back when the playoffs begin!</p>';
      return;
    }

    const currentSeries = series.filter(
      s => Number(s.round) === currentRound && s.status !== 'complete'
    );

    if (currentSeries.length === 0) {
      const allComplete = series.every(s => s.status === 'complete');
      formContainer.innerHTML = allComplete
        ? '<p class="empty">The playoffs are over. Check the leaderboard for final standings!</p>'
        : '<p class="empty">No open series for this round right now.</p>';
      return;
    }

    renderPicksForm(currentSeries);
  } catch (err) {
    formContainer.innerHTML = `<p class="error">Failed to load series: ${err.message}</p>`;
    console.error(err);
  }
}

function renderPicksForm(seriesList) {
  const formContainer = document.getElementById('picks-form-container');

  const form = document.createElement('form');
  form.id = 'picks-form';
  form.noValidate = true;

  form.innerHTML = `
    <div class="participant-fields">
      <div class="field-group">
        <label for="input-name">Your Name</label>
        <input type="text" id="input-name" placeholder="e.g. Patrick Roy" required autocomplete="name" />
      </div>
      <div class="field-group">
        <label for="input-email">Your Email <span class="hint">(used to identify you — not shown publicly)</span></label>
        <input type="email" id="input-email" placeholder="you@example.com" required autocomplete="email" />
      </div>
    </div>
    <div id="pin-field-group" class="field-group pin-field" style="display:none;">
      <label for="input-pin" id="pin-label">Enter your PIN</label>
      <input type="password" id="input-pin" placeholder="4–6 digit PIN"
             maxlength="6" inputmode="numeric" autocomplete="off" />
    </div>
    <p class="picks-instruction">Make your picks for each series below. Picks lock when the first game starts — you can update them any time before then by re-submitting with the same email and PIN.</p>
  `;

  // Email blur → show PIN field
  const emailInput = form.querySelector('#input-email');
  const pinInput   = form.querySelector('#input-pin');
  emailInput.addEventListener('blur', async () => {
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) return;

    // Show PIN field with correct label
    try {
      const { exists } = await checkEmail(email);
      const pinGroup = document.getElementById('pin-field-group');
      const pinLabel = document.getElementById('pin-label');
      if (pinGroup) {
        pinLabel.textContent = exists ? 'Enter your PIN' : 'Choose a PIN (4–6 digits)';
        pinGroup.style.display = '';
        pinInput?.focus();
      }
    } catch (_) {}
  });

  // PIN blur → pre-fill picks once PIN is entered
  pinInput.addEventListener('blur', async () => {
    const pin   = pinInput.value.trim();
    const email = emailInput.value.trim();
    if (!pin || !/^\d{4,6}$/.test(pin) || !email) return;
    try {
      const { picks, name } = await getMyPicks(email, pin);
      if (name) {
        const nameInput = form.querySelector('#input-name');
        if (nameInput && !nameInput.value.trim()) nameInput.value = name;
      }
      if (picks && picks.length > 0) {
        prefillPicks(picks);
        showBanner('Your previous picks have been loaded. You can update them until each series locks.', 'info');
      }
    } catch (_) {}
  });

  // Series cards
  const seriesGrid = document.createElement('div');
  seriesGrid.className = 'series-grid';
  seriesList.forEach(s => seriesGrid.appendChild(buildSeriesCard(s)));
  form.appendChild(seriesGrid);

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'submit-btn';
  submitBtn.textContent = 'Submit Picks';
  form.appendChild(submitBtn);

  form.addEventListener('submit', handleSubmit);

  formContainer.innerHTML = '';
  formContainer.appendChild(form);
}

function buildSeriesCard(s) {
  const locked = s.locked;
  const lockTime = s.first_game_utc ? formatLocalTime(s.first_game_utc) : null;

  const card = document.createElement('div');
  card.className = `series-card ${locked ? 'locked' : ''}`;
  card.dataset.seriesId = s.series_id;

  const lockBadge = locked
    ? '<span class="lock-badge">LOCKED</span>'
    : lockTime
      ? `<span class="lock-time">Locks ${lockTime}</span>`
      : '<span class="lock-time">Lock time TBD</span>';

  const teamLogo = (logo, abbr) => logo
    ? `<img src="${logo}" alt="${abbr}" class="team-logo" />`
    : `<span class="team-logo-fallback">${abbr}</span>`;

  card.innerHTML = `
    <div class="series-header">
      <span class="series-label">${s.series_id}</span>
      ${lockBadge}
    </div>
    <div class="matchup">
      <label class="team-option ${locked ? 'disabled' : ''}">
        <input type="radio" name="winner-${s.series_id}" value="${s.team1_abbr}" ${locked ? 'disabled' : ''} required />
        <div class="team-logo-wrap">${teamLogo(s.team1_logo, s.team1_abbr)}</div>
        <span class="team-name">${s.team1_name}</span>
        <span class="team-abbr-badge">${s.team1_abbr}</span>
      </label>
      <div class="vs-divider">VS</div>
      <label class="team-option ${locked ? 'disabled' : ''}">
        <input type="radio" name="winner-${s.series_id}" value="${s.team2_abbr}" ${locked ? 'disabled' : ''} required />
        <div class="team-logo-wrap">${teamLogo(s.team2_logo, s.team2_abbr)}</div>
        <span class="team-name">${s.team2_name}</span>
        <span class="team-abbr-badge">${s.team2_abbr}</span>
      </label>
    </div>
    <div class="games-pick">
      <span class="games-label">Games</span>
      <div class="games-options">
        ${[4, 5, 6, 7].map(n => `
          <label class="games-option ${locked ? 'disabled' : ''}">
            <input type="radio" name="games-${s.series_id}" value="${n}" ${locked ? 'disabled' : ''} required />
            <span>${n}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;

  return card;
}

function prefillPicks(picks) {
  picks.forEach(({ series_id, pick_team, pick_games }) => {
    const winnerInput = document.querySelector(`input[name="winner-${series_id}"][value="${pick_team}"]`);
    if (winnerInput) winnerInput.checked = true;

    const gamesInput = document.querySelector(`input[name="games-${series_id}"][value="${pick_games}"]`);
    if (gamesInput) gamesInput.checked = true;
  });
}

async function handleSubmit(e) {
  e.preventDefault();

  const form = document.getElementById('picks-form');
  const name = form.querySelector('#input-name').value.trim();
  const email = form.querySelector('#input-email').value.trim();

  if (!name || !email) {
    showBanner('Please enter your name and email.', 'error');
    return;
  }

  // PIN validation
  const pinGroup = document.getElementById('pin-field-group');
  const pinVisible = pinGroup && pinGroup.style.display !== 'none';

  if (!pinVisible) {
    // PIN field hasn't appeared — user hasn't blurred the email field
    showBanner('Please click outside the email field first to activate PIN verification.', 'error');
    form.querySelector('#input-email')?.focus();
    return;
  }

  const pinInput = form.querySelector('#input-pin');
  const pin = pinInput ? pinInput.value.trim() : '';

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    showBanner('Please enter your PIN (4–6 digits).', 'error');
    pinInput?.focus();
    return;
  }

  if (!bracketData) return;
  const { series, currentRound } = bracketData;
  const currentSeries = series.filter(
    s => Number(s.round) === currentRound && s.status !== 'complete'
  );

  // Collect picks (skip locked series)
  const picks = [];
  let missingPicks = false;

  for (const s of currentSeries) {
    if (s.locked) continue;

    const winnerEl = form.querySelector(`input[name="winner-${s.series_id}"]:checked`);
    const gamesEl = form.querySelector(`input[name="games-${s.series_id}"]:checked`);

    if (!winnerEl || !gamesEl) {
      missingPicks = true;
      document.querySelector(`.series-card[data-series-id="${s.series_id}"]`)
        ?.classList.add('missing');
    } else {
      document.querySelector(`.series-card[data-series-id="${s.series_id}"]`)
        ?.classList.remove('missing');
      picks.push({
        series_id:  s.series_id,
        pick_team:  winnerEl.value,
        pick_games: Number(gamesEl.value),
      });
    }
  }

  if (missingPicks) {
    showBanner('Please complete all picks before submitting.', 'error');
    return;
  }

  if (picks.length === 0) {
    showBanner('All series in this round are locked. No picks to submit.', 'info');
    return;
  }

  const submitBtn = form.querySelector('.submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const { results } = await submitPicks(name, email, picks, pin);

    const saved   = results.filter(r => r.status === 'saved').length;
    const updated = results.filter(r => r.status === 'updated').length;
    const locked  = results.filter(r => r.status === 'locked').length;

    let msg = '';
    if (saved + updated > 0) {
      msg += `${saved + updated} pick${saved + updated > 1 ? 's' : ''} ${updated > 0 && saved === 0 ? 'updated' : 'saved'}. `;
    }
    if (locked > 0) msg += `${locked} series already started and could not be changed.`;

    showBanner(msg.trim() || 'Picks submitted!', saved + updated > 0 ? 'success' : 'warning');

    // Check for shame
    if (checkForShame(currentSeries, results.map((r, i) => ({ ...r, pick_team: picks[i]?.pick_team })))) {
      setTimeout(triggerShame, 600);
    }
  } catch (err) {
    if (err.message === 'incorrect_pin') {
      showBanner('Incorrect PIN. Please try again.', 'error');
      pinInput?.focus();
    } else {
      showBanner(`Submission failed: ${err.message}`, 'error');
    }
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Picks';
  }
}

function showBanner(message, type = 'info') {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  banner.textContent = message;
  banner.className = `status-banner ${type}`;
  banner.style.display = 'block';
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (type === 'success' || type === 'info') {
    setTimeout(() => { banner.style.display = 'none'; }, 6000);
  }
}

document.addEventListener('DOMContentLoaded', loadPicksForm);

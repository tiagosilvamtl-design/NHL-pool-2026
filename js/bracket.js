// Bracket visualization — East/West conference layout

async function loadBracket() {
  const container = document.getElementById('bracket-container');

  try {
    container.innerHTML = '<p class="loading">Loading bracket...</p>';
    const { series } = await getBracket();

    if (!series || series.length === 0) {
      container.innerHTML = '<p class="empty">Bracket not available yet. Check back when the playoffs begin!</p>';
      return;
    }

    const { east, west, scf, hasConferenceData } = splitByConference(series);

    if (!hasConferenceData) {
      renderFlatBracket(container, series);
      return;
    }

    renderConferenceBracket(container, east, west, scf);
  } catch (err) {
    container.innerHTML = `<p class="error">Failed to load bracket: ${err.message}</p>`;
    console.error(err);
  }
}

// ─── CONFERENCE SPLIT ─────────────────────────────────────────────────────────

function splitByConference(series) {
  const east = series.filter(s => s.conference === 'Eastern');
  const west = series.filter(s => s.conference === 'Western');
  const scf  = series.filter(s => Number(s.round) === 4);
  const hasConferenceData = series.some(s => s.conference === 'Eastern' || s.conference === 'Western');
  return { east, west, scf, hasConferenceData };
}

function groupByRound(seriesList) {
  const rounds = {};
  seriesList.forEach(s => {
    const r = Number(s.round);
    if (!rounds[r]) rounds[r] = [];
    rounds[r].push(s);
  });
  return rounds;
}

// ─── CONFERENCE BRACKET ───────────────────────────────────────────────────────

function renderConferenceBracket(container, east, west, scf) {
  const roundLabels = { 1: 'First Round', 2: 'Second Round', 3: 'Conf. Finals' };

  const bracketEl = document.createElement('div');
  bracketEl.className = 'bracket-container';

  // ── East half (R1 → R2 → CF, left to center) ──
  const eastHalf = document.createElement('div');
  eastHalf.className = 'conference-half';

  const eastHeader = document.createElement('div');
  eastHeader.className = 'conference-header east-header';
  eastHeader.textContent = 'EASTERN CONFERENCE';
  eastHalf.appendChild(eastHeader);

  const eastInner = document.createElement('div');
  eastInner.className = 'conference-half-inner';
  const eastRounds = groupByRound(east);
  [1, 2, 3].forEach(r => {
    if (eastRounds[r]) eastInner.appendChild(buildRoundColumn(eastRounds[r], roundLabels[r] || `Round ${r}`));
  });
  eastHalf.appendChild(eastInner);

  // ── Stanley Cup Final (center) ──
  const scfCol = document.createElement('div');
  scfCol.className = 'bracket-column final';
  const scfTitle = document.createElement('div');
  scfTitle.className = 'round-title';
  scfTitle.textContent = '🏆 Stanley Cup Final';
  scfCol.appendChild(scfTitle);
  (scf || []).forEach(s => scfCol.appendChild(buildBracketSeries(s)));
  if (!scf || scf.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'bracket-series';
    placeholder.innerHTML = '<div class="bracket-status">TBD</div>';
    scfCol.appendChild(placeholder);
  }

  // ── West half (CF → R2 → R1, center to right) ──
  const westHalf = document.createElement('div');
  westHalf.className = 'conference-half';

  const westHeader = document.createElement('div');
  westHeader.className = 'conference-header west-header';
  westHeader.textContent = 'WESTERN CONFERENCE';
  westHalf.appendChild(westHeader);

  const westInner = document.createElement('div');
  westInner.className = 'conference-half-inner';
  const westRounds = groupByRound(west);
  [3, 2, 1].forEach(r => {
    if (westRounds[r]) westInner.appendChild(buildRoundColumn(westRounds[r], roundLabels[r] || `Round ${r}`));
  });
  westHalf.appendChild(westInner);

  bracketEl.appendChild(eastHalf);
  bracketEl.appendChild(scfCol);
  bracketEl.appendChild(westHalf);

  container.innerHTML = '';
  container.appendChild(bracketEl);
}

function buildRoundColumn(seriesList, label) {
  const col = document.createElement('div');
  col.className = 'bracket-column';
  const title = document.createElement('div');
  title.className = 'round-title';
  title.textContent = label;
  col.appendChild(title);
  seriesList.forEach(s => col.appendChild(buildBracketSeries(s)));
  return col;
}

// ─── SERIES CARD ──────────────────────────────────────────────────────────────

function buildBracketSeries(s) {
  const card = document.createElement('div');
  card.className = `bracket-series ${s.status === 'complete' ? 'complete' : 'active'}`;

  const team1Won = s.winner_abbr === s.team1_abbr;
  const team2Won = s.winner_abbr === s.team2_abbr;
  const seriesStarted = s.locked || s.status === 'complete';

  const statusLabel = s.status === 'complete'
    ? `${s.winner_abbr} wins in ${s.actual_games}`
    : seriesStarted
      ? 'In progress'
      : s.first_game_utc
        ? `Starts ${formatLocalTime(s.first_game_utc)}`
        : 'Upcoming';

  const statusClass = s.status === 'complete' ? 'complete-status' : '';

  const teamLogo = (logo, abbr) => logo
    ? `<img src="${logo}" alt="${abbr}" class="team-logo-sm" />`
    : '';

  card.innerHTML = `
    <div class="bracket-team ${team1Won ? 'winner' : team2Won ? 'eliminated' : ''}">
      ${teamLogo(s.team1_logo, s.team1_abbr)}
      <span>${s.team1_abbr}</span>
    </div>
    <div class="bracket-divider"></div>
    <div class="bracket-team ${team2Won ? 'winner' : team1Won ? 'eliminated' : ''}">
      ${teamLogo(s.team2_logo, s.team2_abbr)}
      <span>${s.team2_abbr}</span>
    </div>
    <div class="bracket-status ${statusClass}">${statusLabel}</div>
  `;

  return card;
}

// ─── FALLBACK (no conference data yet) ───────────────────────────────────────

function renderFlatBracket(container, series) {
  const rounds = {};
  series.forEach(s => {
    if (!rounds[s.round]) rounds[s.round] = [];
    rounds[s.round].push(s);
  });

  const roundNums = Object.keys(rounds).map(Number).sort();
  const roundLabels = { 1: 'First Round', 2: 'Second Round', 3: 'Conference Finals', 4: 'Stanley Cup Final' };

  const bracketEl = document.createElement('div');
  bracketEl.className = 'bracket';

  roundNums.forEach(rNum => {
    const col = document.createElement('div');
    col.className = 'bracket-round';
    const roundTitle = document.createElement('h3');
    roundTitle.className = 'round-title';
    roundTitle.textContent = roundLabels[rNum] || `Round ${rNum}`;
    col.appendChild(roundTitle);
    rounds[rNum].forEach(s => col.appendChild(buildBracketSeries(s)));
    bracketEl.appendChild(col);
  });

  container.innerHTML = '';
  container.appendChild(bracketEl);
}

document.addEventListener('DOMContentLoaded', loadBracket);

// Bracket visualization

async function loadBracket() {
  const container = document.getElementById('bracket-container');

  try {
    container.innerHTML = '<p class="loading">Loading bracket...</p>';
    const { series } = await getBracket();

    if (!series || series.length === 0) {
      container.innerHTML = '<p class="empty">Bracket not available yet. Check back when the playoffs begin!</p>';
      return;
    }

    // Group by round
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

      const seriesInRound = rounds[rNum];
      seriesInRound.forEach(s => {
        col.appendChild(buildBracketSeries(s));
      });

      bracketEl.appendChild(col);
    });

    container.innerHTML = '';
    container.appendChild(bracketEl);
  } catch (err) {
    container.innerHTML = `<p class="error">Failed to load bracket: ${err.message}</p>`;
    console.error(err);
  }
}

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

document.addEventListener('DOMContentLoaded', loadBracket);

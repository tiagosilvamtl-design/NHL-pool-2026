// Picks overview — matrix of participants × series, grouped by round.

const ROUND_LABELS = {
  1: 'First Round',
  2: 'Second Round',
  3: 'Conference Finals',
  4: 'Stanley Cup Final',
};

async function loadOverview() {
  const container = document.getElementById('overview-container');

  try {
    container.innerHTML = '<p class="loading">Loading picks overview...</p>';
    const { leaderboard, series } = await getLeaderboard();

    if (!leaderboard || leaderboard.length === 0) {
      container.innerHTML = '<p class="empty">No picks submitted yet. Be the first!</p>';
      return;
    }

    if (!series || series.length === 0) {
      container.innerHTML = '<p class="empty">No locked series yet — picks become visible once each series starts.</p>';
      return;
    }

    // Group locked/complete series by round
    const seriesByRound = {};
    series.forEach(s => {
      if (!seriesByRound[s.round]) seriesByRound[s.round] = [];
      seriesByRound[s.round].push(s);
    });

    const rounds = Object.keys(seriesByRound).map(Number).sort();

    // Sort participants by total score descending
    const participants = [...leaderboard].sort((a, b) => b.total - a.total);

    container.innerHTML = '';
    rounds.forEach(round => {
      container.appendChild(
        buildRoundSection(round, seriesByRound[round], participants)
      );
    });

  } catch (err) {
    container.innerHTML = `<p class="error">Failed to load overview: ${err.message}</p>`;
    console.error(err);
  }
}

// ─── ROUND SECTION ────────────────────────────────────────────────────────────

function buildRoundSection(round, seriesList, participants) {
  const section = document.createElement('section');
  section.className = 'page-section';

  const heading = document.createElement('h2');
  heading.textContent = ROUND_LABELS[round] || `Round ${round}`;
  section.appendChild(heading);

  const wrap = document.createElement('div');
  wrap.className = 'ov-table-wrap';
  wrap.appendChild(buildMatrix(seriesList, participants));
  section.appendChild(wrap);

  return section;
}

// ─── MATRIX TABLE ─────────────────────────────────────────────────────────────

function buildMatrix(seriesList, participants) {
  const table = document.createElement('table');
  table.className = 'ov-table';

  // ── Header ──
  const thead = table.createTHead();
  const headerRow = thead.insertRow();

  // Sticky name column header
  const nameTh = document.createElement('th');
  nameTh.className = 'ov-name-header';
  nameTh.textContent = 'Participant';
  headerRow.appendChild(nameTh);

  // One column per series
  seriesList.forEach(s => {
    const th = document.createElement('th');
    th.className = 'ov-series-header';

    const t1Won = s.status === 'complete' && s.winner_abbr === s.team1_abbr;
    const t2Won = s.status === 'complete' && s.winner_abbr === s.team2_abbr;

    th.innerHTML = `
      <div class="ov-series-id">${s.series_id}</div>
      <div class="ov-series-teams">
        <span class="ov-team-slot ${t1Won ? 'ov-winner' : ''}">
          ${teamLogoHtml(s.team1_logo, s.team1_abbr)}${s.team1_abbr}
        </span>
        <span class="ov-vs">vs</span>
        <span class="ov-team-slot ${t2Won ? 'ov-winner' : ''}">
          ${teamLogoHtml(s.team2_logo, s.team2_abbr)}${s.team2_abbr}
        </span>
      </div>
    `;
    headerRow.appendChild(th);
  });

  // ── Body ──
  const tbody = table.createTBody();

  participants.forEach(participant => {
    const tr = tbody.insertRow();

    // Sticky name cell
    const nameTd = tr.insertCell();
    nameTd.className = 'ov-name';
    nameTd.textContent = participant.name;

    // Quick pick lookup for this participant
    const pickMap = {};
    (participant.picksDetail || []).forEach(p => { pickMap[p.series_id] = p; });

    // One cell per series
    seriesList.forEach(s => {
      const td = tr.insertCell();
      const pick = pickMap[s.series_id];

      if (!pick || !pick.pick_team) {
        td.className = 'ov-cell no-pick';
        td.innerHTML = '<span class="ov-dash">—</span>';
        return;
      }

      const isComplete = s.status === 'complete';
      if (isComplete) {
        td.className = `ov-cell ${pick.correct_winner ? 'correct' : 'wrong'}`;
      } else {
        td.className = 'ov-cell in-progress';
      }

      const logo = pick.pick_team === s.team1_abbr ? s.team1_logo : s.team2_logo;

      let icon = '';
      if (isComplete) {
        icon = `<span class="ov-icon ${pick.correct_winner ? 'correct' : 'wrong'}">${pick.correct_winner ? '✓' : '✗'}</span>`;
      }

      const bonus = isComplete && pick.correct_winner && pick.correct_games
        ? '<span class="ov-bonus">+1</span>' : '';

      td.innerHTML = `
        <div class="ov-pick-content">
          ${icon}
          ${teamLogoHtml(logo, pick.pick_team)}
          <span class="ov-pick-team">${pick.pick_team}</span>
          <span class="ov-pick-games">in ${pick.pick_games}</span>
          ${bonus}
        </div>
      `;
    });
  });

  return table;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function teamLogoHtml(url, abbr) {
  return url
    ? `<img src="${url}" alt="${abbr}" class="ov-logo" />`
    : `<span class="ov-logo-fallback">${abbr}</span>`;
}

document.addEventListener('DOMContentLoaded', loadOverview);

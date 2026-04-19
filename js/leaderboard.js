// Leaderboard page logic

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function loadLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  const lastUpdated = document.getElementById('last-updated');

  try {
    container.innerHTML = '<p class="loading">Loading standings...</p>';
    const { leaderboard, series } = await getLeaderboard();
    const seriesMap = {};
    (series || []).forEach(s => { seriesMap[s.series_id] = s; });

    if (!leaderboard || leaderboard.length === 0) {
      container.innerHTML = '<p class="empty">No picks submitted yet. Be the first!</p>';
      return;
    }

    // Determine how many rounds have any completed series
    const roundsWithScores = new Set();
    leaderboard.forEach(p => {
      Object.keys(p.roundScores || {}).forEach(r => roundsWithScores.add(Number(r)));
    });
    const rounds = Array.from(roundsWithScores).sort();
    const roundLabels = { 1: 'R1', 2: 'R2', 3: 'R3 (CF)', 4: 'Final' };

    const table = document.createElement('table');
    table.className = 'leaderboard-table';

    // Header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    ['#', 'Name', ...rounds.map(r => roundLabels[r] || `R${r}`), 'Total'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    });

    // Body
    const tbody = table.createTBody();
    const medalEmoji = { 1: '🥇', 2: '🥈', 3: '🥉' };

    leaderboard.forEach(p => {
      const tr = tbody.insertRow();
      tr.className = `rank-${p.rank}`;

      // Rank cell
      const rankTd = tr.insertCell();
      rankTd.className = 'rank-num';
      rankTd.textContent = medalEmoji[p.rank] || p.rank;

      // Name cell
      const nameTd = tr.insertCell();
      nameTd.className = 'name-cell clickable';
      nameTd.textContent = p.name;
      nameTd.title = 'Click to view picks';
      nameTd.addEventListener('click', () => showPicksModal(p, seriesMap));

      // Round score cells
      rounds.forEach(r => {
        const td = tr.insertCell();
        td.textContent = p.roundScores[r] ?? 0;
      });

      // Total cell
      const totalTd = tr.insertCell();
      totalTd.className = 'total-col';
      totalTd.textContent = p.total;
    });

    container.innerHTML = '';
    container.appendChild(table);

    if (lastUpdated) {
      lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }
  } catch (err) {
    container.innerHTML = `<p class="error">Failed to load leaderboard: ${err.message}</p>`;
    console.error(err);
  }
}

// ─── PICKS MODAL ─────────────────────────────────────────────────────────────

function showPicksModal(participant, seriesMap) {
  document.getElementById('picks-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'picks-modal';
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <h3>${participant.name}'s Picks</h3>
      <button class="modal-close" aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      ${buildPicksList(participant.picksDetail, seriesMap)}
    </div>
  `;

  overlay.appendChild(modal);

  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  modal.querySelector('.modal-close').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  document.body.appendChild(overlay);
}

function buildPicksList(picksDetail, seriesMap) {
  if (!picksDetail || picksDetail.length === 0) {
    return '<p class="picks-empty">No locked picks yet.</p>';
  }

  const sorted = [...picksDetail].sort((a, b) =>
    a.round - b.round || a.series_id.localeCompare(b.series_id)
  );

  return sorted.map(pick => {
    const s = seriesMap[pick.series_id] || {};
    const t1 = s.team1_abbr || '?';
    const t2 = s.team2_abbr || '?';
    const logo = (url, abbr) => url
      ? `<img src="${url}" alt="${abbr}" class="team-logo-xs" />`
      : '';

    const picked1 = pick.pick_team === t1;
    const picked2 = pick.pick_team === t2;
    const isComplete = s.status === 'complete';

    let statusHtml;
    if (!pick.pick_team) {
      statusHtml = '<span class="pick-status no-pick">No pick</span>';
    } else if (isComplete) {
      const pts = pick.points ?? 0;
      statusHtml = `<span class="pick-status ${pick.correct_winner ? 'correct' : 'wrong'}">${pick.correct_winner ? '✓' : '✗'} ${pts} pt${pts !== 1 ? 's' : ''}</span>`;
    } else {
      statusHtml = '<span class="pick-status in-progress">In progress</span>';
    }

    return `
      <div class="pick-row">
        <div class="pick-row-left">
          <span class="pick-series">${pick.series_id}</span>
          <span class="pick-matchup">
            <span class="${picked1 ? 'picked' : ''}">${logo(s.team1_logo, t1)}${t1}</span>
            <span class="vs">vs</span>
            <span class="${picked2 ? 'picked' : ''}">${logo(s.team2_logo, t2)}${t2}</span>
          </span>
        </div>
        <div class="pick-row-right">
          <span class="pick-choice">${pick.pick_team ? `${pick.pick_team} in ${pick.pick_games}` : '—'}</span>
          ${statusHtml}
        </div>
      </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  loadLeaderboard();
  setInterval(loadLeaderboard, REFRESH_INTERVAL_MS);
});

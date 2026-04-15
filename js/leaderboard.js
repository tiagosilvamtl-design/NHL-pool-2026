// Leaderboard page logic

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function loadLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  const lastUpdated = document.getElementById('last-updated');

  try {
    container.innerHTML = '<p class="loading">Loading standings...</p>';
    const { leaderboard } = await getLeaderboard();

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
    leaderboard.forEach(p => {
      const tr = tbody.insertRow();
      tr.className = p.rank === 1 ? 'rank-first' : '';

      const cells = [
        p.rank === 1 ? '🥇' : p.rank,
        p.name,
        ...rounds.map(r => p.roundScores[r] ?? 0),
        p.total,
      ];

      cells.forEach((val, i) => {
        const td = tr.insertCell();
        td.textContent = val;
        if (i === cells.length - 1) td.className = 'total-col';
      });
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

document.addEventListener('DOMContentLoaded', () => {
  loadLeaderboard();
  setInterval(loadLeaderboard, REFRESH_INTERVAL_MS);
});

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
      nameTd.className = 'name-cell';
      nameTd.textContent = p.name;

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

document.addEventListener('DOMContentLoaded', () => {
  loadLeaderboard();
  setInterval(loadLeaderboard, REFRESH_INTERVAL_MS);
});

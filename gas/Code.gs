// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Replace with your Google Spreadsheet ID (from the URL of your Sheet)
const SPREADSHEET_ID = '1KBhVCvtmN2LQAeTcbQhqCE5x1uZDIExgqeeAJIlq5ZA';

// Must match the APPS_SCRIPT_SECRET GitHub Secret
const APPS_SCRIPT_SECRET = 'YOUR_SECRET_HERE';

// Sheet column indices (0-based)
const SUB_COLS = { timestamp: 0, name: 1, email: 2, series_id: 3, pick_team: 4, pick_games: 5 };
const SER_COLS = {
  series_id: 0, round: 1, team1_abbr: 2, team2_abbr: 3, team1_name: 4, team2_name: 5,
  winner_abbr: 6, actual_games: 7, first_game_utc: 8, locked: 9, status: 10,
  team1_logo: 11, team2_logo: 12,
};

// ─── ROUTER ───────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'get_bracket')           return jsonResponse(getBracket());
    if (action === 'get_leaderboard')       return jsonResponse(getLeaderboard());
    if (action === 'get_my_picks')          return jsonResponse(getMyPicks(e.parameter.email));
    if (action === 'get_series_lock_status') return jsonResponse(getSeriesLockStatus());
    if (action === 'submit_picks')          return jsonResponse(submitPicks(e.parameter.data));
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'update_results') return jsonResponse(updateResults(body));
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

// Returns all data rows (skips header row). Returns array of arrays.
function getSheetRows(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

function rowToSeries(row) {
  return {
    series_id:      row[SER_COLS.series_id],
    round:          row[SER_COLS.round],
    team1_abbr:     row[SER_COLS.team1_abbr],
    team2_abbr:     row[SER_COLS.team2_abbr],
    team1_name:     row[SER_COLS.team1_name],
    team2_name:     row[SER_COLS.team2_name],
    winner_abbr:    row[SER_COLS.winner_abbr]    || null,
    actual_games:   row[SER_COLS.actual_games]   || null,
    first_game_utc: row[SER_COLS.first_game_utc] || null,
    locked:         row[SER_COLS.locked] === true || row[SER_COLS.locked] === 'TRUE',
    status:         row[SER_COLS.status]          || 'active',
    team1_logo:     row[SER_COLS.team1_logo]      || '',
    team2_logo:     row[SER_COLS.team2_logo]      || '',
  };
}

// ─── GET BRACKET ──────────────────────────────────────────────────────────────

function getBracket() {
  const rows = getSheetRows('series');
  const seriesList = rows.map(rowToSeries).filter(s => s.series_id);

  // Derive current round: lowest round with any non-complete series
  const activeRounds = seriesList.filter(s => s.status !== 'complete').map(s => Number(s.round));
  const currentRound = activeRounds.length > 0 ? Math.min(...activeRounds) : null;

  return { series: seriesList, currentRound };
}

// ─── GET SERIES LOCK STATUS ───────────────────────────────────────────────────

function getSeriesLockStatus() {
  const rows = getSheetRows('series');
  return rows
    .filter(r => r[SER_COLS.series_id])
    .map(r => ({
      series_id:      r[SER_COLS.series_id],
      locked:         r[SER_COLS.locked] === true || r[SER_COLS.locked] === 'TRUE',
      first_game_utc: r[SER_COLS.first_game_utc] || null,
    }));
}

// ─── GET MY PICKS ─────────────────────────────────────────────────────────────

function getMyPicks(email) {
  if (!email) return { error: 'email required' };
  const norm = normalizeEmail(email);
  const rows = getSheetRows('submissions');
  const picks = rows
    .filter(r => normalizeEmail(r[SUB_COLS.email]) === norm)
    .map(r => ({
      series_id:  r[SUB_COLS.series_id],
      pick_team:  r[SUB_COLS.pick_team],
      pick_games: r[SUB_COLS.pick_games],
    }));
  return { picks };
}

// ─── SUBMIT PICKS ─────────────────────────────────────────────────────────────

function submitPicks(dataParam) {
  if (!dataParam) return { error: 'Missing data parameter' };

  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(dataParam));
  } catch (e) {
    return { error: 'Invalid JSON in data parameter' };
  }

  const { name, email, picks } = payload;
  if (!name || !email || !picks || !picks.length) {
    return { error: 'Missing required fields: name, email, picks' };
  }

  const norm = normalizeEmail(email);
  const cleanName = String(name).trim().substring(0, 100);

  // Use LockService to prevent concurrent writes
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    // Load series map: series_id → {locked, status}
    const seriesRows = getSheetRows('series');
    const seriesMap = {};
    seriesRows.forEach(r => {
      if (r[SER_COLS.series_id]) {
        seriesMap[r[SER_COLS.series_id]] = {
          locked: r[SER_COLS.locked] === true || r[SER_COLS.locked] === 'TRUE',
          status: r[SER_COLS.status],
        };
      }
    });

    // Load existing submissions for this email: series_id → row index (1-based in sheet, so +2 for header)
    const subSheet = getSheet('submissions');
    const subRows = getSheetRows('submissions');
    const existingBySeriesId = {};
    subRows.forEach((r, i) => {
      if (normalizeEmail(r[SUB_COLS.email]) === norm) {
        existingBySeriesId[r[SUB_COLS.series_id]] = i + 2; // +2: 1-based + skip header
      }
    });

    const results = [];
    const now = new Date().toISOString();

    picks.forEach(pick => {
      const { series_id, pick_team, pick_games } = pick;

      if (!series_id || !pick_team || !pick_games) {
        results.push({ series_id, status: 'error', message: 'Missing fields in pick' });
        return;
      }

      const seriesInfo = seriesMap[series_id];
      if (!seriesInfo) {
        results.push({ series_id, status: 'error', message: 'Unknown series' });
        return;
      }

      if (seriesInfo.locked) {
        results.push({ series_id, status: 'locked' });
        return;
      }

      const rowValues = [now, cleanName, norm, series_id, pick_team, Number(pick_games)];
      const existingRowIndex = existingBySeriesId[series_id];

      if (existingRowIndex) {
        // Update existing row in place
        subSheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
        results.push({ series_id, status: 'updated' });
      } else {
        // Append new row
        subSheet.appendRow(rowValues);
        results.push({ series_id, status: 'saved' });
      }
    });

    return { results };
  } finally {
    lock.releaseLock();
  }
}

// ─── GET LEADERBOARD ──────────────────────────────────────────────────────────

function getLeaderboard() {
  const seriesRows = getSheetRows('series');
  const subRows = getSheetRows('submissions');

  // Build completed series map: series_id → {winner_abbr, actual_games, round}
  const completedSeries = {};
  seriesRows.forEach(r => {
    if (r[SER_COLS.status] === 'complete' && r[SER_COLS.series_id]) {
      completedSeries[r[SER_COLS.series_id]] = {
        winner_abbr:  r[SER_COLS.winner_abbr],
        actual_games: Number(r[SER_COLS.actual_games]),
        round:        Number(r[SER_COLS.round]),
      };
    }
  });

  // Group submissions by email
  const participantMap = {};
  subRows.forEach(r => {
    const email = normalizeEmail(r[SUB_COLS.email]);
    if (!email) return;
    if (!participantMap[email]) {
      participantMap[email] = { name: r[SUB_COLS.name], picks: {} };
    }
    // Always use the most recent name
    participantMap[email].name = r[SUB_COLS.name];
    participantMap[email].picks[r[SUB_COLS.series_id]] = {
      pick_team:  r[SUB_COLS.pick_team],
      pick_games: Number(r[SUB_COLS.pick_games]),
    };
  });

  // Score each participant
  const leaderboard = Object.entries(participantMap).map(([email, { name, picks }]) => {
    const roundScores = {};
    const picksDetail = [];
    let total = 0;

    Object.entries(completedSeries).forEach(([series_id, { winner_abbr, actual_games, round }]) => {
      const pick = picks[series_id];
      if (!roundScores[round]) roundScores[round] = 0;

      let pts = 0;
      let correctWinner = false;
      let correctGames = false;

      if (pick) {
        if (pick.pick_team === winner_abbr) {
          pts += 2;
          correctWinner = true;
          if (pick.pick_games === actual_games) {
            pts += 1;
            correctGames = true;
          }
        }
      }

      roundScores[round] += pts;
      total += pts;

      picksDetail.push({
        series_id,
        round,
        pick_team:      pick ? pick.pick_team  : null,
        pick_games:     pick ? pick.pick_games : null,
        correct_winner: correctWinner,
        correct_games:  correctGames,
        points:         pts,
      });
    });

    return { name, total, roundScores, picksDetail };
  });

  leaderboard.sort((a, b) => b.total - a.total);

  // Add rank (ties get same rank)
  let rank = 1;
  leaderboard.forEach((p, i) => {
    if (i > 0 && p.total < leaderboard[i - 1].total) rank = i + 1;
    p.rank = rank;
  });

  return { leaderboard };
}

// ─── UPDATE RESULTS (called by GitHub Actions) ────────────────────────────────

function updateResults(body) {
  if (body.secret !== APPS_SCRIPT_SECRET) {
    return { error: 'Unauthorized' };
  }

  const { results } = body;
  if (!results || !results.length) return { error: 'No results provided' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const seriesSheet = getSheet('series');
    const rows = getSheetRows('series');

    // Build map: series_id → row index in sheet (1-based + header offset)
    const rowIndexMap = {};
    rows.forEach((r, i) => {
      if (r[SER_COLS.series_id]) rowIndexMap[r[SER_COLS.series_id]] = i + 2;
    });

    const updated = [];
    const appended = [];

    results.forEach(res => {
      const {
        series_id, round, team1_abbr, team2_abbr, team1_name, team2_name,
        winner_abbr, actual_games, first_game_utc, locked, status,
      } = res;

      const rowData = [
        series_id, round || '', team1_abbr || '', team2_abbr || '',
        team1_name || '', team2_name || '',
        winner_abbr || '', actual_games || '', first_game_utc || '',
        locked === true, status || 'active',
        res.team1_logo || '', res.team2_logo || '',
      ];

      const existingIdx = rowIndexMap[series_id];
      if (existingIdx) {
        seriesSheet.getRange(existingIdx, 1, 1, rowData.length).setValues([rowData]);
        updated.push(series_id);
      } else {
        seriesSheet.appendRow(rowData);
        appended.push(series_id);
      }
    });

    return { updated, appended };
  } finally {
    lock.releaseLock();
  }
}

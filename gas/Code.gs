// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const SPREADSHEET_ID = '1KBhVCvtmN2LQAeTcbQhqCE5x1uZDIExgqeeAJIlq5ZA';
const APPS_SCRIPT_SECRET = 'Alakazam';

// Sheet column indices (0-based)
const SUB_COLS = { timestamp: 0, name: 1, email: 2, series_id: 3, pick_team: 4, pick_games: 5 };
const SER_COLS = {
  series_id: 0, round: 1, team1_abbr: 2, team2_abbr: 3, team1_name: 4, team2_name: 5,
  winner_abbr: 6, actual_games: 7, first_game_utc: 8, locked: 9, status: 10,
  team1_logo: 11, team2_logo: 12, conference: 13, team1_wins: 14, team2_wins: 15,
};
const PIN_COLS = { email: 0, pin_hash: 1, created_at: 2 };

// ─── ROUTER ───────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'get_bracket')            return jsonResponse(getBracket());
    if (action === 'get_leaderboard')        return jsonResponse(getLeaderboard());
    if (action === 'get_my_picks')           return jsonResponse(getMyPicks(e.parameter.email, e.parameter.pin));
    if (action === 'get_series_lock_status') return jsonResponse(getSeriesLockStatus());
    if (action === 'submit_picks')           return jsonResponse(submitPicks(e.parameter.data));
    if (action === 'check_email')            return jsonResponse(checkEmail(e.parameter.email));
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
    conference:     row[SER_COLS.conference]      || '',
    team1_wins:     Number(row[SER_COLS.team1_wins]) || 0,
    team2_wins:     Number(row[SER_COLS.team2_wins]) || 0,
  };
}

// ─── PIN HELPERS ──────────────────────────────────────────────────────────────

// SHA-256 hash of "normalizedEmail:pin". Applies (b & 0xff) to handle GAS signed bytes.
function hashPin(email, pin) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizeEmail(email) + ':' + pin
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// Called inside the lock to prevent race conditions on first submission.
// Returns {status: 'valid'|'created'|'invalid'}
function validateOrCreatePin(email, pin) {
  const norm = normalizeEmail(email);
  const hash = hashPin(norm, pin);
  const pinsSheet = getSheet('pins');
  const lastRow = pinsSheet.getLastRow();

  if (lastRow >= 2) {
    const rows = pinsSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (const row of rows) {
      if (normalizeEmail(row[PIN_COLS.email]) === norm) {
        return row[PIN_COLS.pin_hash] === hash ? { status: 'valid' } : { status: 'invalid' };
      }
    }
  }

  // First time: create entry
  pinsSheet.appendRow([norm, hash, new Date().toISOString()]);
  return { status: 'created' };
}

// Returns {exists: bool} — only reads column 1 (emails) for efficiency.
function checkEmail(email) {
  if (!email) return { error: 'email required' };
  const norm = normalizeEmail(email);
  const pinsSheet = getSheet('pins');
  const lastRow = pinsSheet.getLastRow();
  if (lastRow < 2) return { exists: false };
  const rows = pinsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const exists = rows.some(r => normalizeEmail(r[0]) === norm);
  return { exists };
}

// ─── GET BRACKET ──────────────────────────────────────────────────────────────

function getBracket() {
  const rows = getSheetRows('series');
  const seriesList = rows.map(rowToSeries).filter(s => s.series_id);
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

function getMyPicks(email, pin) {
  if (!email) return { error: 'email required' };
  const norm = normalizeEmail(email);

  // If this email has a registered PIN, require correct PIN before returning picks
  const pinsSheet = getSheet('pins');
  const lastRow = pinsSheet.getLastRow();
  if (lastRow >= 2) {
    const pinRows = pinsSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const pinRow = pinRows.find(r => normalizeEmail(r[PIN_COLS.email]) === norm);
    if (pinRow) {
      if (!pin || hashPin(norm, pin) !== pinRow[PIN_COLS.pin_hash]) {
        return { picks: [] }; // Wrong or missing PIN — return empty silently
      }
    }
  }

  const rows = getSheetRows('submissions');
  const myRows = rows.filter(r => normalizeEmail(r[SUB_COLS.email]) === norm);
  const picks = myRows.map(r => ({
    series_id:  r[SUB_COLS.series_id],
    pick_team:  r[SUB_COLS.pick_team],
    pick_games: r[SUB_COLS.pick_games],
  }));
  const name = myRows.length > 0 ? myRows[0][SUB_COLS.name] : null;
  return { picks, name };
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

  const { name, email, picks, pin } = payload;
  if (!name || !email || !picks || !picks.length || !pin) {
    return { error: 'Missing required fields: name, email, picks, pin' };
  }

  const norm = normalizeEmail(email);
  const cleanName = String(name).trim().substring(0, 100);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    // Validate or create PIN (must be inside lock to prevent race on first submission)
    const pinResult = validateOrCreatePin(norm, pin);
    if (pinResult.status === 'invalid') {
      return { error: 'incorrect_pin' };
    }

    // Load series map
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

    // Load existing submissions for this email
    const subSheet = getSheet('submissions');
    const subRows = getSheetRows('submissions');
    const existingBySeriesId = {};
    subRows.forEach((r, i) => {
      if (normalizeEmail(r[SUB_COLS.email]) === norm) {
        existingBySeriesId[r[SUB_COLS.series_id]] = i + 2;
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
        subSheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
        results.push({ series_id, status: 'updated' });
      } else {
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

  // Series locked but still in progress — picks are visible, no score yet
  const lockedActiveSeries = {};
  seriesRows.forEach(r => {
    const locked = r[SER_COLS.locked] === true || r[SER_COLS.locked] === 'TRUE';
    const status = r[SER_COLS.status] || 'active';
    if (locked && status !== 'complete' && r[SER_COLS.series_id]) {
      lockedActiveSeries[r[SER_COLS.series_id]] = { round: Number(r[SER_COLS.round]) };
    }
  });

  const participantMap = {};
  subRows.forEach(r => {
    const email = normalizeEmail(r[SUB_COLS.email]);
    if (!email) return;
    if (!participantMap[email]) participantMap[email] = { name: r[SUB_COLS.name], picks: {} };
    participantMap[email].name = r[SUB_COLS.name];
    participantMap[email].picks[r[SUB_COLS.series_id]] = {
      pick_team:  r[SUB_COLS.pick_team],
      pick_games: Number(r[SUB_COLS.pick_games]),
    };
  });

  const leaderboard = Object.entries(participantMap).map(([email, { name, picks }]) => {
    const roundScores = {};
    const picksDetail = [];
    let total = 0;

    Object.entries(completedSeries).forEach(([series_id, { winner_abbr, actual_games, round }]) => {
      const pick = picks[series_id];
      if (!roundScores[round]) roundScores[round] = 0;
      let pts = 0, correctWinner = false, correctGames = false;

      if (pick) {
        if (pick.pick_team === winner_abbr) {
          pts += 2; correctWinner = true;
          if (pick.pick_games === actual_games) { pts += 1; correctGames = true; }
        }
      }

      roundScores[round] += pts;
      total += pts;
      picksDetail.push({ series_id, round, pick_team: pick?.pick_team || null,
        pick_games: pick?.pick_games || null, correct_winner: correctWinner,
        correct_games: correctGames, points: pts });
    });

    // Add locked-but-not-complete series (visible picks, no score yet)
    Object.entries(lockedActiveSeries).forEach(([series_id, { round }]) => {
      const pick = picks[series_id];
      picksDetail.push({
        series_id, round,
        pick_team:      pick ? pick.pick_team  : null,
        pick_games:     pick ? pick.pick_games : null,
        correct_winner: null,
        correct_games:  null,
        points:         null,
      });
    });

    return { name, total, roundScores, picksDetail };
  });

  leaderboard.sort((a, b) => b.total - a.total);
  let rank = 1;
  leaderboard.forEach((p, i) => {
    if (i > 0 && p.total < leaderboard[i - 1].total) rank = i + 1;
    p.rank = rank;
  });

  const seriesInfo = seriesRows
    .filter(r => {
      const locked = r[SER_COLS.locked] === true || r[SER_COLS.locked] === 'TRUE';
      return (locked || r[SER_COLS.status] === 'complete') && r[SER_COLS.series_id];
    })
    .map(r => ({
      series_id:   r[SER_COLS.series_id],
      round:       Number(r[SER_COLS.round]),
      team1_abbr:  r[SER_COLS.team1_abbr],
      team2_abbr:  r[SER_COLS.team2_abbr],
      team1_name:  r[SER_COLS.team1_name],
      team2_name:  r[SER_COLS.team2_name],
      team1_logo:  r[SER_COLS.team1_logo]  || '',
      team2_logo:  r[SER_COLS.team2_logo]  || '',
      status:      r[SER_COLS.status]       || 'active',
      winner_abbr: r[SER_COLS.winner_abbr]  || null,
    }));

  return { leaderboard, series: seriesInfo };
}

// ─── UPDATE RESULTS (called by GitHub Actions) ────────────────────────────────

function updateResults(body) {
  if (body.secret !== APPS_SCRIPT_SECRET) return { error: 'Unauthorized' };

  const { results } = body;
  if (!results || !results.length) return { error: 'No results provided' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const seriesSheet = getSheet('series');
    const rows = getSheetRows('series');
    const rowIndexMap = {};
    rows.forEach((r, i) => {
      if (r[SER_COLS.series_id]) rowIndexMap[r[SER_COLS.series_id]] = i + 2;
    });

    const updated = [], appended = [];

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
        res.team1_logo || '', res.team2_logo || '', res.conference || '',
        res.team1_wins != null ? Number(res.team1_wins) : '',
        res.team2_wins != null ? Number(res.team2_wins) : '',
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

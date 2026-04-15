#!/usr/bin/env node
// Fetches NHL playoff data and pushes results to the Apps Script backend.
// Requires Node 20+ (native fetch). No npm dependencies.
// Usage: APPS_SCRIPT_URL=... APPS_SCRIPT_SECRET=... node update-scores.js

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET;
const SEASON = '20252026';

if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET) {
  console.error('Missing required env vars: APPS_SCRIPT_URL, APPS_SCRIPT_SECRET');
  process.exit(1);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'nhl-pool-bot/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

function isoDateString(date) {
  return date.toISOString().split('T')[0];
}

// Generate an array of date strings (YYYY-MM-DD) from start to end (inclusive)
function dateRange(startDate, endDate) {
  const dates = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    dates.push(isoDateString(cur));
    cur.setUTCDate(cur.getUTCDate() + 7); // fetch weekly schedules
  }
  return dates;
}

// ─── FETCH BRACKET ────────────────────────────────────────────────────────────

async function fetchBracket() {
  console.log('Fetching playoff bracket...');
  const data = await fetchJSON(
    `https://api-web.nhle.com/v1/playoff-series/carousel/${SEASON}/`
  );

  const seriesMap = {}; // series_id → series object

  if (!data.rounds) {
    console.warn('No rounds in carousel response. Playoffs may not have started yet.');
    console.log('Raw response:', JSON.stringify(data).substring(0, 500));
    return seriesMap;
  }

  for (const round of data.rounds) {
    const roundNum = round.roundNumber;
    for (const s of (round.series || [])) {
      const letter = s.seriesLetter || s.seriesAbbrev;
      if (!letter) continue;

      const series_id = `R${roundNum}${letter}`;
      const top = s.topSeedTeam || {};
      const bot = s.bottomSeedTeam || {};

      const topWins = Number(top.wins || 0);
      const botWins = Number(bot.wins || 0);

      let winner_abbr = null;
      let actual_games = null;
      let status = 'active';

      if (topWins === 4 || botWins === 4) {
        winner_abbr = topWins === 4 ? top.abbrev : bot.abbrev;
        actual_games = topWins + botWins;
        status = 'complete';
      }

      seriesMap[series_id] = {
        series_id,
        round: roundNum,
        team1_abbr:  top.abbrev      || '',
        team2_abbr:  bot.abbrev      || '',
        team1_name:  top.commonName  || top.name || '',
        team2_name:  bot.commonName  || bot.name || '',
        team1_logo:  top.logo        || '',
        team2_logo:  bot.logo        || '',
        winner_abbr,
        actual_games,
        status,
        // first_game_utc and locked filled in next step
        first_game_utc: null,
        locked: false,
      };
    }
  }

  console.log(`Found ${Object.keys(seriesMap).length} series.`);
  return seriesMap;
}

// ─── FETCH FIRST GAME TIMES ───────────────────────────────────────────────────

async function fetchFirstGameTimes(seriesMap) {
  console.log('Fetching game schedules to find series start times...');

  // Fetch schedules from today ± 60 days to cover the full playoff window
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 7); // look back a week in case playoffs started
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 70); // look ahead ~10 weeks

  // We need to find all team pairs from our series
  const teamPairs = {}; // "ABBv1-ABBv2" sorted → series_id
  for (const [sid, s] of Object.entries(seriesMap)) {
    const key = [s.team1_abbr, s.team2_abbr].sort().join('-');
    teamPairs[key] = sid;
  }

  // Collect all scheduled dates to check (by week)
  const weekStarts = dateRange(start, end);

  const firstGameMap = {}; // series_id → ISO string

  for (const weekStart of weekStarts) {
    let scheduleData;
    try {
      scheduleData = await fetchJSON(
        `https://api-web.nhle.com/v1/schedule/${weekStart}`
      );
    } catch (err) {
      console.warn(`Failed to fetch schedule for ${weekStart}: ${err.message}`);
      continue;
    }

    for (const gameWeek of (scheduleData.gameWeek || [])) {
      for (const game of (gameWeek.games || [])) {
        // gameType 3 = playoffs
        if (game.gameType !== 3) continue;

        const away = game.awayTeam?.abbrev;
        const home = game.homeTeam?.abbrev;
        if (!away || !home) continue;

        const key = [away, home].sort().join('-');
        const sid = teamPairs[key];
        if (!sid) continue;

        const gameStart = game.startTimeUTC;
        if (!gameStart) continue;

        if (!firstGameMap[sid] || gameStart < firstGameMap[sid]) {
          firstGameMap[sid] = gameStart;
        }
      }
    }
  }

  // Apply first game times and locked status to seriesMap
  const now = new Date();
  for (const [sid, s] of Object.entries(seriesMap)) {
    const first = firstGameMap[sid] || null;
    s.first_game_utc = first;
    s.locked = first !== null && new Date(first) <= now;
  }

  console.log('First game times resolved:', JSON.stringify(firstGameMap, null, 2));
}

// ─── PUSH TO APPS SCRIPT ─────────────────────────────────────────────────────

async function pushToAppsScript(seriesMap) {
  const results = Object.values(seriesMap);
  console.log(`Pushing ${results.length} series to Apps Script...`);

  const body = JSON.stringify({
    action: 'update_results',
    secret: APPS_SCRIPT_SECRET,
    results,
  });

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    redirect: 'follow',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apps Script POST failed: HTTP ${res.status}\n${text}`);
  }

  const json = await res.json();
  if (json.error) throw new Error(`Apps Script returned error: ${json.error}`);

  console.log('Apps Script response:', JSON.stringify(json));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    const seriesMap = await fetchBracket();

    if (Object.keys(seriesMap).length === 0) {
      console.log('No series data to push. Exiting.');
      return;
    }

    await fetchFirstGameTimes(seriesMap);
    await pushToAppsScript(seriesMap);

    console.log('Done.');
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

main();

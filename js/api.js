// API client — all communication with the Apps Script backend goes through here.

async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params, _t: Date.now() });
  const res = await fetch(`${APPS_SCRIPT_URL}?${qs}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function getBracket() {
  return apiGet('get_bracket');
}

async function getLeaderboard() {
  return apiGet('get_leaderboard');
}

async function getMyPicks(email) {
  return apiGet('get_my_picks', { email: email.trim().toLowerCase() });
}

async function getSeriesLockStatus() {
  return apiGet('get_series_lock_status');
}

// picks: [{series_id, pick_team, pick_games}]
async function submitPicks(name, email, picks) {
  const payload = { name, email: email.trim().toLowerCase(), picks };
  const data = encodeURIComponent(JSON.stringify(payload));
  const res = await fetch(`${APPS_SCRIPT_URL}?action=submit_picks&data=${data}&_t=${Date.now()}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// Format a UTC ISO string to the user's local timezone
function formatLocalTime(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short',
  });
}

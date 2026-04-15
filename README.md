# NHL Playoff Pool

A free, automated NHL playoffs predictions pool hosted on GitHub Pages. Picks lock automatically when each series starts. Scores update hourly via the NHL public API.

## Scoring

| Result | Points |
|--------|--------|
| Correct series winner | **2 pts** |
| Correct number of games *(only if winner is also correct)* | **+1 pt** |

---

## Setup (one-time, ~20 minutes)

### Step 1 — Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Name it something like **"NHL Pool 2026"**.
3. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
   ```
   Your Spreadsheet ID is: `1KBhVCvtmN2LQAeTcbQhqCE5x1uZDIExgqeeAJIlq5ZA`

### Step 2 — Set up Google Apps Script

1. In the spreadsheet, click **Extensions → Apps Script**.
2. Delete the default `Code.gs` content.
3. Create two files in the Script Editor:
   - **`Code.gs`** — paste the contents of `gas/Code.gs`
   - **`Setup.gs`** — paste the contents of `gas/Setup.gs`
4. In `Code.gs`, replace the two placeholders at the top:
   ```js
   const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';   // from Step 1
   const APPS_SCRIPT_SECRET = 'YOUR_SECRET_HERE';        // make up a strong random string
   ```
   Keep a note of the secret — you'll need it for GitHub.
5. Save both files.
6. Run the `setupSheets` function from `Setup.gs` once:
   - Select `setupSheets` in the function dropdown, click **Run**.
   - Approve the permissions prompt (it needs access to your Sheet).
   - Verify that `submissions` and `series` tabs appear in the spreadsheet.

### Step 3 — Deploy the Apps Script as a Web App

1. In the Script Editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Type" and select **Web app**.
3. Set:
   - **Execute as**: Me
   - **Who has access**: Anyone
4. Click **Deploy** and copy the **Web App URL** (ends in `/exec`).

### Step 4 — Configure the frontend

1. Open `js/config.js` and replace the placeholder with your Web App URL:
   ```js
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
   ```
2. Commit and push this change.

### Step 5 — Set up GitHub repository

1. Push this project to a GitHub repository.
2. In the repo settings, add:
   - **Secret** (`Settings → Secrets → Actions`):
     - `APPS_SCRIPT_SECRET` → the secret string you chose in Step 2
   - **Variable** (`Settings → Variables → Actions`):
     - `APPS_SCRIPT_URL` → your Web App URL from Step 3

### Step 6 — Enable GitHub Pages

1. Go to **Settings → Pages**.
2. Set Source to **Deploy from a branch**, branch `main`, folder `/` (root).
3. Save. Your pool will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

### Step 7 — Test

1. Run the GitHub Actions workflow manually:
   - Go to **Actions → Update NHL Scores → Run workflow**.
   - Check that the `series` sheet gets populated with playoff data.
2. Open `picks.html` on your GitHub Pages site.
3. Submit a test pick and verify it appears in the `submissions` sheet.
4. Open `index.html` to confirm the leaderboard renders.

---

## How it works

```
GitHub Pages (static site)
    ↓ GET requests
Google Apps Script Web App  ←→  Google Sheets (picks + results)
    ↑ POST (hourly)
GitHub Actions (fetches NHL API, pushes results)
```

- **Picks lock** automatically when the first game of each series starts (determined from the NHL schedule API).
- **Same email** can re-submit to update picks until a series locks.
- **Scores** are recomputed live from the Google Sheet on every leaderboard load.
- **GitHub Actions** runs hourly to keep results current.

---

## Re-deploying Apps Script after changes

Every time you modify `Code.gs`, you must create a new deployment for the changes to take effect on the public `/exec` URL:

1. **Deploy → Manage deployments**
2. Click the pencil icon on your existing deployment
3. Set version to **New version**
4. Click **Deploy**

The URL stays the same — no need to update `js/config.js` or GitHub variables.

---

## Project structure

```
/
├── index.html                  Leaderboard
├── picks.html                  Pick submission form
├── bracket.html                Playoff bracket
├── css/style.css
├── js/
│   ├── config.js               Apps Script URL
│   ├── api.js                  Backend API client
│   ├── leaderboard.js
│   ├── picks.js
│   ├── shame.js                Easter egg
│   └── bracket.js
├── gas/
│   ├── Code.gs                 Apps Script backend
│   └── Setup.gs                One-time sheet setup
└── .github/
    ├── scripts/update-scores.js
    └── workflows/update-scores.yml
```

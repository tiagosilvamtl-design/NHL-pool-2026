// Run setupSheets() ONCE from the Apps Script editor to create required sheets.
// Run addConferenceHeader() and addPinsSheet() once to migrate the live sheet.

function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const sheetsConfig = [
    {
      name: 'submissions',
      headers: ['timestamp', 'name', 'email', 'series_id', 'pick_team', 'pick_games'],
    },
    {
      name: 'series',
      headers: [
        'series_id', 'round', 'team1_abbr', 'team2_abbr', 'team1_name', 'team2_name',
        'winner_abbr', 'actual_games', 'first_game_utc', 'locked', 'status',
        'team1_logo', 'team2_logo', 'conference',
      ],
    },
    {
      name: 'pins',
      headers: ['email', 'pin_hash', 'created_at'],
    },
  ];

  sheetsConfig.forEach(({ name, headers }) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      Logger.log(`Created sheet: ${name}`);
    } else {
      Logger.log(`Sheet already exists: ${name}`);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      Logger.log(`Added headers to: ${name}`);
    }
  });

  Logger.log('Setup complete.');
}

// Run this ONCE to add the conference column header to the live series sheet
// (which already has data, so setupSheets won't touch it).
function addConferenceHeader() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('series');
  if (!sheet) { Logger.log('series sheet not found'); return; }
  const lastCol = sheet.getLastColumn();
  // Only add if not already there
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (existingHeaders.includes('conference')) {
    Logger.log('conference column already exists');
    return;
  }
  sheet.getRange(1, lastCol + 1).setValue('conference');
  sheet.getRange(1, lastCol + 1).setFontWeight('bold');
  Logger.log('Added conference column at position ' + (lastCol + 1));
}

// Run this ONCE to create the pins sheet if it doesn't exist yet.
function addPinsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (ss.getSheetByName('pins')) {
    Logger.log('pins sheet already exists');
    return;
  }
  const sheet = ss.insertSheet('pins');
  sheet.appendRow(['email', 'pin_hash', 'created_at']);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  Logger.log('Created pins sheet');
}

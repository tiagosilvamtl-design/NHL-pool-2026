// Run this ONCE from the Apps Script editor to create the required sheets.
// After running, this script is no longer needed.

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
        'team1_logo', 'team2_logo',
      ],
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
    // Write headers if the sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      Logger.log(`Added headers to: ${name}`);
    }
  });

  Logger.log('Setup complete. Verify SPREADSHEET_ID is correct in Code.gs before deploying.');
}

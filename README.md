# 2026 Tracker

PWA + Google Apps Script backend for the plan-aligned 2026 tracking system.

## Structure

- `app/` - static PWA (HTML/CSS/JS + service worker).
- `apps_script/` - Google Apps Script backend (`Code.gs`).
- `2026_tracker.xlsx` - spreadsheet template to upload into Google Sheets.

## Setup

1) Create the Google Sheet
- Upload `2026_tracker.xlsx` to Google Drive and open as a Google Sheet.
- Confirm sheet names match the template (Metric_Catalog, Tile_Catalog, Raw_Events, Raw_Weekly, People, Drink_Templates).
- Keep the first row as a title row and the second row as headers.

2) Apps Script backend
- Open Extensions > Apps Script in the sheet.
- Replace the contents with `apps_script/Code.gs`.
- In Project Settings, set Script Properties:
  - `API_TOKEN` = your bearer token.
- Update `apps_script/appsscript.json` timeZone to your local timezone if needed.
- Deploy as Web App:
  - Execute as: you
  - Who has access: Anyone with the link

3) PWA frontend
- Host the `app/` folder on any static host (Netlify, GitHub Pages, Cloudflare Pages).
- Open the app and set Settings:
  - Backend URL (your Apps Script web app URL ending in `/exec`)
  - API token
  - Optional dashboard URL (Google Sheet link)

## Free iPhone setup (quick)

1) Google Sheet + Apps Script (free)
   - Upload `2026_tracker.xlsx` to Google Drive and open as a Google Sheet.
   - Extensions → Apps Script → paste `apps_script/Code.gs`.
   - Project Settings → Script Properties: set `API_TOKEN`.
   - Deploy → New deployment → Web App.
     - Execute as: you
     - Who has access: Anyone with the link
     - Copy the `/exec` URL.

2) Free hosting for the PWA
   - GitHub Pages: create a repo, add `app/` contents at repo root, enable Pages.
   - Cloudflare Pages: create a new Pages project from the repo (or drag-and-drop the `app/` folder).
   - Use the hosted URL on your phone.

3) iPhone install
   - Open the PWA URL in Safari → Share → Add to Home Screen.
   - Open the app, go to Settings, paste Backend URL + API token.
   - Optional: paste your Google Sheet link into Dashboard URL.

## Notes

- Auth is checked via Script Properties. The PWA sends the token in the Authorization header and also as `token` and `auth_token` fields to work with Apps Script limitations.
- Raw_Events is append-only. Raw_Weekly is upserted by WeekStart (Monday).
- Config is fully sheet-driven via Metric_Catalog, Goal_Catalog, Tile_Catalog, Drink_Templates, and People.

## Quick test

- Log an Idea tile from the app and confirm a new row appears in `Raw_Events` with OccurredAt and LoggedAt.
- Submit a weekly review and confirm the matching WeekStart row updates in `Raw_Weekly`.

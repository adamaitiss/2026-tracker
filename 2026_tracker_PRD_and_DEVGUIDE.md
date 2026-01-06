# 2026 Tracker — PRD + Dev Guide (Aligned to “My 2026 plan”)

## 1) Executive Summary

### High-leverage XLSX changes made (and why)
- **Replaced posture minutes with a daily posture session metric**: removed `POSTURE_MIN` and implemented `POSTURE_SESSION` (1 session/day; each session represents the plan’s 15 minutes). This matches the revised plan requirement and keeps logging friction low.
- **Removed irrelevant metrics from the template**: deleted unused `EDUCATION_MIN` and `HOBBY_MIN` from `Metric_Catalog` to enforce “plan-only” metric codes.
- **Made “training” totals reflect the full communication plan**: added `DICTION_TRAINING_MIN` and updated rollups so Training totals include speech-therapist sessions (supports the plan’s diction objective).
- **Completed missing goal coverage**: added `G_NETWORTH_Y` (year-end net worth target) and `G_RELATIONSHIP_3M` (derived relationship duration > 3 months) to `Goal_Catalog`.
- **Activated metrics that were present but incorrectly inactive**: set `DEEP_WORK_HOURS` and `PARTNER_QUALITY_TIME` to Active (they are explicitly mentioned in the plan and/or already surfaced in tiles).

Assumptions introduced (minimal and necessary) are listed in the PRD section.

---

## 2) PRD (comprehensive)

### Problem statement
The plan is ambitious and multi-domain. Execution fails primarily due to:
- logging gaps during busy weeks,
- lack of consistent weekly review,
- metrics that are not operationalized into low-friction, repeatable actions.

This product provides **iPhone-first micro-logging** with **Mac weekly review** so that the plan’s targets, milestones, and protocols are measurable and enforceable.

### Personas & contexts
- **Primary user (single-user system)**:
  - **On iPhone (daily):** 5–45 second logs via home-screen tiles (one tap or a quick picker).
  - **On MacBook (weekly):** 30–60 min review: check dashboards, protocols, milestone progress, and plan-vs-actual pace lines.

### Requirements

#### Functional
1. **Event logging (iPhone-first)**
   - Log any plan metric as an event into `Raw_Events`.
   - Support templates/choosers where required:
     - **Alcohol** via `Drink_Templates`
     - **People** via `People` picker (social/dating/pro)
     - Minutes/hours pickers for time-based metrics
2. **Weekly inputs**
   - Weekly form writes to `Raw_Weekly` for:
     - work hours
     - weekly expenses
     - excluded renovation expenses
     - optional net worth snapshot
     - deal spike flag
3. **Backdating (non-negotiable)**
   - Default occurred date/time = “now” (today).
   - User can set occurred date/time to any prior date/time.
   - Persist both:
     - `occurred_at` (user-selected; defaults to now)
     - `logged_at` (server timestamp; always now)
4. **Structured sheet writes**
   - App must append structured rows to Google Sheets so the spreadsheet remains editable on iPhone/Mac.
5. **Weekly review support**
   - Dashboard and rollups update automatically from `Raw_Events` and `Raw_Weekly`.
6. **Busy Week protocol support**
   - Track busy-week trigger and enforce visibility for minimum floors.

#### Non-functional
- Low-cost stack (Google Apps Script + static hosting).
- Offline-tolerant on iPhone (queue + retry).
- Idempotent writes (avoid duplicates).
- Timezone-safe (device timezone captured; reporting based on occurred date).

### Backdating design (occurred_at vs logged_at)
- **UX default:** occurred_at prefilled with now; user can tap date chip to backdate.
- **Storage:** 
  - `occurred_at`: user value
  - `logged_at`: server-generated timestamp
- **Reporting rule:** all aggregations (daily/weekly/monthly/quarterly) use **occurred_at**, never logged_at, so “what happened” stays correct even with late logging.

### Core user flows

#### 1) Log an event (1–2 taps)
1. Open PWA (or iOS Shortcut).
2. Tap a tile (e.g., Ideas +1).
3. Optionally:
   - select person (if required),
   - select template (alcohol),
   - adjust occurred_at (backdate),
   - add notes/tags/star.
4. Submit → backend appends to `Raw_Events`.

#### 2) Edit / correct / backdate after the fact
- Open log history (recent events).
- Tap event → edit occurred_at/value/tags/notes.
- Submit edit:
  - either **soft-delete + reinsert** (recommended) or **update-in-place** (more complex in Sheets).

#### 3) Weekly review (Mac)
- Open Dashboard:
  - plan vs actual pace lines
  - weekly caps and floors
  - milestones status
  - triggers (busy week, low social, low dates, etc.)
- Open Weekly_Agg to see protocol compliance and exceptions.
- Update Milestones (manual completion items).

#### 4) People management
- Quick-add person from a logging flow.
- Maintain person Type (Social / Dating / Professional).
- Review “met 2+ / 5+” progress derived from meetings.

#### 5) Alcohol logging
- Choose drink template, adjust servings.
- Sheet computes standard drinks automatically (`StdDrinks`) so the user never converts manually.

### Data model (Google Sheet schemas)

#### Raw_Events (append-only)
Required:
- `event_id` (string; UUID)
- `occurred_at` (datetime; user-selected; defaults now)
- `metric_code` (string; must exist in Metric_Catalog)
- `value` (number; usually 1 for boolean/toggles)
Optional:
- `unit` (string; default from Metric_Catalog)
- `person_id` (string; required when NeedsPerson = Yes)
- `drink_template_id` (string; required when NeedsTemplate = Yes)
- `notes` (string)
- `tags` (string; comma-separated)
- `starred` (0/1)
- `reviewed` (0/1)
- `source` (manual / ios_shortcut / healthkit / etc.)
Server-set:
- `logged_at` (datetime; server timestamp)

Derived in-sheet:
- `date`, `week_start`, `month_start`, `quarter`
- `std_drinks` (from template + servings)

#### Raw_Weekly
Required:
- `week_start` (date; Monday)
- `work_hours` (number)
- `expenses_personal_rub` (number)
- `excluded_renovation_rub` (number)
Optional:
- `networth_rub` (number)
- `deal_spike_flag` (0/1)
- `notes`, `source`

#### People
Required:
- `person_id`
- `name`
- `type` ∈ {Social, Dating, Professional}
Optional:
- `first_met` (date)
- `notes`
Derived:
- `meetings_2026`, `dates_2026`, `sex_2026`, `pro_contacts_2026` via `Raw_Events`

#### Drink_Templates
Required:
- `drink_template_id`
- `name`
- `abv_percent`
- `volume_ml`
Derived:
- `pure_alcohol_ml`
- `std_drinks_us` (14g ethanol standard)

### Automation plan (Shortcuts + endpoints; fallbacks)

**Preferred (automated where realistic):**
- Apple Health → iOS Shortcut → POST `/events/bulk`
  - Sleep hours (`SLEEP_HOURS`) if available
  - Mindfulness minutes (`MINDFULNESS_MIN`) if logged in Health/Mindfulness apps

**Fallback (manual, low friction):**
- Sleep: quick tile to enter last-night sleep hours (occurred_at backdated to morning).
- Mindfulness: minute picker tile.
- Work hours: weekly form on Sundays.

### Analytics / dashboard requirements (exact charts + calculations)

Dashboards are spreadsheet-driven and must update automatically.

**Required visuals (plan vs actual):**
- **Expenses**
  - Weekly expenses vs weekly cap (175k)
  - Cumulative YTD expenses vs linear pace to annual cap (9m, excluding renovation)
- **Cigarettes**
  - Cumulative YTD vs cap pace line to 100/year
- **Alcohol**
  - Average std drinks/day YTD vs cap (0.4) *(chosen over implied cap for interpretability)*
- **Work hours**
  - Weekly work hours vs target 55 and spike threshold 60
- **Ideas**
  - Weekly ideas vs target 10
  - YTD cumulative vs target pace to 500
- **Training**
  - Training hours YTD vs target 100 (includes diction sessions)
- **Social / friends**
  - People met 2+ times (YTD) progress to 20
  - People met 5+ times (YTD) progress to 5
- **Dating**
  - New dates/month from June vs target 8, with stop-on-relationship logic
- **Travel & activities**
  - Travel nights YTD vs target (>10 implemented as 11)
  - New activities YTD vs target 12
- **Other plan metrics (tracked in rollups)**
  - Posture sessions (daily compliance)
  - Sleep average vs 7.5h/day
  - Unhealthy meals YTD vs cap 150
  - Workouts skipped YTD vs cap 8
  - Net worth snapshot vs target 120m
  - Relationship duration derived (>3 months)

### Out of scope
- Multi-user sharing
- Social network features
- Advanced financial aggregation (bank integrations)
- Full native iOS app (PWA + Shortcuts is the target)

### Risks & mitigations
- **Late logging skews weekly reporting** → enforce occurred_at default + prominent backdate affordance.
- **Duplicate events from flaky mobile connections** → idempotency via event_id.
- **Timezone edge cases at week boundaries** → store timezone_offset_minutes; compute week_start from occurred_at in local timezone before submission.
- **Sheet schema drift** → config-driven catalogs; validations in backend.

### Acceptance criteria
- App can log every plan metric with <10 seconds average effort on iPhone.
- All rollups use occurred_at (late logs land in correct day/week/month).
- Dashboard charts update correctly when new rows are appended.
- Metric_Catalog contains only plan metrics + required infrastructure helpers (explicitly marked).
- Busy-week protocol triggers and floors are computable from the sheet data.

---

## 3) Dev Guide / Tasking for coding agents (detailed)

### Proposed architecture
- **Frontend**: PWA (mobile-first), hosted statically (GitHub Pages / Cloudflare Pages).
- **Backend**: Google Apps Script (GAS) deployed as Web App.
- **Data store**: Google Sheet (based on the aligned XLSX imported to Sheets).

### Backend (GAS) endpoints

#### Auth
- Pre-shared token stored in Script Properties.
- Client sends `Authorization: Bearer <token>`.

#### Idempotency
- Every event includes `event_id` (UUID v4).
- Backend checks if event_id already exists in `Raw_Events!A:A`; if yes, return 200 and do not append.

#### POST /events
Request JSON:
```json
{
  "event_id": "uuid",
  "occurred_at": "2026-06-12T21:15:00+03:00",
  "metric_code": "IDEA",
  "value": 1,
  "unit": "count",
  "person_id": null,
  "drink_template_id": null,
  "notes": "",
  "tags": "work,random",
  "starred": 0,
  "source": "pwa"
}
```

Validation rules:
- metric_code must exist in `Metric_Catalog[MetricCode]` and be Active=1 (or allow inactive if explicitly enabled by Tile_Catalog Active=1).
- If NeedsPerson=Yes → person_id required.
- If NeedsTemplate=Yes → drink_template_id required.
- occurred_at must be parseable; if missing, set to now (but frontend should always send it).
- logged_at is always backend now().

Response:
```json
{ "ok": true, "event_id": "uuid" }
```

#### POST /events/bulk
Accept array of events; apply per-event idempotency; return per-event results.

#### POST /weekly
Request JSON:
```json
{
  "week_start": "2026-06-08",
  "work_hours": 57.5,
  "expenses_personal_rub": 160000,
  "excluded_renovation_rub": 0,
  "networth_rub": 95000000,
  "deal_spike_flag": 0,
  "notes": "",
  "source": "pwa"
}
```
Validation:
- week_start must be Monday.
- numeric fields >= 0.

#### GET /config
Returns the three catalogs:
- Tile_Catalog
- Metric_Catalog
- Goal_Catalog

Implementation: read ranges and return JSON arrays; cache in frontend.

### Config-driven UI (critical)
- App loads `/config` at startup (with caching).
- Home screen tiles are rendered purely from `Tile_Catalog`:
  - widget_type determines control (toggle, stepper, template_stepper, minute_picker, person_toggle, etc.)
  - presets define quick buttons
  - ordering and active flags define visibility

### Backdating implementation details
- UI:
  - occurred_at defaults to device now
  - “Occurred” chip opens date/time picker with quick options: Today, Yesterday, Last weekend
- Server:
  - logged_at set on receipt
- Editing:
  - Recommended: **soft-delete** approach
    - append a new row with `metric_code = "EVENT_VOID"` referencing event_id in tags/notes
    - or add a `voided` column (if you choose to extend schema)
  - Simpler alternative: update-in-place by locating row index (slower, more complex)

### Person picker implementation details
- People are stored in `People` tab.
- Quick add flow:
  - user types name → backend generates new person_id (P####) and appends to People
- Favorites:
  - store local favorites list in localStorage (fast)
  - optionally add `favorite` flag column in People if you want cross-device favorites

### Alcohol templates implementation details
- App loads `Drink_Templates`.
- Logging:
  - choose template + servings (0.5, 1, 2, 3)
  - backend writes event with `drink_template_id` and servings as value
- Sheet computes `StdDrinks` for reporting.

### Offline queue + retry
- Store pending requests in localStorage:
  - `{event_id, payload, retries, last_attempt_at}`
- Retry:
  - exponential backoff up to N retries
  - visible “Pending sync” badge

### Testing plan

#### Unit tests
- Week boundary calculations (Monday week_start) from occurred_at + timezone.
- Standard drinks calculation sanity checks (template math) if also computed in backend.
- Goal logic: stop-on-relationship for dating metrics.

#### Integration tests
- Append row correctness for Raw_Events and Raw_Weekly.
- Idempotency: same event_id twice does not create duplicates.
- Bulk ingestion from Shortcuts.

#### Edge cases
- Backdated events crossing month/quarter boundaries.
- occurred_at around midnight with timezone offset.
- Partial failures in bulk endpoint.
- Duplicate person creation (same name).

### Deployment steps
1. Import aligned XLSX into Google Sheets.
2. Create GAS project bound to the Sheet.
3. Add Script Properties:
   - SHEET_ID
   - AUTH_TOKEN
4. Deploy as Web App (execute as you; accessible to anyone with token).
5. Host PWA statically.
6. Configure iOS Shortcuts:
   - POST to `/events/bulk` with token header.

### Phased delivery plan

#### Phase 0 — Validate spreadsheet + endpoints
- Confirm catalogs load.
- Confirm `/events` writes correct rows including occurred_at/logged_at.
- Confirm rollups update.

#### Phase 1 — MVP logging tiles
- Implement tile renderer + basic widgets (toggle/stepper/minute picker).
- Recent events list.

#### Phase 2 — People + alcohol templates + weekly review
- Person picker + quick add.
- Alcohol template chooser.
- Weekly form for Raw_Weekly.
- Embedded dashboard view (read-only).

#### Phase 3 — Automation + edit/backdate polish
- Shortcuts ingestion for sleep/mindfulness.
- Offline queue.
- Edit/void flow.
- Better backdate UX.

### Prioritized backlog (stories)

1. **Event logging (toggle/stepper/minute picker)**
   - AC: logs append to Raw_Events with valid schema and idempotency.
2. **Backdating UX**
   - AC: user can set occurred_at to any prior date/time; reporting uses occurred_at.
3. **Config loader**
   - AC: UI renders tiles purely from Tile_Catalog.
4. **Person picker**
   - AC: metrics with NeedsPerson enforce selection; People quick-add works.
5. **Alcohol templates**
   - AC: selecting template writes drink_template_id; StdDrinks computed in sheet.
6. **Weekly form**
   - AC: writes to Raw_Weekly; Weekly_Agg updates.
7. **Offline queue**
   - AC: events created offline sync later without duplicates.
8. **Shortcuts automation**
   - AC: health-derived events land correctly with occurred_at backdating supported.
9. **Edit/void**
   - AC: user can correct mistakes without corrupting rollups; audit trail preserved.

---

## 4) Alignment Audit (plan → implementation)

| Plan item | Sheet location | MetricCode / GoalID | Time scale | How it’s logged | How it’s visualized |
|---|---|---|---|---|---|
| People met 2+ times a year: 20 (social, informal) | People.Meetings2026 (derived) + Dashboard cell E10 | SOCIAL_MEET / G_FRIENDS_2P | yearly | Tile: Social meet (person) | Dashboard: People met 2+ |
| People met 5+ times a year: 5 (social, informal) | People.Meetings2026 (derived) + Dashboard cell E11 | SOCIAL_MEET / G_FRIENDS_5P | yearly | Tile: Social meet (person) | Dashboard: People met 5+ |
| New dates/month (starting Jun 2026): 8 (stop upon relationship) | Raw_Events (DATE) + Monthly_Agg.Dates + Dashboard_Charts.Dating | DATE / G_DATES_M | monthly | Tile: Date (person) with backdating | Dashboard chart: Dating |
| New sex partners: 3 (stop upon relationship) | People.Sex2026 (derived from Raw_Events) | SEX / G_SEXPARTNERS_Y | yearly | Tile: Sex (person) | Dashboard stat: New sex partners |
| New romantic relationship duration: >3 months | Dashboard J3:K6 (derived from RELATIONSHIP_START/END) | RELATIONSHIP_START, RELATIONSHIP_END / G_RELATIONSHIP_3M | derived | Tiles: Relationship start / end | Dashboard block: Rel duration |
| Books read: 15 | Raw_Events (BOOK_FINISHED) + Monthly_Agg.BooksFinished | BOOK_FINISHED / G_BOOKS_Y | yearly | Tile: Book finished | Monthly/Quarterly rollups |
| Origination actions: >=1 weekly | Weekly_Agg.OriginationActions | ORIGINATION_ACTION / G_ORIG_W | weekly | Tile: Origination action | Weekly_Agg + review |
| Originated initiatives presented to VP: 2 | Quarterly_Agg + Milestones Q2/Q3 | INITIATIVE_PRESENTED_VP / G_VP_PRES_Y | yearly | Tile: VP presentation | Quarterly milestones |
| New professional contacts: 20 | People.ProContacts2026 (derived) + Dashboard stat | PRO_CONTACT_ADDED / G_PROCONTACTS_Y | yearly | Tile: Pro contact added (person) | Dashboard stat |
| Public speaking/presentation/etc training: 100h | Weekly_Agg.Training_min → hours + Dashboard training | TRAINING_MIN (+DICTION_TRAINING_MIN) / G_TRAINING_Y | yearly | Tiles: Training minutes; Diction training minutes | Dashboard chart: Training |
| Diction improvement (via speech therapist sessions + voice recordings) | Raw_Events (DICTION_TRAINING_MIN, VOICE_SAMPLE) | DICTION_TRAINING_MIN, VOICE_SAMPLE | weekly/monthly | Tile: Diction training; Tile: Voice sample | Log history + milestone |
| New activities tried: 12 | Raw_Events (NEW_ACTIVITY) + Dashboard travel/activities | NEW_ACTIVITY / G_NEWACT_Y | yearly | Tile: New activity | Dashboard chart: Travel & New Activities |
| Travel: >10 nights | Raw_Events (TRAVEL_NIGHT) + Dashboard travel/activities | TRAVEL_NIGHT / G_TRAVEL_Y | yearly | Tile: Travel night | Dashboard chart: Travel & New Activities |
| Write ideas: 500 total and 10/week | Weekly_Agg.Ideas + Dashboard ideas chart | IDEA / G_IDEAS_Y, G_IDEAS_W | weekly & yearly | Tile: Idea +1 | Dashboard chart: Ideas |
| Weekly idea review: star top idea weekly | Weekly_Agg.IdeaStars | IDEA_STAR / G_IDEA_REVIEW_W | weekly | Tile: Star top idea | Weekly_Agg trigger: IdeaNoReview |
| Mindfulness: 100 min/week and 4+ days/week | Weekly_Agg.Mindfulness_min & Mindfulness_days | MINDFULNESS_MIN / G_MINDFUL_W_MIN, G_MINDFUL_W_DAYS | weekly | Tile: Mindfulness minutes (or Health automation) | Dashboard weekly stat |
| Expenses: RUB <9m (excl renovation) + weekly <175k | Raw_Weekly + Dashboard expense chart | EXPENSES_PERSONAL_RUB / G_EXPENSES_Y, G_EXPENSES_W | weekly & yearly | Weekly form | Dashboard chart: Expenses |
| Desired net worth outcome: RUB >120m | Raw_Weekly.NetWorth_RUB + Dashboard stat | NETWORTH_RUB / G_NETWORTH_Y | yearly | Weekly/monthly snapshot entry | Dashboard stat |
| Work hours: <55/week; Busy-week trigger at >60h or deal spike | Raw_Weekly.WorkHours + Weekly_Agg.BusyWeek | WORKHOURS_WEEKLY / G_WORKHOURS_W + DEALSPIKE_FLAG | weekly | Weekly form + deal spike toggle | Dashboard chart: Work hours |
| Busy Week protocol (keep 1 social, 1 training, 10 ideas) | Weekly_Agg.SpikeMinimum_met? | Protocol | weekly | Derived from Weekly_Agg columns | Weekly_Agg protocol indicators |
| Maintenance: sleep, alcohol, cigarettes, unhealthy meals, workouts skipped, posture | Raw_Events + Daily/Weekly_Agg | Multiple maintenance goals | daily/weekly/yearly | Tiles + automation where possible | Dashboard + rollup tabs |
| Project: Friendship pipeline (sourcing → meeting → assess → repeat) | People tab + SOCIAL_MEET + Monthly_Agg social pipeline columns | SOCIAL_MEET (person-based) | ongoing | Log each informal meeting with person_id | Dashboard: People met 2+/5+; Monthly_Agg.NewSocialPeople/Converted2plus |
| Project: Dating readiness foundations (filters, boundaries, life content) | Milestones tab (Dating Q1/Q2 manual items) | Milestones | quarterly | Manual milestone checkbox updates | Milestones tab status |
| Project: Dating pipeline (sourcing → date → assess → repeat) | People tab (Type=Dating) + DATE events | DATE (person-based) | monthly | Log each date with person_id | Dashboard: Dating chart |
| Project: Training pipeline (choose programs + schedule recurring sessions) | Weekly_Agg.TrainingSessions/Training_min + Milestones Career | TRAINING_MIN, DICTION_TRAINING_MIN | weekly/yearly | Log each training session minutes | Dashboard: Training |
| Project: Origination pipeline (10 ideas → stakeholder chats → memo/quarter) | Raw_Events + Monthly/Quarterly_Agg + Milestones Career | INITIATIVE_IDEA, STAKEHOLDER_CHAT, MEMO_WRITTEN, ORIGINATION_ACTION | weekly/monthly/quarterly | Use tiles for each pipeline step | Monthly/Quarterly rollups + Milestones |
| Project: New activity pipeline (plan 1 new activity/month) | Raw_Events.NEW_ACTIVITY + Milestones Hobbies | NEW_ACTIVITY | monthly | Tile: New activity | Dashboard: Travel & New Activities |
| Project: Idea system (daily capture + weekly 20-min review) | Raw_Events.IDEA + Raw_Events.IDEA_STAR | IDEA, IDEA_STAR | daily/weekly | Idea tile + Star top idea tile | Dashboard: Ideas + Weekly trigger IdeaNoReview |
| Protocol: Social conversion risk trigger (10+ new contacts/month but <2 second meetings) | Monthly_Agg.Trigger_NewContactsLow2nd | Derived | monthly | Derived from People first meetings and 2+ meetings | Monthly_Agg trigger flag |
| Protocol: Work spikes kill consistency (social) trigger (<1 social event for 2 weeks) | Weekly_Agg.Trigger_LowSocial_2w | Derived | weekly | Derived from Weekly_Agg.SocialEvents + BusyWeek | Weekly_Agg trigger flag |
| Protocol: Work spikes kill consistency (dating) trigger (<2 new dates for 2 weeks) | Weekly_Agg.Trigger_LowDates_2w | Derived | weekly | Derived from Weekly_Agg.Dates + BusyWeek | Weekly_Agg trigger flag |
| Protocol: Origination stall trigger (0 origination actions in a month) | Monthly_Agg.Trigger_NoOrigination | Derived | monthly | Derived from ORIGINATION_ACTION / STAKEHOLDER_CHAT / MEMO_WRITTEN / VP presentations | Monthly_Agg trigger flag |
| Protocol: Cancelled activities trigger (cancel 2 planned activities in a month) | Monthly_Agg.Trigger_CancelledActivities | ACTIVITY_CANCELLED | monthly | Tile: Activity cancelled | Monthly_Agg trigger flag |
| 2026-Q2 — Finance: Open new foreign bank card | Milestones!C3 (criteria in E3) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Social: Wardrobe plan executed | Milestones!C4 (criteria in E4) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Social: Join 2 recurring communities + attend 6–8 sessions | Milestones!C5 (criteria in E5) | COMMUNITY_SESSION | quarterly | Tiles/events: COMMUNITY_SESSION | Milestones tab status |
| 2026-Q1 — Social: Meet 10–20 new people | Milestones!C6 (criteria in E6) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Social: Convert 4–6 into 2nd meetings | Milestones!C7 (criteria in E7) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Social: Living situation invite-ready | Milestones!C8 (criteria in E8) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Social: Identify 8 friend-candidates | Milestones!C9 (criteria in E9) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Social: Host/organize 2 events | Milestones!C10 (criteria in E10) | HOSTED_EVENT | quarterly | Tiles/events: HOSTED_EVENT | Milestones tab status |
| 2026-Q2 — Social: Reach cumulative 10–12 people met 2+ times | Milestones!C11 (criteria in E11) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Social: 5 core candidates seen at least monthly | Milestones!C12 (criteria in E12) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Social: Reach cumulative 15+ people met 2+ times | Milestones!C13 (criteria in E13) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Social: 5 people hit 5+ meetings threshold | Milestones!C14 (criteria in E14) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Social: Run 2 hosted events (Q4) | Milestones!C15 (criteria in E15) | HOSTED_EVENT | quarterly | Tiles/events: HOSTED_EVENT | Milestones tab status |
| 2026-Q1 — Dating: Wardrobe plan executed; grooming baseline stable | Milestones!C16 (criteria in E16) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Dating: Photos planned/booked | Milestones!C17 (criteria in E17) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Dating: Partner filter + deal-breakers + first-date plan defined | Milestones!C18 (criteria in E18) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Dating: Ex-boundary plan written and started | Milestones!C19 (criteria in E19) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Dating: Profile live + messaging rhythm established by May | Milestones!C20 (criteria in E20) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Dating: Calendar locked for 2 dates/week starting June | Milestones!C21 (criteria in E21) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Dating: June target: 8 dates | Milestones!C22 (criteria in E22) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Dating: At least 1 new sex partner (cumulative) | Milestones!C23 (criteria in E23) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Dating: 3 new sex partners (cumulative) | Milestones!C24 (criteria in E24) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Dating: Relationship >3 months (if found) | Milestones!C25 (criteria in E25) | RELATIONSHIP_START | quarterly | Tiles/events: RELATIONSHIP_START | Milestones tab status |
| 2026-Q1 — Career: Training started; 15 hours logged (cum) | Milestones!C26 (criteria in E26) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Career: 45 hours training logged (cum) | Milestones!C27 (criteria in E27) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Career: 75 hours training logged (cum) | Milestones!C28 (criteria in E28) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Career: 100 hours training complete (cum) | Milestones!C29 (criteria in E29) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Career: Record baseline voice sample | Milestones!C30 (criteria in E30) | VOICE_SAMPLE | quarterly | Tiles/events: VOICE_SAMPLE | Milestones tab status |
| 2026-Q1 — Career: Origination list (10 ideas) + stakeholder conversations | Milestones!C31 (criteria in E31) | IDEA, INITIATIVE_IDEA, STAKEHOLDER_CHAT | quarterly | Tiles/events: IDEA, INITIATIVE_IDEA, STAKEHOLDER_CHAT | Milestones tab status |
| 2026-Q2 — Career: Initiative #1 presented to VP (cum>=1) | Milestones!C32 (criteria in E32) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Career: Initiative #2 presented to VP (cum>=2) | Milestones!C33 (criteria in E33) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Career: 10 new professional contacts (cum) | Milestones!C34 (criteria in E34) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Career: 15 new professional contacts (cum) | Milestones!C35 (criteria in E35) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Career: 20 new professional contacts (cum) | Milestones!C36 (criteria in E36) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Hobbies: Anchor hobby sessions 12 (cum) | Milestones!C37 (criteria in E37) | COOKING_SESSION, PISTOL_SHOOTING_SESSION | quarterly | Tiles/events: COOKING_SESSION, PISTOL_SHOOTING_SESSION | Milestones tab status |
| 2026-Q2 — Hobbies: Anchor hobby sessions 24 (cum) | Milestones!C38 (criteria in E38) | COOKING_SESSION, PISTOL_SHOOTING_SESSION | quarterly | Tiles/events: COOKING_SESSION, PISTOL_SHOOTING_SESSION | Milestones tab status |
| 2026-Q1 — Hobbies: Try 2 new activities (cum) | Milestones!C39 (criteria in E39) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Hobbies: Try 6 new activities (cum) | Milestones!C40 (criteria in E40) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Hobbies: Try 10 new activities (cum) | Milestones!C41 (criteria in E41) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Hobbies: Try 12 new activities (cum) | Milestones!C42 (criteria in E42) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Hobbies: Reach 125 ideas (cum) | Milestones!C43 (criteria in E43) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q2 — Hobbies: Reach 250 ideas (cum) | Milestones!C44 (criteria in E44) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Hobbies: Reach 375 ideas (cum) | Milestones!C45 (criteria in E45) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Hobbies: Finish 500 ideas (cum) | Milestones!C46 (criteria in E46) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q1 — Hobbies: Take 3 travel nights (cum) | Milestones!C47 (criteria in E47) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Hobbies: Take 7 travel nights (cum) | Milestones!C48 (criteria in E48) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Dating: Improve conversion (more 2nd/3rd dates, fewer dead chats) | Milestones!C49 (criteria in E49) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q3 — Dating: 1–2 candidates plausibly >3 months | Milestones!C50 (criteria in E50) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |
| 2026-Q4 — Dating: Audit filters + channel mix + execution (if no relationship) | Milestones!C51 (criteria in E51) | Milestone | quarterly | Manual milestone checkbox | Milestones tab status |

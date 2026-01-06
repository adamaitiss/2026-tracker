/* 2026 Tracker Apps Script backend */

function doGet(e) {
  try {
    var path = getPath_(e);
    if (path === '/v1/config') {
      requireAuth_(e, null);
      return jsonResponse_({
        status: 'ok',
        server_time: new Date().toISOString(),
        timezone: Session.getScriptTimeZone(),
        metric_catalog: getSheetObjects_('Metric_Catalog'),
        goal_catalog: getSheetObjects_('Goal_Catalog'),
        tile_catalog: getSheetObjects_('Tile_Catalog'),
        drink_templates: getSheetObjects_('Drink_Templates'),
        people: getSheetObjects_('People')
      });
    }

    return jsonError_('not_found', 404, 'Unknown endpoint: ' + path);
  } catch (err) {
    return handleError_(err);
  }
}

function doPost(e) {
  try {
    var path = getPath_(e);
    var payload = parseJson_(e);
    requireAuth_(e, payload);

    if (path === '/v1/events') {
      return handleEventPost_(payload);
    }

    if (path === '/v1/weekly') {
      return handleWeeklyPost_(payload);
    }

    if (path === '/v1/people') {
      return handlePeoplePost_(payload);
    }

    return jsonError_('not_found', 404, 'Unknown endpoint: ' + path);
  } catch (err) {
    return handleError_(err);
  }
}

function handleEventPost_(payload) {
  assertRequired_(payload, ['event_id', 'occurred_at', 'metric_code', 'value']);

  var metric = getMetricByCode_(payload.metric_code, payload.allow_inactive);
  if (!metric) {
    return jsonError_('invalid_metric', 400, 'Unknown or inactive metric_code');
  }

  if (isTruthy_(metric['NeedsPerson?']) && !payload.person_id) {
    return jsonError_('needs_person', 400, 'person_id required for metric');
  }

  if (isTruthy_(metric['NeedsTemplate?']) && !payload.drink_template_id) {
    return jsonError_('needs_template', 400, 'drink_template_id required for metric');
  }

  var sheet = getSheet_('Raw_Events');
  var header = getHeaderInfo_(sheet);

  if (eventIdExists_(sheet, header, payload.event_id)) {
    return jsonResponse_({ status: 'duplicate_ignored', event_id: payload.event_id });
  }

  var rowIndex = findAppendRow_(sheet, header, 'EventID');
  ensureRowCapacity_(sheet, rowIndex);
  var row = buildRowWithFormulas_(sheet, rowIndex, header, {
    EventID: payload.event_id,
    OccurredAt: parseDate_(payload.occurred_at),
    MetricCode: payload.metric_code,
    Value: payload.value,
    Unit: payload.unit || metric.DefaultUnit || '',
    PersonID: payload.person_id || '',
    DrinkTemplateID: payload.drink_template_id || '',
    Notes: payload.notes || '',
    Tags: payload.tags || '',
    Starred: payload.starred || 0,
    Reviewed: payload.reviewed || 0,
    Source: payload.source || 'pwa',
    LoggedAt: new Date()
  }, ['Date', 'WeekStart', 'MonthStart', 'Quarter', 'StdDrinks']);

  sheet.getRange(rowIndex, 1, 1, header.headers.length).setValues([row]);

  return jsonResponse_({
    status: 'ok',
    event_id: payload.event_id,
    logged_at: new Date().toISOString()
  });
}

function handleWeeklyPost_(payload) {
  assertRequired_(payload, ['week_start']);

  var sheet = getSheet_('Raw_Weekly');
  var header = getHeaderInfo_(sheet);
  var weekStart = normalizeWeekStart_(payload.week_start);
  var tz = Session.getScriptTimeZone();
  var weekStartStr = Utilities.formatDate(weekStart, tz, 'yyyy-MM-dd');

  var rowIndex = findRowByDate_(sheet, header, 'WeekStart', weekStartStr);

  var updateValues = {
    WeekStart: weekStart,
    WorkHours: emptyToBlank_(payload.work_hours),
    ExpensesPersonal_RUB: emptyToBlank_(payload.expenses_personal_rub),
    ExcludedRenovation_RUB: emptyToBlank_(payload.excluded_renovation_rub),
    'NetWorth_RUB(optional)': emptyToBlank_(payload.net_worth_rub),
    Notes: payload.notes || '',
    Source: payload.source || 'pwa',
    'DealSpikeFlag(1/0)': emptyToBlank_(payload.deal_spike_flag)
  };

  if (rowIndex) {
    var rowValues = sheet.getRange(rowIndex, 1, 1, header.headers.length).getValues()[0];
    var updated = rowValues.slice();
    header.headers.forEach(function (name, idx) {
      if (updateValues.hasOwnProperty(name)) {
        updated[idx] = updateValues[name];
      }
    });
    sheet.getRange(rowIndex, 1, 1, header.headers.length).setValues([updated]);
  } else {
    var row = buildRowFromHeader_(header.headers, updateValues);
    sheet.getRange(header.lastRow + 1, 1, 1, header.headers.length).setValues([row]);
  }

  return jsonResponse_({ status: 'ok', week_start: weekStartStr });
}

function handlePeoplePost_(payload) {
  assertRequired_(payload, ['name', 'type']);

  var type = String(payload.type || '').trim();
  if (!/^(Social|Pro|Romance)$/.test(type)) {
    return jsonError_('invalid_type', 400, 'type must be Social, Pro, or Romance');
  }

  var sheet = getSheet_('People');
  var header = getHeaderInfo_(sheet);
  var personId = payload.person_id || generatePersonId_();

  if (payload.person_id && personIdExists_(sheet, header, payload.person_id)) {
    return jsonResponse_({ status: 'duplicate_ignored', person_id: payload.person_id });
  }

  var rowIndex = findAppendRow_(sheet, header, 'PersonID');
  ensureRowCapacity_(sheet, rowIndex);
  var row = buildRowWithFormulas_(sheet, rowIndex, header, {
    PersonID: personId,
    Name: payload.name,
    Type: type,
    FirstMet: payload.first_met ? parseDate_(payload.first_met) : new Date(),
    Notes: payload.notes || ''
  }, ['Meetings2026', 'Dates2026', 'Sex2026', 'ProContacts2026']);

  sheet.getRange(rowIndex, 1, 1, header.headers.length).setValues([row]);

  return jsonResponse_({ status: 'ok', person_id: personId });
}

function getPath_(e) {
  var path = '/';
  if (e && e.pathInfo) {
    path = e.pathInfo;
  } else if (e && e.parameter && e.parameter.path) {
    path = e.parameter.path;
  }
  if (!path) {
    return '/';
  }
  if (path.charAt(0) !== '/') {
    path = '/' + path;
  }
  return path;
}

function parseJson_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('Invalid JSON payload');
  }
}

function requireAuth_(e, payload) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) {
    throw new Error('API_TOKEN not set in Script Properties');
  }

  var token = extractToken_(e, payload);
  if (!token || token !== expected) {
    throw new Error('Unauthorized');
  }
}

function extractToken_(e, payload) {
  if (payload) {
    if (payload.token) {
      return payload.token;
    }
    if (payload.auth_token) {
      return payload.auth_token;
    }
  }
  if (e && e.parameter) {
    if (e.parameter.token) {
      return e.parameter.token;
    }
    if (e.parameter.auth_token) {
      return e.parameter.auth_token;
    }
  }
  if (e && e.headers) {
    var authHeader = e.headers.Authorization || e.headers.authorization;
    if (authHeader && authHeader.indexOf('Bearer ') === 0) {
      return authHeader.replace('Bearer ', '').trim();
    }
  }
  return '';
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(code, status, message) {
  return jsonResponse_({ status: 'error', code: code, http_status: status, message: message });
}

function handleError_(err) {
  var message = String(err);
  if (message.indexOf('Unauthorized') !== -1 || message.indexOf('API_TOKEN') !== -1) {
    return jsonError_('unauthorized', 401, message);
  }
  if (message.indexOf('Missing required field') !== -1) {
    return jsonError_('bad_request', 400, message);
  }
  if (message.indexOf('Invalid JSON') !== -1) {
    return jsonError_('bad_request', 400, message);
  }
  return jsonError_('server_error', 500, message);
}

function assertRequired_(payload, keys) {
  keys.forEach(function (key) {
    if (!payload || payload[key] === undefined || payload[key] === null || payload[key] === '') {
      throw new Error('Missing required field: ' + key);
    }
  });
}

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet not found: ' + name);
  }
  return sheet;
}

function getHeaderInfo_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headerRow = detectHeaderRow_(sheet, lastCol);
  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];

  return {
    headerRow: headerRow,
    headers: headers,
    lastRow: lastRow
  };
}

function detectHeaderRow_(sheet, lastCol) {
  var maxScan = Math.min(5, sheet.getLastRow());
  var rows = sheet.getRange(1, 1, maxScan, lastCol).getValues();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var nonEmpty = row.filter(function (cell) { return cell !== '' && cell !== null; });
    if (nonEmpty.length >= 2 && row.join('|').indexOf('MetricCode') !== -1) {
      return i + 1;
    }
    if (nonEmpty.length >= 2 && row.join('|').indexOf('TileID') !== -1) {
      return i + 1;
    }
    if (nonEmpty.length >= 2 && row.join('|').indexOf('GoalID') !== -1) {
      return i + 1;
    }
    if (nonEmpty.length >= 2 && row.join('|').indexOf('EventID') !== -1) {
      return i + 1;
    }
    if (nonEmpty.length >= 2 && row.join('|').indexOf('WeekStart') !== -1) {
      return i + 1;
    }
    if (nonEmpty.length >= 2 && row.join('|').indexOf('PersonID') !== -1) {
      return i + 1;
    }
  }
  return 2;
}

function getSheetObjects_(sheetName) {
  var sheet = getSheet_(sheetName);
  var header = getHeaderInfo_(sheet);
  var dataRowStart = header.headerRow + 1;
  if (header.lastRow < dataRowStart) {
    return [];
  }
  var data = sheet.getRange(dataRowStart, 1, header.lastRow - header.headerRow, header.headers.length).getValues();
  var objects = [];
  data.forEach(function (row) {
    var isEmpty = row.every(function (cell) { return cell === '' || cell === null; });
    if (isEmpty) {
      return;
    }
    var obj = {};
    header.headers.forEach(function (name, idx) {
      obj[name] = row[idx];
    });
    objects.push(obj);
  });
  return objects;
}

function getMetricByCode_(metricCode, allowInactive) {
  var metrics = getSheetObjects_('Metric_Catalog');
  for (var i = 0; i < metrics.length; i++) {
    var metric = metrics[i];
    if (metric.MetricCode === metricCode) {
      if (allowInactive || isTruthy_(metric['Active?'])) {
        return metric;
      }
      return null;
    }
  }
  return null;
}

function eventIdExists_(sheet, header, eventId) {
  return idExists_(sheet, header, 'EventID', eventId);
}

function personIdExists_(sheet, header, personId) {
  return idExists_(sheet, header, 'PersonID', personId);
}

function idExists_(sheet, header, columnName, value) {
  var idIndex = header.headers.indexOf(columnName);
  if (idIndex === -1) {
    throw new Error(columnName + ' column not found');
  }
  if (header.lastRow <= header.headerRow) {
    return false;
  }
  var columnRange = sheet.getRange(header.headerRow + 1, idIndex + 1, header.lastRow - header.headerRow, 1);
  var finder = columnRange.createTextFinder(String(value)).matchEntireCell(true).findNext();
  return !!finder;
}

function findAppendRow_(sheet, header, columnName) {
  var idx = header.headers.indexOf(columnName);
  if (idx === -1) {
    throw new Error('Column not found: ' + columnName);
  }
  var dataStart = header.headerRow + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < dataStart) {
    return dataStart;
  }
  var range = sheet.getRange(dataStart, idx + 1, lastRow - header.headerRow, 1);
  var values = range.getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var cell = values[i][0];
    if (cell !== '' && cell !== null) {
      return dataStart + i + 1;
    }
  }
  return dataStart;
}

function ensureRowCapacity_(sheet, rowIndex) {
  var maxRows = sheet.getMaxRows();
  if (rowIndex > maxRows) {
    sheet.insertRowsAfter(maxRows, rowIndex - maxRows);
  }
}

function ensureRowFormulas_(sheet, rowIndex, header, formulaHeaders) {
  if (!formulaHeaders || !formulaHeaders.length) {
    return;
  }
  var formulas = sheet.getRange(rowIndex, 1, 1, header.headers.length).getFormulas()[0];
  var missingCols = [];
  formulaHeaders.forEach(function (name) {
    var idx = header.headers.indexOf(name);
    if (idx === -1) {
      return;
    }
    if (!formulas[idx]) {
      missingCols.push(idx + 1);
    }
  });
  if (!missingCols.length) {
    return;
  }
  if (rowIndex <= header.headerRow + 1) {
    return;
  }
  var sourceRow = rowIndex - 1;
  missingCols.forEach(function (col) {
    sheet.getRange(sourceRow, col).copyTo(sheet.getRange(rowIndex, col), { contentsOnly: false });
  });
}

function buildRowWithFormulas_(sheet, rowIndex, header, values, formulaHeaders) {
  ensureRowFormulas_(sheet, rowIndex, header, formulaHeaders);
  var formulas = sheet.getRange(rowIndex, 1, 1, header.headers.length).getFormulas()[0];
  return header.headers.map(function (name, idx) {
    if (values.hasOwnProperty(name)) {
      return values[name];
    }
    if (formulas[idx]) {
      return formulas[idx];
    }
    return '';
  });
}

function buildRowFromHeader_(headers, values) {
  return headers.map(function (name) {
    if (values.hasOwnProperty(name)) {
      return values[name];
    }
    return '';
  });
}

function parseDate_(value) {
  if (value instanceof Date) {
    return value;
  }
  var date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date: ' + value);
  }
  return date;
}

function normalizeWeekStart_(value) {
  var date = parseDate_(value);
  var day = date.getDay();
  var diff = (day + 6) % 7; // Monday=0
  if (diff !== 0) {
    date.setDate(date.getDate() - diff);
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function findRowByDate_(sheet, header, columnName, targetDateStr) {
  var idx = header.headers.indexOf(columnName);
  if (idx === -1) {
    throw new Error('Column not found: ' + columnName);
  }
  var tz = Session.getScriptTimeZone();
  if (header.lastRow <= header.headerRow) {
    return null;
  }
  var range = sheet.getRange(header.headerRow + 1, idx + 1, header.lastRow - header.headerRow, 1);
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    var cell = values[i][0];
    if (!cell) {
      continue;
    }
    var cellStr = Utilities.formatDate(new Date(cell), tz, 'yyyy-MM-dd');
    if (cellStr === targetDateStr) {
      return header.headerRow + 1 + i;
    }
  }
  return null;
}

function generatePersonId_() {
  var uuid = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return 'P' + uuid;
}

function emptyToBlank_(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return value;
}

function isTruthy_(value) {
  if (value === true || value === 1) {
    return true;
  }
  var str = String(value).toLowerCase();
  return str === 'true' || str === 'yes' || str === '1';
}

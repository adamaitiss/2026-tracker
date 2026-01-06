const STORAGE_KEYS = {
  settings: 'tracker.settings',
  config: 'tracker.config',
  queue: 'tracker.queue',
  weeklyQueue: 'tracker.weeklyQueue',
  favorites: 'tracker.favorites'
};

const PERSON_TYPE_BY_METRIC = {
  SOCIAL_MEET: 'Social',
  PRO_CONTACT_ADDED: 'Pro',
  RELEVANT_CONTACT_APPROACH: 'Pro',
  STAKEHOLDER_CHAT: 'Pro',
  DATE: 'Romance',
  SEX: 'Romance',
  RELATIONSHIP_START: 'Romance',
  RELATIONSHIP_END: 'Romance',
  PARTNER_QUALITY_TIME: 'Romance'
};

const state = {
  config: null,
  settings: loadSettings(),
  queue: loadQueue(STORAGE_KEYS.queue),
  weeklyQueue: loadQueue(STORAGE_KEYS.weeklyQueue),
  favorites: loadFavorites()
};

const modalState = {
  tile: null,
  valueInput: null,
  fixedValue: null,
  personSelect: null,
  templateSelect: null,
  tagsInput: null,
  notesInput: null,
  backdateToggle: null,
  backdateInput: null,
  addPersonForm: null
};

document.addEventListener('DOMContentLoaded', () => {
  bindUI();
  hydrateSettingsForm();
  updateConnectionStatus();
  updateQueueStatus();
  setDefaultWeekStart();
  loadConfig().then(() => {
    renderTiles();
    renderFavorites();
    updateConfigStatus();
  });
  flushQueue();
  registerServiceWorker();
});

function bindUI() {
  document.querySelectorAll('.tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  document.getElementById('retryQueue').addEventListener('click', () => flushQueue(true));
  document.getElementById('refreshConfig').addEventListener('click', async () => {
    await loadConfig({ force: true });
    renderTiles();
    renderFavorites();
    updateConfigStatus();
  });

  document.getElementById('weeklyForm').addEventListener('submit', handleWeeklySubmit);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('testConnection').addEventListener('click', testConnection);

  const modal = document.getElementById('tileModal');
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalSubmit').addEventListener('click', submitModalEvent);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  window.addEventListener('online', () => {
    updateConnectionStatus();
    flushQueue();
  });
  window.addEventListener('offline', updateConnectionStatus);
}

function setView(viewId) {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === viewId);
  });
  document.querySelectorAll('.tab[data-view]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === viewId);
  });
}

function setDefaultWeekStart() {
  const input = document.getElementById('weekStart');
  const now = new Date();
  const monday = new Date(now);
  const diff = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  input.value = formatDateInput(monday);
}

async function loadConfig({ force = false } = {}) {
  const cached = loadCachedConfig();
  if (cached && !force) {
    state.config = cached;
  }

  if (!state.settings.backendUrl || !state.settings.apiToken) {
    if (!state.config && cached) {
      state.config = cached;
    }
    return;
  }

  try {
    const url = buildUrl(state.settings.backendUrl, '/v1/config', {
      token: state.settings.apiToken
    });
    const headers = isAppsScriptUrl(state.settings.backendUrl)
      ? {}
      : { Authorization: `Bearer ${state.settings.apiToken}` };
    const response = await fetch(url, {
      headers
    });
    if (!response.ok) {
      throw new Error('Config fetch failed');
    }
    const data = await response.json();
    if (data && data.status === 'ok') {
      state.config = data;
      localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(data));
      showToast('Config loaded');
    }
  } catch (err) {
    if (!state.config && cached) {
      state.config = cached;
      showToast('Using cached config', true);
    } else {
      showToast('Config unavailable', true);
    }
  }
}

function loadCachedConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.config));
  } catch (err) {
    return null;
  }
}

function renderTiles() {
  const container = document.getElementById('tiles');
  container.innerHTML = '';

  const tiles = getActiveTiles();
  if (!tiles.length) {
    container.innerHTML = '<div class="card">No tiles available. Load config first.</div>';
    return;
  }

  tiles.forEach((tile, index) => {
    const card = document.createElement('div');
    card.className = 'tile';
    card.style.animationDelay = `${index * 40}ms`;
    card.addEventListener('click', () => openTileModal(tile));

    const title = document.createElement('div');
    title.className = 'tile-title';
    title.textContent = tile.DisplayName || tile.TileID;

    const meta = document.createElement('div');
    meta.className = 'tile-meta';
    meta.textContent = `${tile.MetricCode} · ${tile.WidgetType}`;

    const tag = document.createElement('div');
    tag.className = 'tile-tag';
    const tagValue = toNumber(tile.DefaultValue, 1);
    tag.textContent = tile.Unit ? `${tagValue} ${tile.Unit}` : 'Tap to log';

    card.append(title, meta, tag);
    container.appendChild(card);
  });
}

function openTileModal(tile) {
  modalState.tile = tile;
  modalState.valueInput = null;
  modalState.fixedValue = null;
  modalState.personSelect = null;
  modalState.templateSelect = null;
  modalState.tagsInput = null;
  modalState.notesInput = null;
  modalState.backdateToggle = null;
  modalState.backdateInput = null;
  modalState.addPersonForm = null;

  const metric = getMetric(tile.MetricCode) || {};
  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  document.getElementById('modalTitle').textContent = tile.DisplayName || tile.TileID;
  document.getElementById('modalSub').textContent = metric.MetricName || tile.MetricCode;

  const widgetType = tile.WidgetType;
  const defaultValue = toNumber(tile.DefaultValue, 1);
  const step = toNumber(tile.Step, toNumber(metric.DefaultStep, 1));
  const presets = parsePresets(tile.Presets || metric.Presets);
  const unit = tile.Unit || metric.DefaultUnit || '';
  const requiresTemplate = needsTemplate(tile, metric);
  const requiresPerson = needsPerson(tile, metric);

  if (widgetType === 'stepper' || widgetType === 'minute_picker' || widgetType === 'duration_picker' || widgetType === 'template_stepper') {
    body.appendChild(renderValueControl(defaultValue, step, presets, unit));
  } else {
    const chip = document.createElement('div');
    chip.className = 'meta-chip';
    chip.textContent = `Value: ${defaultValue}${unit ? ' ' + unit : ''}`;
    modalState.fixedValue = defaultValue;
    body.appendChild(chip);
  }

  if (requiresTemplate) {
    const templates = (state.config?.drink_templates || []).filter((row) => row.DrinkTemplateID);
    body.appendChild(renderTemplateSelect(templates));
  }

  if (requiresPerson) {
    const people = getPeopleForMetric(tile.MetricCode);
    body.appendChild(renderPersonSelect(people));
  }

  if (widgetType === 'tag_toggle') {
    body.appendChild(renderTagsInput(presets));
  }

  const notes = document.createElement('label');
  notes.textContent = 'Notes (optional)';
  const notesInput = document.createElement('input');
  notesInput.placeholder = 'Add context or tags';
  notes.appendChild(notesInput);
  modalState.notesInput = notesInput;
  body.appendChild(notes);

  body.appendChild(renderBackdateControls());

  openModal();
}

function renderValueControl(defaultValue, step, presets, unit) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card';

  const label = document.createElement('div');
  label.className = 'section-sub';
  label.textContent = unit ? `Value (${unit})` : 'Value';

  const control = document.createElement('div');
  control.className = 'value-input';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '-';

  const input = document.createElement('input');
  input.type = 'number';
  input.step = step;
  input.min = 0;
  input.value = defaultValue;

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';

  minus.addEventListener('click', () => {
    input.value = Math.max(0, toNumber(input.value, defaultValue) - step);
  });
  plus.addEventListener('click', () => {
    input.value = toNumber(input.value, defaultValue) + step;
  });

  control.append(minus, input, plus);

  wrapper.append(label, control);

  if (presets.length) {
    const presetWrap = document.createElement('div');
    presetWrap.className = 'preset-list';
    presets.forEach((value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset';
      btn.textContent = value;
      btn.addEventListener('click', () => {
        input.value = value;
      });
      presetWrap.appendChild(btn);
    });
    wrapper.appendChild(presetWrap);
  }

  modalState.valueInput = input;
  return wrapper;
}

function renderTemplateSelect(templates) {
  const label = document.createElement('label');
  label.textContent = 'Drink template';

  const select = document.createElement('select');
  templates.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.DrinkTemplateID;
    option.textContent = template.Name || template.DrinkTemplateID;
    select.appendChild(option);
  });

  label.appendChild(select);
  modalState.templateSelect = select;
  return label;
}

function renderPersonSelect(people) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card';

  const label = document.createElement('label');
  label.textContent = 'Person';

  const select = document.createElement('select');
  select.innerHTML = '<option value="">Select person</option>';

  const favorites = getFavoritePeople(people);
  if (favorites.length) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'Favorites';
    favorites.forEach((person) => {
      const option = document.createElement('option');
      option.value = person.PersonID;
      option.textContent = person.Name || person.PersonID;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  }

  const others = people.filter((person) => !state.favorites.includes(person.PersonID));
  if (others.length) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'All';
    others.forEach((person) => {
      const option = document.createElement('option');
      option.value = person.PersonID;
      option.textContent = person.Name || person.PersonID;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  }

  label.appendChild(select);
  wrapper.appendChild(label);

  const addToggle = document.createElement('button');
  addToggle.type = 'button';
  addToggle.className = 'ghost';
  addToggle.textContent = 'Add new person';

  const addForm = document.createElement('div');
  addForm.style.display = 'none';
  addForm.className = 'form';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Name';

  const typeSelect = document.createElement('select');
  ['Social', 'Pro', 'Romance'].forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    typeSelect.appendChild(option);
  });

  const firstMetInput = document.createElement('input');
  firstMetInput.type = 'date';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'primary';
  addButton.textContent = 'Create person';

  addButton.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast('Add a name first', true);
      return;
    }
    const payload = {
      person_id: generatePersonId(),
      name,
      type: typeSelect.value,
      first_met: firstMetInput.value || null
    };
    try {
      const result = await postJson('/v1/people', payload);
      if (result.status === 'ok') {
        const newPerson = {
          PersonID: result.person_id,
          Name: name,
          Type: typeSelect.value,
          FirstMet: payload.first_met || ''
        };
        state.config.people = state.config.people || [];
        state.config.people.push(newPerson);
        select.appendChild(new Option(name, result.person_id));
        select.value = result.person_id;
        addForm.style.display = 'none';
        showToast('Person added');
        renderFavorites();
      }
    } catch (err) {
      enqueueRequest('people', payload);
      showToast('Queued person add', true);
    }
  });

  addForm.append(nameInput, typeSelect, firstMetInput, addButton);

  addToggle.addEventListener('click', () => {
    addForm.style.display = addForm.style.display === 'none' ? 'flex' : 'none';
  });

  wrapper.append(addToggle, addForm);

  modalState.personSelect = select;
  modalState.addPersonForm = addForm;

  return wrapper;
}

function renderTagsInput(presets) {
  const label = document.createElement('label');
  label.textContent = 'Tags';

  const input = document.createElement('input');
  input.placeholder = 'community:<name>, optional tags';

  if (presets.length) {
    const datalist = document.createElement('datalist');
    datalist.id = 'tagPresets';
    presets.forEach((preset) => {
      const option = document.createElement('option');
      option.value = preset;
      datalist.appendChild(option);
    });
    input.setAttribute('list', 'tagPresets');
    label.appendChild(datalist);
  }

  label.appendChild(input);
  modalState.tagsInput = input;
  return label;
}

function renderBackdateControls() {
  const wrapper = document.createElement('div');
  wrapper.className = 'card';

  const toggleRow = document.createElement('label');
  toggleRow.className = 'toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'backdateToggle';
  const text = document.createElement('span');
  text.textContent = 'Backdate event';
  toggleRow.append(checkbox, text);

  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.value = formatDateTimeLocal(new Date());
  input.style.display = 'none';

  checkbox.addEventListener('change', () => {
    input.style.display = checkbox.checked ? 'block' : 'none';
  });

  wrapper.append(toggleRow, input);
  modalState.backdateToggle = checkbox;
  modalState.backdateInput = input;
  return wrapper;
}

function openModal() {
  const modal = document.getElementById('tileModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const modal = document.getElementById('tileModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function submitModalEvent() {
  if (!modalState.tile) {
    return;
  }

  const tile = modalState.tile;
  const metric = getMetric(tile.MetricCode) || {};
  const widgetType = tile.WidgetType;
  const unit = tile.Unit || metric.DefaultUnit || '';
  const requiresTemplate = needsTemplate(tile, metric);
  const requiresPerson = needsPerson(tile, metric);

  const value = modalState.valueInput
    ? toNumber(modalState.valueInput.value, 1)
    : toNumber(modalState.fixedValue, 1);

  if (widgetType === 'tag_toggle' && modalState.tagsInput && !modalState.tagsInput.value.trim()) {
    showToast('Tags required for this tile', true);
    return;
  }

  if (requiresPerson && modalState.personSelect) {
    if (!modalState.personSelect.value) {
      showToast('Select a person', true);
      return;
    }
  }

  if (requiresTemplate && modalState.templateSelect) {
    if (!modalState.templateSelect.value) {
      showToast('Choose a template', true);
      return;
    }
  }

  const occurredAt = modalState.backdateToggle?.checked
    ? toIsoWithOffset(new Date(modalState.backdateInput.value))
    : toIsoWithOffset(new Date());

  const payload = {
    event_id: generateEventId(),
    occurred_at: occurredAt,
    metric_code: tile.MetricCode,
    value,
    unit,
    person_id: modalState.personSelect?.value || null,
    drink_template_id: modalState.templateSelect?.value || null,
    notes: modalState.notesInput?.value || '',
    tags: modalState.tagsInput?.value || '',
    starred: 0,
    source: 'pwa'
  };

  await submitEvent(payload);
  closeModal();
}

async function submitEvent(payload) {
  try {
    const result = await postJson('/v1/events', payload);
    if (result.status === 'ok' || result.status === 'duplicate_ignored') {
      showToast('Logged');
    } else {
      throw new Error('Failed');
    }
  } catch (err) {
    enqueueRequest('event', payload);
    showToast('Queued offline', true);
  }
}

async function handleWeeklySubmit(event) {
  event.preventDefault();

  const payload = {
    week_start: document.getElementById('weekStart').value,
    work_hours: inputValue('workHours'),
    expenses_personal_rub: inputValue('expensesPersonal'),
    excluded_renovation_rub: inputValue('excludedRenovation'),
    net_worth_rub: inputValue('netWorth'),
    deal_spike_flag: document.getElementById('dealSpike').checked ? 1 : 0,
    notes: document.getElementById('weeklyNotes').value,
    source: 'pwa'
  };

  try {
    const result = await postJson('/v1/weekly', payload);
    if (result.status === 'ok') {
      showToast('Weekly saved');
    }
  } catch (err) {
    enqueueRequest('weekly', payload);
    showToast('Weekly queued', true);
  }
}

async function saveSettings() {
  const backendUrl = document.getElementById('backendUrl').value.trim();
  const apiToken = document.getElementById('apiToken').value.trim();
  const dashboardUrl = document.getElementById('dashboardUrl').value.trim();

  state.settings = { backendUrl, apiToken, dashboardUrl };
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  updateDashboardLink();
  showSettingsStatus('Settings saved');
  await loadConfig({ force: true });
  renderTiles();
  renderFavorites();
  updateConfigStatus();
}

async function testConnection() {
  try {
    const url = buildUrl(state.settings.backendUrl, '/v1/config', {
      token: state.settings.apiToken
    });
    const headers = isAppsScriptUrl(state.settings.backendUrl)
      ? {}
      : { Authorization: `Bearer ${state.settings.apiToken}` };
    const response = await fetch(url, {
      headers
    });
    if (!response.ok) {
      throw new Error('Connection failed');
    }
    showSettingsStatus('Connected');
  } catch (err) {
    showSettingsStatus('Connection failed');
  }
}

function updateDashboardLink() {
  const link = document.getElementById('dashboardLink');
  if (state.settings.dashboardUrl) {
    link.href = state.settings.dashboardUrl;
    link.setAttribute('aria-disabled', 'false');
  } else {
    link.href = '#';
    link.setAttribute('aria-disabled', 'true');
  }
}

function showSettingsStatus(message) {
  document.getElementById('settingsStatus').textContent = message;
}

function updateConfigStatus() {
  const status = document.getElementById('configStatus');
  if (!state.config) {
    status.textContent = 'No config loaded.';
    return;
  }
  const tileCount = getActiveTiles().length;
  const peopleCount = (state.config.people || []).length;
  status.textContent = `Tiles: ${tileCount}. People: ${peopleCount}. Last sync: ${new Date().toLocaleString()}`;
}

async function postJson(path, payload) {
  if (!state.settings.backendUrl || !state.settings.apiToken) {
    throw new Error('Missing settings');
  }
  const url = buildUrl(state.settings.backendUrl, path, {
    token: state.settings.apiToken
  });
  const body = {
    ...payload,
    auth_token: state.settings.apiToken
  };
  const isAppsScript = isAppsScriptUrl(state.settings.backendUrl);
  const headers = isAppsScript
    ? { 'Content-Type': 'text/plain;charset=utf-8' }
    : {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.settings.apiToken}`
      };
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error('Request failed');
  }
  return response.json();
}

function enqueueRequest(type, payload) {
  const item = {
    id: payload.event_id || `${type}-${Date.now()}`,
    type,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0
  };

  if (type === 'weekly' || type === 'people') {
    state.weeklyQueue.push(item);
    saveQueue(STORAGE_KEYS.weeklyQueue, state.weeklyQueue);
  } else {
    state.queue.push(item);
    saveQueue(STORAGE_KEYS.queue, state.queue);
  }
  updateQueueStatus();
}

async function flushQueue(manual = false) {
  if (!navigator.onLine) {
    return;
  }
  if (!state.settings.backendUrl || !state.settings.apiToken) {
    return;
  }

  let queueChanged = false;
  const remaining = [];
  for (const item of state.queue) {
    try {
      const result = await postJson('/v1/events', item.payload);
      if (result.status !== 'ok' && result.status !== 'duplicate_ignored') {
        throw new Error('Failed');
      }
      queueChanged = true;
    } catch (err) {
      item.attempts += 1;
      remaining.push(item);
    }
  }
  state.queue = remaining;
  saveQueue(STORAGE_KEYS.queue, state.queue);

  const remainingWeekly = [];
  for (const item of state.weeklyQueue) {
    try {
      const endpoint = item.type === 'people' ? '/v1/people' : '/v1/weekly';
      const result = await postJson(endpoint, item.payload);
      if (result.status !== 'ok' && !(item.type === 'people' && result.status === 'duplicate_ignored')) {
        throw new Error('Failed');
      }
      queueChanged = true;
    } catch (err) {
      item.attempts += 1;
      remainingWeekly.push(item);
    }
  }
  state.weeklyQueue = remainingWeekly;
  saveQueue(STORAGE_KEYS.weeklyQueue, state.weeklyQueue);

  updateQueueStatus();
  if (queueChanged && manual) {
    showToast('Queue flushed');
  }
}

function updateQueueStatus() {
  const total = state.queue.length + state.weeklyQueue.length;
  document.getElementById('queueStatus').textContent = `Queue: ${total}`;
}

function updateConnectionStatus() {
  document.getElementById('connectionStatus').textContent = navigator.onLine ? 'Online' : 'Offline';
  updateDashboardLink();
}

function renderFavorites() {
  const container = document.getElementById('favoritesList');
  container.innerHTML = '';
  const people = state.config?.people || [];
  if (!people.length) {
    container.textContent = 'Load config to manage favorites.';
    return;
  }

  people.forEach((person) => {
    if (!person.PersonID) {
      return;
    }
    const item = document.createElement('label');
    item.className = 'favorite-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.favorites.includes(person.PersonID);
    checkbox.addEventListener('change', () => {
      toggleFavorite(person.PersonID, checkbox.checked);
    });
    const name = document.createElement('span');
    name.textContent = `${person.Name || person.PersonID} (${person.Type || 'Unknown'})`;
    item.append(checkbox, name);
    container.appendChild(item);
  });
}

function toggleFavorite(personId, isFavorite) {
  if (isFavorite) {
    if (!state.favorites.includes(personId)) {
      state.favorites.push(personId);
    }
  } else {
    state.favorites = state.favorites.filter((id) => id !== personId);
  }
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites));
}

function getActiveTiles() {
  const tiles = state.config?.tile_catalog || [];
  return tiles
    .filter((tile) => isTruthy(tile['Active?']))
    .sort((a, b) => toNumber(a.Order, 0) - toNumber(b.Order, 0));
}

function getMetric(metricCode) {
  const metrics = state.config?.metric_catalog || [];
  return metrics.find((metric) => metric.MetricCode === metricCode);
}

function getPeopleForMetric(metricCode) {
  const people = (state.config?.people || []).filter((row) => row.PersonID);
  const type = PERSON_TYPE_BY_METRIC[metricCode];
  if (!type) {
    return people;
  }
  return people.filter((person) => person.Type === type);
}

function getFavoritePeople(people) {
  return people.filter((person) => state.favorites.includes(person.PersonID));
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings));
    return settings || { backendUrl: '', apiToken: '', dashboardUrl: '' };
  } catch (err) {
    return { backendUrl: '', apiToken: '', dashboardUrl: '' };
  }
}

function hydrateSettingsForm() {
  document.getElementById('backendUrl').value = state.settings.backendUrl || '';
  document.getElementById('apiToken').value = state.settings.apiToken || '';
  document.getElementById('dashboardUrl').value = state.settings.dashboardUrl || '';
}

function loadQueue(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (err) {
    return [];
  }
}

function saveQueue(key, queue) {
  localStorage.setItem(key, JSON.stringify(queue));
}

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites)) || [];
  } catch (err) {
    return [];
  }
}

function parsePresets(presets) {
  if (!presets) {
    return [];
  }
  return String(presets)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isTruthy(value) {
  if (value === true || value === 1) {
    return true;
  }
  const str = String(value).toLowerCase();
  return str === 'true' || str === 'yes' || str === '1';
}

function needsPerson(tile, metric) {
  return isTruthy(tile?.['NeedsPerson?']) || isTruthy(metric?.['NeedsPerson?']) || tile?.WidgetType === 'person_toggle';
}

function needsTemplate(tile, metric) {
  return isTruthy(tile?.['NeedsTemplate?']) || isTruthy(metric?.['NeedsTemplate?']) || tile?.WidgetType === 'template_stepper';
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toIsoWithOffset(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    date = new Date();
  }
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offsetMinutes = String(absOffset % 60).padStart(2, '0');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}

function generateEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `evt-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function generatePersonId() {
  const base = generateEventId().replace(/[^a-f0-9]/gi, '').slice(0, 6).toUpperCase();
  return `P${base}`;
}

function inputValue(id) {
  const value = document.getElementById(id).value;
  return value === '' ? '' : Number(value);
}

function buildUrl(base, path, params) {
  if (!base) {
    return path;
  }
  let url;
  try {
    const normalizedPath = normalizePath(path);
    if (isAppsScriptUrl(base)) {
      url = new URL(base);
      url.searchParams.set('path', normalizedPath);
    } else {
      url = new URL(base.replace(/\/$/, '') + normalizedPath);
    }
  } catch (err) {
    if (isAppsScriptUrl(base)) {
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}path=${encodeURIComponent(normalizePath(path))}`;
    }
    return base.replace(/\/$/, '') + normalizePath(path);
  }
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }
  return url.toString();
}

function normalizePath(path) {
  if (!path) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function isAppsScriptUrl(base) {
  return String(base).includes('script.google.com/macros/s/');
}

function showToast(message, subtle = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.background = subtle ? '#2b7a78' : '#1f3f32';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => null);
  }
}

updateDashboardLink();

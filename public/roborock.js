import { locale, t } from './i18n.js';

const states = {
  idle: 'Připraven', charger_disconnected: 'Mimo dok', charging: 'Nabíjí se', charging_complete: 'Nabito',
  cleaning: 'Uklízí', paused: 'Pozastaveno', returning_home: 'Vrací se do doku',
  emptying_the_bin: 'Vyprazdňuje zásobník', washing_the_mop: 'Pere mopy', washing_the_mop_2: 'Pere mopy',
  error: 'Chyba vysavače', charging_problem: 'Chyba nabíjení', device_offline: 'Nedostupné',
  updating: 'Aktualizuje se', mapping: 'Mapuje byt',
};
const supplies = {
  mainBrush: 'Hlavní kartáč', sideBrush: 'Boční kartáč', filter: 'Filtr', sensors: 'Čidla',
};
const cleaningModes = {
  vacuum: ['Jen vysát', 'vacuum'],
  mop: ['Jen vytřít', 'drop'],
  vac_and_mop: ['Vysát a vytřít zároveň', 'cycle'],
  vac_then_mop: ['Vysát, potom vytřít', 'next'],
  smart_mode: ['SmartPlan', 'bolt'],
  custom: ['Podle nastavení místností', 'devices'],
};
const mainModes = ['vacuum', 'mop', 'vac_and_mop'];
const cleaningLabels = {
  fan: { quiet: 'Tiché', balanced: 'Vyvážené', turbo: 'Turbo', max: 'Max', max_plus: 'Max+' },
  route: { standard: 'Standardní', deep: 'Důkladná', deep_plus: 'Velmi důkladná', fast: 'Rychlá' },
  water: { low: 'Nízká', medium: 'Střední', high: 'Vysoká', custom_water_flow: 'Vlastní dávka' },
};
const roomOrder = new Map(
  ['Obývák', 'Pracovna', 'Kuchyně', 'Ložnice', 'Studovna', 'Chodba', 'Koupelna'].map((name, index) => [name, index]),
);
const dateTime = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Prague', dateStyle: 'medium', timeStyle: 'short' });
const area = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat(locale);
const duration = (seconds) => {
  if (!Number.isFinite(seconds)) return '–';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? minutes + ' ' + t('min') : Math.floor(minutes / 60) + ' h ' + minutes % 60 + ' ' + t('min');
};

function readings(entries) {
  const list = document.createElement('dl');
  list.className = 'vacuum-readings';
  for (const [name, value] of entries) {
    const box = document.createElement('div');
    const label = document.createElement('dt');
    const reading = document.createElement('dd');
    label.textContent = t(name);
    reading.textContent = value;
    box.append(label, reading);
    list.append(box);
  }
  return list;
}

export function setupVacuum(roomIcon, icon) {
  const byId = (id) => document.getElementById('vacuum-' + id);
  const open = byId('open');
  const dialog = byId('dialog');
  const form = byId('form');
  const rooms = byId('rooms');
  const scope = byId('scope-choices');
  const roomScope = scope.querySelector('[value="rooms"]');
  const allScope = scope.querySelector('[value="all"]');
  const submit = form.querySelector('[type="submit"]');
  const modeChoices = byId('mode-choices');
  const modeStatus = byId('modes-status');
  const more = byId('more');
  const moreModes = byId('more-modes');
  const moreSelected = byId('more-selected');
  const parameters = [...form.querySelectorAll('[data-vacuum-parameter]')].map((button) => ({
    button,
    key: button.dataset.vacuumParameter,
    field: document.getElementById(button.getAttribute('aria-controls')),
    value: button.querySelector('strong'),
  }));
  const waterLevel = byId('water-level');
  let profile;
  let openParameter;
  const transport = byId('transport');
  const controls = [...transport.querySelectorAll('[data-vacuum-action]')];
  let enabled = false;
  let status;
  let details;
  let statusPending;
  let detailsPending;
  let lastStatus = 0;
  let lastDetails = 0;
  let changing = false;
  let listedMap;
  let listedRooms;

  function message(copy, error = false) {
    const node = byId('message');
    node.textContent = copy ? t(copy) : '';
    node.dataset.error = String(error);
    node.hidden = !copy;
  }

  function renderStatus() {
    const data = status?.data;
    const live = status?.state === 'live';
    const text = t(!status ? 'Načítám…' : status.state === 'reauth' ? 'Přihlásit Roborock'
      : !live ? 'Nedostupné' : states[data?.state] ?? 'Neznámý stav');
    const battery = Number.isFinite(data?.battery) ? data.battery + ' %' : '–';
    byId('shortcut-status').textContent = live && battery !== '–' ? text + ' · ' + battery : text;
    byId('state').textContent = text;
    byId('battery').textContent = battery;
    byId('battery').setAttribute('aria-label', t('Baterie') + ' ' + battery);
    const notes = [];
    if (live && data?.drying) notes.push(t('Suší mopy'));
    if (live && data?.error) notes.push(t('Chyba vysavače') + ' ' + data.error);
    if (live && data?.dockError) notes.push(t('Chyba doku') + ' ' + data.dockError);
    byId('extra').textContent = notes.join(' · ');
    const active = live && ['cleaning', 'paused', 'returning_home'].includes(data?.state);
    const progress = byId('progress-bar');
    const knownProgress = Number.isFinite(data?.progress) && data.progress > 0;
    if (knownProgress) progress.value = data.progress;
    else progress.removeAttribute('value');
    byId('progress').hidden = !active;
    byId('progress-label').textContent = active ? [
      knownProgress && data.progress + ' %',
      Number.isFinite(data.area) && area.format(data.area) + ' m²',
      Number.isFinite(data.duration) && duration(data.duration),
    ].filter(Boolean).join(' · ') : '';
  }

  function renderForm() {
    const mode = form.elements.mode?.value;
    const ready = !changing && details?.state === 'live' && details.data?.modes?.includes(mode);
    modeChoices.disabled = !ready;
    modeStatus.hidden = Boolean(mode);
    modeStatus.textContent = t(details ? 'Nedostupné' : 'Načítám…');
    more.hidden = !moreModes.childElementCount;
    moreModes.hidden = more.hidden || more.getAttribute('aria-expanded') !== 'true';
    moreSelected.hidden = !mode || mainModes.includes(mode) || !moreModes.hidden;
    moreSelected.textContent = moreSelected.hidden ? '' : t(cleaningModes[mode][0]);
    renderParameters(mode, ready);
    const data = status?.data;
    const live = status?.state === 'live';
    const sameMap = Number.isSafeInteger(data?.mapId) && data.mapId === details?.data?.mapId;
    const roomOptions = live && sameMap && Boolean(details?.data?.rooms?.length);
    roomScope.disabled = changing || !roomOptions;
    allScope.disabled = changing;
    if (!roomOptions) allScope.checked = true;
    rooms.hidden = !roomScope.checked;
    for (const room of rooms.querySelectorAll('input')) room.disabled = changing || !roomOptions;
    submit.disabled = !ready || !live || !data?.actions?.start ||
      (roomScope.checked && !rooms.querySelector('input:checked'));
    for (const button of controls) {
      button.hidden = !(live && data?.actions?.[button.dataset.vacuumAction]);
      button.disabled = changing;
    }
    transport.hidden = controls.every((button) => button.hidden);
  }

  function renderTiles(container, name, options, selected) {
    container.replaceChildren(...options.map(([value, copy, symbol]) => {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = value;
      radio.checked = radio.value === String(selected);
      if (symbol) label.innerHTML = icon(symbol);
      label.append(radio, t(copy));
      return label;
    }));
  }

  function renderParameters(mode, ready) {
    const manual = Boolean(mode) && mode !== 'smart_mode' && mode !== 'custom';
    const customCode = details?.data?.cleaningOptions?.water?.custom_water_flow;
    const customWater = Boolean(customCode) && Number(form.elements.water?.value) === customCode;
    for (const { button, field, key, value } of parameters) {
      const options = field.querySelector('.vacuum-setting-options');
      button.hidden = !manual || options.childElementCount < 2 || (key === 'fan' ? mode === 'mop' : mode === 'vacuum');
      button.disabled = field.disabled = !ready || button.hidden;
      field.hidden = button.hidden || openParameter !== key;
      button.setAttribute('aria-expanded', String(!field.hidden));
      const selected = options.querySelector(':checked');
      const level = key === 'water' && customWater ? ' ' + integer.format(waterLevel.valueAsNumber) + '/30' : '';
      value.textContent = (selected?.labels[0].textContent ?? '') + level;
    }
    byId('parameters').hidden = parameters.every(({ button }) => button.hidden);
    waterLevel.disabled = byId('water-options').disabled || !customWater;
    byId('water-level-control').hidden = !customWater;
  }

  function syncSettings() {
    const supported = details?.data?.modes;
    if (!Array.isArray(supported)) return;
    const cleaningOptions = details.data.cleaningOptions;
    const nextProfile = JSON.stringify([supported, cleaningOptions]);
    if (profile === nextProfile) return;
    profile = nextProfile;
    const modes = Object.entries(cleaningModes).flatMap(([mode, [label, symbol]]) =>
      supported.includes(mode) ? [[mode, label, symbol]] : []);
    const currentMode = form.elements.mode?.value;
    const selectedMode = supported.includes(currentMode) ? currentMode : modes[0]?.[0];
    renderTiles(byId('modes'), 'mode', modes.filter(([mode]) => mainModes.includes(mode)), selectedMode);
    renderTiles(moreModes, 'mode', modes.filter(([mode]) => !mainModes.includes(mode)), selectedMode);
    for (const { field, key } of parameters) {
      const options = [['', 'Výchozí'], ...Object.entries(cleaningLabels[key]).flatMap(([name, label]) => {
        const code = cleaningOptions?.[key]?.[name];
        return Number.isSafeInteger(code) ? [[code, label]] : [];
      })];
      const selected = field.querySelector('input:checked')?.value;
      renderTiles(field.querySelector('.vacuum-setting-options'), key, options,
        options.some(([value]) => String(value) === selected) ? selected : '');
    }
  }

  function renderDetails() {
    syncSettings();
    const data = details?.data;
    const image = byId('map-img');
    const source = data?.image ? 'data:image/png;base64,' + data.image : '';
    if (source && image.getAttribute('src') !== source) image.src = source;
    image.hidden = !source;
    byId('map-message').hidden = Boolean(source);
    byId('map-message').textContent = t(details ? 'Mapa je nedostupná.' : 'Načítám mapu…');
    byId('map-count').textContent = data?.maps > 1 ? t('Mapy') + ' · ' + data.maps : '';

    const items = data?.rooms ?? [];
    const signature = JSON.stringify(items);
    if (listedMap !== data?.mapId || listedRooms !== signature) {
      const selection = listedMap === data?.mapId
        ? new Set([...rooms.querySelectorAll('input:checked')].map((input) => input.value)) : new Set();
      listedMap = data?.mapId;
      listedRooms = signature;
      const sortedRooms = items
        .map(({ id, name }) => ({ id, name: name === 'Ložnice pro hosty' ? 'Studovna' : name }))
        .sort((a, b) => (roomOrder.get(a.name) ?? roomOrder.size) - (roomOrder.get(b.name) ?? roomOrder.size));
      rooms.replaceChildren(...sortedRooms.map(({ id, name }) => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        const symbol = document.createElement('span');
        const caption = document.createElement('span');
        checkbox.type = 'checkbox';
        checkbox.name = 'vacuum-room';
        checkbox.value = id;
        checkbox.setAttribute('form', form.id);
        checkbox.checked = selection.has(checkbox.value);
        symbol.className = 'vacuum-room-icon';
        symbol.innerHTML = roomIcon(name);
        caption.textContent = name ? t(name) : t('Místnost') + ' ' + id;
        label.append(checkbox, symbol, caption);
        return label;
      }));
    }

    const history = byId('history');
    const last = data?.history?.latest;
    if (last) {
      history.replaceChildren(readings([
        ...(last.startedAt ? [['Datum', dateTime.format(last.startedAt)]] : []),
        ['Plocha', Number.isFinite(last.area) ? area.format(last.area) + ' m²' : '–'],
        ['Doba úklidu', duration(last.duration)],
        ...(last.complete == null ? [] : [['Výsledek', t(last.complete ? 'Dokončeno' : 'Nedokončeno')]]),
      ]));
    } else history.textContent = t(!details ? 'Načítám…' : data?.history?.total === 0 ? 'Zatím bez úklidu' : 'Nedostupné');
    const maintenance = byId('maintenance');
    const parts = Object.entries(supplies).flatMap(([key, label]) =>
      Number.isFinite(data?.maintenance?.[key]) ? [[label, integer.format(data.maintenance[key]) + ' h']] : []);
    maintenance.replaceChildren(parts.length ? readings(parts) : t(details ? 'Nedostupné' : 'Načítám…'));
  }

  async function request(path = '', options) {
    const response = await fetch('/api/roborock' + path, {
      cache: 'no-store', signal: AbortSignal.timeout(85_000), ...options,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }

  function loadStatus() {
    if (!enabled) return;
    statusPending ??= request().then((data) => { status = data; }, () => {
      status = { ...status, state: 'error' };
    }).finally(() => {
      lastStatus = Date.now();
      statusPending = undefined;
      renderStatus();
      renderForm();
    });
    return statusPending;
  }

  function loadDetails() {
    if (!enabled) return;
    detailsPending ??= request('/details').then((data) => { details = data; }, () => {
      details = { ...details, state: 'error' };
    }).finally(() => {
      lastDetails = Date.now();
      detailsPending = undefined;
      renderDetails();
      renderForm();
    });
    return detailsPending;
  }

  async function send(body) {
    if (changing || !enabled) return;
    changing = true;
    message('Odesílám požadavek…');
    renderForm();
    try {
      await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      message('Vysavač přijal požadavek.');
    } catch (error) {
      message(error.message || 'Vysavač nepotvrdil požadavek.', true);
    } finally {
      await statusPending;
      await loadStatus();
      changing = false;
      renderForm();
    }
  }

  async function refresh() {
    const button = byId('refresh');
    button.disabled = true;
    try {
      await Promise.all([loadStatus(), loadDetails()]);
    } finally {
      button.disabled = false;
    }
  }

  open.addEventListener('click', () => {
    dialog.showModal();
    if (!changing) message('');
    refresh();
  });
  byId('refresh').addEventListener('click', refresh);
  byId('close').addEventListener('click', () => dialog.close());
  more.addEventListener('click', () => {
    more.setAttribute('aria-expanded', String(moreModes.hidden));
    renderForm();
  });
  for (const { button, key } of parameters) {
    button.addEventListener('click', () => {
      openParameter = button.getAttribute('aria-expanded') === 'true' ? undefined : key;
      renderForm();
    });
  }
  waterLevel.addEventListener('input', () => {
    byId('water-value').value = integer.format(waterLevel.valueAsNumber);
    renderForm();
  });
  form.addEventListener('change', renderForm);
  scope.addEventListener('change', renderForm);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const data = new FormData(form);
    const segments = roomScope.checked ? data.getAll('vacuum-room').map(Number) : [];
    const settings = {};
    for (const key of ['fan', 'route', 'water', 'waterLevel']) {
      if (data.get(key)) settings[key] = Number(data.get(key));
    }
    send({ action: 'start', mode: data.get('mode'), segments, mapId: listedMap, settings });
  });
  transport.addEventListener('click', (event) => {
    const button = event.target.closest('[data-vacuum-action]');
    if (button && !button.disabled && !button.hidden) send({ action: button.dataset.vacuumAction });
  });
  setInterval(() => {
    if (!enabled || document.hidden || changing) return;
    const now = Date.now();
    if (now - lastStatus >= (dialog.open ? 10_000 : 28_000)) loadStatus();
    if (dialog.open && now - lastDetails >= 55_000) loadDetails();
  }, 5_000);

  return (configured) => {
    if (enabled === configured) return;
    enabled = configured;
    open.hidden = !enabled;
    if (enabled) loadStatus();
  };
}

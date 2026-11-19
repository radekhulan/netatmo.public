import { setupSpotify } from './spotify.js';
import { setupVacuum } from './roborock.js';
import { language, locale, t, translatePage } from './i18n.js';
import { labelPoints, setupHistory } from './history.js';

translatePage();
const byId = (id) => document.getElementById(id);
const svgPaths = {
  home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-6h6v6"/>',
  sofa: '<path d="M4 12V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M3 16v3m18-3v3M5 16h14a2 2 0 0 0 2-2v-2h-4v2H7v-2H3v2a2 2 0 0 0 2 2Z"/>',
  desk: '<path d="M3 7h18v4H3zM5 11v7m14-7v7m-7-7v3"/>',
  book: '<path d="M12 6c-3-3-7-3-9-2v14c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 2zm0 0v14"/>',
  bed: '<path d="M3 19V6m18 13v-6a3 3 0 0 0-3-3h-7v7M3 17h18M3 13h8m-6 0V9h4v4"/>',
  door: '<path d="M4 21h16M6 21V4h12v17m-5-9h.01"/>',
  bath: '<path d="M3 12h18M4 12v3a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-3M7 19l-1 2m11-2 1 2M6 12V6a3 3 0 0 1 6 0M10 6h4"/>',
  washer: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M7 5.5h.01m3 0h.01"/><circle cx="12" cy="14.5" r="4"/>',
  coffee: '<path d="M4 9h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Zm13 1h2a2 2 0 0 1 0 4h-2M3 21h16M8 3v3m4-3v3"/>',
  storage: '<path d="M4 9h16v11H4zM3 4h18v5H3zM10 13h4"/>',
  devices: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  ceiling: '<path d="M3 3h18m-9 0v6m-5 0h10l3 6H4Zm0 9-1 2m6-2v3m5-3 1 2"/>',
  kitchen: '<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M15 12V6a3 3 0 0 1 3-3h1v18m0-9h-4"/>',
  led: '<path d="m4 15 11-11 5 5L9 20H4zm8-3 2-2m-5 5 1-1m7 3h4m-2-2v4"/>',
  drop: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z"/>',
  air: '<path d="M3 8h12a2 2 0 1 0-2-2m-9 6h15a2 2 0 1 1-2 2m-13 2h8a2 2 0 1 1-2 2"/>',
  sound: '<path d="M4 9h4l4-4v14l-4-4H4zm11 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  heat: '<path d="M4 9h16v9H4zM8 9v9m4-9v9m4-9v9m-9 0v2m10-2v2M8 6V4m4 2V3m4 3V4"/>',
  gauge: '<path d="M4 18a9 9 0 1 1 16 0H4Zm8-4 4-4m-4 4h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2m10-10 2-2"/>',
  sunrise: '<path d="M3 18h18M7 16a5 5 0 0 1 10 0M12 9V3m-3 3 3-3 3 3M5 9l2 2m12-2-2 2"/>',
  sunset: '<path d="M3 18h18M7 16a5 5 0 0 1 10 0M12 3v6m-3-3 3 3 3-3M5 9l2 2m12-2-2 2"/>',
  moon: '<path d="M20.9 13.3A8.7 8.7 0 0 1 10.7 3.1a9 9 0 1 0 10.2 10.2Z"/>',
  'partly-night': '<path d="M15 8a5 5 0 0 1-5-5 5 5 0 0 0-5 7m2 9h11a3.5 3.5 0 0 0 0-7h-1a4.5 4.5 0 0 0-8.6 1H7a3 3 0 0 0 0 6Z"/>',
  partly:
    '<path d="M11 13A4 4 0 1 1 15 8M9 3v2M3 8l2 1m11-5-1 2m-5 14h9a3 3 0 0 0 0-6h-1a4 4 0 0 0-8 1h-1a2.5 2.5 0 0 0 1 5Z"/>',
  cloud: '<path d="M7 19h11a4 4 0 0 0 0-8h-1a5 5 0 0 0-9.7 1H7a3.5 3.5 0 0 0 0 7Z"/>',
  'cloud-off': '<path d="m2 2 20 20M10.94 5.16A7 7 0 0 1 16 9h1.5a4.5 4.5 0 0 1 4.09 6.38M4.6 7.6A6.98 6.98 0 0 0 8 20h9.5a4.48 4.48 0 0 0 2.55-.79"/>',
  rain: '<path d="M7 15h11a3 3 0 0 0 0-6h-1a5 5 0 0 0-9.7 1H7a2.5 2.5 0 0 0 0 5Zm2 3-1 2m5-2-1 2m5-2-1 2"/>',
  fog: '<path d="M7 13h11a3 3 0 0 0 0-6h-1a5 5 0 0 0-9.7 1H7a2.5 2.5 0 0 0 0 5Zm-3 4h15m-12 4h13"/>',
  snow: '<path d="M12 3v18M4 7l16 10M4 17 20 7m-8 0L9 4m3 3 3-3m-3 13-3 3m3-3 3 3"/>',
  storm: '<path d="M7 15a3 3 0 0 1 0-6h1a5 5 0 0 1 9.7 1h1a2.5 2.5 0 0 1 0 5H16m-3-2-3 5h3l-2 4"/>',
  bulb: '<path d="M9 18h6m-5 3h4M9 15a5 5 0 1 1 6 0v2H9zM12 2v1M3 10h2m14 0h2"/>',
  'bulb-off': '<path d="m3 3 18 18M8 13a5 5 0 0 0 1 2v2h6v-1M8 7a5 5 0 0 1 8 6M9 20h6m-5 2h4"/>',
  lamp: '<path d="M9 4h6l4 10H5zm3 10v6m-4 0h8"/>',
  vacuum: '<circle cx="12" cy="12" r="9"/><path d="M5 15h14M8 18h8"/><circle cx="12" cy="9" r="2"/>',
  cycle: '<path d="M20 8a8 8 0 0 0-13-3L4 8m0-4v4h4m-4 8a8 8 0 0 0 13 3l3-3m0 4v-4h-4"/>',
  power: '<path d="M12 3v8m-5-5a8 8 0 1 0 10 0"/>',
  bolt: '<path d="m13 2-8 12h6l-1 8 9-12h-6z"/>',
  spotify: '<circle cx="12" cy="12" r="9"/><path d="M7 10a11 11 0 0 1 10 1m-9 2a8 8 0 0 1 8 1m-7 2a6 6 0 0 1 6 1"/>',
  refresh: '<path d="M19 9a7.5 7.5 0 1 0 1 7m-1-12v5h-5"/>',
  display: '<path d="M3 4h18v12H3zm9 12v4m-4 0h8"/>',
  battery: '<rect x="2" y="6" width="17" height="12" rx="2"/><path d="M22 10v4M6 10v4m4-4v4m4-4v4"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5"/>',
  plus: '<path d="M5 12h14m-7-7v14"/>',
  minus: '<path d="M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  previous: '<path d="M5 5v14m14-14L8 12l11 7z"/>',
  next: '<path d="M19 5v14M5 5l11 7-11 7z"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  music: '<path d="M9 17V6l11-2v11M9 9l11-2"/><ellipse cx="6" cy="17" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>',
};
const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svgPaths[name] || svgPaths.home}</svg>`;
document.querySelectorAll('[data-icon]').forEach((element) => {
  element.innerHTML = icon(element.dataset.icon);
});

const shortTime = new Intl.DateTimeFormat(locale, {
  timeZone: 'Europe/Prague',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const longDate = new Intl.DateTimeFormat(locale, {
  timeZone: 'Europe/Prague',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const contactDate = new Intl.DateTimeFormat(locale, {
  timeZone: 'Europe/Prague',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const staleAfter = 30 * 60_000;

function widgetStatus(source, at = source?.at, forceWarning = false) {
  if (!source) return '';
  if (source.state === 'demo') return `<span class="source">${t('Ukázka')}</span>`;
  const old = Number.isFinite(at) && Date.now() - at > staleAfter;
  if (source.state === 'live' && !old && !forceWarning && !connectionFailed) return '';
  const title = old
    ? t('Naposledy') + ' ' + contactDate.format(at)
    : Number.isFinite(at)
      ? t('Spojení nedostupné')
      : t('Bez spojení');
  const detail = old ? contactDate.format(at) : Number.isFinite(at) ? '' : t('Bez záznamu');
  return `<span class="widget-alert" title="${title}" aria-label="${title}"><b>!</b>${detail ? ` <span>${detail}</span>` : ''}</span>`;
}

const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Europe/Prague' });
const fullDayName = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'Europe/Prague' });
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', dateStyle: 'short' });
const num = (value, precision = 0) =>
  Number.isFinite(value)
    ? value.toLocaleString(locale, { minimumFractionDigits: precision, maximumFractionDigits: precision })
    : '–';
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const label = (value, unit, precision = 0) => (Number.isFinite(value) ? num(value, precision) + ' ' + unit : '–');
const watts = (value) => value >= 1000 ? label(value / 1000, 'kW', 2) : label(value, 'W', 1);
const has = (source) => source?.state === 'live' || source?.state === 'stale' || source?.state === 'demo';
const statusText = { live: t('Živě'), stale: t('Starší data'), demo: t('Ukázka'), off: t('Nepřipojeno'), error: t('Nedostupné') };
const empty = (text) => `<div class="placeholder">${text}</div>`;
let panel;
let airplus;
let airplusLoad;
let airplusRoom;
let airplusChanging = false;
let airplusError = '';
let forecastInterval;
let nightForecastActive;
let inFlight;
let commandPending = false;
let toastTimer;
let heatingRoomKey;
let installEvent;
let wake;
let keepAwake = false;
let connectionFailed = false;
let demoLamp = false;
let demoHeatingMode = 'schedule';
const nightDialog = byId('night-dialog');
const airplusDialog = byId('airplus-dialog');
const coffeeDialog = byId('coffee-dialog');
const coffeeShortcut = byId('coffee-open');
let coffeeData;
let coffeeLoad;
let coffeeWaking = false;
let coffeeCommand = '';
const coffeeStates = {
  ready: 'Připraven',
  wake_pending: 'Probouzí se…',
  standby: 'Pohotovostní režim',
  waking_up: 'Zahřívá se',
  going_to_sleep: 'Vypíná se',
  descaling: 'Odvápňuje se',
  rinsing: 'Proplachuje se',
  preparing_beverage: 'Připravuje nápoj',
  preparing_milk: 'Připravuje mléko',
  preparing_milk_alt: 'Připravuje mléko',
  preparing_steam: 'Připravuje páru',
  dispensing_hot_water: 'Vydává horkou vodu',
  cleaning_milk: 'Čistí mléčný okruh',
  offline: 'Bez spojení',
  unavailable: 'Nedostupné',
  reauth: 'Obnov přihlášení Coffee Link',
};
const coffeeAlerts = {
  water_empty: 'Doplň vodu',
  beans_empty: 'Doplň kávová zrna',
  grounds_full: 'Vyprázdni zásobník sedliny',
  descale: 'Odvápni kávovar',
  filter_replace: 'Vyměň vodní filtr',
};
const nightActions = byId('night-actions');
const nightForecast = byId('night-forecast');
const dayClock = byId('clock');
const nightClock = byId('night-clock');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const widgetAnimations = new WeakMap();
const widgetValues = new WeakMap();
let nightPeriod;
let dashboardDate;
let clockTime;

function renderClock(display, time, previous) {
  display.setAttribute('aria-label', time);
  display.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  const digits = [...time];
  display.innerHTML = digits.map((digit) =>
    `<span${/\d/.test(digit) ? ' class="clock-digit"' : ''} aria-hidden="true">${digit}</span>`).join('');
  if (document.hidden || reducedMotion.matches || previous === time) return;

  const entering = previous == null;
  digits.forEach((digit, index) => {
    const slot = display.children[index];
    if (!slot.classList.contains('clock-digit') || digit === previous?.[index]) return;
    const values = entering
      ? Array.from({ length: 6 }, (_, step) => (Number(digit) + step + 4) % 10)
      : [previous[index]];
    values.push(digit);
    slot.innerHTML = `<span class="clock-digit-value">${digit}</span><span class="clock-reel">${values.map((value) => `<span>${value}</span>`).join('')}</span>`;
    const distance = 100 * (values.length - 1) / values.length;
    slot.lastElementChild.animate([
      { transform: 'translateY(0)', opacity: entering ? 0.45 : 1 },
      { transform: `translateY(-${distance}%)`, opacity: 1 },
    ], {
      duration: entering ? 1250 : 560,
      delay: index * (entering ? 32 : 15),
      easing: entering ? 'cubic-bezier(.14, .72, .2, 1)' : 'cubic-bezier(.25, .7, .24, 1)',
      fill: 'both',
    }).onfinish = () => {
      slot.textContent = digit;
    };
  });
}

function fadeWidget(node, delay) {
  if (document.hidden || reducedMotion.matches || nightDialog.open !== nightDialog.contains(node)) return;
  const entering = delay != null;
  const current = widgetAnimations.get(node);
  if (!entering && current?.playState === 'running' && current.effect.getTiming().delay > 0) return;
  current?.cancel();
  widgetAnimations.set(node, node.animate([{ opacity: entering ? 0 : 0.78 }, { opacity: 1 }], {
    duration: entering ? 550 : 330,
    delay: delay ?? 0,
    easing: 'ease-out',
    fill: 'backwards',
  }));
}

function fadeChanged(node, value, target = node) {
  const previous = widgetValues.get(node);
  widgetValues.set(node, value);
  if (previous !== undefined && previous !== value) fadeWidget(target);
}

function renderWidget(node, markup, value = markup) {
  node.innerHTML = markup;
  fadeChanged(node, value);
}

function animateView() {
  if (!clockTime) return;
  const night = nightDialog.open;
  renderClock(night ? nightClock : dayClock, clockTime);
  const widgets = night
    ? '#night-date, #night-forecast, #night-rooms, #night-actions'
    : '#date, #rooms, .utilities, #outdoor, .forecast, .radar, .daily, #precipitation, #actions, .home-heating, #solar, #power-meters, .media-shortcuts';
  document.querySelectorAll(widgets).forEach((node, index) => fadeWidget(node, 45 + Math.min(index, 8) * 22));
}

function syncNightMode(date, hour, night) {
  const startDay = localDate.format(hour < 7 ? date.getTime() - 8 * 3600_000 : date);
  const period = startDay + (night ? ' night' : ' day');
  if (period === nightPeriod) return;
  if (night && !nightDialog.open && document.querySelector('dialog[open]')) return;
  nightPeriod = period;
  if (night && !nightDialog.open) openNight();
  if (!night && nightDialog.open) nightDialog.close();
}

function clock(replay = false) {
  const date = new Date();
  const text = longDate.format(date);
  const dateText = text.charAt(0).toUpperCase() + text.slice(1);
  const time = shortTime.format(date);
  const timestamp = date.toISOString();
  const previous = clockTime;
  const wasNight = nightDialog.open;
  const newHour = time.slice(0, 2) !== previous?.slice(0, 2);
  const day = localDate.format(date);
  const newDay = dashboardDate != null && dashboardDate !== day;
  dashboardDate = day;
  clockTime = time;
  dayClock.dateTime = nightClock.dateTime = timestamp;
  if (time !== previous) {
    renderClock(dayClock, time, wasNight || replay ? time : previous);
    renderClock(nightClock, time, !wasNight || replay ? time : previous);
  }
  for (const id of ['date', 'night-date']) {
    const display = byId(id);
    if (display.textContent !== dateText) display.textContent = dateText;
    display.dateTime = timestamp;
  }
  const hour = Number(time.slice(0, 2));
  const night = hour >= 22 || hour < 7;
  if (night !== nightForecastActive) {
    nightForecastActive = night;
    forecastInterval = night ? 4 : 1;
  }
  if (newHour || newDay) {
    renderForecast();
    renderPrecipitation();
    if (nightDialog.open) renderHourlyForecast(nightForecast, panel?.sources.weather, 4);
    if (dayDialog.open) renderWeatherDetail();
  }
  if (newDay) {
    renderDailyForecast();
    renderOutdoor();
    renderSolar();
    if (!document.hidden) {
      if (inFlight) inFlight.then(refresh);
      else refresh();
    }
  }
  syncNightMode(date, hour, night);
  if (replay && wasNight === nightDialog.open) animateView();
  if (heatDialog.open) renderHeatingRemaining(findHeatingRoom(heatingRoomKey)?.heat, date.getTime());
}

function weatherType(code, isDay = 1) {
  if (!Number.isFinite(code)) return ['cloud', t('Počasí nedostupné')];
  if (code === 0) return isDay ? ['sun', t('Jasno')] : ['moon', t('Jasná noc')];
  if (code === 1 || code === 2) return [isDay ? 'partly' : 'partly-night', t('Polojasno')];
  if (code === 3) return ['cloud', t('Zataženo')];
  if (code < 50) return ['fog', t('Mlha')];
  if (code >= 95) return ['storm', t('Bouřky')];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', t('Sněžení')];
  if (code >= 80) return ['rain', t('Přeháňky')];
  return ['rain', code < 60 ? t('Mrholení') : t('Déšť')];
}

function meterMarkup(meter) {
  const name = meter.room ? t(meter.name) + ' · ' + t(meter.room) : t(meter.name);
  const value = watts(meter.power);
  return `<button type="button" class="power-meter" data-meter="${meter.id}" data-icon="${esc(meter.icon ?? 'bolt')}" aria-haspopup="dialog" title="${esc(name)}" aria-label="${esc(name + ' ' + value)}">
    ${icon(meter.icon ?? 'bolt')}
    <strong>${value}</strong>
    ${widgetStatus(meter, meter.at, meter.power == null)}
  </button>`;
}

const co2Colors = [
  [800, [83, 181, 128]],
  [1000, [170, 122, 79]],
  [1400, [247, 147, 58]],
  [2000, [246, 76, 87]],
];

function co2Color(ppm) {
  if (!Number.isFinite(ppm)) return '';
  const upper = co2Colors.findIndex(([limit]) => ppm <= limit);
  if (upper < 1) return co2Colors[upper === 0 ? 0 : co2Colors.length - 1][1].join(' ');
  const [min, from] = co2Colors[upper - 1];
  const [max, to] = co2Colors[upper];
  const fraction = (ppm - min) / (max - min);
  return from.map((channel, index) => Math.round(channel + fraction * (to[index] - channel))).join(' ');
}

function renderNight() {
  renderHourlyForecast(nightForecast, panel?.sources.weather, 4);
  const station = panel?.sources.station;
  renderWidget(byId('night-rooms'), ['Obývák', 'Pracovna', 'Ložnice'].map((name) => {
    const room = panel?.rooms.find((entry) => entry.name === name);
    const { temperature, co2, time } = room?.meter ?? {};
    const color = co2Color(co2);
    const status = widgetStatus(station, time ?? station?.at, !Number.isFinite(co2) || !Number.isFinite(temperature));
    return `<div class="night-room">
      <span class="night-room-name">${esc(t(name))}</span>
      ${status ? `<span class="night-room-status">${status}</span>` : ''}
      <b class="night-room-temp" title="${t('Teplota místnosti')}">${label(temperature, '°C', 1)}</b>
      <span class="night-room-co2"${color ? ` style="--co2: ${color}"` : ''}>CO₂ <b>${num(co2)}</b>${color ? ' ppm' : ''}</span>
    </div>`;
  }).join(''));
}

function valveOpening(heat) {
  const power = heat?.power;
  return heat?.reachable && panel?.sources.heating?.state === 'live' && !connectionFailed &&
    Number.isFinite(power) && power >= 0 && power <= 100 ? power : null;
}

function roomMarkup(room, index) {
  const { meter, heat } = room;
  const stale = meter.time && Date.now() - meter.time > 30 * 60_000;
  const co2 = co2Color(meter.co2);
  const valve = valveOpening(heat);
  const valveLabel = t('Otevření hlavice');
  const valveReading = valve == null ? '' : label(valve, '%');
  const actual = label(heat?.temperature, '°C', 1);
  const target = label(heat?.target, '°C', 1);
  const heatingLabel = [t('Topení'), t('Aktuální teplota') + ' ' + actual, t('Požadovaná teplota') + ' ' + target,
    valveReading && valveLabel + ' ' + valveReading].filter(Boolean).join(' · ');
  const purifier = airplus?.data?.find((device) => device.room === room.name);
  const pm25 = purifier?.available && airplus.state === 'live' ? purifier.pm25 : null;
  const waterEmpty = purifier?.available && airplus.state === 'live' && purifier.waterEmpty === true;
  const airTitle = [t('Čistička vzduchu'), 'PM2.5 ' + label(pm25, 'µg/m³'), waterEmpty && t('Doplň vodu')].filter(Boolean).join(' · ');
  return `<article class="room" data-room-history="${index}">
    ${stale && panel?.sources.station.state === 'live' ? `<span class="room-alert">${widgetStatus(panel.sources.station, meter.time)}</span>` : ''}
    <div class="room-top"><button type="button" class="room-title room-history" data-history="temperature" data-index="${index}" aria-haspopup="dialog"><span class="room-icon">${icon(room.icon)}</span><span>${esc(t(room.name))}</span></button>
    <div class="room-temp" title="${stale ? t('Poslední měření v') + ' ' + shortTime.format(meter.time) : t('Teplota místnosti')}">${num(meter.temperature, 1)}<small>°C</small></div></div>
    <div class="room-metrics">
      ${heat ? `<button class="room-heat-row" type="button" data-room="${index}" aria-haspopup="dialog" aria-label="${esc(heatingLabel)}" title="${esc(heatingLabel)}">
        <span class="room-valve" data-open="${valve > 0}">${icon('heat')}${valveReading || '–'}</span>
        <span class="room-heat-temperatures"><b>${num(heat.temperature, 1)}</b>${icon('right')}<b class="room-target">${target}</b></span>
      </button>` : ''}
      <button type="button" title="CO₂" aria-label="CO₂ ${label(meter.co2, 'ppm')}" class="room-history room-co2" data-history="co2" data-index="${index}"${co2 ? ` style="--co2: ${co2}"` : ''}>
        ${icon('air')}<b>${num(meter.co2)}</b>${co2 ? '<span class="room-co2-unit">ppm</span>' : ''}
      </button>
      ${purifier ? `<button type="button" class="room-history airplus-room" data-airplus-room="${index}" data-water-empty="${waterEmpty}" title="${esc(airTitle)}" aria-label="${esc(airTitle)}" aria-haspopup="dialog">${waterEmpty ? icon('drop') : ''}<span class="room-pm-label">PM2.5</span><span class="room-pm-short" aria-hidden="true">PM</span> <b>${num(pm25)}</b></button>` : ''}
    </div>
  </article>`;
}

function renderAirplus() {
  if (!airplusDialog.open) return;
  const purifier = airplus?.data?.find(({ room }) => room === airplusRoom);
  const live = purifier?.available === true && airplus.state === 'live';
  const disabled = !live || airplusChanging ? ' disabled' : '';
  byId('airplus-title').textContent = t(airplusRoom) + ' · ' + t('Čistička vzduchu');
  const state = byId('airplus-status');
  const modes = [['auto', 'Automaticky', 'cycle'], ['sleep', 'Noční režim', 'moon'], ['medium', 'Střední', 'air'], ['turbo', 'Turbo', 'bolt']];
  const mode = modes.find(([key]) => key === purifier?.mode)?.[1];
  byId('airplus-water').hidden = !live || purifier.waterEmpty !== true;
  byId('airplus-pm').textContent = purifier?.available ? num(purifier.pm25) : '–';
  const readings = [];
  if (purifier?.available) {
    const values = [
      ['Index alergenů', purifier.allergens, '/ 12'], ['Zbývá z filtru', purifier.filter, '%'], ['Vlhkost', purifier.humidity, '%'],
    ];
    for (const [name, value, unit] of values) {
      if (Number.isFinite(value)) readings.push([t(name), label(value, unit)]);
    }
  }
  byId('airplus-readings').innerHTML = readings.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('');
  const controls = byId('airplus-controls');
  const on = purifier?.on === true;
  const active = document.activeElement;
  const focused = controls.contains(active) ? [...controls.querySelectorAll('button')].indexOf(active) : -1;
  controls.innerHTML = `<button type="button" class="airplus-power" role="switch" aria-label="${t('Napájení')}" aria-checked="${on}" data-airplus-action="power" data-value="${!on}"${disabled || (typeof purifier?.on === 'boolean' ? '' : ' disabled')}>
    <span><b>${t(on ? 'Zapnuto' : 'Vypnuto')}</b>${mode && on ? `<small>${t(mode)}</small>` : ''}</span><span class="device-switch" aria-hidden="true"></span></button>
    <div class="airplus-options" role="group" aria-label="${t('Režim')}">${modes.map(([key, name, symbol]) => `<button type="button" data-airplus-action="mode" data-value="${key}" aria-pressed="${purifier?.mode === key}"${disabled}>${icon(symbol)}<span>${t(name)}</span></button>`).join('')}</div>
    ${purifier?.humiditySupported === true ? `<section class="airplus-humidity"><h3>${t('Cílová vlhkost')}</h3><div class="airplus-options" role="group" aria-label="${t('Cílová vlhkost')}">${[40, 50, 60, 70].map((value) => `<button type="button" data-airplus-action="humidity" data-value="${value}" aria-pressed="${purifier.humidityTarget === value}"${disabled}>${value} %</button>`).join('')}</div></section>` : ''}`;
  if (focused >= 0) controls.querySelectorAll('button')[focused]?.focus({ preventScroll: true });
  const message = airplusError || (airplusChanging ? t('Čekám na potvrzení…') : live ? '' : t(purifier?.available ? 'Starší data' : 'Nedostupné'));
  state.hidden = !message;
  state.textContent = message;
}

byId('airplus-controls').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-airplus-action]');
  const purifier = airplus?.data?.find(({ room }) => room === airplusRoom);
  if (!button || airplusChanging || !purifier?.available || airplus.state !== 'live') return;
  const action = button.dataset.airplusAction;
  let value = button.dataset.value;
  if (action === 'power') value = value === 'true';
  if (action === 'humidity') value = Number(value);
  if (action === 'power' && purifier.on === value || action === 'humidity' && purifier.humidityTarget === value ||
      action === 'mode' && purifier.on && purifier.mode === value) return;

  airplusChanging = true;
  airplusError = '';
  if (airplusLoad) await airplusLoad;
  renderAirplus();
  try {
    const response = await fetch('/api/airplus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: purifier.model, action, value }), signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error();
    const { data } = await response.json();
    airplus = { ...airplus, data: airplus.data.map((device) => device.model === data.model ? data : device) };
    if (panel) renderRooms();
  } catch {
    airplusError = t('Čistička změnu nepotvrdila.');
  } finally {
    airplusChanging = false;
    renderAirplus();
    void loadAirplus();
  }
});

function loadAirplus() {
  if (airplusChanging) return airplusLoad;
  airplusLoad ??= (async () => {
    try {
      const response = await fetch('/api/airplus', { cache: 'no-store', signal: AbortSignal.timeout(17_000) });
      if (!response.ok) throw new Error();
      const next = await response.json();
      airplus = next.state === 'error' && airplus?.data ? { ...airplus, state: 'stale' } : next;
    } catch {
      if (airplus?.data) airplus = { ...airplus, state: 'stale' };
    }
    if (panel) renderRooms();
    renderAirplus();
  })().finally(() => { airplusLoad = null; });
  return airplusLoad;
}

function renderCoffee() {
  const report = coffeeData?.data;
  const readings = coffeeData?.state === 'live' || coffeeData?.state === 'stale' ? report : null;
  const alerts = coffeeData?.state === 'live'
    ? (report?.alerts ?? []).map((key) => coffeeAlerts[key]).filter(Boolean)
    : [];
  const status = coffeeWaking ? 'Probouzí se…'
    : coffeeData?.state === 'stale' ? 'Starší data'
    : readings ? coffeeStates[report.status] ?? 'Neznámý stav'
    : coffeeData?.state === 'off' ? 'Nepřipojeno' : coffeeData ? 'Nedostupné' : 'Načítám…';
  const progress = coffeeData?.state === 'live' ? readings?.progress : null;
  const stateText = t(status) + (Number.isFinite(progress) ? ' · ' + label(progress, '%') : '');
  coffeeShortcut.hidden = !coffeeData || coffeeData.state === 'off';
  coffeeShortcut.dataset.alert = String(alerts.length > 0);
  const shortcutStatus = byId('coffee-shortcut-status');
  shortcutStatus.textContent = alerts.length ? t(alerts[0]) : stateText;
  shortcutStatus.title = shortcutStatus.textContent;
  if (!coffeeDialog.open) return;
  byId('coffee-status').textContent = stateText;
  const wake = byId('coffee-wake');
  wake.hidden = !coffeeWaking && (coffeeData?.state !== 'live' || report?.status !== 'standby');
  wake.disabled = coffeeWaking;
  const command = byId('coffee-command-status');
  command.textContent = t(coffeeCommand);
  command.hidden = !coffeeCommand;
  const age = byId('coffee-data-age');
  age.hidden = coffeeData?.state !== 'stale' || !Number.isFinite(coffeeData.at);
  age.textContent = age.hidden ? '' : t('Naposledy') + ' ' + contactDate.format(coffeeData.at);
  const warnings = byId('coffee-alerts');
  warnings.hidden = alerts.length === 0;
  warnings.innerHTML = alerts.map((warning) => `<li>${esc(t(warning))}</li>`).join('');
  renderCoffeeReadings('coffee-readings', [
    ['Zásobník sedliny', readings?.groundsPct, '%'],
    ['Zbývá do odvápnění', readings?.descaleRemainingPct, '%'],
    ['Počet odvápnění', readings?.descaleCount],
    ['Použité vodní filtry', readings?.filterCount],
  ]);
  renderCoffeeReadings('coffee-counts', [
    ['Černé kávy celkem', readings?.coffeeCount],
    ['Espresso', readings?.espressoCount],
    ['Cappuccino', readings?.cappuccinoCount],
    ['Cold Brew', readings?.coldBrewCount],
    ['Voda celkem', readings?.waterLiters, 'l', 1],
  ]);
}

function renderCoffeeReadings(id, readings) {
  const list = byId(id);
  const items = readings.filter(([, value]) => Number.isFinite(value));
  list.parentElement.hidden = items.length === 0;
  list.innerHTML = items.map(([name, value, unit, precision]) =>
    `<div><dt>${esc(t(name))}</dt><dd>${unit ? label(value, unit, precision) : num(value)}</dd></div>`).join('');
}

function loadCoffee() {
  if (coffeeWaking) return coffeeLoad;
  coffeeLoad ??= (async () => {
    try {
      const response = await fetch('/api/coffeelink', { cache: 'no-store', signal: AbortSignal.timeout(17_000) });
      if (!response.ok) throw new Error();
      coffeeData = await response.json();
    } catch {
      coffeeData = { state: 'error' };
    }
    renderCoffee();
  })().finally(() => { coffeeLoad = null; });
  return coffeeLoad;
}

coffeeShortcut.addEventListener('click', () => {
  coffeeCommand = '';
  coffeeDialog.showModal();
  renderCoffee();
  void loadCoffee();
});
byId('coffee-close').addEventListener('click', () => coffeeDialog.close());
byId('coffee-wake').addEventListener('click', async () => {
  if (coffeeWaking || coffeeData?.state !== 'live' || coffeeData.data?.status !== 'standby') return;
  coffeeWaking = true;
  coffeeCommand = '';
  renderCoffee();
  try {
    await coffeeLoad;
    const response = await fetch('/api/coffeelink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'wake' }),
      signal: AbortSignal.timeout(56_000),
    });
    const { result } = await response.json();
    coffeeCommand = {
      busy: 'Kávovar se už probouzí.',
      in_use: 'Kávovar právě používá Coffee Link.',
      unavailable: 'Probuzení teď není dostupné.',
      reauth: 'Obnov přihlášení Coffee Link',
    }[result] ?? (result === 'confirmed' ? '' : 'Kávovar probuzení nepotvrdil.');
  } catch {
    coffeeCommand = 'Kávovar probuzení nepotvrdil.';
  } finally {
    coffeeWaking = false;
    await loadCoffee();
  }
});

function renderOutdoor() {
  const outside = panel?.outdoor;
  const weather = panel?.sources.weather.data;
  const model = weather?.current;
  const today = forecastDayIndex(weather?.daily);
  const sunTimes = [['sunrise', 'Východ slunce'], ['sunset', 'Západ slunce']].map(([key, name]) => {
    const time = forecastTime(weather?.daily?.[key]?.[today]);
    return `<span title="${t(name)}" aria-label="${t(name)} ${time}">${icon(key)}${time}</span>`;
  }).join('');
  const [symbol, condition] = weatherType(model?.weather_code, model?.is_day);
  const hero = byId('outdoor');
  hero.dataset.weather = symbol;
  hero.dataset.night = model?.is_day === 0;
  const stationAvailable = Number.isFinite(outside?.temperature);
  const station = panel?.sources.station;
  const warning = widgetStatus(station, outside?.time ?? station?.at, !stationAvailable);
  const sourceName = !stationAvailable && model ? `<span class="source">${t('Model počasí')}</span>` : '';
  const markup =
    `<span class="hero-tools widget-status">${warning || sourceName}</span>
    <button class="today-forecast" type="button" aria-label="${t('Předpověď na příštích 24 hodin')}" title="${t('Předpověď na příštích 24 hodin')}" aria-haspopup="dialog"></button>
    <div class="hero-main">${icon(symbol, 'weather-icon ' + symbol)}<div class="hero-number">${num(stationAvailable ? outside.temperature : model?.temperature_2m, 1)}<small>°C</small></div>
      <div class="hero-condition">${condition}<span>${t('Pocitově')} ${label(model?.apparent_temperature, '°C', 1)}</span></div></div>
    <div class="hero-metrics"><span title="${t('Vlhkost')}">${icon('drop')}${label(outside?.humidity ?? model?.relative_humidity_2m, '%')}</span>
      <span title="${t('Tlak stanice')}">${icon('gauge')}${label(outside?.pressure, 'hPa')}</span>
      <span title="${t('Vítr podle předpovědi')}">${icon('air')}${label(model?.wind_speed_10m, 'km/h')}</span>
      ${Number.isFinite(outside?.min) && Number.isFinite(outside?.max) &&
        (station?.state === 'demo' || Number.isFinite(outside.time) && localDate.format(outside.time) === dashboardDate)
        ? `<span title="${t('Minimum a maximum stanice')}">↓ ${num(outside.min, 1)}° &nbsp; ↑ ${num(outside.max, 1)}°</span>` : ''}
      <span class="hero-sun-times">${sunTimes}</span></div>`;
  renderWidget(hero, markup, hero.dataset.night + markup);
}

function forecastHour(time, code, temperature, rain, isDay, precipitation, rainLabel, amount, peak) {
  const [symbol, condition] = weatherType(code, isDay);
  const symbols = precipitation.length ? precipitation : [symbol];
  const name = precipitation.length ? precipitation.map((kind) => t(kind === 'snow' ? 'Sníh' : 'Déšť')).join(' / ') : condition;
  return `<span class="forecast-item" title="${name}">
    <time datetime="${new Date(time).toISOString()}">${shortTime.format(time)}</time>
    <span class="forecast-symbols" role="img" aria-label="${name}">${symbols.map((kind) => icon(kind, 'weather-icon ' + kind)).join('')}</span>
    <b>${num(temperature)}°</b>
    <span class="hour-rain" title="${rainLabel}">${rain}</span>
    <span class="hour-precipitation" data-wet="${amount > 0}" data-snow="${precipitation.includes('snow')}"
      style="--amount-fill:${amount > 0 ? 100 * amount / peak : 0}%" title="${t('Úhrn srážek za zobrazený blok')}">${label(amount, 'mm', 1)}</span>
  </span>`;
}

function renderForecast() {
  const source = panel?.sources.weather;
  const node = byId('forecast');
  node.title = t(forecastInterval === 4 ? 'Zobrazit hodinovou předpověď' : 'Zobrazit předpověď po čtyřech hodinách');
  node.setAttribute('aria-label', node.title);
  byId('forecast-status').innerHTML = widgetStatus(source);
  const offset = node.dataset.interval === String(forecastInterval) ? node.scrollLeft : 0;
  renderHourlyForecast(node, source, forecastInterval, 48 / forecastInterval);
  node.dataset.interval = forecastInterval;
  if (node.scrollLeft !== offset) node.scrollLeft = offset;
}

function forecastBoundaries(times, hours) {
  return times.flatMap((time, index) =>
    hours === 1 || Number(forecastTime(time).slice(0, 2)) % hours === 0 ? [index] : []);
}

function maxHourlyValue(series, start, end) {
  const values = series?.slice(start + 1, end + 1).filter(Number.isFinite) ?? [];
  return values.length ? Math.max(...values) : null;
}

function renderHourlyForecast(node, source, hours = 1, slots = 6) {
  const table = source?.data?.hourly;
  const since = Date.now() / 1000;
  if (!table?.time?.length || table.time.at(-1) <= since) {
    const markup = `<span class="placeholder">${t(source ? 'Předpověď je nedostupná.' : 'Načítám předpověď…')}</span>`;
    if (widgetValues.get(node) !== markup) renderWidget(node, markup);
    return;
  }
  const hour = Math.max(0, table.time.findLastIndex((time) => time <= since));
  const boundaries = forecastBoundaries(table.time, hours);
  const start = Math.max(0, boundaries.findLastIndex((index) => index <= hour));
  const indices = boundaries.slice(start, start + slots);
  const rainLabel = t(hours === 1 ? 'Srážky' : 'Nejvyšší hodinová šance srážek v bloku');
  const periods = indices.map((index, offset) => {
    const end = boundaries[start + offset + 1] ?? table.time.length;
    const from = Math.max(index, hour);
    const amount = sumHourlyValues(table.precipitation?.slice(from + 1, end + 1) ?? [], end - from);
    return { index, end, from, amount };
  });
  const peak = Math.max(0, ...periods.map(({ amount }) => amount ?? 0));
  const html = periods
    .map(({ index: i, end, from, amount }) => {
      const kinds = new Set();
      for (let j = from; j < end; j++) {
        const [symbol] = weatherType(table.weather_code[j]);
        if (table.rain?.[j + 1] > 0 || table.showers?.[j + 1] > 0 || symbol === 'rain' || symbol === 'storm') kinds.add('rain');
        if (table.snowfall?.[j + 1] > 0 || symbol === 'snow') kinds.add('snow');
      }
      const rain = label(maxHourlyValue(table.precipitation_probability, from, end), '%');
      return forecastHour(table.time[i] * 1000, table.weather_code[i], table.temperature_2m[i], rain, table.is_day?.[i], [...kinds], rainLabel, amount, peak);
    })
    .join('');
  if (widgetValues.get(node) === html) return;
  node.style.setProperty('--count', Math.min(indices.length, 6));
  renderWidget(node, html);
}

function forecastDays(daily) {
  const today = localDate.format(Date.now());
  const first = daily?.time?.findIndex((time) => localDate.format(time * 1000) >= today) ?? -1;
  return { today, first, days: first < 0 ? [] : daily.time.slice(first) };
}

function renderDailyForecast() {
  const source = panel?.sources.weather;
  byId('daily-status').innerHTML = widgetStatus(source);
  const daily = source?.data?.daily;
  const { today, first, days } = forecastDays(daily);
  renderWidget(byId('daily-forecast'), days.slice(0, 5).map((time, offset) => {
    const index = first + offset;
    const [condition, name] = weatherType(daily.weather_code[index]);
    const date = time * 1000;
    const day = localDate.format(date);
    const shortDay = dayName.format(date);
    const fullDay = fullDayName.format(date);
    const dayLabel = day === today ? t('Dnes') + ' · ' + fullDay : fullDay;
    const max = daily.temperature_2m_max[index];
    const min = daily.temperature_2m_min[index];
    const high = Number.isFinite(max) ? num(max) + '°' : '–';
    const low = Number.isFinite(min) ? num(min) + '°' : '–';
    const amount = daily.precipitation_sum[index];
    const rain = label(amount, 'mm', 1);
    const symbol = daily.snowfall_sum?.[index] > 0 ? 'snow' : amount > 0 && condition !== 'storm' ? 'rain' : condition;
    const summary = `${dayLabel} · ${name} · ${t('Minimum')} ${low} · ${t('Maximum')} ${high} · ${t('Srážky')} ${rain}`;
    return `<button type="button" class="daily-row" data-day="${date}" aria-haspopup="dialog" aria-label="${t('Podrobná předpověď')} · ${summary}" title="${summary}">
      <time datetime="${day}" aria-label="${dayLabel}">
        <span class="daily-day-short">${shortDay}</span><span class="daily-day-full">${fullDay}</span>
      </time>
      ${icon(symbol, 'weather-icon ' + symbol)}
      <span class="daily-low">${low}</span>
      <b class="daily-high">${high}</b>
      <span class="daily-rain" data-wet="${amount > 0}" data-snow="${symbol === 'snow'}">${amount === 0 ? '' : num(amount, 1)}</span>
    </button>`;
  }).join('') || empty(source ? t('Nedostupné') : t('Načítám…')));
}

const dayDialog = byId('day-dialog');
const dayDetails = byId('day-details');
const dayPrevious = byId('day-previous');
const dayNext = byId('day-next');
const dayChartValues = new WeakMap();
new ResizeObserver(() => {
  dayDetails.querySelectorAll('.day-chart-graphic').forEach(drawDayLabels);
}).observe(dayDetails);
let forecastTrigger;
let selectedForecastDay;
let outdoorHistoryRequest;
const forecastDate = new Intl.DateTimeFormat(locale, {
  timeZone: 'Europe/Prague', weekday: 'long', day: 'numeric', month: 'long',
});
const forecastTime = (seconds) => Number.isFinite(seconds) ? shortTime.format(seconds * 1000) : '–';
const forecastHourMs = 3600_000;

function chartTimes(start, end, now) {
  const times = Array.from({ length: 5 }, (_, i) => {
    const time = start + i * (end - start) / 4;
    if (time === now) return t('Teď');
    const clock = shortTime.format(time);
    return now == null && i === 4 && clock === '00:00' ? '24:00' : clock;
  });
  return `<div class="day-chart-times" aria-hidden="true">${times.map((time) => `<span>${time}</span>`).join('')}</div>`;
}

function forecastDayIndex(daily, at = Date.now()) {
  const day = localDate.format(at);
  return daily?.time?.findIndex((time) => localDate.format(time * 1000) === day) ?? -1;
}

function drawDayLabels(graph) {
  const width = graph.clientWidth;
  const height = graph.clientHeight;
  if (!width || !height) return;
  const { points, start, end, threshold, x, y, format } = dayChartValues.get(graph);
  const layer = graph.querySelector('.day-chart-values');
  layer.replaceChildren();
  const count = Math.max(2, Math.min(6, 1 + Math.floor(width / 56)));
  let right = -Infinity;
  for (const [time, value] of labelPoints(points, start, end, count, threshold)) {
    const node = document.createElement('span');
    node.textContent = format(value);
    layer.append(node);
    const halfWidth = node.offsetWidth / 2;
    const halfHeight = node.offsetHeight / 2;
    const center = Math.max(halfWidth + 2, Math.min(width - halfWidth - 2, x(time) * width));
    if (center - halfWidth < right + 6) {
      node.remove();
      continue;
    }
    const pointY = y(value) * height;
    const above = pointY - halfHeight - 3;
    const labelY = above >= halfHeight ? above : Math.min(height - halfHeight, pointY + halfHeight + 3);
    node.style.left = center + 'px';
    node.style.top = labelY + 'px';
    right = center + halfWidth;
  }
}

function setDayLabels(graph, options) {
  dayChartValues.set(graph, options);
  drawDayLabels(graph);
}

function dayTemperatureChart(container, points, start, end, gap, now) {
  if (!points.length) {
    container.textContent = t('Teploty nejsou dostupné.');
    return;
  }
  const values = points.map(([, value]) => value);
  const low = Math.floor(Math.min(...values));
  const high = Math.max(low + 2, Math.ceil(Math.max(...values)));
  const x = (time) => 2 + 396 * (time - start) / (end - start);
  const y = (value) => 68 - 64 * (value - low) / (high - low);
  const line = points.map(([time, value], i) => {
    const command = i && time - points[i - 1][0] <= gap ? 'L' : 'M';
    return command + x(time).toFixed(1) + ' ' + y(value).toFixed(1);
  }).join(' ');
  const last = points.at(-1);
  container.innerHTML = `<div class="day-chart-axis"><span>${label(high, '°C')}</span><span>${label(low, '°C')}</span></div>
    <div class="day-chart-graphic"><svg viewBox="0 0 400 72" preserveAspectRatio="none" role="img" aria-label="${t('Teplota')} ${label(Math.min(...values), '°C', 1)} – ${label(Math.max(...values), '°C', 1)}">
      <path class="day-chart-grid" d="M0 4H400M0 36H400M0 68H400" />
      <path class="day-chart-line" d="${line}" />
      <circle cx="${x(last[0])}" cy="${y(last[1])}" r="2" fill="currentColor" />
    </svg><div class="day-chart-values" aria-hidden="true"></div></div>${chartTimes(start, end, now)}`;
  setDayLabels(container.querySelector('.day-chart-graphic'), {
    points, start, end, threshold: (high - low) * 0.12,
    x: (time) => x(time) / 400,
    y: (value) => y(value) / 72,
    format: (value) => value.toLocaleString(locale, { maximumFractionDigits: 1 }) + '°',
  });
}

function precipitationHours(hourly, start, end) {
  return (hourly?.time ?? []).flatMap((seconds, i) => {
    const time = seconds * 1000;
    const from = Math.max(start, time - forecastHourMs);
    const to = Math.min(end, time);
    if (to <= from) return [];
    const fullHour = to - from === forecastHourMs;
    return [{ time, from, to, rain: fullHour ? rainAt(hourly, i) : null,
      snow: fullHour ? hourly.snowfall?.[i] : null, chance: hourly.precipitation_probability?.[i] }];
  });
}

function renderDayPrecipitationChart(rows, start, end, now) {
  const annotations = [];
  const series = [['rain', 'Déšť', 'mm'], ['snow', 'Sníh', 'cm'], ['chance', 'Šance srážek', '%']].map(([key, name, unit]) => {
    const chance = key === 'chance';
    const peak = Math.max(...rows.map((row) => row[key]).filter(Number.isFinite));
    if (!(peak > 0 || (chance && now != null && peak === 0))) return '';
    const top = chance ? 100 : Math.ceil(peak * 10) / 10;
    annotations.push({
      points: rows.filter((row) => Number.isFinite(row[key]) && (chance || row[key] > 0))
        .map((row) => [(row.from + row.to) / 2, row[key]]),
      start, end, threshold: top * 0.12,
      x: (time) => (time - start) / (end - start),
      y: (value) => (57 - 54 * value / top) / 60,
      format: (value) => chance ? num(value) + ' %' : value.toLocaleString(locale, { maximumFractionDigits: 2 }),
    });
    const marks = rows.map((row, index) => {
      const value = row[key];
      if (!Number.isFinite(value) || (!chance && value <= 0)) return '';
      const height = 54 * value / top;
      const x = 400 * (row.from - start) / (end - start);
      const width = 400 * (row.to - row.from) / (end - start);
      const from = shortTime.format(row.time - forecastHourMs);
      const to = now == null && row.time === end ? '24:00' : shortTime.format(row.time);
      const y = (57 - height).toFixed(2);
      const title = `<title>${from}–${to} · ${label(value, unit, chance ? 0 : 2)}</title>`;
      if (chance) {
        const previous = rows[index - 1];
        const step = previous?.to === row.from && Number.isFinite(previous.chance)
          ? `M${x.toFixed(2)} ${(57 - 54 * previous.chance / top).toFixed(2)}V${y}` : `M${x.toFixed(2)} ${y}`;
        return `<path class="day-chart-line" d="${step}h${width.toFixed(2)}">${title}</path>`;
      }
      return `<rect x="${(x + width * 0.15).toFixed(2)}" y="${y}" width="${(width * 0.7).toFixed(2)}" height="${height.toFixed(2)}" rx="1">${title}</rect>`;
    }).join('');
    return `<div class="day-precipitation-series" data-kind="${key}">
      <span class="day-precipitation-label">${icon(chance ? 'drop' : key)} ${t(name)} · ${unit}</span>
      <div class="day-chart-plot">
        <div class="day-chart-axis"><span>${num(top, chance ? 0 : 1)}</span><span>0</span></div>
        <div class="day-chart-graphic"><svg viewBox="0 0 400 60" preserveAspectRatio="none" role="img" aria-label="${t(name)} · ${t('Maximum')} ${label(peak, unit, chance ? 0 : 2)}">
          <path class="day-chart-grid" d="M0 3H400M0 30H400M0 57H400" />${marks}
        </svg><div class="day-chart-values" aria-hidden="true"></div></div>${chartTimes(start, end, now)}
      </div></div>`;
  }).join('');
  const hasData = rows.some(({ rain, snow, chance }) => Number.isFinite(rain) || Number.isFinite(snow) || Number.isFinite(chance));
  if (!series && hasData) return;
  dayDetails.insertAdjacentHTML('beforeend', `<section class="day-chart day-precipitation">
    <h3>${t('Předpověď srážek')} · Open-Meteo</h3>
    ${series ? `<div class="day-precipitation-series-list">${series}</div>`
      : `<div class="day-precipitation-empty">${t('Výhled srážek není dostupný.')}</div>`}
  </section>`);
  dayDetails.lastElementChild.querySelectorAll('.day-chart-graphic').forEach((graph, index) => setDayLabels(graph, annotations[index]));
}

async function showOutdoorHistory(start, end) {
  const container = byId('day-netatmo-plot');
  const request = new AbortController();
  outdoorHistoryRequest?.abort();
  outdoorHistoryRequest = request;
  try {
    const response = await fetch('/api/history/outdoor', { signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (request.signal.aborted || !container.isConnected) return;
    const points = data.series.temperature.filter(([time]) => time >= start && time <= end);
    dayTemperatureChart(container, points, start, end, 35 * 60_000, end);
    if (data.state === 'stale') byId('day-netatmo-status').textContent = t('Starší data');
  } catch {
    if (!request.signal.aborted && container.isConnected) container.textContent = t('Historii se nepodařilo načíst.');
  }
}

function outdoorHistoryChart() {
  return `<section class="day-chart"><h3>${t('Naměřená teplota')} · Netatmo</h3>
    <span id="day-netatmo-status" role="status"></span><div id="day-netatmo-plot" class="day-chart-plot">${t('Načítám historii…')}</div></section>`;
}

function temperatureForecastChart() {
  return `<section class="day-chart day-chart-forecast"><h3>${t('Předpověď teploty')} · Open-Meteo</h3>
    <div id="day-forecast-plot" class="day-chart-plot"></div></section>`;
}

function forecastOverview(min, max, symbol, condition, metrics, cards) {
  const range = Number.isFinite(min) && Number.isFinite(max) ? num(min) + '° ' + t('až') + ' ' + label(max, '°C') : '–';
  return `<div class="day-condition">${icon(symbol, 'weather-icon ' + symbol)}<div><strong>${range}</strong><span>${condition}</span></div></div>
    <dl class="day-metrics">${metrics.map(([symbol, name, reading, detail]) =>
      `<div><dt>${icon(symbol)}${name}</dt><dd>${reading}</dd>${detail ? `<dd class="day-metric-note">${detail}</dd>` : ''}</div>`,
    ).join('')}</dl>
    <div class="day-periods" aria-label="${t('Časový výhled')}">${cards.join('')}</div>`;
}

function dayPeriodCard(heading, hourly, index, chance) {
  const [symbol, condition] = weatherType(hourly?.weather_code?.[index], hourly?.is_day?.[index]);
  const temperature = hourly?.temperature_2m?.[index];
  return `<div class="day-period" title="${condition}">
    <span>${heading}</span>
    <div>${icon(symbol, 'weather-icon ' + symbol)}<b>${Number.isFinite(temperature) ? num(temperature) + '°' : '–'}</b></div>
    <small aria-label="${t('Nejvyšší hodinová šance srážek')} ${label(chance, '%')}">${icon('drop')}${label(chance, '%')}</small>
  </div>`;
}

function maxForecastValue(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function renderUpcomingForecast() {
  const now = Date.now();
  const horizon = 24 * forecastHourMs;
  const end = now + horizon;
  const { hourly, daily } = panel?.sources.weather?.data ?? {};
  const hours = (hourly?.time ?? []).flatMap((seconds, index) => {
    const time = seconds * 1000;
    return time >= now && time <= end ? [{ time, index }] : [];
  });
  const temperatures = hours.flatMap(({ time, index }) => {
    const value = hourly.temperature_2m?.[index];
    return Number.isFinite(value) ? [[time, value]] : [];
  });
  const precipitation = precipitationHours(hourly, now, end);
  const fullHours = precipitation.filter(({ from, to }) => to - from === forecastHourMs);
  const expectedHours = Math.floor(end / forecastHourMs) - Math.ceil(now / forecastHourMs);
  const rain = sumHourlyValues(fullHours.map((hour) => hour.rain), expectedHours);
  const snow = sumHourlyValues(fullHours.map((hour) => hour.snow), expectedHours);
  const wind = maxForecastValue(hours.map(({ index }) => hourly.wind_speed_10m?.[index]));
  const gust = maxForecastValue(hours.filter(({ time }) => time > now).map(({ index }) => hourly.wind_gusts_10m?.[index]));
  const sun = ['sunrise', 'sunset'].map((key) => forecastTime(daily?.[key]?.find((time) => time * 1000 >= now && time * 1000 < end)));
  const metrics = [
    ['drop', t('Srážky'), (snow > 0 ? t('Déšť') + ' ' : '') + label(rain, 'mm', 1), snow > 0 ? t('Nový sníh') + ' ' + label(snow, 'cm', 1) : ''],
    ['air', t('Vítr'), label(wind, 'km/h'), gust > wind ? t('Nárazy') + ' ' + label(gust, 'km/h') : ''],
    ['sun', t('Východ / západ'), sun.join(' / '), ''],
  ];
  const block = horizon / 4;
  const cards = Array.from({ length: 4 }, (_, period) => {
    const start = now + period * block;
    const middle = start + block / 2;
    const sample = hours.filter(({ time }) => time >= start && time < start + block).reduce((best, entry) =>
      !best || Math.abs(entry.time - middle) < Math.abs(best.time - middle) ? entry : best, null);
    const chance = maxForecastValue(precipitation.filter(({ from, to }) => to > start && from < start + block).map((hour) => hour.chance));
    return dayPeriodCard(`${shortTime.format(start)}–${shortTime.format(start + block)}`, hourly, sample?.index, chance);
  });
  const code = maxForecastValue(hours.map(({ index }) => hourly.weather_code?.[index]));
  const [symbol, condition] = weatherType(code, hourly?.is_day?.[hours.find(({ index }) => hourly.weather_code?.[index] === code)?.index]);
  const values = temperatures.map(([, value]) => value);
  const history = byId('day-netatmo-plot')?.closest('.day-chart');
  byId('day-title').textContent = t('Předpověď na příštích 24 hodin');
  dayDetails.innerHTML = `${forecastOverview(Math.min(...values), Math.max(...values), symbol, condition, metrics, cards)}
    <div class="day-charts">${temperatureForecastChart()}${outdoorHistoryChart()}</div>`;
  renderDayPrecipitationChart(precipitation, now, end, now);
  dayTemperatureChart(byId('day-forecast-plot'), temperatures, now, end, 90 * 60_000, now);
  if (history) byId('day-netatmo-plot').closest('.day-chart').replaceWith(history);
  else showOutdoorHistory(now - horizon, now);
}

function renderWeatherDetail() {
  const { days } = forecastDays(panel?.sources.weather?.data?.daily);
  const position = days.findIndex((day) => day * 1000 === selectedForecastDay);
  const focused = document.activeElement;
  byId('day-navigation').hidden = selectedForecastDay == null || days.length < 2;
  dayPrevious.disabled = position <= 0;
  dayNext.disabled = position >= days.length - 1;
  if (focused === dayNext && dayNext.disabled) dayPrevious.focus({ preventScroll: true });
  if (focused === dayPrevious && dayPrevious.disabled) dayNext.focus({ preventScroll: true });
  if (selectedForecastDay == null || localDate.format(selectedForecastDay) <= localDate.format(Date.now())) {
    return renderUpcomingForecast();
  }
  const data = panel?.sources.weather?.data;
  const daily = data?.daily;
  const index = forecastDayIndex(daily, selectedForecastDay);
  byId('day-title').textContent = forecastDate.format(selectedForecastDay);
  if (index < 0) {
    byId('day-details').innerHTML = empty(t('Předpověď je dočasně nedostupná.'));
    return;
  }
  const date = daily.time[index] * 1000;
  const value = (key) => daily[key]?.[index];
  const [symbol, name] = weatherType(value('weather_code'));
  const snow = value('snowfall_sum');
  const amount = value('precipitation_sum');
  const wind = value('wind_speed_10m_max');
  const gust = value('wind_gusts_10m_max');
  const metrics = [
    ['drop', t('Srážky'), label(amount, 'mm', 1), snow > 0 ? t('Nový sníh') + ' ' + label(snow, 'cm', 1) : ''],
    ['air', t('Vítr'), label(wind, 'km/h'), gust > wind ? t('Nárazy') + ' ' + label(gust, 'km/h') : ''],
    ['sun', t('Východ / západ'), forecastTime(value('sunrise')) + ' / ' + forecastTime(value('sunset')), ''],
  ];
  const hourly = data.hourly;
  const localDay = localDate.format(date);
  const end = (daily.time[index + 1] ?? daily.time[index] + 86400) * 1000;
  const periods = Array.from({ length: 4 }, () => []);
  const temperatures = [];
  hourly?.time.forEach((time, index) => {
    if (localDate.format(time * 1000) !== localDay) return;
    const temperature = hourly.temperature_2m?.[index];
    if (Number.isFinite(temperature)) temperatures.push([time * 1000, temperature]);
    const hour = Number(forecastTime(time).slice(0, 2));
    periods[Math.floor(hour / 6)]?.push({ index, hour });
  });
  const cards = periods.map((hours, period) => {
    const middle = period * 6 + 3;
    const sample = hours.reduce((best, entry) =>
      !best || Math.abs(entry.hour - middle) < Math.abs(best.hour - middle) ? entry : best, null);
    const chance = maxForecastValue(hours.map(({ index }) => hourly.precipitation_probability?.[index]));
    return dayPeriodCard([t('Noc'), t('Ráno'), t('Odpoledne'), t('Večer')][period], hourly, sample?.index, chance);
  });
  const min = value('temperature_2m_min');
  const max = value('temperature_2m_max');
  dayDetails.innerHTML = `${forecastOverview(min, max, symbol, name, metrics, cards)}
    <div class="day-charts">${temperatureForecastChart()}</div>`;
  renderDayPrecipitationChart(precipitationHours(hourly, date, end), date, end);
  dayTemperatureChart(byId('day-forecast-plot'), temperatures, date, end, 90 * 60_000);
}

function stepForecastDay(direction) {
  if (selectedForecastDay == null) return;
  const { days } = forecastDays(panel?.sources.weather?.data?.daily);
  const index = days.findIndex((day) => day * 1000 === selectedForecastDay);
  const next = days[index + direction];
  if (next == null) return;
  selectedForecastDay = next * 1000;
  outdoorHistoryRequest?.abort();
  dayDetails.replaceChildren();
  dayDialog.scrollTop = 0;
  renderWeatherDetail();
}

dayPrevious.addEventListener('click', () => stepForecastDay(-1));
dayNext.addEventListener('click', () => stepForecastDay(1));
dayDialog.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  stepForecastDay(event.key === 'ArrowRight' ? 1 : -1);
});
let daySwipe;
let daySwipedAt = -Infinity;
dayDialog.addEventListener('pointerdown', (event) => {
  if (selectedForecastDay != null && event.pointerType === 'touch' && event.isPrimary && dayDetails.contains(event.target)) {
    daySwipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    dayDialog.setPointerCapture(event.pointerId);
  }
});
dayDialog.addEventListener('pointercancel', () => { daySwipe = undefined; });
dayDialog.addEventListener('pointerup', (event) => {
  if (daySwipe?.id !== event.pointerId) return;
  const dx = event.clientX - daySwipe.x;
  const dy = event.clientY - daySwipe.y;
  daySwipe = undefined;
  if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
  daySwipedAt = performance.now();
  stepForecastDay(dx < 0 ? 1 : -1);
});
dayDialog.addEventListener('click', (event) => {
  if (performance.now() - daySwipedAt < 350) event.preventDefault();
}, true);

byId('daily-forecast').addEventListener('click', (event) => {
  const day = event.target.closest('[data-day]');
  if (!day) return;
  openWeatherDay('#daily-forecast [data-day="' + day.dataset.day + '"]', Number(day.dataset.day));
});
function openWeatherDay(trigger, at) {
  if (dayDialog.open) return;
  forecastTrigger = trigger;
  selectedForecastDay = at;
  byId('day-details').replaceChildren();
  renderWeatherDetail();
  dayDialog.showModal();
}

byId('outdoor').addEventListener('click', (event) => {
  if (event.target.closest('.today-forecast')) openWeatherDay('#outdoor .today-forecast');
});
byId('day-close').addEventListener('click', () => dayDialog.close());
dayDialog.addEventListener('close', () => {
  if (!dayDialog.open) outdoorHistoryRequest?.abort();
  document.querySelector(forecastTrigger)?.focus({ preventScroll: true });
});

byId('forecast').addEventListener('click', () => {
  forecastInterval = forecastInterval === 4 ? 1 : 4;
  renderPrecipitation();
  renderForecast();
});
byId('forecast').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  event.currentTarget.scrollBy({ left: (event.key === 'ArrowRight' ? 1 : -1) * event.currentTarget.clientWidth });
});

function rainAt(series, index) {
  const rain = series.rain?.[index];
  const showers = series.showers?.[index];
  return Number.isFinite(rain) && Number.isFinite(showers) ? rain + showers : null;
}

function sumHourlyValues(values, count) {
  return count > 0 && values.length === count && values.every(Number.isFinite)
    ? values.reduce((sum, value) => sum + value, 0) : null;
}

function fourHourPrecipitation(hourly, now) {
  const boundaries = forecastBoundaries(hourly.time, 4);
  const first = boundaries.findIndex((index) => hourly.time[index] >= now);
  if (first < 0) return [];
  return boundaries.slice(first, first + 4).map((index, offset) => {
    const end = boundaries[first + offset + 1];
    const start = hourly.time[index];
    const heading = forecastTime(start);
    const hours = end == null ? [] : hourly.time.slice(index + 1, end + 1);
    const rain = hours.map((_, offset) => rainAt(hourly, index + 1 + offset));
    const snow = end == null ? [] : hourly.snowfall?.slice(index + 1, end + 1) ?? [];
    return {
      heading,
      target: end == null ? heading : `${heading}–${forecastTime(hourly.time[end])}`,
      date: start * 1000,
      probability: maxHourlyValue(hourly.precipitation_probability, index, end ?? index),
      rain: sumHourlyValues(rain, hours.length),
      snow: sumHourlyValues(snow, hours.length),
      wind: hourly.wind_speed_10m?.[index],
      windDirection: hourly.wind_direction_10m?.[index],
      windGusts: maxHourlyValue(hourly.wind_gusts_10m, index, end ?? index),
    };
  });
}

function renderPrecipitation() {
  const source = panel?.sources.weather;
  const output = byId('precipitation');
  const hourly = source?.data?.hourly;
  const quarterHours = source?.data?.minutely_15;
  const fourHours = forecastInterval === 4;
  if (!hourly?.time?.length || (!fourHours && !quarterHours?.time?.length)) {
    renderWidget(output, empty(source ? t('Výhled srážek není dostupný.') : t('Načítám výhled srážek…')));
    return;
  }

  const now = Date.now() / 1000;
  const horizons = [
    [30, '+30 min'],
    [60, '+1 h'],
    [120, '+2 h'],
    [180, '+3 h'],
  ];
  const entries = fourHours ? fourHourPrecipitation(hourly, now) : horizons.map(([minutes, heading]) => {
    const target = now + minutes * 60;
    const hour = hourly.time.findIndex((time) => time >= target);
    const quarter = quarterHours.time.findIndex((time) => time >= target);
    return {
      heading,
      target: shortTime.format(target * 1000),
      probability: hourly.precipitation_probability?.[hour],
      rain: rainAt(quarterHours, quarter),
      snow: quarterHours.snowfall?.[quarter],
      wind: quarterHours.wind_speed_10m?.[quarter],
      windDirection: quarterHours.wind_direction_10m?.[quarter],
      windGusts: quarterHours.wind_gusts_10m?.[quarter],
    };
  });
  if (!entries.length) {
    renderWidget(output, empty(t('Výhled srážek není dostupný.')));
    return;
  }
  const rows = [
    ['Šance srážek', 'probability', '%', 0,
      fourHours ? 'Nejvyšší hodinová šance srážek v bloku' : 'Pravděpodobnost srážek v hodině obsahující zvolený čas'],
    ['Déšť', 'rain', 'mm', 1,
      fourHours ? 'Úhrn deště za zobrazený blok' : 'Množství deště za 15 minut obsahujících zvolený čas'],
    ['Sníh', 'snow', 'cm', 1,
      fourHours ? 'Úhrn sněhu za zobrazený blok' : 'Množství nového sněhu za 15 minut obsahujících zvolený čas'],
  ];
  const windRow = `<tr><th scope="row" title="${t('Rychlost a směr větru v cílovém čase')}">${t('Vítr')}</th>${entries
    .map(({ wind, windDirection, windGusts }) => {
      const speed = label(wind, 'km/h');
      const gust = Number.isFinite(windGusts) ? ` · ${t('Nárazy')} ${label(windGusts, 'km/h')}` : '';
      const direction = wind > 0 && Number.isFinite(windDirection);
      const hint = speed + (direction ? ` · ${t('Směr odkud vítr fouká')} ${num(windDirection)}°` : '') + gust;
      if (!Number.isFinite(wind)) return `<td class="wind"><span class="precipitation-value">${speed}</span></td>`;
      return `<td class="wind"><span class="precipitation-value wind-value" title="${hint}" aria-label="${hint}">${direction
        ? `<span class="wind-arrow" aria-hidden="true" style="--wind-angle:${(windDirection + 180) % 360}deg">↑</span>`
        : ''}<span>${speed}</span></span></td>`;
    })
    .join('')}</tr>`;
  const focusedColumn = output.contains(document.activeElement) ? document.activeElement.dataset.precipitationColumn : undefined;
  output.innerHTML = `<table class="precipitation-table">
    <thead><tr><td><button type="button" class="precipitation-detail" data-precipitation-column="0" aria-haspopup="dialog"
      aria-label="${t('Zobrazit detail srážek')}">${t('Srážky')}${icon('right')}</button>${widgetStatus(source)}</td>
      ${entries.map(({ heading, target, date }, index) => `<th scope="col"><button type="button" class="precipitation-detail"
        data-precipitation-column="${index + 1}" ${date == null ? '' : `data-date="${date}"`} aria-haspopup="dialog"
        title="${date == null ? target : `${forecastDate.format(date)} · ${target}`}">${heading}</button></th>`).join('')}</tr></thead>
    <tbody>${rows
      .map(
        ([name, key, unit, decimals, hint]) =>
          `<tr><th scope="row" title="${t(hint)}">${t(name)}</th>${entries
            .map((entry) => {
              const value = entry[key];
              const valid = Number.isFinite(value) && value >= 0 && (key !== 'probability' || value <= 100);
              const fill = valid ? (key === 'probability' ? Math.round(value) : value > 0 ? 100 : 0) : 0;
              const kind =
                key !== 'probability'
                  ? key
                  : entry.snow > 0 && entry.rain > 0
                    ? 'mixed'
                    : entry.snow > 0
                      ? 'snow'
                      : entry.rain > 0
                        ? 'rain'
                        : 'unknown';
              return `<td class="${key}"><span class="precipitation-value" data-kind="${kind}" data-filled="${fill > 0}" style="--fill:${fill}%">${label(valid ? value : null, unit, decimals)}</span></td>`;
            })
            .join('')}</tr>`,
      )
      .join('')}${windRow}</tbody>
  </table>`;
  fadeChanged(output, output.textContent + entries.map(({ wind, windDirection }) => wind > 0 ? windDirection : '').join(','));
  if (focusedColumn != null) output.querySelector(`[data-precipitation-column="${focusedColumn}"]`)?.focus({ preventScroll: true });
}

byId('precipitation').addEventListener('click', (event) => {
  const column = event.target.closest('td, th')?.cellIndex ?? 0;
  const trigger = `#precipitation [data-precipitation-column="${column}"]`;
  const button = document.querySelector(trigger);
  openWeatherDay(button ? trigger : '#outdoor .today-forecast', button?.dataset.date ? Number(button.dataset.date) : undefined);
});

let radarFrames = [];
let radarIndex = 0;
let radarTimer;
const radarSlider = byId('radar-slider');
const radarPlay = byId('radar-play');
const radarImage = byId('radar-image');
let radarLiveIndex = 0;
let radarReady = false;

function setupRadarMap(open) {
  const map = byId('radar-map');
  const image = byId('map-image');
  const zoomIn = byId('radar-zoom-in');
  const zoomOut = byId('radar-zoom-out');
  const storageKey = 'panel-radar-view';
  const minZoom = 1;
  const maxZoom = 8;
  const zoomStep = 1.35;
  const aspect = 680 / 460;
  const pointers = new Map();
  const defaultView = { x: 0.5, y: 0.5, zoom: minZoom };
  let home = defaultView;
  let saved;
  let dragging = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (value && [value.x, value.y, value.zoom].every(Number.isFinite)) {
      saved = { x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1), zoom: clamp(value.zoom, minZoom, maxZoom) };
    }
  } catch {}

  const currentView = () => saved ?? home;

  function geometry({ x, y, zoom }) {
    const width = map.clientWidth;
    const height = map.clientHeight;
    const imageWidth = width * zoom;
    const imageHeight = imageWidth / aspect;
    const insetX = Math.min(0.5, width / (2 * imageWidth));
    const insetY = Math.min(0.5, height / (2 * imageHeight));
    return { x: clamp(x, insetX, 1 - insetX), y: clamp(y, insetY, 1 - insetY), width, height, imageWidth, imageHeight };
  }

  function renderView() {
    if (!map.clientWidth || !map.clientHeight) return;
    const view = currentView();
    const { x, y, width, height, imageWidth, imageHeight } = geometry(view);
    image.style.transform = `translate(${width / 2 - x * imageWidth}px, ${height / 2 - y * imageHeight}px) scale(${view.zoom})`;
    image.style.setProperty('--radar-zoom', view.zoom);
    zoomIn.disabled = view.zoom >= maxZoom;
    zoomOut.disabled = view.zoom <= minZoom;
  }

  function persist() {
    try {
      if (saved) localStorage.setItem(storageKey, JSON.stringify(saved));
      else localStorage.removeItem(storageKey);
    } catch {}
  }

  function moveView(factor, from, to = from) {
    const view = currentView();
    const { x, y, width, height, imageWidth, imageHeight } = geometry(view);
    const zoom = clamp(view.zoom * factor, minZoom, maxZoom);
    const ratio = zoom / view.zoom;
    const center = { x: width / 2, y: height / 2 };
    from ??= center;
    to ??= from;
    const next = geometry({
      x: x + (from.x - center.x - (to.x - center.x) / ratio) / imageWidth,
      y: y + (from.y - center.y - (to.y - center.y) / ratio) / imageHeight,
      zoom,
    });
    saved = { x: next.x, y: next.y, zoom };
    renderView();
  }

  const reset = () => {
    saved = radarDialog.open ? { ...home } : undefined;
    renderView();
    persist();
  };
  const zoom = (factor) => {
    moveView(factor);
    persist();
  };
  zoomIn.addEventListener('click', () => zoom(zoomStep));
  zoomOut.addEventListener('click', () => zoom(1 / zoomStep));
  byId('radar-center').addEventListener('click', reset);
  map.addEventListener('keydown', (event) => {
    if (event.target !== map) return;
    const offsets = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    if (event.key === '+' || event.key === '=') zoom(zoomStep);
    else if (event.key === '-') zoom(1 / zoomStep);
    else if (event.key === 'Home') reset();
    else if (Object.hasOwn(offsets, event.key)) {
      const [x, y] = offsets[event.key];
      moveView(1, { x: 0, y: 0 }, { x, y });
      persist();
    } else return;
    event.preventDefault();
  });

  function position(event) {
    const box = map.getBoundingClientRect();
    return { x: event.clientX - box.left - map.clientLeft, y: event.clientY - box.top - map.clientTop };
  }

  map.addEventListener('wheel', (event) => {
    if (!event.deltaY) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? map.clientHeight : 1);
    moveView(Math.exp(clamp(-delta * 0.002, -1, 1)), position(event));
    persist();
  }, { passive: false });

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  map.addEventListener('pointerdown', (event) => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || event.target.closest('button') || pointers.size >= 2) return;
    if (!pointers.size) dragging = false;
    pointers.set(event.pointerId, position(event));
    if (pointers.size === 2) dragging = true;
  });
  map.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = position(event);
    if (!dragging && distance(previous, next) < 6) return;
    if (!map.hasPointerCapture(event.pointerId)) map.setPointerCapture(event.pointerId);
    dragging = true;
    map.dataset.dragging = '';
    pointers.set(event.pointerId, next);
    const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
    if (other) moveView(distance(next, other) / Math.max(1, distance(previous, other)), midpoint(previous, other), midpoint(next, other));
    else moveView(1, previous, next);
  });
  const endPointer = (event) => {
    if (!pointers.delete(event.pointerId) || pointers.size) return;
    delete map.dataset.dragging;
    if (dragging) persist();
    else if (event.type === 'pointerup' && event.pointerType === 'touch') open();
  };
  for (const type of ['pointerup', 'pointercancel']) map.addEventListener(type, endPointer);
  map.addEventListener('lostpointercapture', (event) => {
    if (event.target === map) endPointer(event);
  });
  map.addEventListener('pointerleave', (event) => {
    if (!map.hasPointerCapture(event.pointerId)) endPointer(event);
  });
  map.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    if (!dragging) open();
  });

  new ResizeObserver(renderView).observe(map);
  renderView();
  return (location) => {
    home = location ? { ...location, zoom: 2.4 } : defaultView;
    renderView();
  };
}

function showRadar(index) {
  const frame = radarFrames[index];
  if (!frame) return;
  radarIndex = index;
  radarSlider.value = index;
  const frameId = frame.id;
  radarImage.hidden = true;
  radarImage.onload = () => {
    if (radarFrames[radarIndex]?.id !== frameId) return;
    radarImage.hidden = false;
    if (!radarDialog.open) {
      const map = byId('radar-map');
      fadeChanged(map, frameId);
    }
  };
  radarImage.onerror = () => {
    if (radarFrames[radarIndex]?.id === frameId) byId('radar-time').textContent = t('Snímek nedostupný');
  };
  radarImage.src = '/api/radar/' + encodeURIComponent(frameId);
  const outdated = Date.now() - Date.parse(radarFrames[radarLiveIndex].time) > 20 * 60_000;
  byId('radar-time').textContent =
    (outdated ? t('Starší') + ' · ' : '') +
    shortTime.format(new Date(frame.time)) +
    (frame.minute ? ' · ' + t('odhad') + ' +' + frame.minute + ' min' : ' · ' + t('měření'));
}

function stopRadar() {
  clearInterval(radarTimer);
  radarTimer = undefined;
  radarPlay.innerHTML = icon('play');
  radarPlay.setAttribute('aria-label', t('Přehrát radar'));
}

function renderRadar() {
  const source = panel?.sources.radar;
  const radar = source?.data;
  const observed = radar?.frames.findLast((frame) => frame.minute === 0);
  byId('radar-status').innerHTML = widgetStatus(source, observed ? Date.parse(observed.time) : source?.at);
  if (!radar?.frames?.length) {
    stopRadar();
    radarFrames = [];
    radarReady = false;
    radarImage.hidden = true;
    byId('radar-marker').hidden = true;
    radarSlider.disabled = radarPlay.disabled = byId('radar-now').disabled = byId('radar-next').disabled = true;
    byId('radar-time').textContent = panel ? t('Radar nedostupný') : t('Načítám radar…');
    return;
  }
  const playWhenReady = radarDialog.open && !radarReady;
  const previous = radarFrames[radarIndex]?.id;
  const wasLatest = !radarReady || radarIndex === radarLiveIndex;
  const changed = radar.frames.map((frame) => frame.id).join() !== radarFrames.map((frame) => frame.id).join();
  radarFrames = radar.frames;
  radarLiveIndex = radarFrames.findLastIndex((frame) => frame.minute === 0);
  radarReady = true;
  const { x, y } = radar.location ?? {};
  const visible = x >= 0 && x <= 1 && y >= 0 && y <= 1;
  const name = t(panel.location || 'Domov');
  byId('radar-marker').hidden = !visible;
  byId('radar-marker').setAttribute('aria-label', name);
  byId('radar-marker').title = name;
  byId('radar-home-name').textContent = name;
  if (visible) {
    byId('radar-marker').style.setProperty('--x', x * 100 + '%');
    byId('radar-marker').style.setProperty('--y', y * 100 + '%');
  }
  setRadarHome(visible ? { x, y } : null);
  radarSlider.max = radarFrames.length - 1;
  radarSlider.disabled = radarPlay.disabled = radarFrames.length < 2;
  byId('radar-now').disabled = false;
  byId('radar-next').disabled = radarLiveIndex >= radarFrames.length - 1;
  if (changed) {
    const preserved = radarFrames.findIndex((frame) => frame.id === previous);
    showRadar(wasLatest || preserved < 0 ? radarLiveIndex : preserved);
  }
  if (playWhenReady) playRadar();
}
function playRadar() {
  if (radarTimer || radarFrames.length < 2) return;
  radarPlay.innerHTML = icon('pause');
  radarPlay.setAttribute('aria-label', t('Zastavit radar'));
  showRadar(0);
  radarTimer = setInterval(() => showRadar((radarIndex + 1) % radarFrames.length), 700);
}
radarPlay.addEventListener('click', () => radarTimer ? stopRadar() : playRadar());
const radarDialog = byId('radar-dialog');
const radarDisplay = byId('radar-display');
const radarParent = radarDisplay.parentElement;
const radarExpand = byId('radar-expand');
function openRadar() {
  if (radarDialog.open) return;
  byId('radar-expanded').append(radarDisplay);
  radarExpand.hidden = true;
  radarDialog.showModal();
  playRadar();
}
radarExpand.addEventListener('click', openRadar);
const setRadarHome = setupRadarMap(openRadar);
byId('radar-close').addEventListener('click', () => radarDialog.close());
radarDialog.addEventListener('close', () => {
  stopRadar();
  radarParent.append(radarDisplay);
  radarExpand.hidden = false;
  radarExpand.focus({ preventScroll: true });
  if (radarLiveIndex >= 0) showRadar(radarLiveIndex);
});
radarSlider.addEventListener('input', () => {
  stopRadar();
  showRadar(Number(radarSlider.value));
});
byId('radar-now').addEventListener('click', () => {
  stopRadar();
  showRadar(radarLiveIndex);
});
byId('radar-next').addEventListener('click', () => {
  stopRadar();
  showRadar(radarLiveIndex + 1);
});

function canRunAction(action, source) {
  return action?.available && (source.state === 'live' || source.state === 'demo') && !connectionFailed && !commandPending;
}

function renderActions() {
  const source = panel?.sources.fibaro;
  byId('fibaro-source').innerHTML = widgetStatus(source);
  const allOff = byId('all-lights-off');
  const allOffAction = source?.data?.find(({ key }) => key === 'all-off');
  allOff.hidden = !allOffAction;
  allOff.disabled = !canRunAction(allOffAction, source);
  const lampScenes = ['lamps-on', 'lamps-off'].map((key) => source?.data?.find((action) => action.key === key));
  const ledsOn = source?.state === 'demo' ? demoLamp : panel?.ledGroupOn === true;
  const ledScene = lampScenes.every(Boolean) ? lampScenes[Number(ledsOn)] : null;
  const ledLabel = t(ledsOn ? 'Vypnout LED' : 'Zapnout LED');
  const ledIcon = icon(ledsOn ? 'bulb' : 'bulb-off');
  const ledToggle = byId('led-lights-toggle');
  ledToggle.hidden = !ledScene;
  ledToggle.disabled = !canRunAction(ledScene, source);
  if (ledScene) {
    ledToggle.dataset.action = ledScene.key;
    byId('led-lights-icon').innerHTML = ledIcon;
    byId('led-lights-label').textContent = ledLabel;
  }
  for (const button of nightActions.querySelectorAll('[data-action]')) {
    const action = source?.data?.find(({ key }) => key === button.dataset.action);
    button.disabled = !canRunAction(action, source);
    if (action?.type === 'light') {
      button.setAttribute('aria-pressed', String(source.state === 'demo' ? demoLamp : Boolean(action.on)));
    } else {
      button.removeAttribute('aria-pressed');
    }
  }
  if (!source?.data?.length) {
    const message =
      source?.state === 'live'
        ? t('Přidejte vybraná světla nebo scény v panel.json.')
        : source
          ? statusText[source.state]
          : t('Načítám světla…');
    renderWidget(byId('light-actions'), empty(message));
    return;
  }
  byId('light-actions').innerHTML = source.data
    .filter(({ key }) => key !== 'lamp' && key !== 'all-off' && (!ledScene || key !== 'lamps-off'))
    .map((action) => {
      if (ledScene && action.key === 'lamps-on') {
        const verb = t(ledsOn ? 'Vypnout' : 'Zapnout');
        return `<div class="lamps-actions">
          <span class="lamps-actions-title" data-led-on="${ledsOn}"><span class="action-icon">${ledIcon}</span>LED</span>
          <button type="button" class="lamps-action" data-action="${ledScene.key}" aria-label="${ledLabel}" ${canRunAction(ledScene, source) ? '' : 'disabled'}>${verb}</button>
        </div>`;
      }
      const light = action.type === 'light';
      const on = light && (source.state === 'demo' ? demoLamp : action.on);
      const symbol = light ? 'lamp' : action.key === 'lamps-off' ? 'bulb-off' : 'bulb';
      return `<button type="button" class="action${on ? ' on' : ''}" data-action="${esc(action.key)}"${light ? ' aria-pressed="' + on + '"' : ''}${canRunAction(action, source) ? '' : ' disabled'}>
      <span class="action-icon">${icon(symbol)}</span>
      ${light ? `<span class="action-state">${action.available ? (on ? t('Zapnuto') : t('Vypnuto')) : t('Nedostupné')}</span>` : ''}
      <span>${esc(t(action.name))}</span></button>`;
    })
    .join('');
  fadeChanged(byId('actions'), JSON.stringify([ledsOn, source.data.map(({ key, name, on, available, type }) =>
    [key, name, available, type === 'light' && (source.state === 'demo' ? demoLamp : on)])]));
}

const heatingModeButtons = document.querySelectorAll('[data-heating-mode]');
const heatingRoomSelect = byId('heating-room-select');
const heatingRoomOpen = byId('heating-room-open');

const heatingKey = (room) => String(room.heat?.id ?? room.name);
const heatingRooms = () => panel?.heatingRooms ?? panel?.rooms.filter(({ heat }) => heat) ?? [];
const findHeatingRoom = (key) => heatingRooms().find((room) => heatingKey(room) === key);
const extraRoomIcons = new Map([['Chodba', 'door'], ['Koupelna', 'bath']]);
const heatingRoomIcon = (room) => room.icon ?? extraRoomIcons.get(room.name) ?? 'home';

function renderHeatingRoom() {
  const room = findHeatingRoom(heatingRoomSelect.value);
  const current = byId('heating-room-current');
  const target = byId('heating-room-target');
  current.textContent = label(room?.heat?.temperature, '°C', 1);
  target.textContent = label(room?.heat?.target, '°C', 1);
  current.setAttribute('aria-label', current.title + ' ' + current.textContent);
  target.setAttribute('aria-label', target.title + ' ' + target.textContent);
  heatingRoomOpen.disabled = !room?.heat;
  const action = t(room?.canHeat && !connectionFailed ? 'Nastavit teplotu' : 'Podrobnosti topení');
  heatingRoomOpen.setAttribute('aria-label', `${action} · ${current.textContent} → ${target.textContent}`);
  heatingRoomOpen.title = action;
  fadeChanged(heatingRoomOpen, current.textContent + '|' + target.textContent);
}

heatingRoomSelect.addEventListener('change', renderHeatingRoom);
heatingRoomOpen.addEventListener('click', () => openHeating(findHeatingRoom(heatingRoomSelect.value)));

function renderHeatingMode() {
  const heating = panel?.sources.heating;
  const demo = heating?.state === 'demo';
  const mode = demo ? demoHeatingMode : heating?.mode;
  const canSet = !connectionFailed && !commandPending && (demo || heating?.canSetMode);
  byId('heating-program-open').disabled = connectionFailed || commandPending || !heating?.programAvailable;
  const status = byId('heating-mode-status');
  const boiler = byId('boiler-status');
  const boilerLabel = byId('boiler-label');
  const liveHeating = heating?.state === 'live' && !connectionFailed ? heating : null;
  const demandRooms = liveHeating?.boilerDemandRooms ?? [];
  const boilerState = liveHeating?.boilerOn === true ? 'on'
    : demandRooms.length ? 'demand'
    : liveHeating?.boilerOn === false ? 'off' : 'unknown';
  const boilerText = t({ on: 'Kotel topí', demand: 'Požadavek tepla', off: 'Kotel netopí', unknown: 'Stav kotle neznámý' }[boilerState]);
  const warning = heating && !demo ? widgetStatus(heating) : '';
  boiler.dataset.state = boilerState;
  boiler.title = demandRooms.length ? t('Požadavek tepla') + ' · ' + demandRooms.map(t).join(', ') : boilerText;
  const indicator = warning ? `${warning}<span class="boiler-caption">${t('Nedostupné')}</span>` : esc(boilerText);
  if (boilerLabel.dataset.indicator !== indicator) {
    boilerLabel.innerHTML = indicator;
    boilerLabel.dataset.indicator = indicator;
  }
  fadeChanged(boiler, boilerState + indicator);
  status.textContent = demo ? t('Ukázka') : warning || heating?.state !== 'live' ? ''
    : { hg: t('Nezámrzný režim'), off: t('Vypnuto') }[mode] ?? '';
  heatingModeButtons.forEach((button) => {
    const active = button.dataset.heatingMode === mode;
    button.setAttribute('aria-pressed', String(active));
    button.disabled = !canSet;
  });
  const rooms = heatingRooms();
  const options = Array.from(heatingRoomSelect.options);
  if (options.length !== rooms.length || rooms.some((room, i) =>
    options[i].value !== heatingKey(room) || options[i].text !== t(room.name) || options[i].dataset.icon !== heatingRoomIcon(room),
  )) {
    const selected = heatingRoomSelect.value;
    options.forEach((option) => option.remove());
    heatingRoomSelect.append(...rooms.map((room) => {
      const option = new Option('', heatingKey(room));
      const symbol = heatingRoomIcon(room);
      option.dataset.icon = symbol;
      option.innerHTML = `${icon(symbol, 'heating-room-icon')}<span class="heating-room-name">${esc(t(room.name))}</span>`;
      return option;
    }));
    if (findHeatingRoom(selected)) heatingRoomSelect.value = selected;
  }
  heatingRoomSelect.disabled = !rooms.length;
  renderHeatingRoom();
}

heatingModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    const mode = button.dataset.heatingMode;
    if (panel?.sources.heating.state === 'demo') {
      demoHeatingMode = mode;
      renderHeatingMode();
      toast(t('Ukázka') + ' · ' + button.textContent);
      return;
    }
    sendAction('/api/heating/mode', { mode }, t('Změna režimu topení odeslána'));
  });
});

const hasSolarProduction = ([, power]) => power > 0.005;

function currentSolarChart(chart, today) {
  if (!chart?.points.length) return chart;
  const todayIndex = chart.points.findIndex(([time]) => localDate.format(time) === today);
  if (todayIndex < 0) return chart;

  const todayPoints = chart.points.slice(todayIndex);
  const firstProduction = todayPoints.find(hasSolarProduction);
  if (!firstProduction) return chart;

  const previousProduction = chart.points.slice(0, todayIndex).findLast(hasSolarProduction);
  if (firstProduction[0] - (previousProduction?.[0] ?? chart.start) <= 3 * 3_600_000) return chart;

  return { ...chart, start: todayPoints[0][0], points: todayPoints, todayOnly: true };
}

function drawSolarChart(chart, date) {
  const canvas = byId('solar-plot');
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  const { points } = chart;
  // Bez výroby (noc) víc než hodinu: osa jen přes úsek s výrobou, hodinu před a po.
  const producing = points.filter(hasSolarProduction);
  let { start, end } = chart;
  let zoomed = false;
  if (producing.length) {
    const from = Math.max(start, producing[0][0] - 3_600_000);
    const to = Math.min(end, producing.at(-1)[0] + 3_600_000);
    if (end - start - (to - from) > 3_600_000) {
      [start, end, zoomed] = [from, to, true];
    }
  }
  const visible = points.filter(([time]) => time >= start && time <= end);
  const peak = Math.max(...points.map(([, power]) => power));
  const scale = Math.max(1, Math.ceil(peak));
  const x = (time) => 2 + ((time - start) / (end - start)) * (width - 4);
  const y = (power) => height - 2 - (power / scale) * (height - 6);

  context.strokeStyle = '#385064';
  context.lineWidth = 1;
  context.beginPath();
  for (const fraction of [0, 0.5, 1]) {
    const top = y(scale * fraction);
    context.moveTo(0, top);
    context.lineTo(width, top);
  }
  context.stroke();

  const fill = context.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, '#ffc36a80');
  fill.addColorStop(1, '#ffc36a0a');
  context.fillStyle = fill;
  context.strokeStyle = '#ffc36a';
  context.lineWidth = 3;
  context.lineJoin = 'round';

  let segment = [];
  const drawSegment = () => {
    if (!segment.length) return;
    if (segment.length === 1) {
      const [time, power] = segment[0];
      context.beginPath();
      context.arc(x(time), y(power), 4, 0, Math.PI * 2);
      context.stroke();
      return;
    }
    context.beginPath();
    for (const [time, power] of segment) context.lineTo(x(time), y(power));
    context.stroke();
    context.lineTo(x(segment.at(-1)[0]), y(0));
    context.lineTo(x(segment[0][0]), y(0));
    context.closePath();
    context.fill();
  };
  for (const point of visible) {
    if (segment.length && point[0] - segment.at(-1)[0] > 15 * 60_000) {
      drawSegment();
      segment = [];
    }
    segment.push(point);
  }
  drawSegment();

  byId('solar-scale').textContent = num(scale) + ' kW';
  byId('solar-peak').textContent = 'Max. ' + label(peak, 'kW', 2);
  const chartLabel = date ? t('Výkon fotovoltaiky') + ' ' + date : t(chart.todayOnly
    ? 'Dnešní výkon fotovoltaiky' : 'Výkon fotovoltaiky za posledních 24 hodin');
  canvas.setAttribute('aria-label', chartLabel + '. ' + t('Maximum') + ' ' + label(peak, 'kW', 2));
  byId('solar-hours').innerHTML = [0, 0.25, 0.5, 0.75, 1]
    .map((fraction) => `<span>${date && !zoomed && fraction === 1 ? '24:00' : shortTime.format(start + (end - start) * fraction)}</span>`)
    .join('');
}

const solar = byId('solar');
const solarDate = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const compactSolarDate = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
let solarSelection;

function moveSolarDay(step) {
  const today = Date.parse(localDate.format(Date.now()));
  const selected = solarSelection ? Date.parse(solarSelection.date) : today;
  const time = selected + step * 86_400_000;
  if (time >= today) {
    solarSelection = undefined;
    renderSolar();
    return;
  }
  const date = new Date(time).toISOString().slice(0, 10);
  loadSolarDay(date);
}

async function loadSolarDay(date) {
  const selection = { date, pending: true };
  solarSelection = selection;
  renderSolar();
  try {
    const response = await fetch('/api/goodwe/day?date=' + encodeURIComponent(date), { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error();
    selection.data = await response.json();
  } catch {
    selection.failed = true;
  } finally {
    selection.pending = false;
    if (solarSelection === selection) renderSolar();
  }
}

solar.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-solar]');
  if (!button) return;
  if (button.dataset.solar === 'retry') return loadSolarDay(solarSelection.date);
  moveSolarDay(Number(button.dataset.solar));
});

function renderSolar() {
  const source = panel?.sources.goodwe;
  const data = source?.data;
  const productionDate = data?.productionDate;
  const today = dashboardDate ?? localDate.format(Date.now());
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  const currentDay = !productionDate || productionDate === today;
  const todayProduction = currentDay ? data?.day : null;
  const yesterdayProduction = currentDay ? data?.yesterday : productionDate === yesterday ? data?.day : null;
  const selection = solarSelection;
  const date = selection && solarDate.format(Date.parse(selection.date));
  const chart = selection ? selection.data?.chart : currentSolarChart(data?.chart, today);
  const period = date ?? t(chart?.todayOnly ? 'Dnes' : 'Posledních 24 h');
  const compactPeriod = selection ? compactSolarDate.format(Date.parse(selection.date)) : chart?.todayOnly ? period : '24 h';
  const history = data?.provider === 'SEMS+' || Boolean(selection);
  const measuredAt = data?.measuredAt;
  const delayed = Number.isFinite(measuredAt) && Date.now() - measuredAt > 8 * 60_000;
  const readingLabel = delayed ? `${t('Poslední měření v')} ${contactDate.format(measuredAt)}` : '';
  const warning = delayed ? `<span class="widget-alert" title="${readingLabel}" aria-label="${readingLabel}"><b>!</b> <time datetime="${new Date(measuredAt).toISOString()}">${shortTime.format(measuredAt)}</time></span>`
    : widgetStatus(source, source?.at, data?.offline);
  const power = Number.isFinite(data?.power) ? data.power / 1000 : null;
  const total = selection ? num(selection.data?.production, 1) : num(power, 2);
  const focus = solar.contains(document.activeElement) && document.activeElement.dataset.solar;
  solar.innerHTML = `<div class="service-heading"><span class="service-icon">${icon('bolt')}</span><h2>${t('Fotovoltaika')}</h2>
    ${warning ? `<span class="widget-status">${warning}</span>` : ''}
    ${data ? `<span class="solar-number">${total}<small>${selection ? 'kWh' : 'kW'}</small></span>` : ''}</div>`;
  if (data && (chart?.points.length || history)) {
    solar.insertAdjacentHTML('beforeend', `<div class="solar-chart" aria-busy="${Boolean(selection?.pending)}">
      <div class="solar-chart-heading">
        ${history ? `<div class="solar-nav">
          <button type="button" class="icon-button" data-solar="-1" aria-label="${t('Předchozí den')}">${icon('left')}</button>
          <span title="${period}"><span class="solar-period-full">${period}</span><span class="solar-period-short">${compactPeriod}</span></span>
          <button type="button" class="icon-button" data-solar="1" aria-label="${t('Následující den')}" ${selection ? '' : 'disabled'}>${icon('right')}</button>
        </div>` : `<span>${period}</span>`}
        ${chart?.partial ? `<span class="solar-partial">${t('Částečný záznam')}</span>` : ''}
        <b id="solar-peak"></b>
      </div>
      ${chart?.points.length ? `<div class="solar-chart-plot"><div class="solar-chart-scale"><span id="solar-scale"></span><span>0</span></div>
      <canvas id="solar-plot" width="520" height="136" role="img"></canvas></div>
      <div class="solar-chart-hours" id="solar-hours"></div>` : `<div class="solar-chart-message" role="status">${selection?.pending
        ? t('Načítám historii…') : selection?.failed ? `<button class="secondary" type="button" data-solar="retry">${t('Zkusit znovu')}</button>`
          : t('Pro toto období nejsou data grafu.')}</div>`}
    </div>`);
  }
  if (data) {
    solar.insertAdjacentHTML('beforeend', `<div class="solar-details">
      <div><span>${t('Dnes')}</span><b>${label(todayProduction, 'kWh', 1)}</b></div>
      <div><span>${t('Včera')}</span><b>${label(yesterdayProduction, 'kWh', 1)}</b></div>
    </div>`);
  } else {
    solar.insertAdjacentHTML('beforeend', empty(source ? statusText[source.state] : t('Načítám…')));
  }
  if (data && chart?.points.length) drawSolarChart(chart, date);
  const production = solar.querySelector('.solar-number');
  fadeChanged(solar, production?.textContent ?? warning, production ?? solar);
  if (focus) {
    const button = solar.querySelector(`button[data-solar="${focus}"]:enabled`) ?? solar.querySelector('button[data-solar="-1"]');
    button?.focus({ preventScroll: true });
  }
}

function renderRooms() {
  const rooms = byId('rooms');
  const cards = panel?.rooms.map(roomMarkup) ?? [empty(t('Načítám místnosti…'))];
  const previousCards = widgetValues.get(rooms);
  if (previousCards && cards.length === previousCards.length) {
    cards.forEach((card, index) => {
      if (card === previousCards[index]) return;
      rooms.children[index].outerHTML = card;
      fadeWidget(rooms.children[index]);
    });
  } else rooms.innerHTML = cards.join('');
  widgetValues.set(rooms, cards);
}

function render() {
  const state = connectionFailed ? 'error' : panel?.demo ? 'demo' : 'live';
  byId('connection').dataset.state = state;
  byId('connection').textContent = connectionFailed
    ? t('Bez spojení')
    : panel?.demo
      ? t('Ukázka zařízení')
      : panel
        ? t('Lokální panel')
        : t('Načítám data');
  byId('room-source').innerHTML = widgetStatus(panel?.sources.station);
  renderRooms();
  const power = byId('power-meters');
  const meters = panel?.powerMeters ?? [];
  power.hidden = !meters.length;
  renderWidget(power, meters.map(meterMarkup).join(''));
  renderBatteries();
  if (byId('heat-dialog').open) {
    const room = findHeatingRoom(heatingRoomKey);
    renderHeatingTemperatures(room?.heat);
    byId('heat-adjust').hidden = !room?.canHeat || connectionFailed;
  }
  renderOutdoor();
  renderForecast();
  if (nightDialog.open) renderNight();
  renderDailyForecast();
  renderRadar();
  renderPrecipitation();
  configureVacuum(panel?.vacuum === true);
  renderActions();
  renderHeatingMode();
  renderSolar();
  renderClimateShortcut();
  if (climateDialog.open) renderClimateEco();
}

async function refresh() {
  void loadAirplus();
  void loadCoffee();
  if (inFlight) return inFlight;
  byId('refresh').disabled = true;
  inFlight = (async () => {
    try {
      const response = await fetch('/api/panel', { cache: 'no-store', signal: AbortSignal.timeout(24_000) });
      if (!response.ok) throw new Error();
      const next = await response.json();
      const previousWeather = panel?.sources.weather;
      const weather = next.sources.weather;
      panel = next;
      mergeBatterySamples(next.batteries);
      connectionFailed = false;
      if (dayDialog.open && (weather?.at !== previousWeather?.at || weather?.state !== previousWeather?.state)) renderWeatherDetail();
      byId('data-time').textContent = t('Obnoveno v') + ' ' + shortTime.format(new Date());
    } catch {
      connectionFailed = true;
      byId('data-time').textContent = t('Zobrazeny poslední dostupné údaje');
    } finally {
      byId('refresh').disabled = false;
      render();
      inFlight = null;
    }
  })();
  return inFlight;
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  byId('toast').hidden = true;
  byId('night-toast').hidden = true;
  const node = byId(nightDialog.open ? 'night-toast' : 'toast');
  node.textContent = message;
  node.dataset.error = String(error);
  node.hidden = false;
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 3500);
}

async function sendAction(path, body, success, feedback = toast) {
  if (commandPending) return false;
  commandPending = true;
  renderActions();
  renderHeatingMode();
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(24_000),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    if (success) feedback(success);
    return true;
  } catch (error) {
    feedback(t(error.message || 'Akce se nezdařila'), true);
    return false;
  } finally {
    if (path !== '/api/fibaro/devices' && path !== '/api/sensibo') {
      if (inFlight) await inFlight;
      await refresh();
    }
    commandPending = false;
    renderActions();
    renderHeatingMode();
  }
}

async function runLightAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const source = panel?.sources.fibaro;
  const action = source?.data?.find(({ key }) => key === button.dataset.action);
  if (!canRunAction(action, source)) return;
  const inLightsDialog = devicesDialog.contains(button);
  const feedback = inLightsDialog ? setDevicesStatus : toast;
  if (source.state === 'demo') {
    if (action.type === 'light') demoLamp = !demoLamp;
    if (action.key === 'lamps-on') demoLamp = true;
    if (action.key.endsWith('off')) demoLamp = false;
    renderActions();
    return feedback(t('Ukázka') + ' · ' + t(action.name));
  }
  const sent = await sendAction('/api/fibaro', { key: action.key, on: !action.on }, t('Odesláno') + ' · ' + t(action.name), feedback);
  if (inLightsDialog && sent && devicesDialog.open) await loadDevices(false);
}

byId('actions').addEventListener('click', runLightAction);
nightActions.addEventListener('click', runLightAction);

const devicesDialog = byId('devices-dialog');
devicesDialog.querySelector('.devices-scenes').addEventListener('click', runLightAction);
const devicesList = byId('devices-list');
const devicesRefresh = byId('devices-refresh');
const devicesStatus = byId('devices-status');
const rgbDialog = byId('device-rgb-dialog');
const rgbForm = byId('device-rgb-form');
const rgbBrightness = byId('device-rgb-brightness');
const rgbApply = byId('device-rgb-apply');
const rgbStatus = byId('device-rgb-status');
const rgbCurrent = byId('device-rgb-current');
let rgbId;
const deviceOrder = new Intl.Collator(locale);
const lightOrder = new Map([['Světlo', -1], ['LED', 1]]);
const roomIconName = (name) => panel?.rooms?.find((room) => room.name === name)?.icon;
const deviceMeterOrder = ['home', 'snow', 'display', 'heat'];
let devicesLoad;
let deviceChange;
let devicesData;
let washerData;
let washerLoad;
let washerPowerLoad;
const washerDialog = byId('washer-dialog');
const washerShortcut = byId('washer-open');
const washerNotifications = byId('washer-notifications');
const washerNoticeKey = 'washer-last-completion';
let washerNoticeAt = 0;
try { washerNoticeAt = Number(localStorage.getItem(washerNoticeKey)) || 0; } catch {}
const washerModes = { 0: 'Odpojena', 1: 'Připravena', 2: 'Pere', 3: 'Pozastaveno', 4: 'Naplánováno',
  5: 'Naplánováno', 6: 'Chyba', 7: 'Dopráno', 9: 'Dokončuje' };
const washerPhases = { 1: 'Praní', 2: 'Praní', 3: 'Odstřeďování', 4: 'Máchání', 5: 'Máchání', 6: 'Máchání',
  7: 'Sušení', 8: 'Sušení', 11: 'Odstřeďování', 14: 'Praní', 15: 'Praní', 16: 'Praní', 17: 'Máchání', 18: 'Máchání', 25: 'Praní', 27: 'Praní' };

function lightIsOn(device) {
  return Boolean(device.online) && (deviceChange?.id === device.id ? deviceChange.on : device.on) === true;
}

function lightRow(device, room) {
  const name = esc(t(device.name));
  const changing = deviceChange?.id === device.id;
  const checked = changing ? deviceChange.on : device.on;
  const state = changing ? t(checked ? 'Zapínám…' : 'Vypínám…')
    : !device.online ? t('Nedostupné') : device.on == null ? t('Stav neznámý')
    : t(device.on ? 'Svítí' : 'Nesvítí');
  const disabled = !changing && (devicesData.state !== 'live' || !device.online || device.on == null || Boolean(deviceChange));
  const roomLabel = esc(t(room || 'Bez místnosti'));
  const toggle = `<button class="device-row" type="button" role="switch" data-device="${device.id}"
    aria-label="${name} · ${roomLabel}" aria-checked="${checked === true}"${changing ? ' aria-busy="true"' : ''}${disabled ? ' disabled' : ''}>
    <span class="device-name">${name}<small>${esc(state)}</small></span>
    <span class="device-switch" aria-hidden="true"></span></button>`;
  if (!device.rgb) return toggle;
  return `<div class="device-rgb-row">${toggle}<button class="device-rgb-open" type="button" data-rgb-device="${device.id}"
    aria-haspopup="dialog" aria-label="RGB · ${roomLabel}" title="RGB · ${roomLabel}"${disabled || changing ? ' disabled' : ''}>
    <span class="device-rgb-swatch" aria-hidden="true"></span><span class="device-rgb-caption">RGB</span>
  </button></div>`;
}

function lightRoom([room, devices]) {
  const lit = devices.some(lightIsOn);
  const name = esc(t(room || 'Bez místnosti'));
  const rank = ({ name }) => lightOrder.get(name) ?? 0;
  devices.sort((a, b) => rank(a) - rank(b) || deviceOrder.compare(t(a.name), t(b.name)));
  return `<section class="device-group" data-lit="${lit}">
    <h3><span class="devices-icon">${icon(roomIconName(room) || 'bulb')}</span>${name}</h3>
    ${devices.map((device) => lightRow(device, room)).join('')}
  </section>`;
}

const recentWash = (at) => Number.isFinite(at) && at <= Date.now() && Date.now() - at < 2 * 60 * 60_000;

function washerView() {
  if (!washerData || washerData.state === 'off') return null;
  const data = washerData.data;
  if (data?.reauth) return { status: t('Přihlásit hOn') };
  if (washerData.state !== 'live' || !data) return { status: t('Nedostupné') };
  const mode = Number(data.machMode);
  const connected = data.connected !== false;
  const active = connected && [2, 3, 9].includes(mode);
  const finished = connected && (mode === 7 || (mode === 1 && recentWash(data.completedAt)));
  const phase = mode === 2 ? washerPhases[Number(data.prPhase)] : null;
  const status = t(finished ? 'Dopráno' : !connected ? 'Odpojena' : phase || washerModes[mode] || 'Stav neznámý');
  const remaining = Number(data.remainingTimeMM);
  const countdown = active && Number.isSafeInteger(remaining) && remaining > 0 ? `${remaining} ${t('min')}` : '';
  const description = [data.programName, String(data.doorLockStatus) === '1' ? t('Dvířka zamčená') : null]
    .filter(Boolean).join(' · ');
  return { status, countdown, description, active, finished };
}

function washerDetail() {
  const view = washerView();
  if (!view) return '';
  const title = [view.status, view.countdown, view.description].filter(Boolean).join(' · ');
  return `<span class="washer-state" title="${esc(title)}"><span class="washer-phase">${esc(view.status)}</span>${view.countdown ? `<span class="washer-time"> · ${esc(view.countdown)}</span>` : ''}</span>`;
}

function deviceMeter(device) {
  const reading = device.reading && label(device.reading.value, device.reading.unit, 1);
  const detail = reading || (!device.online ? t('Nedostupné')
    : device.on != null ? t(device.on ? 'Zapnuto' : 'Vypnuto') : t('Pouze čtení'));
  return `<div class="device-meter"${device.icon === 'home' ? ' data-total="true"' : ''}>
    <dt><span class="devices-icon">${icon(device.icon)}</span>${esc(t(device.name))}</dt><dd>${esc(detail)}${device.icon === 'washer' ? washerDetail() : ''}</dd>
  </div>`;
}

function deviceMeters(devices) {
  if (!devices.length) return '';
  const rank = (device) => {
    const index = deviceMeterOrder.indexOf(device.icon);
    return index < 0 ? deviceMeterOrder.length : index;
  };
  const readings = devices.sort((a, b) => rank(a) - rank(b)).map(deviceMeter);
  return `<section class="device-meters" aria-label="${t('Příkon zařízení')}">
    <dl>${readings.join('')}</dl>
  </section>`;
}

function renderDevices() {
  const focused = devicesList.contains(document.activeElement) ? document.activeElement.dataset : {};
  const groups = new Map();
  const meters = [];
  for (const device of devicesData?.data ?? []) {
    if (!device.switchable) {
      meters.push(device);
      continue;
    }
    const name = device.room || '';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(device);
  }
  const rooms = [...groups].sort(([a], [b]) => Number(!a) - Number(!b) || deviceOrder.compare(t(a), t(b)));
  devicesList.innerHTML = (rooms.length ? `<div class="lights-rooms">${rooms.map(lightRoom).join('')}</div>` : '') +
    deviceMeters(meters);
  const focusSelector = focused.rgbDevice ? `[data-rgb-device="${focused.rgbDevice}"]`
    : focused.device ? `[data-device="${focused.device}"]` : null;
  if (focusSelector) devicesList.querySelector(`${focusSelector}:enabled`)?.focus({ preventScroll: true });
  devicesRefresh.disabled = Boolean(devicesLoad || deviceChange);
}

function setDevicesStatus(message, error = false) {
  devicesStatus.textContent = message;
  devicesStatus.dataset.error = String(error);
}

function renderWasher() {
  const view = washerView();
  washerShortcut.hidden = !view;
  washerShortcut.dataset.cycle = view?.finished ? 'done' : view?.active ? 'active' : '';
  const summary = [view?.status, view?.countdown].filter(Boolean).join(' · ');
  byId('washer-shortcut-status').textContent = summary;
  byId('washer-summary').textContent = summary || t('Nedostupné');
  const readings = byId('washer-readings');
  const data = washerData?.state === 'live' && !washerData.data?.reauth ? washerData.data : null;
  const entries = [];
  if (data) {
    const addReading = (name, raw, unit) => {
      if (raw == null || raw === '' || typeof raw === 'boolean') return;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) entries.push([t(name), unit ? label(value, unit) : num(value, 0)]);
    };
    if (data.programName) entries.push([t('Prací program'), data.programName]);
    addReading('Teplota', data.temp, '°C');
    addReading('Otáčky', data.spinSpeed, t('ot/min'));
    const door = String(data.doorStatus);
    const lock = String(data.doorLockStatus);
    if (door === '1' || door === '0' || lock === '1') {
      entries.push([t('Dvířka'), t(door === '1' ? 'Otevřená' : lock === '1' ? 'Zamčená' : 'Zavřená')]);
    }
    if (view?.active || String(data.machMode) === '7') addReading('Voda za cyklus', data.currentWaterUsed, 'l');
    addReading('Počítadlo cyklů', data.totalWashCycle);
    addReading('Voda celkem', data.totalWaterUsed, 'l');
  }
  readings.hidden = !entries.length;
  readings.innerHTML = entries.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('');
  const last = byId('washer-last');
  const completedAt = washerData?.data?.completedAt;
  last.hidden = !Number.isFinite(completedAt);
  if (!last.hidden) last.textContent = t('Poslední dokončení') + ' · ' + new Date(completedAt).toLocaleString(locale, {
    timeZone: 'Europe/Prague', dateStyle: 'short', timeStyle: 'short',
  });
  washerNotifications.hidden = !('Notification' in window && 'serviceWorker' in navigator) || Notification.permission !== 'default';
}

async function loadWasherPower() {
  if (washerPowerLoad) return;
  const request = new AbortController();
  washerPowerLoad = request;
  let data;
  try {
    const response = await fetch('/api/washer/power', { cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) });
    if (response.ok) data = await response.json();
  } catch {}
  if (washerPowerLoad !== request) return;
  washerPowerLoad = null;
  byId('washer-power-now').textContent = label(data?.power, 'W', 1);
  byId('washer-energy-today').textContent = label(data?.consumption, 'kWh', 2);
}

async function notifyWasher() {
  const completedAt = washerData?.data?.completedAt;
  if (!recentWash(completedAt) || washerView()?.active) return;
  try { washerNoticeAt = Math.max(washerNoticeAt, Number(localStorage.getItem(washerNoticeKey)) || 0); } catch {}
  if (completedAt <= washerNoticeAt) return;
  if (document.hidden && !(window.Notification?.permission === 'granted' && 'serviceWorker' in navigator)) return;
  washerNoticeAt = completedAt;
  try { localStorage.setItem(washerNoticeKey, String(completedAt)); } catch {}
  if (!document.hidden) toast(t('Pračka doprala.'));
  else {
    try {
      const worker = await navigator.serviceWorker.getRegistration();
      await worker?.showNotification(t('Pračka doprala.'), { tag: 'washer-done', icon: '/icon-192.png' });
    } catch {}
  }
}

async function loadWasher() {
  if (washerLoad) return;
  const request = new AbortController();
  washerLoad = request;
  let result;
  try {
    const response = await fetch('/api/washer', { cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch {
    result = { state: 'error' };
  }
  if (washerLoad !== request) return;
  washerLoad = null;
  washerData = result;
  renderWasher();
  void notifyWasher();
  if (devicesDialog.open && !devicesLoad && devicesData) renderDevices();
}

async function loadDevices(showLoading = true) {
  devicesLoad?.abort();
  if (!devicesDialog.open) return;
  const request = new AbortController();
  devicesLoad = request;
  void loadWasher();
  devicesRefresh.disabled = true;
  if (showLoading) setDevicesStatus(t('Načítám zařízení…'));
  try {
    const response = await fetch('/api/fibaro/devices', { cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (request.signal.aborted) return;
    devicesData = result;
    const message = result.state !== 'live' ? statusText[result.state] : !result.data.length ? t('Fibaro nevrátilo žádná zařízení.') : '';
    if (showLoading || message || devicesStatus.dataset.source === 'true') {
      setDevicesStatus(message, result.state === 'error');
      devicesStatus.dataset.source = String(Boolean(message));
    }
  } catch {
    if (request.signal.aborted) return;
    if (devicesData) devicesData = { ...devicesData, state: 'stale' };
    setDevicesStatus(t('Zařízení se nepodařilo načíst.'), true);
    devicesStatus.dataset.source = 'true';
  } finally {
    if (devicesLoad === request) {
      devicesLoad = null;
      if (devicesDialog.open) renderDevices();
    }
  }
}

byId('devices-open').addEventListener('click', () => {
  devicesData = null;
  devicesList.replaceChildren();
  devicesDialog.showModal();
  loadDevices();
});
byId('devices-close').addEventListener('click', () => devicesDialog.close());
devicesDialog.addEventListener('close', () => {
  if (devicesDialog.open) return;
  devicesLoad?.abort();
});
washerShortcut.addEventListener('click', () => {
  washerDialog.showModal();
  renderWasher();
  void loadWasher();
  void loadWasherPower();
});
byId('washer-close').addEventListener('click', () => washerDialog.close());
washerDialog.addEventListener('close', () => {
  if (washerDialog.open) return;
  washerPowerLoad?.abort();
  washerPowerLoad = null;
});
washerNotifications.addEventListener('click', async () => {
  try { await Notification.requestPermission(); } catch {}
  renderWasher();
});
devicesRefresh.addEventListener('click', () => loadDevices());
byId('device-rgb-close').addEventListener('click', () => rgbDialog.close());
rgbDialog.addEventListener('close', () => {
  devicesList.querySelector(`[data-rgb-device="${rgbId}"]:enabled`)?.focus({ preventScroll: true });
});
rgbForm.addEventListener('input', () => {
  byId('device-rgb-level').textContent = label(rgbBrightness.valueAsNumber, '%');
  rgbApply.disabled = commandPending || !rgbForm.elements.color.value;
  if (!commandPending) rgbStatus.textContent = '';
});
rgbForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (commandPending || rgbApply.disabled) return;
  const body = { id: rgbId, color: rgbForm.elements.color.value, brightness: rgbBrightness.valueAsNumber };
  rgbApply.disabled = true;
  rgbStatus.dataset.error = 'false';
  rgbStatus.textContent = t('Nastavuji…');
  await sendAction('/api/fibaro/devices', body, t('Barva a jas nastaveny.'), (message, error) => {
    rgbStatus.textContent = message;
    rgbStatus.dataset.error = String(Boolean(error));
  });
  rgbApply.disabled = false;
  await loadDevices(false);
  refresh();
});
devicesList.addEventListener('click', async (event) => {
  const rgbButton = event.target.closest('[data-rgb-device]');
  if (rgbButton) {
    if (commandPending || deviceChange || devicesData?.state !== 'live') return;
    const device = devicesData.data.find(({ id }) => id === Number(rgbButton.dataset.rgbDevice));
    if (!device?.rgb || !device.online) return;
    rgbId = device.id;
    rgbForm.reset();
    const color = device.rgbColor;
    rgbCurrent.hidden = !color || Boolean(color.preset);
    if (!rgbCurrent.hidden) {
      const channels = color.channels.slice(0, 3).map((channel) => Math.min(255, Math.round(channel + color.channels[3])));
      rgbCurrent.style.setProperty('--led-color', `rgb(${channels.join(' ')})`);
    }
    rgbForm.elements.color.value = color?.preset ?? (color ? 'current' : '');
    rgbApply.disabled = !rgbForm.elements.color.value;
    byId('device-rgb-level').textContent = label(rgbBrightness.valueAsNumber, '%');
    byId('device-rgb-title').textContent = t(device.room || 'Bez místnosti') + ' · ' + t(device.name);
    rgbStatus.textContent = '';
    rgbDialog.showModal();
    return;
  }
  const button = event.target.closest('button[data-device]');
  if (!button || button.disabled) return;
  const id = Number(button.dataset.device);
  if (deviceChange) {
    if (deviceChange.id === id) {
      deviceChange.on = !deviceChange.on;
      renderDevices();
    }
    return;
  }
  if (commandPending || devicesData?.state !== 'live') return;
  const device = devicesData.data.find((entry) => entry.id === id);
  if (!device?.switchable || !device.online || device.on == null) return;
  devicesLoad?.abort();
  const change = { id, on: !device.on };
  deviceChange = change;
  setDevicesStatus('');
  renderDevices();
  let sent;
  do {
    sent = change.on;
    const confirmed = await sendAction('/api/fibaro/devices', { id, on: sent }, '', (message, error) => {
      if (change.on !== sent) return;
      setDevicesStatus(message, error);
      devicesStatus.dataset.source = 'false';
    });
    const latest = devicesData?.data?.find((entry) => entry.id === id);
    if (confirmed && latest) latest.on = sent;
  } while (change.on !== sent);
  deviceChange = null;
  await loadDevices(false);
  refresh();
  if (devicesDialog.open && (document.activeElement === devicesDialog || document.activeElement === document.body)) {
    devicesList.querySelector(`button[data-device="${id}"]:enabled`)?.focus({ preventScroll: true });
  }
});

const climateDialog = byId('climate-dialog');
const climateControls = byId('climate-controls');
const climateStatus = byId('climate-status');
const ecoToggle = byId('climate-eco-toggle');
const ecoStatus = byId('climate-eco-status');
const ecoStatsDialog = byId('climate-eco-dialog');
const ecoStatsOpen = byId('climate-eco-stats-open');
let climateState;
let climateLoading = false;
let climateChanging = false;
let ecoState;
let ecoLoading = false;
let ecoSaving = false;
let ecoError = '';
const fanLabels = { auto: 'Automaticky', quiet: 'Tichý', low: 'Nízký', medium: 'Střední', high: 'Vysoký', strong: 'Maximální' };
const climateModeIcons = { cool: 'snow', heat: 'sun', dry: 'drop', fan: 'air' };

function renderClimate() {
  const data = climateState?.data;
  if (!data) {
    climateControls.replaceChildren();
    return;
  }
  const roomName = data.name === 'Aircon' ? t('Obývák') : data.name;
  const disabled = climateState.state !== 'live' || !data.online || climateChanging;
  const attributes = disabled ? ' disabled' : '';
  const modes = data.modes.filter(([mode]) => Object.hasOwn(climateModeIcons, mode));
  const temperatures = data.temperatures.toSorted((a, b) => a - b);
  const target = data.temperature ?? temperatures[0];
  const higher = temperatures.find((value) => value > target);
  const lower = temperatures.findLast((value) => value < target);
  const focused = climateControls.contains(document.activeElement) ? document.activeElement : null;
  climateControls.innerHTML = `<div class="climate-power"><div class="climate-room">${roomName ? `<b>${esc(roomName)}</b>` : ''}
    <span data-on="${data.online && data.on}">${t(data.online ? data.on ? 'Zapnuto' : 'Vypnuto' : 'Nedostupné')}</span></div>
    ${Number.isFinite(data.measured) ? `<div class="climate-measurement"><span>${t('Teplota místnosti')}</span><b>${label(data.measured, '°C', 1)}</b></div>` : ''}
    <button type="button" class="device-row climate-toggle" role="switch" data-climate="on" aria-label="${t('Klimatizace')}"
      aria-checked="${data.on}"${attributes}><span class="device-switch" aria-hidden="true"></span></button></div>
    <div class="climate-tuning">
      ${modes.length ? `<div class="climate-modes" role="group" aria-label="${t('Režim')}">
      ${modes.map(([value, name]) => `<button type="button" data-climate="mode" value="${esc(value)}"
        aria-pressed="${value === data.mode}"${attributes}>${icon(climateModeIcons[value])}
        <span>${esc(t(name))}</span></button>`).join('')}
      </div>` : ''}
      ${temperatures.length ? `<div class="climate-target" data-mode="${esc(data.mode)}" role="group" aria-labelledby="climate-target-label">
        <div class="climate-target-reading">
          <span id="climate-target-label">${t('Požadovaná teplota')}</span>
          <output>${num(target)}<small>°${esc(data.unit)}</small></output>
        </div>
        <div class="climate-target-steps">
          <button type="button" data-climate="targetTemperature" data-target="${higher ?? ''}" value="up" aria-label="${t('Zvýšit teplotu')}"${disabled || higher == null ? ' disabled' : ''}>+</button>
          <button type="button" data-climate="targetTemperature" data-target="${lower ?? ''}" value="down" aria-label="${t('Snížit teplotu')}"${disabled || lower == null ? ' disabled' : ''}>−</button>
        </div>
      </div>` : ''}
    </div>
    ${data.fanLevels.length ? `<label class="climate-fan">${icon('air')}<span>${t('Ventilátor')}</span>
      <select data-climate="fanLevel"${attributes}>${data.fanLevels.map((level) =>
        `<option value="${esc(level)}"${level === data.fan ? ' selected' : ''}>${esc(t(fanLabels[level] ?? level))}</option>`).join('')}</select></label>` : ''}
    <div class="climate-sync" role="group" aria-label="${t('Ruční oprava stavu')}">
      <span>${t('Ruční oprava stavu')}</span>
      <div>
        <button type="button" data-climate="syncOn" value="false"${attributes}>${t('Je vypnutá')}</button>
        <button type="button" data-climate="syncOn" value="true"${attributes}>${t('Je zapnutá')}</button>
      </div>
    </div>`;
  if (focused?.dataset.climate) {
    const selector = `[data-climate="${focused.dataset.climate}"]:enabled`;
    [...climateControls.querySelectorAll(selector)].find((control) =>
      control.tagName !== 'BUTTON' || control.value === focused.value)?.focus({ preventScroll: true });
  }
}

async function loadClimate() {
  if (!climateDialog.open || climateLoading) return;
  climateLoading = true;
  try {
    const response = await fetch('/api/sensibo', { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error();
    climateState = await response.json();
  } catch {
    climateState = { state: 'error', data: climateState?.data };
  } finally {
    climateLoading = false;
  }
  if (!climateDialog.open) return;
  const { state, data } = climateState;
  climateStatus.textContent = t(state === 'off' ? 'Sensibo zatím není připojené' : state === 'live' && !data
    ? 'V konfiguraci vyberte klimatizaci Sensibo.' : state === 'live' ? '' : state === 'stale' ? 'Starší data' : 'Klimatizace je nedostupná');
  renderClimate();
  climateTimer.updateOptions();
  renderClimateEco();
}

async function changeClimate(input, value) {
  if (climateChanging || climateLoading || commandPending || climateState?.state !== 'live' || !climateState.data?.online) return;
  const property = input.dataset.climate;
  const selected = input.value;
  climateChanging = true;
  climateStatus.textContent = t('Odesílám…');
  renderClimate();
  let errorMessage;
  await sendAction('/api/sensibo', { property, value }, '', (message) => { errorMessage = message; });
  await loadClimate();
  loadClimateEco();
  climateChanging = false;
  if (climateDialog.open) {
    if (errorMessage) climateStatus.textContent = errorMessage;
    renderClimate();
    if (document.activeElement === document.body || document.activeElement === climateDialog) {
      [...climateControls.querySelectorAll(`[data-climate="${property}"]:enabled`)].find((control) =>
        control.tagName !== 'BUTTON' || control.value === selected)?.focus({ preventScroll: true });
    }
  }
}

const ecoLimitFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const ecoLimitLabel = (value) => `${ecoLimitFormat.format(value)} %`;
const ecoMessages = {
  waiting: 'Čeká na dostatečnou výrobu', ready: 'Výroba stačí · ověřuji výdrž',
  low: 'Výroba je pod hranicí', warmup: 'Prvních 30 min',
  running: 'Provoz povolen', timer: 'Pozastaveno časovačem',
  missing: 'Čeká na čerstvá data', mismatch: 'Zkontrolujte stav klimatizace v Sensibo',
  householdMissing: 'Čeká na měření příkonu domu',
  mode: 'Pro Eco zvolte chlazení nebo topení.', error: 'Sensibo nepotvrdilo změnu stavu klimatizace',
};
const ecoMessage = (state) => {
  if (state.constraint === 'household' && ['low', 'waiting'].includes(state.status)) {
    return `${t('Limit příkonu domu')} · ${ecoLimitLabel(state.limits?.householdPercent ?? 60)} FVE`;
  }
  return t(ecoMessages[state.status] ?? 'Eco provoz') +
    (['warmup', 'running'].includes(state.status) && Number.isFinite(state.percent)
      ? ` · ${t('Hranice Eco')} ${state.constraint === 'solar' ? watts(state.threshold) : ecoLimitLabel(state.percent)}` : '');
};

function renderClimateShortcut() {
  const climate = panel?.climate;
  const current = byId('climate-shortcut-now');
  const upcoming = byId('climate-shortcut-next');
  let now = '';
  if (climate?.enabled) {
    now = Number.isFinite(climate.threshold) && ['waiting', 'ready', 'low'].includes(climate.status)
      ? `${t('Eco čeká na')} ${watts(climate.threshold)}` : ecoMessage(climate);
  } else if (typeof climate?.on === 'boolean') now = t(climate.on ? 'Zapnuto' : 'Vypnuto');
  const next = climate?.next;
  const timerStage = climate?.timerStage;
  const ecoStage = climate?.enabled ? 'active' : next?.eco === true ? 'pending' : undefined;
  const timerHint = timerStage ? t(timerStage === 'active' ? 'Řídí časovač' : 'Čeká na plán') : '';
  const ecoHint = ecoStage ? t(ecoStage === 'active' ? 'Eco zapnuto' : 'Eco v příštím kroku') : '';
  for (const [id, stage, hint] of [['climate-shortcut-clock', timerStage, timerHint], ['climate-shortcut-eco', ecoStage, ecoHint]]) {
    const indicator = byId(id);
    indicator.hidden = !stage;
    indicator.dataset.stage = stage ?? '';
    if (hint) indicator.setAttribute('aria-label', hint);
  }
  const scheduled = next ? [shortTime.format(next.at), next.kind === 'stop' ? t('Vypnout') : label(next.temperature, '°' + next.unit),
    next.eco === true ? 'Eco' : next.eco === false ? t('Běžně') : ''].filter(Boolean).join(' · ') : '';
  current.textContent = now;
  current.hidden = !now;
  byId('climate-shortcut-state').hidden = !timerStage && !ecoStage;
  upcoming.textContent = scheduled;
  upcoming.hidden = !scheduled;
  byId('climate-open').title = [now, timerHint, ecoHint, scheduled].filter(Boolean).join('\n');
  fadeChanged(byId('climate-open'), [now, timerHint, ecoHint, scheduled].join('|'), current.closest('.climate-shortcut-body'));
}

function renderClimateEco() {
  const mode = climateState?.data?.mode;
  const eligible = climateState?.state === 'live' && climateState.data?.online && ['cool', 'heat'].includes(mode);
  const solar = panel?.sources.goodwe;
  const meter = panel?.powerMeters?.find(({ id, name }) => ecoState?.meterId ? id === ecoState.meterId : name === 'Klimatizace');
  const household = panel?.powerMeters?.find(({ id }) => id === ecoState?.householdMeterId);
  const latest = (reading, value) => !connectionFailed && reading?.state === 'live' && Number.isFinite(value) ? value : null;
  byId('eco-solar').textContent = watts(latest(solar, solar?.data?.power));
  byId('eco-power').textContent = watts(latest(meter, meter?.power));
  byId('eco-household-meter').hidden = ecoState?.householdMeterId == null;
  byId('eco-household').textContent = watts(latest(household, household?.power));
  byId('eco-threshold').textContent = watts(ecoState?.threshold);
  const active = Boolean(ecoState?.enabled);
  ecoToggle.setAttribute('aria-pressed', String(active));
  byId('climate-eco-toggle-label').textContent = t(active ? 'Eco zapnuto' : 'Eco vypnuto');
  ecoToggle.disabled = ecoSaving || ecoState?.timerControlled || (!active && (!eligible || !ecoState?.available));
  ecoToggle.title = ecoState?.timerControlled ? t('Eco teď určuje časovač.') : '';
  ecoStatus.dataset.state = ecoError ? 'error' : ecoState?.status ?? '';
  const waiting = ['ready', 'low'].includes(ecoState?.status) && ecoState.waitMinutes > 0;
  ecoStatus.textContent = ecoError || (Object.hasOwn(ecoMessages, ecoState?.status) ? ecoMessage(ecoState) + (waiting ? ` · ${ecoState.waitMinutes}/5 min` : '') : '');
  ecoStatsOpen.hidden = !ecoState?.available;
  byId('climate-eco-settings-open').disabled = !ecoState?.limits || ecoSaving;
  if (ecoStatsDialog.open && byId('eco-history').hidden) renderEcoStats();
}

function renderEcoStats() {
  const describe = (stat) => `${watts(stat.watts)}${stat.learned ? '' : ' *'}`;
  const basis = (stat) => stat.range ? `<small>${num(stat.range[0])}–${num(stat.range[1])} °C${stat.demand ?
    ` · ${t('Rozdíl teplot')} ${stat.demand[1] === null ? '≥ ' + num(stat.demand[0]) : num(stat.demand[0]) + '–' + num(stat.demand[1])} °C` : ''}</small>`
    : stat.learned ? `<small>${t('Souhrn všech teplot')}</small>` : '';
  const outside = ecoState.outdoorTemperature;
  byId('climate-eco-stats').innerHTML = `${Number.isFinite(outside) ? `<p class="eco-stats-outdoor">
    <span>${t('Venku')} · Netatmo</span><b>${label(outside, '°C', 1)}</b></p>` : ''}
    ${[['cool', 'Chlazení'], ['heat', 'Topení']].map(([mode, title]) => {
    const stats = ecoState.statistics[mode];
    return `<section data-mode="${mode}"><h3>${icon(climateModeIcons[mode])}${t(title)}</h3><dl>
      <div><dt>${t('Rozběh')}</dt><dd>${describe(stats.warmup)}${basis(stats.warmup)}</dd></div>
      <div><dt>${t('Ustálený provoz')}</dt><dd>${describe(stats.steady)}${basis(stats.steady)}</dd></div>
      <div><dt>${t('Za 30 dní')}</dt><dd>${label(stats.energy, 'kWh', 2)}</dd></div>
      </dl></section>`;
  }).join('')}<small>* ${t('Výchozí odhad')}</small>`;
}

ecoStatsOpen.addEventListener('click', () => {
  selectEcoStats('estimates');
  ecoStatsDialog.showModal();
});
byId('climate-eco-stats-close').addEventListener('click', () => ecoStatsDialog.close());

const ecoStatsTabs = ecoStatsDialog.querySelectorAll('[data-eco-view]');
let ecoHistoryRequest;
async function selectEcoStats(view) {
  const plot = byId('eco-history');
  const estimates = view === 'estimates';
  ecoStatsTabs.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.ecoView === view)));
  byId('climate-eco-stats').hidden = !estimates;
  plot.hidden = estimates;
  ecoHistoryRequest?.abort();
  if (estimates) {
    if (ecoState) renderEcoStats();
    return;
  }
  const weekly = view === 'history';
  const request = new AbortController();
  ecoHistoryRequest = request;
  plot.innerHTML = empty(t('Načítám historii…'));
  try {
    const response = await fetch('/api/sensibo/eco/history' + (weekly ? '/week' : ''), {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(6000)]),
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (request.signal.aborted) return;
    if (weekly) renderEcoWeek(plot, data.runs);
    else renderEcoHistory(plot, data);
  } catch {
    if (!request.signal.aborted) plot.innerHTML = empty(t('Historii se nepodařilo načíst.'));
  }
}

function renderEcoHistory(plot, data) {
  const points = data.points;
  const lines = [['solar', 'Výroba FVE'], ['power', 'Příkon klimatizace'], ['householdPower', 'Příkon domu'], ['threshold', 'Hranice Eco']]
    .filter(([key]) => points.some((point) => Number.isFinite(point[key])));
  if (!lines.length) {
    plot.innerHTML = empty(t('Za posledních 24 hodin ještě nejsou měření Eco.'));
    return;
  }
  const peak = Math.max(1000, Math.ceil(points.reduce((max, point) =>
    Math.max(max, ...lines.map(([key]) => point[key] ?? 0)), 0) / 1000) * 1000);
  const end = Math.min(data.end, points.at(-1).at + 5 * 60_000);
  const start = Math.max(data.start, Math.min(points[0].at - 5 * 60_000, end - 30 * 60_000));
  const x = (at) => 560 * (at - start) / Math.max(1, end - start);
  const y = (value) => 140 - 134 * value / peak;
  const paths = lines.map(([key]) => {
    let previous;
    const path = points.map((point) => {
      const start = !previous || point.at - previous.at > 180_000 || !Number.isFinite(previous[key]);
      previous = point;
      return Number.isFinite(point[key]) ? `${start ? 'M' : 'L'}${x(point.at).toFixed(2)},${y(point[key]).toFixed(2)}` : '';
    }).join(' ');
    const isolated = points.filter((point, index) => Number.isFinite(point[key]) && ![-1, 1].some((offset) => {
      const adjacent = points[index + offset];
      return adjacent && Math.abs(adjacent.at - point.at) <= 180_000 && Number.isFinite(adjacent[key]);
    })).map((point) => `<circle class="eco-line-${key}" cx="${x(point.at)}" cy="${y(point[key])}" r="2.7" />`).join('');
    return `<path class="eco-line-${key}" d="${path}" />${isolated}`;
  }).join('');
  const events = points.filter(({ on }) => typeof on === 'boolean');
  plot.innerHTML = `<div class="eco-chart-legend">${lines.map(([key, name]) => `<span class="eco-line-${key}">${t(name)}</span>`).join('')}</div>
    <div class="eco-chart-plot"><span>${label(peak / 1000, 'kW')}</span><span>0</span>
      <svg viewBox="0 0 560 144" preserveAspectRatio="none" aria-label="${t('Graf Eco')}" role="img">
        <path class="eco-chart-grid" d="M0 6H560 M0 73H560 M0 140H560" />${paths}
        ${events.map(({ at, on }) => `<line class="eco-chart-event" data-on="${on}" x1="${x(at)}" x2="${x(at)}" y1="6" y2="140" />`).join('')}
      </svg></div><div class="eco-chart-times">${[0, 0.25, 0.5, 0.75, 1].map((fraction) =>
        `<time>${shortTime.format(start + fraction * (end - start))}</time>`).join('')}</div>
    <ul class="eco-chart-events">${events.slice(-4).reverse().map(({ at, on, constraint, householdPercent }) =>
      `<li data-on="${on}"><time>${shortTime.format(at)}</time><b>${t(on ? 'Zapnuto' : 'Vypnuto')}</b><span>${t(on ? 'Výroba stačila'
        : constraint === 'household' ? 'Limit příkonu domu' : 'Výroba pod hranicí')}${!on && constraint === 'household'
        ? ` · ${ecoLimitLabel(householdPercent ?? 60)} FVE` : ''}</span></li>`).join('')}</ul>`;
}
const ecoDecisionReasons = {
  household: ['Výroba FVE stačila i při limitu příkonu domu.', 'Výroba FVE už nestačila k dodržení limitu příkonu domu.'],
  climate: ['Výroba FVE pokryla požadavek pro provoz klimatizace.', 'Výroba FVE byla pod hranicí pro provoz klimatizace.'],
  solar: ['Výroba FVE dosáhla nastaveného minima.', 'Výroba FVE byla pod nastaveným minimem.'],
};

function renderEcoWeek(plot, runs) {
  const groups = new Map();
  for (const run of runs.toReversed()) {
    const at = (run.started ?? run.stopped).at;
    const day = localDate.format(at);
    if (!groups.has(day)) groups.set(day, { at, entries: [] });
    groups.get(day).entries.push(run);
  }
  const time = (at, format = shortTime) => `<time datetime="${new Date(at).toISOString()}">${format.format(at)}</time>`;
  const decision = ({ on, constraint, solar, threshold, householdPercent }) => {
    const reason = ecoDecisionReasons[constraint]?.[on ? 0 : 1] ?? (on ? 'Výroba stačila' : 'Výroba pod hranicí');
    const details = [
      Number.isFinite(solar) && `${t('Výroba FVE')} ${watts(solar)}`,
      Number.isFinite(threshold) && `${t('Hranice Eco')} ${watts(threshold)}`,
      constraint === 'household' && Number.isFinite(householdPercent) && `${t('Limit příkonu domu')} ${ecoLimitLabel(householdPercent)} FVE`,
    ].filter(Boolean);
    return `<li data-on="${on}"><b>${t(on ? 'Zapnuto' : 'Vypnuto')}</b> ${t(reason)}
      ${details.length ? `<small>${details.join(' · ')}</small>` : ''}</li>`;
  };
  const duration = (ms) => {
    const minutes = Math.round(ms / 60_000);
    const hours = Math.floor(minutes / 60);
    return [hours && ecoRunHours.format(hours), (minutes % 60 || !hours) && ecoRunMinutes.format(minutes % 60)].filter(Boolean).join(' ');
  };
  plot.innerHTML = `<p class="eco-week-period">${t('Posledních 7 dní · Automatická přepnutí Eco')}</p>` +
    ([...groups.values()].map(({ at, entries }) => `<section class="eco-week-day">
      <h3>${longDate.format(at)}</h3>
      ${entries.map(({ started, stopped }) => `<article class="eco-week-run">
        <div class="eco-week-time">${time((started ?? stopped).at)}${started && stopped
          ? ` – ${time(stopped.at, localDate.format(started.at) === localDate.format(stopped.at) ? shortTime : contactDate)}
            <span>${duration(stopped.at - started.at)}</span>` : ''}</div>
        <ul>${[started, stopped].filter(Boolean).map(decision).join('')}</ul>
        ${started && stopped ? '' : `<small>${t('Délku běhu nelze určit.')}</small>`}
      </article>`).join('')}
    </section>`).join('') || empty(t('Za posledních 7 dní nejsou zaznamenaná žádná přepnutí Eco.')));
}

const ecoRunHours = new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'short' });
const ecoRunMinutes = new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' });
ecoStatsTabs.forEach((button) => button.addEventListener('click', () => selectEcoStats(button.dataset.ecoView)));
ecoStatsDialog.addEventListener('close', () => ecoHistoryRequest?.abort());

async function loadClimateEco() {
  if (!climateDialog.open || ecoLoading || ecoSaving) return;
  ecoLoading = true;
  try {
    const response = await fetch('/api/sensibo/eco', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error();
    const next = await response.json();
    if (!ecoSaving) ecoState = next;
    if (ecoError === t('Eco se nepodařilo načíst.')) ecoError = '';
  } catch {
    if (!ecoState) ecoError = t('Eco se nepodařilo načíst.');
  } finally {
    ecoLoading = false;
    if (climateDialog.open) renderClimateEco();
  }
}

ecoToggle.addEventListener('click', async () => {
  if (ecoSaving || ecoLoading || climateChanging) return;
  ecoSaving = true;
  ecoError = '';
  renderClimateEco();
  try {
    const response = await fetch('/api/sensibo/eco', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !ecoState.enabled }), signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    ecoState = result;
  } catch (error) {
    ecoError = t(error.message || 'Eco se nepodařilo uložit.');
  } finally {
    ecoSaving = false;
    renderClimateEco();
    loadClimateEco();
  }
});

const climateTimer = setupClimateTimer();
const ecoSettingsDialog = byId('climate-eco-settings');
const ecoSettingsForm = byId('climate-eco-settings-form');
const ecoSettingsFields = ecoSettingsForm.elements;
const ecoSettingsStatus = byId('climate-eco-settings-status');
const reciprocalPercent = (value) => value > 0 ? Number((10000 / value).toFixed(2)) : '';

byId('climate-eco-settings-open').addEventListener('click', () => {
  const { climatePercent, householdPercent, minimumSolarW = 2000 } = ecoState.limits;
  const plan = climateTimer.draftPercent();
  ecoSettingsFields.minimumSolarW.value = minimumSolarW;
  ecoSettingsFields.climatePercent.value = climatePercent;
  ecoSettingsFields.climateShare.value = reciprocalPercent(climatePercent);
  ecoSettingsFields.householdPercent.value = householdPercent;
  byId('eco-settings-household').hidden = ecoSettingsFields.householdPercent.disabled = ecoState.householdMeterId == null;
  byId('eco-settings-plan').hidden = ecoSettingsFields.planPercent.disabled = plan === undefined;
  ecoSettingsFields.planPercent.value = plan ?? '';
  ecoSettingsStatus.textContent = '';
  ecoSettingsDialog.showModal();
});
byId('climate-eco-settings-close').addEventListener('click', () => ecoSettingsDialog.close());
ecoSettingsFields.climatePercent.addEventListener('input', () => {
  ecoSettingsFields.climateShare.value = reciprocalPercent(ecoSettingsFields.climatePercent.valueAsNumber);
});
ecoSettingsFields.climateShare.addEventListener('input', () => {
  ecoSettingsFields.climatePercent.value = reciprocalPercent(ecoSettingsFields.climateShare.valueAsNumber);
});
ecoSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (ecoSaving) return;
  const submit = event.submitter ?? ecoSettingsForm.querySelector('[type="submit"]');
  const payload = {
    climatePercent: ecoSettingsFields.climatePercent.valueAsNumber,
    householdPercent: ecoSettingsFields.householdPercent.valueAsNumber,
    minimumSolarW: ecoSettingsFields.minimumSolarW.valueAsNumber,
  };
  const plan = ecoSettingsFields.planPercent.disabled ? undefined : ecoSettingsFields.planPercent.value;
  ecoSaving = submit.disabled = true;
  ecoSettingsStatus.textContent = t('Ukládám…');
  try {
    const response = await fetch('/api/sensibo/eco/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Nastavení Eco se nepodařilo uložit.');
    ecoState = result;
    if (plan !== undefined) climateTimer.setDraftPercent(plan);
    ecoSettingsDialog.close();
  } catch (error) {
    ecoSettingsStatus.textContent = t(error.message || 'Nastavení Eco se nepodařilo uložit.');
  } finally {
    ecoSaving = submit.disabled = false;
    renderClimateEco();
  }
});
byId('climate-open').addEventListener('click', () => {
  climateState = null;
  ecoError = '';
  renderClimate();
  climateStatus.textContent = t('Načítám klimatizaci…');
  climateDialog.showModal();
  loadClimate();
  renderClimateEco();
  loadClimateEco();
  climateTimer.open();
});
byId('climate-close').addEventListener('click', () => climateDialog.close());
climateControls.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-climate]');
  if (button?.dataset.climate === 'on') changeClimate(button, button.getAttribute('aria-checked') !== 'true');
  else if (button?.dataset.climate === 'syncOn') changeClimate(button, button.value === 'true');
  else if (button?.dataset.climate === 'targetTemperature' && button.dataset.target) changeClimate(button, Number(button.dataset.target));
  else if (button?.dataset.climate === 'mode' && (!climateState?.data?.on || button.getAttribute('aria-pressed') === 'false')) {
    changeClimate(button, button.value);
  }
});
climateControls.addEventListener('change', (event) => {
  const input = event.target.closest('select[data-climate]');
  if (input) changeClimate(input, input.value);
});

function setupClimateTimer() {
  const panel = byId('climate-timer');
  const form = byId('climate-timer-form');
  const fields = byId('climate-timer-fields');
  const plan = byId('climate-timer-plan');
  const start = byId('climate-timer-start');
  const cancel = byId('climate-timer-cancel');
  const create = byId('climate-timer-new');
  const status = byId('climate-timer-status');
  const presetsDialog = byId('climate-presets');
  const presetsOpen = byId('climate-presets-open');
  const presetList = byId('climate-preset-list');
  const presetForm = byId('climate-preset-form');
  const presetStatus = byId('climate-preset-status');
  const planEcoSummary = byId('climate-plan-eco-summary');
  const controls = form.elements;
  const endpoint = '/api/sensibo/timer';
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const timerDate = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Prague', dateStyle: 'short' });
  const stepNames = { start: 'Zapnout', temperature: 'Změnit teplotu', stop: 'Vypnout' };
  const stepStatuses = { pending: 'Naplánováno', running: 'Probíhá…', done: 'Hotovo', skipped: 'Vynecháno', failed: 'Chyba' };
  let timer = null;
  let loadRequest;
  let saving = false;
  let draft = true;
  let rememberedDraft;
  let restoreOnLoad;
  let optionsSignature = '';
  let timerEcoAvailable = false;
  let timerLoaded = false;
  let presets = [];
  let savingPreset = false;

  function message(text, error = false) {
    status.textContent = t(text);
    status.dataset.error = String(error);
  }

  function futureTime(after, value) {
    if (!Number.isFinite(after) || !timePattern.test(value)) return NaN;
    const first = (Math.floor(after / 60_000) + 1) * 60_000;
    for (let when = first; when < first + 26 * 3600_000; when += 60_000) {
      if (shortTime.format(when) === value) return when;
    }
    return NaN;
  }

  function showPreview() {
    controls.startTime.hidden = controls.startTime.disabled = controls.now.checked;
    controls.changeTime.disabled = controls.changeTemperature.disabled = !controls.hasChange.checked;
    controls.hasExtraChange.disabled = !controls.hasChange.checked;
    if (controls.hasExtraChange.disabled) controls.hasExtraChange.checked = false;
    controls.extraChangeTime.disabled = controls.extraChangeTemperature.disabled = !controls.hasExtraChange.checked;
    controls.stopTime.disabled = !controls.hasStop.checked;
    const canUseEco = timerEcoAvailable && ['cool', 'heat'].includes(controls.mode.value || climateState?.data?.mode);
    controls.startEco.disabled = !canUseEco && !controls.startEco.checked;
    controls.changeEco.disabled = !controls.hasChange.checked || (!canUseEco && !controls.changeEco.checked);
    controls.extraChangeEco.disabled = !controls.hasExtraChange.checked || (!canUseEco && !controls.extraChangeEco.checked);
    controls.ecoPercent.disabled = fields.disabled || !(controls.startEco.checked ||
      (controls.hasChange.checked && controls.changeEco.checked) || (controls.hasExtraChange.checked && controls.extraChangeEco.checked));
    planEcoSummary.hidden = controls.ecoPercent.disabled || !controls.ecoPercent.value;
    planEcoSummary.textContent = `${t('Minimum FVE')} ${controls.ecoPercent.value} %`;
    const now = Date.now();
    const start = controls.now.checked ? now : futureTime(now, controls.startTime.value);
    const change = controls.hasChange.checked ? futureTime(start, controls.changeTime.value) : start;
    const extraChange = controls.hasExtraChange.checked ? futureTime(change, controls.extraChangeTime.value) : change;
    const stop = controls.hasStop.checked ? futureTime(extraChange, controls.stopTime.value) : NaN;
    const times = { start: controls.now.checked ? NaN : start, change: controls.hasChange.checked ? change : NaN,
      extraChange: controls.hasExtraChange.checked ? extraChange : NaN, stop };
    for (const element of form.querySelectorAll('[data-preview]')) {
      const date = times[element.dataset.preview];
      element.hidden = !Number.isFinite(date);
      if (!element.hidden) {
        element.dateTime = new Date(date).toISOString();
        element.textContent = timerDate.format(date);
      }
    }
  }

  function temperaturesFor(mode) {
    const device = climateState?.data;
    return mode && mode !== device?.mode ? device?.temperaturesByMode?.[mode] ?? [] : device?.temperatures ?? [];
  }

  function updateTemperatures() {
    const device = climateState?.data;
    const values = temperaturesFor(controls.mode.value);
    const signature = JSON.stringify([values, device?.unit, controls.mode.value]);
    if (signature !== optionsSignature) {
      optionsSignature = signature;
      for (const select of [controls.startTemperature, controls.changeTemperature, controls.extraChangeTemperature]) {
        const previous = Number(select.value);
        select.replaceChildren(...values.map((value) => new Option(label(value, '°' + device.unit), value)));
        const preferred = select === controls.changeTemperature && values.includes(24) ? 24 : device?.temperature;
        const selected = values.includes(previous) ? previous : values.includes(preferred) ? preferred : values[0];
        if (selected !== undefined) select.value = selected;
      }
    }
    return values;
  }

  function updateOptions() {
    const device = climateState?.data;
    for (const option of controls.mode.options) if (option.value) option.disabled = !temperaturesFor(option.value).length;
    if (restoreOnLoad && rememberedDraft && device) {
      restoreDraft();
      restoreOnLoad = false;
    }
    const values = updateTemperatures();
    const available = climateState?.state === 'live' && device?.online && values.length;
    fields.disabled = start.disabled = saving || !available;
    controls.mode.disabled = saving || climateState?.state !== 'live' || !device?.online;
    presetsOpen.disabled = !timerLoaded || !draft || controls.mode.disabled;
    if (!saving && !form.hidden && device?.online && !values.length) message('Aktuální režim nemá nastavitelnou teplotu.');
    else if (!saving && status.textContent === t('Aktuální režim nemá nastavitelnou teplotu.')) message('');
    showPreview();
  }

  function restoreDraft(saved = rememberedDraft) {
    if (!saved) return;
    controls.mode.value = saved.mode ?? '';
    controls.ecoPercent.value = saved.ecoPercent ?? '';
    const values = updateTemperatures();
    controls.now.checked = saved.startTime === null;
    if (saved.startTime) controls.startTime.value = saved.startTime;
    controls.hasChange.checked = Boolean(saved.change);
    controls.hasExtraChange.checked = Boolean(saved.extraChange);
    controls.hasStop.checked = Boolean(saved.stopTime);
    controls.startEco.checked = saved.startEco === true;
    controls.changeEco.checked = saved.change?.eco === true;
    controls.extraChangeEco.checked = saved.extraChange?.eco === true;
    if (saved.change) controls.changeTime.value = saved.change.time;
    if (saved.extraChange) controls.extraChangeTime.value = saved.extraChange.time;
    if (saved.stopTime) controls.stopTime.value = saved.stopTime;
    if (saved.unit === climateState?.data?.unit) {
      for (const [select, value] of [[controls.startTemperature, saved.startTemperature],
        [controls.changeTemperature, saved.change?.temperature], [controls.extraChangeTemperature, saved.extraChange?.temperature]]) {
        if (values.includes(value)) select.value = value;
      }
    }
  }

  function render() {
    if (timer?.active) draft = false;
    form.hidden = !draft;
    plan.hidden = draft || !timer;
    cancel.hidden = !timer?.active;
    presetsOpen.hidden = Boolean(timer?.active);
    create.hidden = draft || !timer || timer.active;
    if (!plan.hidden) {
      plan.innerHTML = timer.steps.map((step) => `<li data-status="${step.status}" data-kind="${step.kind}">
        <div class="climate-timer-plan-copy">
          <b>${t(stepNames[step.kind])}</b>
          <div class="climate-timer-plan-meta">${step.temperature == null ? '' : `<strong>${label(step.temperature, '°' + timer.unit)}</strong>`}
            ${step.eco === undefined ? '' : `<span class="climate-timer-mode" data-eco="${step.eco}">${step.eco ? 'Eco' : t('Běžný provoz')}</span>`}
            ${step.eco && Number.isFinite(timer.ecoPercent) ? `<span class="climate-timer-mode" data-eco="true">${timer.ecoPercent} %</span>` : ''}
            <span class="climate-timer-state">${t(stepStatuses[step.status])}</span></div>
        </div>
        <time datetime="${new Date(step.at).toISOString()}"><b>${shortTime.format(step.at)}</b><span>${timerDate.format(step.at)}</span></time>
        ${step.detail ? `<small>${esc(t(step.detail))}</small>` : ''}</li>`).join('');
    }
    updateOptions();
  }

  async function load() {
    if ((loadRequest && !loadRequest.signal.aborted) || saving) return;
    const request = new AbortController();
    loadRequest = request;
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (request.signal.aborted || !climateDialog.open) return;
      timerLoaded = true;
      panel.hidden = !data.enabled;
      timerEcoAvailable = Boolean(data.ecoAvailable);
      timer = data.timer;
      rememberedDraft = data.draft;
      if (!savingPreset) presets = data.presets ?? [];
      if (!timer) draft = true;
      render();
    } catch {
      if (!request.signal.aborted && !panel.hidden) message('Časovač se nepodařilo načíst.', true);
    } finally {
      if (loadRequest === request) loadRequest = undefined;
    }
  }

  async function submit(body) {
    if (saving) return;
    loadRequest?.abort();
    saving = true;
    cancel.disabled = true;
    updateOptions();
    message('Ukládám časovač…');
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      timer = data.timer;
      rememberedDraft = data.draft;
      restoreOnLoad = !timer;
      draft = !timer;
      message('');
      loadClimateEco();
    } catch (error) {
      message(error.message || 'Časovač se nepodařilo uložit.', true);
    } finally {
      saving = false;
      cancel.disabled = false;
      render();
      load();
    }
  }

  create.addEventListener('click', () => {
    restoreOnLoad = true;
    draft = true;
    message('');
    render();
  });
  cancel.addEventListener('click', () => submit({ action: 'cancel', id: timer.id }));
  form.addEventListener('input', (event) => {
    restoreOnLoad = false;
    if (event.target === controls.mode) updateOptions();
    else showPreview();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit({ action: 'start', ...collectDraft() });
  });

  function collectDraft() {
    return {
      mode: controls.mode.value || undefined,
      ecoPercent: !controls.ecoPercent.disabled && controls.ecoPercent.value ? Number(controls.ecoPercent.value) : undefined,
      startTime: controls.now.checked ? null : controls.startTime.value,
      startTemperature: Number(controls.startTemperature.value),
      startEco: controls.startEco.checked,
      change: controls.hasChange.checked ? { time: controls.changeTime.value, temperature: Number(controls.changeTemperature.value),
        eco: controls.changeEco.checked } : null,
      extraChange: controls.hasExtraChange.checked ? { time: controls.extraChangeTime.value, temperature: Number(controls.extraChangeTemperature.value),
        eco: controls.extraChangeEco.checked } : null,
      stopTime: controls.hasStop.checked ? controls.stopTime.value : null,
    };
  }

  function renderPresets() {
    presetList.innerHTML = presets.map(({ id, name, draft: saved }) => {
      const stages = [{ time: saved.startTime, temperature: saved.startTemperature, eco: saved.startEco }];
      if (saved.change) stages.push(saved.change);
      if (saved.extraChange) stages.push(saved.extraChange);
      if (saved.stopTime) stages.push({ time: saved.stopTime, stop: true });
      const ecoLabel = Number.isFinite(saved.ecoPercent) ? `Eco ${num(saved.ecoPercent)} %` : 'Eco';
      return `<li><button type="button" data-preset="${esc(id)}">
        <span class="climate-preset-heading"><b>${esc(name)}</b>${saved.mode ? `<small>${t(saved.mode === 'heat' ? 'Topení' : 'Chlazení')}</small>` : ''}</span>
        <span class="climate-preset-steps">${stages.map(({ time, temperature, eco, stop }) => `<span class="climate-preset-step" data-eco="${Boolean(eco)}" data-stop="${Boolean(stop)}">
          <span>${time ? `<time datetime="${esc(time)}">${esc(time)}</time>` : t('Hned')}${stop ? '' : ` <strong>${label(temperature, '°' + saved.unit)}</strong>`}</span>
          <small>${stop ? t('Vypnout') : eco ? ecoLabel : t('Běžně')}</small>
        </span>`).join('')}</span></button>
        <button class="icon-button" type="button" data-delete-preset="${esc(id)}" aria-label="${t('Smazat plán')} · ${esc(name)}">${icon('close')}</button></li>`;
    }).join('');
  }

  async function updatePresets(body) {
    if (savingPreset) return;
    loadRequest?.abort();
    savingPreset = true;
    presetStatus.textContent = '';
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Plán se nepodařilo uložit.');
      presets = data.presets;
      renderPresets();
      presetStatus.textContent = t(body.action === 'savePreset' ? 'Plán uložen.' : 'Plán smazán.');
    } catch (error) {
      presetStatus.textContent = t(error.message);
    } finally {
      savingPreset = false;
    }
  }

  presetsOpen.addEventListener('click', () => {
    presetStatus.textContent = '';
    renderPresets();
    presetsDialog.showModal();
  });
  byId('climate-presets-close').addEventListener('click', () => presetsDialog.close());
  presetForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (fields.disabled || !form.checkValidity()) {
      presetStatus.textContent = t('Zkontrolujte čas a teplotu časovače.');
      return;
    }
    updatePresets({ action: 'savePreset', name: presetForm.elements.name.value, unit: climateState.data.unit, ...collectDraft() });
  });
  presetList.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || savingPreset) return;
    if (button.dataset.deletePreset) {
      updatePresets({ action: 'deletePreset', id: button.dataset.deletePreset });
      return;
    }
    const preset = presets.find(({ id }) => id === button.dataset.preset);
    if (!preset) return;
    const device = climateState?.data;
    if (preset.draft.unit !== device?.unit || [preset.draft.startTemperature, preset.draft.change?.temperature,
      preset.draft.extraChange?.temperature].some((value) => value != null && !temperaturesFor(preset.draft.mode).includes(value))) {
      presetStatus.textContent = t('Klimatizace tuto teplotu v aktuálním režimu nepodporuje.');
      return;
    }
    restoreOnLoad = false;
    restoreDraft(preset.draft);
    updateOptions();
    presetForm.elements.name.value = preset.name;
    presetsDialog.close();
  });
  climateDialog.addEventListener('close', () => { if (!climateDialog.open) loadRequest?.abort(); });
  return {
    open() {
      if (!controls.startTime.value) controls.startTime.value = shortTime.format(Date.now() + 30 * 60_000);
      draft = !timer;
      timerLoaded = false;
      rememberedDraft = undefined;
      restoreOnLoad = true;
      message('');
      render();
      load();
    },
    updateOptions,
    draftPercent() { return draft && timerLoaded ? controls.ecoPercent.value : undefined; },
    setDraftPercent(value) {
      if (!draft) return;
      restoreOnLoad = false;
      controls.ecoPercent.value = value;
      showPreview();
    },
    poll() { if (!document.hidden && climateDialog.open) load(); },
  };
}

function openNight() {
  renderNight();
  nightDialog.showModal();
  animateView();
}
byId('night-open').addEventListener('click', openNight);
byId('night-close').addEventListener('click', () => nightDialog.close());
nightDialog.addEventListener('close', () => {
  if (!nightDialog.open) animateView();
});

const batteryButton = byId('battery-open');
const batteryDialog = byId('battery-dialog');
const batteryRefresh = byId('battery-refresh');
const batteryRefreshStatus = byId('battery-refresh-status');
const batterySamples = {};
let batteryDiagnostics;
const batteryLevels = new Map([
  ['full', 'Plná'], ['high', 'Dobrá'], ['medium', 'Střední'],
  ['low', 'Slabá'], ['very_low', 'Velmi slabá'], ['empty', 'Vybitá'],
]);

function mergeBatterySamples(samples = {}) {
  for (const [key, sample] of Object.entries(samples)) {
    if (sample.at >= (batterySamples[key]?.at ?? 0)) batterySamples[key] = sample;
  }
}

function batteryInfo({ state, percent, reachable }) {
  if (!reachable) return { tone: 'unknown', text: t('Nedostupné') };
  const level = batteryLevels.get(state);
  const measured = Number.isFinite(percent);
  if (!measured && !level) return { tone: 'unknown', text: t('Stav neznámý') };
  const tone = percent === 0 || state === 'empty' ? 'empty'
    : (measured && percent <= 20) || ['low', 'very_low'].includes(state) ? 'low' : 'ok';
  return { tone, text: measured ? label(percent, '%') : t(level) };
}

function signalMarkup(connection) {
  if (!connection) return '–';
  const { reachable, kind, strength, state, lastSeen, firmware } = connection;
  const wifi = kind === 'wifi';
  const bands = { very_low: 1, low: 1, medium: 2, high: 3, full: 3 };
  const nativeBars = Object.hasOwn(bands, state) ? bands[state] : null;
  const bars = !reachable ? 0 : nativeBars ?? (Number.isFinite(strength)
    ? strength <= (wifi ? 56 : 60) ? 3 : strength >= (wifi ? 86 : 80) ? 1 : 2 : 0);
  const description = t(bars ? ['Slabý', 'Střední', 'Silný'][bars - 1] : 'Nedostupné');
  const title = [t(wifi ? 'Wi-Fi' : 'Rádiový signál'), description, (bars && Number.isFinite(strength)) && num(strength),
    Number.isFinite(lastSeen) && `${t('Naposledy')} ${contactDate.format(lastSeen)}`,
    firmware != null && `${t('Firmware')} ${firmware}`].filter(Boolean).join(' · ');
  return `<span class="battery-signal" data-bars="${bars}" title="${esc(title)}"><span class="signal-bars" aria-hidden="true"><i></i><i></i><i></i></span><span>${bars ? description : '–'}</span></span>`;
}

function batteryRows(entries, diagnostics) {
  const matching = (a, b) => a.name === b.name && a.roomId === b.roomId && (a.kind ?? null) === (b.kind ?? null);
  const rows = [...entries];
  for (const device of diagnostics ?? []) {
    let index = rows.findIndex(({ id }) => id === device.id);
    if (index < 0 && diagnostics.filter((item) => matching(item, device)).length === 1) {
      index = rows.findIndex((item) => !item.id && matching(item, device));
    }
    if (index < 0) rows.push({ tone: 'unknown', text: '–', ...device });
    else rows[index] = { ...rows[index], ...device };
  }
  return rows.sort((a, b) => t(a.name).localeCompare(t(b.name), locale));
}

function renderBatteries() {
  const groups = [['heating', 'Topení'], ['station', 'Meteostanice']].map(([key, title]) => ({
    key,
    title,
    sample: batterySamples[key],
    unavailable: ['error', 'stale'].includes(panel?.sources[key]?.state),
    entries: (batterySamples[key]?.data ?? []).map((entry) => ({ ...entry, ...batteryInfo(entry) })),
  }));
  const tones = groups.flatMap(({ entries }) => entries.map(({ tone }) => tone));
  const incomplete = groups.some(({ sample, unavailable }) => sample ? sample.stale : unavailable);
  const status = connectionFailed || tones.every((tone) => tone === 'unknown') ? 'unknown'
    : tones.includes('empty') ? 'empty' : tones.includes('low') ? 'low'
      : incomplete || tones.includes('unknown') ? 'partial' : 'ok';
  const captions = { unknown: 'Stav neznámý', empty: 'Vybité', low: 'Slabé', partial: 'Částečné údaje', ok: 'V pořádku' };
  batteryButton.dataset.batteryStatus = status;
  batteryButton.title = `${t('Baterie')} · ${t(captions[status])}`;
  batteryButton.setAttribute('aria-label', batteryButton.title);
  if (!batteryDialog.open) return;
  byId('battery-groups').innerHTML = groups.map(({ key, title, sample, entries }) => {
    const heating = key === 'heating';
    const rows = batteryRows(entries, batteryDiagnostics?.[key]);
    return `<section class="battery-group">
      <header><h3>${t(title)}</h3>${sample ? `<time class="battery-sampled" datetime="${new Date(sample.at).toISOString()}" data-stale="${sample.stale}"
        title="${t('Baterie')} · ${t(sample.stale ? 'Starší data' : 'Obnoveno v')}">${contactDate.format(sample.at)}</time>` : ''}</header>
      ${rows.length ? `<table aria-label="${t(title)}"><thead><tr><th scope="col">${t('Zařízení')}</th><th scope="col">${t('Baterie')}</th>
        ${heating ? `<th scope="col" title="${t('Otevření hlavice')}">${t('Otevření')}</th>` : ''}<th scope="col">${t('Signál')}</th></tr></thead>
        <tbody>${rows.map(({ name, kind, tone, text, opening, connection }) => `<tr><th scope="row">${esc(t(name))}${kind && kind !== 'Hlavice' ? ` <small>${t(kind)}</small>` : ''}</th>
          <td><b data-battery-status="${tone}">${esc(text)}</b></td>${heating ? `<td class="battery-opening" data-open="${opening > 0}">${label(opening, '%')}</td>` : ''}
          <td>${signalMarkup(connection)}</td></tr>`).join('')}</tbody></table>` : empty(t('Údaje o bateriích nejsou dostupné.'))}
    </section>`;
  }).join('');
}

batteryButton.addEventListener('click', () => {
  batteryDialog.showModal();
  renderBatteries();
  loadBatteryOverview(false);
});
byId('battery-close').addEventListener('click', () => batteryDialog.close());
batteryRefresh.addEventListener('click', () => loadBatteryOverview(true));

async function loadBatteryOverview(forceBatteries) {
  if (batteryRefresh.disabled) return;
  batteryRefresh.disabled = true;
  batteryRefreshStatus.textContent = t(forceBatteries ? 'Obnovuji baterie…' : 'Načítám hlavice a signál…');
  try {
    const response = await fetch('/api/batteries/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batteries: forceBatteries }), signal: AbortSignal.timeout(24_000),
    });
    const result = await response.json();
    mergeBatterySamples(result.batteries);
    batteryDiagnostics = result.diagnostics;
    if (!response.ok) throw new Error();
    batteryRefreshStatus.textContent = result.failed ? t('Obnovila se jen část údajů.') : forceBatteries ? t('Baterie obnoveny.') : '';
  } catch {
    batteryDiagnostics = undefined;
    batteryRefreshStatus.textContent = t(forceBatteries ? 'Baterie se nepodařilo obnovit.' : 'Hlavice a signál se nepodařilo načíst.');
  } finally {
    batteryRefresh.disabled = false;
    renderBatteries();
  }
}

const heatDialog = byId('heat-dialog');
const heatForm = byId('heat-form');
const heatInput = byId('heat-temperature');
const heatRemaining = byId('heat-remaining');
const heatRemainingTime = byId('heat-remaining-time');
const heatHistory = byId('heat-history');
const heatHistoryAt = byId('heat-history-at');
const heatHistoryStatus = byId('heat-history-status');
const heatHistoryPlot = byId('heat-history-plot');
const heatHoursFormat = new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'short' });
const heatMinutesFormat = new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' });
let heatHistoryRequest;
new ResizeObserver(() => {
  const graph = heatHistoryPlot.querySelector('.day-chart-graphic');
  if (graph) drawDayLabels(graph);
}).observe(heatHistoryPlot);

async function showHeatingHistory(roomId) {
  heatHistoryRequest?.abort();
  heatHistory.hidden = roomId == null;
  heatHistoryAt.hidden = true;
  heatHistoryPlot.hidden = true;
  heatHistoryPlot.replaceChildren();
  if (heatHistory.hidden) return;
  const request = new AbortController();
  heatHistoryRequest = request;
  heatHistoryStatus.textContent = t('Načítám historii…');
  try {
    const response = await fetch('/api/history/heating?' + new URLSearchParams({ room: roomId }), {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    });
    if (request.signal.aborted || !heatDialog.open) return;
    if (response.status === 404) {
      heatHistoryStatus.textContent = t('Historie není dostupná.');
      return;
    }
    if (!response.ok) throw new Error();
    const { series, start, end, state } = await response.json();
    if (request.signal.aborted || !heatDialog.open) return;
    if (!series.temperature.length) {
      heatHistoryStatus.textContent = t('Teploty nejsou dostupné.');
      return;
    }
    heatHistoryStatus.textContent = state === 'stale' ? t('Starší data') : '';
    const lastMeasurement = series.temperature.at(-1)[0];
    heatHistoryAt.dateTime = new Date(lastMeasurement).toISOString();
    heatHistoryAt.textContent = ' · ' + t('měření') + ' ' + shortTime.format(lastMeasurement);
    heatHistoryAt.hidden = false;
    heatHistoryPlot.hidden = false;
    dayTemperatureChart(heatHistoryPlot, series.temperature, start, end, 35 * 60_000);
  } catch {
    if (!request.signal.aborted && heatDialog.open) heatHistoryStatus.textContent = t('Historii se nepodařilo načíst.');
  }
}

function renderHeatingRemaining(heat, now = Date.now()) {
  const minutes = Math.ceil((heat?.endsAt - now) / 60_000);
  heatRemaining.hidden = !(['manual', 'max'].includes(heat?.mode) && minutes > 0);
  if (heatRemaining.hidden) return;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const text = [hours && heatHoursFormat.format(hours), (rest || !hours) && heatMinutesFormat.format(rest)]
    .filter(Boolean).join(' ');
  if (heatRemainingTime.textContent !== text) heatRemainingTime.textContent = text;
}

function renderHeatingTemperatures(heat) {
  byId('heat-current').textContent = label(heat?.temperature, '°C', 1);
  byId('heat-target').textContent = label(heat?.target, '°C', 1);
  const opening = valveOpening(heat);
  const valve = byId('heat-valve');
  valve.textContent = label(opening, '%');
  valve.dataset.open = String(opening > 0);
  const devices = (batterySamples.heating?.data ?? []).filter(({ roomId }) => roomId != null && roomId === heat?.id);
  const valves = devices.filter(({ kind }) => kind === 'Hlavice');
  const batteries = (valves.length ? valves : devices).map(batteryInfo);
  const battery = byId('heat-battery');
  battery.textContent = batteries.map(({ text }) => text).join(' / ') || '–';
  battery.parentElement.dataset.batteryStatus = batteries.find(({ tone }) => tone === 'empty')?.tone ??
    batteries.find(({ tone }) => tone === 'low')?.tone ?? batteries[0]?.tone ?? 'unknown';
  battery.title = batterySamples.heating?.stale ? t('Starší data') : '';
  renderHeatingRemaining(heat);
  const info = byId('heat-plan');
  const source = panel?.sources.heating;
  const rows = [];
  if (source?.scheduleName) rows.push(t('Program') + ' · ' + source.scheduleName);
  if (source?.mode === 'away') {
    rows.push(t('Teplota v režimu Pryč') + ' · ' + label(source.awayTarget, '°C', 1));
    if (!heat?.resumeAt) rows.push(t('Bez nastaveného návratu'));
  }
  if (heat?.next) {
    const time = contactDate.format(heat.next.at);
    rows.push(t(heat.resumeAt ? 'Návrat k programu' : 'Další změna') + ' · ' + time + ' · ' + label(heat.next.target, '°C', 1));
  } else if (heat?.resumeAt) {
    rows.push(t('Návrat k programu') + ' · ' + contactDate.format(heat.resumeAt));
  }
  info.hidden = !rows.length;
  info.replaceChildren(...rows.map((text) => {
    const row = document.createElement('span');
    row.textContent = text;
    return row;
  }));
}
function openHeating(room) {
  if (!room?.heat) return;
  heatingRoomKey = heatingKey(room);
  byId('heat-title').textContent = t(room.name) + ' · ' + t('Topení');
  byId('heat-adjust').hidden = !room.canHeat || connectionFailed || commandPending;
  renderHeatingTemperatures(room.heat);
  heatForm.elements.durationHours.value = '2';
  heatInput.value = Math.max(7, Math.min(28, Math.round((room.heat.target ?? 21) * 2) / 2));
  heatDialog.showModal();
  showHeatingHistory(room.heat.id);
}
byId('rooms').addEventListener('click', (event) => {
  const air = event.target.closest('[data-airplus-room]');
  if (air) {
    airplusRoom = panel?.rooms[air.dataset.airplusRoom]?.name;
    if (airplusRoom) {
      airplusError = '';
      airplusDialog.showModal();
      renderAirplus();
      void loadAirplus();
    }
    return;
  }
  const history = event.target.closest('[data-history]');
  if (history) {
    const room = panel?.rooms[history.dataset.index];
    if (room) openHistory('room', history.dataset.index, t(room.name), history.dataset.history);
    return;
  }
  const button = event.target.closest('[data-room]');
  if (button) {
    openHeating(panel?.rooms[button.dataset.room]);
    return;
  }
  const card = event.target.closest('[data-room-history]');
  const room = card && panel?.rooms[card.dataset.roomHistory];
  if (room) openHistory('room', card.dataset.roomHistory, t(room.name), 'temperature');
});
byId('airplus-close').addEventListener('click', () => airplusDialog.close());
byId('heat-close').addEventListener('click', () => heatDialog.close());
heatDialog.addEventListener('close', () => { if (!heatDialog.open) heatHistoryRequest?.abort(); });
byId('heat-minus').addEventListener('click', () => heatInput.stepDown());
byId('heat-plus').addEventListener('click', () => heatInput.stepUp());
async function heatingAction(temperature, durationHours) {
  const room = findHeatingRoom(heatingRoomKey);
  if (!room?.canHeat || connectionFailed) return;
  const controls = [byId('heat-schedule'), heatForm.querySelector('[type=submit]')];
  controls.forEach((button) => {
    button.disabled = true;
  });
  const done = await sendAction('/api/heating', { id: room.heat.id, temperature, durationHours }, t('Změna topení odeslána'));
  controls.forEach((button) => {
    button.disabled = false;
  });
  if (done) heatDialog.close();
}
heatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  heatingAction(heatInput.valueAsNumber, Number(heatForm.elements.durationHours.value));
});
byId('heat-schedule').addEventListener('click', () => heatingAction(null));
const toTime = (minute) => [Math.floor(minute / 60), minute % 60].map((value) => String(value).padStart(2, '0')).join(':');
const toMinute = (value) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

function setupHeatingProgram() {
  const dialog = byId('heating-program-dialog');
  const title = byId('heating-program-title');
  const status = byId('heating-program-status');
  const close = byId('heating-program-close');
  const form = byId('heating-program-form');
  const fields = byId('heating-program-fields');
  const matrix = byId('heating-program-matrix');
  const periods = byId('heating-program-periods');
  const chart = byId('heating-program-chart');
  const save = byId('heating-program-save');
  const chartRooms = ['Obývák', 'Pracovna', 'Ložnice'];
  let program;
  let loading;
  let saving = false;

  function readTemperature(value) {
    const text = value.trim();
    return /^\d+(?:[,.]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : NaN;
  }

  function message(text, error = false) {
    status.textContent = t(text);
    status.dataset.error = String(error);
  }

  function addPeriod({ minute, zoneId }, first = false) {
    const row = document.createElement('div');
    row.className = 'heating-program-period';
    row.innerHTML = `<input type="time" value="${toTime(minute)}" aria-label="${t('Začátek období')}" required${first ? ' readonly' : ''}>
      <select aria-label="${t('Teplotní sada')}">${program.zones.map(({ id, name }) =>
        `<option value="${id}"${id === zoneId ? ' selected' : ''}>${esc(t(name))}</option>`).join('')}</select>
      ${first ? '' : `<button type="button" class="icon-button" aria-label="${t('Odebrat čas')}">×</button>`}`;
    periods.append(row);
    return row;
  }

  function readPeriods() {
    return [...periods.children].map((row) => ({
      minute: toMinute(row.querySelector('input').value),
      zoneId: Number(row.querySelector('select').value),
    })).sort((a, b) => a.minute - b.minute);
  }

  function renderChart() {
    const day = readPeriods().filter(({ minute }) => Number.isFinite(minute));
    const series = chartRooms.flatMap((name, color) => {
      const row = program.rooms.findIndex((room) => room.name === name);
      if (row < 0) return [];
      const inputs = matrix.tBodies[0].rows[row].querySelectorAll('input');
      const temperatures = new Map(program.zones.map(({ id }, index) => [id, readTemperature(inputs[index].value)]));
      return [{ name, color, values: day.map(({ zoneId }) => temperatures.get(zoneId)) }];
    });
    const values = series.flatMap((line) => line.values).filter(Number.isFinite);
    chart.hidden = !values.length;
    if (!values.length) return;
    const low = Math.floor(Math.min(...values));
    const high = Math.max(low + 2, Math.ceil(Math.max(...values)));
    const x = (minute) => 42 + 262 * minute / 1440;
    const y = (value) => 103 - 90 * ((value - low) / (high - low));
    const axis = [low, (low + high) / 2, high].map((value) =>
      `<path d="M42 ${y(value)}H304"/><text x="36" y="${y(value)}" text-anchor="end" dominant-baseline="middle">${value.toLocaleString(locale)}°</text>`).join('');
    const times = [0, 360, 720, 1080, 1440].map((minute) =>
      `<text x="${x(minute)}" y="122" text-anchor="middle">${toTime(minute)}</text>`).join('');
    const lines = series.map(({ color, values }) => {
      const path = values.map((value, index) => {
        if (!Number.isFinite(value)) return '';
        const step = Number.isFinite(values[index - 1]) ? 'V' + y(value) : `M${x(day[index].minute)} ${y(value)}`;
        return step + 'H' + x(day[index + 1]?.minute ?? 1440);
      }).join('');
      return `<path class="heating-curve" data-series="${color}" d="${path}"/>`;
    }).join('');
    chart.innerHTML = `<svg viewBox="0 0 327 130" role="img" aria-label="${t('Plánovaná teplota')}">
      <g class="heating-chart-axis">${axis}${times}</g>${lines}</svg>
      <div class="heating-chart-legend">${series.map(({ name, color }) =>
        `<span data-series="${color}">${esc(t(name))}</span>`).join('')}</div>`;
  }

  function render() {
    const { name, rooms, zones, monday, editable } = program;
    title.textContent = t('Program topení') + ' · ' + name;
    const temperatures = zones.map((zone) => new Map(zone.rooms.map((room) => [room.id, room.therm_setpoint_temperature])));
    matrix.innerHTML = `<thead><tr><th scope="col">${t('Místnost')}</th>${zones.map((zone) =>
      `<th scope="col">${esc(t(zone.name))}</th>`).join('')}</tr></thead><tbody>${rooms.map((room, roomIndex) => `<tr>
      <th scope="row">${esc(t(room.name))}</th>
      ${zones.map((zone, zoneIndex) => {
        const value = temperatures[zoneIndex].get(room.id);
        const name = esc(`${t(room.name)} · ${t(zone.name)} · °C`);
        const formatted = Number.isFinite(value) ? value.toLocaleString(locale, { useGrouping: false, maximumFractionDigits: 20 }) : '';
        return `<td><div class="heating-program-temperature">
          <input type="text" inputmode="decimal" value="${esc(formatted)}"
            data-room-index="${roomIndex}" data-zone-index="${zoneIndex}" aria-label="${name}" required>
          <button type="button" data-step="1" aria-label="${t('Zvýšit teplotu')} · ${name}">+</button>
          <button type="button" data-step="-1" aria-label="${t('Snížit teplotu')} · ${name}">−</button>
        </div></td>`;
      }).join('')}</tr>`).join('')}</tbody>`;
    periods.replaceChildren();
    monday.forEach((period, index) => addPeriod(period, index === 0));
    fields.disabled = !editable;
    save.hidden = !editable;
    form.hidden = false;
    renderChart();
    message(editable ? '' : 'Program je k dispozici pouze ke čtení.');
  }

  byId('heating-program-open').addEventListener('click', async () => {
    if (dialog.open) return;
    loading?.abort();
    const request = new AbortController();
    loading = request;
    title.textContent = t('Program topení');
    form.hidden = true;
    message('Načítám…');
    dialog.showModal();
    try {
      const response = await fetch('/api/heating/program', {
        cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (request.signal.aborted) return;
      program = result;
      render();
    } catch {
      if (!request.signal.aborted) message('Program topení se nepodařilo načíst.', true);
    }
  });

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });
  dialog.addEventListener('click', (event) => { if (saving && event.target === dialog) event.preventDefault(); });
  dialog.addEventListener('close', () => { if (!dialog.open) loading?.abort(); });
  byId('heating-program-add').addEventListener('click', () => {
    const times = [...periods.querySelectorAll('input')].map((input) => toMinute(input.value)).filter(Number.isFinite);
    const taken = new Set(times);
    let minute = Math.min(1439, Math.max(...times, 0) + 60);
    if (taken.size >= 1440) return;
    while (taken.has(minute)) minute = minute % 1439 + 1;
    const zoneId = Number(periods.lastElementChild.querySelector('select').value);
    addPeriod({ minute, zoneId }).querySelector('input').focus();
    renderChart();
  });
  periods.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) {
      button.closest('.heating-program-period').remove();
      renderChart();
    }
  });
  fields.addEventListener('input', renderChart);
  matrix.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-step]');
    if (!button) return;
    const input = button.parentElement.querySelector('input');
    const entered = readTemperature(input.value);
    const value = Number.isFinite(entered) ? entered : readTemperature(input.defaultValue);
    const next = Math.max(5, Math.min(30, (Math.round(value * 2) + Number(button.dataset.step)) / 2));
    input.value = num(next, Number.isInteger(next) ? 0 : 1);
    renderChart();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !program?.editable) return;
    const day = readPeriods();
    if (new Set(day.map(({ minute }) => minute)).size !== day.length) {
      message('Každý čas může být v rozvrhu jen jednou.', true);
      return;
    }
    const temperatures = [...matrix.querySelectorAll('input')].flatMap((input) => {
      const temperature = readTemperature(input.value);
      if (temperature === readTemperature(input.defaultValue)) return [];
      return [{
        zoneId: program.zones[input.dataset.zoneIndex].id,
        roomId: program.rooms[input.dataset.roomIndex].id,
        temperature,
      }];
    });
    if (temperatures.some(({ temperature }) => temperature < 5 || temperature > 30 || !Number.isInteger(temperature * 2))) {
      message('Zvolte teplotu 5 až 30 °C po půl stupni.', true);
      return;
    }
    saving = true;
    fields.disabled = save.disabled = close.disabled = true;
    message('Ukládám program…');
    try {
      const done = await sendAction('/api/heating/program', { revision: program.revision, periods: day, temperatures }, '',
        (error) => message(error, true));
      if (done) {
        dialog.close();
        toast(t('Program topení uložen.'));
      } else if (status.dataset.error === 'false') {
        message('Počkejte na dokončení předchozí akce', true);
      }
    } finally {
      saving = false;
      fields.disabled = save.disabled = close.disabled = false;
    }
  });
}

setupHeatingProgram();

setupSpotify(icon, fadeChanged);
const configureVacuum = setupVacuum((room) => icon(roomIconName(room)), icon);
const openHistory = setupHistory((index) => {
  const room = panel?.rooms[index];
  if (!room) return [];
  const { meter, heat } = room;
  const purifier = airplus?.data?.find((device) => device.room === room.name);
  const purifierLive = purifier?.available && airplus.state === 'live';
  return [
    ['Teplota místnosti', meter.temperature, '°C', 1],
    ['CO₂', meter.co2, 'ppm'],
    ['Vlhkost', meter.humidity, '%'],
    ['Hluk', meter.noise, 'dB'],
    ['PM2.5', purifierLive ? purifier.pm25 : null, 'µg/m³', 0, purifierLive && purifier.waterEmpty ? 'Doplň vodu' : ''],
    ['Teplota z hlavice', heat?.temperature, '°C', 1],
    ['Požadovaná teplota', heat?.target, '°C', 1],
    ['Otevření hlavice', valveOpening(heat), '%'],
  ].filter(([, value, , , notice]) => Number.isFinite(value) || notice)
    .map(([name, value, unit, precision, notice]) => [t(name), label(value, unit, precision), notice ? t(notice) : '']);
});
byId('power-meters').addEventListener('click', (event) => {
  const meter = event.target.closest('[data-meter]');
  const reading = meter && panel?.powerMeters?.find(({ id }) => id === Number(meter.dataset.meter));
  if (reading) openHistory('power', reading.id, t(reading.name), 'power');
});

const languageToggle = byId('language-toggle');
const languagePopup = byId('language-popup');
function setLanguagePopup(open, restoreFocus = false) {
  if (!languageToggle || !languagePopup) return;
  languageToggle.setAttribute('aria-expanded', String(open));
  languagePopup.hidden = !open;
  if (open) {
    languagePopup.removeAttribute('data-align-end');
    if (languagePopup.getBoundingClientRect().right > document.documentElement.clientWidth - 6) {
      languagePopup.setAttribute('data-align-end', '');
    }
    languagePopup.querySelector('[aria-pressed="true"]')?.focus();
  }
  else if (restoreFocus) languageToggle.focus();
}
for (const button of document.querySelectorAll('[data-language]')) {
  button.setAttribute('aria-pressed', String(button.dataset.language === language));
  if (languageToggle && button.dataset.language === language) {
    languageToggle.firstElementChild.dataset.flag = language;
    languageToggle.setAttribute('aria-label', t('Jazyk') + ' · ' + button.title);
    languageToggle.title = t('Jazyk') + ' · ' + button.title;
  }
  button.addEventListener('click', () => {
    setLanguagePopup(false, true);
    if (button.dataset.language === language) return;
    try { localStorage.setItem('panel-language', button.dataset.language); } catch { return; }
    location.reload();
  });
}
languageToggle?.addEventListener('click', () => setLanguagePopup(languagePopup.hidden));
languageToggle?.parentElement.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !languagePopup.hidden) {
    event.preventDefault();
    setLanguagePopup(false, true);
  }
});
document.addEventListener('pointerdown', (event) => {
  if (languageToggle && languagePopup && !languagePopup.hidden && !languageToggle.parentElement.contains(event.target)) setLanguagePopup(false);
});
languageToggle?.parentElement.addEventListener('focusout', (event) => {
  if (!languagePopup.hidden && !languageToggle.parentElement.contains(event.relatedTarget)) setLanguagePopup(false);
});
const fullscreen = byId('fullscreen');
fullscreen.hidden = !document.fullscreenEnabled || matchMedia('(display-mode: fullscreen)').matches;
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast(t('Celou obrazovku se nepodařilo otevřít.'), true);
  }
});
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  fullscreen.setAttribute('aria-pressed', String(active));
  fullscreen.setAttribute('aria-label', t(active ? 'Ukončit celou obrazovku' : 'Celá obrazovka'));
});

async function holdScreen() {
  if (!keepAwake || document.hidden || !navigator.wakeLock || (wake && !wake.released)) return;
  try {
    wake = await navigator.wakeLock.request('screen');
  } catch {
    toast(t('Displej se nepodařilo ponechat zapnutý.'), true);
  }
}
if (navigator.wakeLock) {
  byId('keep-awake').hidden = false;
  try {
    keepAwake = localStorage.getItem('keep-awake') === 'true';
  } catch {}
  byId('keep-awake').setAttribute('aria-pressed', String(keepAwake));
  byId('keep-awake').addEventListener('click', () => {
    keepAwake = !keepAwake;
    try {
      localStorage.setItem('keep-awake', String(keepAwake));
    } catch {}
    byId('keep-awake').setAttribute('aria-pressed', String(keepAwake));
    if (keepAwake) holdScreen();
    else wake?.release().catch(() => {});
  });
  holdScreen();
}
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
  byId('install').hidden = false;
});
byId('install').addEventListener('click', async () => {
  if (!installEvent) return;
  await installEvent.prompt();
  installEvent = undefined;
  byId('install').hidden = true;
});
window.addEventListener('appinstalled', () => {
  byId('install').hidden = true;
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.warn);
byId('refresh').addEventListener('click', refresh);
document.addEventListener('panel-voice-changed', () => {
  refresh();
  if (devicesDialog.open && !deviceChange) loadDevices(false);
  if (climateDialog.open && !climateChanging) loadClimate();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopRadar();
  else {
    clock(true);
    holdScreen();
    refresh();
    void loadWasher();
    if (washerDialog.open) void loadWasherPower();
  }
});
setInterval(() => {
  void loadWasher();
  if (!document.hidden) {
    refresh();
    if (washerDialog.open) void loadWasherPower();
    if (devicesDialog.open && !devicesLoad && !deviceChange) loadDevices(false);
    if (climateDialog.open && !climateChanging) loadClimate();
  }
}, 30_000);
clock(true);
setInterval(clock, 1000);
setInterval(climateTimer.poll, 5000);
setInterval(() => { if (!document.hidden) loadClimateEco(); }, 5000);
render();
refresh();
void loadWasher();

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    const control = event.composedPath().some((node) =>
      node instanceof Element && node.matches('button, a[href], input, label, select, textarea'));
    if (event.defaultPrevented || control) return;
    if (['spotify', 'heating-program-dialog', 'vacuum-dialog'].includes(dialog.id) ||
        dialog === devicesDialog || dialog === rgbDialog || dialog === climateDialog || dialog === ecoSettingsDialog) {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) return;
    }
    const selection = window.getSelection();
    if (!selection?.isCollapsed && dialog.contains(selection?.anchorNode)) return;
    dialog.close();
  });
}

import { locale, t } from './i18n.js';

const metrics = {
  co2: ['CO₂', 'ppm', 0, '#9be1ba'],
  temperature: ['Teplota', '°C', 1, '#ffd087'],
  humidity: ['Vlhkost', '%', 0, '#96ccf2'],
  noise: ['Hluk', 'dB', 0, '#e5b7f2'],
  power: ['Příkon', 'W', 1, '#ffd087'],
};
const clock = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const byId = (id) => document.getElementById(id);
const number = (value, digits) => value.toLocaleString(locale, { maximumFractionDigits: digits });
const defaultPowerPeriod = 6;

export function labelPoints(points, start, end, count, changeThreshold) {
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, slot) => {
    const target = start + slot * step;
    let nearest;
    let nearestDistance = Infinity;
    let strongest;
    let strongestChange = changeThreshold;
    for (const [index, point] of points.entries()) {
      const [time, value] = point;
      const offset = time - target;
      if (offset < -step / 2 || offset >= step / 2) continue;
      const distance = Math.abs(offset);
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
      if (slot === 0 || slot === count - 1) continue;
      const before = value - (points[index - 1]?.[1] ?? value);
      const after = (points[index + 1]?.[1] ?? value) - value;
      const change = Math.max(Math.abs(before), before * after < 0 ? Math.abs(before - after) : 0);
      if (change > strongestChange) {
        strongest = point;
        strongestChange = change;
      }
    }
    return strongest ?? nearest;
  }).filter(Boolean);
}

export function setupHistory(roomReadings) {
  const dialog = byId('history-dialog');
  const title = byId('history-title');
  const status = byId('history-status');
  const tabs = byId('history-tabs');
  const periods = byId('history-periods');
  const chart = byId('history-chart');
  const summary = byId('history-summary');
  const roomCurrent = byId('history-room-current');
  const canvas = byId('history-plot');
  const hours = byId('history-hours');
  let controller;
  let data;
  let selection;
  let titleName;
  let powerPeriod;

  function updatePeriod() {
    const label = powerPeriod ? t('Posledních {hours} h').replace('{hours}', powerPeriod) : t('Posledních 24 h');
    title.textContent = titleName + ' · ' + label;
    for (const button of periods.children) button.setAttribute('aria-pressed', String(Number(button.dataset.hours) === powerPeriod));
    return label;
  }

  function draw(key) {
    selection = key;
    for (const button of tabs.children) button.setAttribute('aria-pressed', String(button.dataset.series === key));
    const [name, unit, digits, color] = metrics[key];
    const end = data.end;
    const start = powerPeriod ? Math.max(data.start, end - powerPeriod * 3_600_000) : data.start;
    const series = data.series[key] ?? [];
    let points = series;
    if (start > data.start) {
      const first = series.findIndex(([time]) => time >= start);
      points = first < 0 ? [] : series.slice(first);
      if (first > 0 && points[0][0] > start) points.unshift([start, series[first - 1][1]]);
    }
    const energy = Number.isFinite(data.consumption) ? t('Spotřeba dnes') + ' ' + number(data.consumption, 2) + ' kWh' : '';
    summary.textContent = energy;
    chart.hidden = !points.length;
    const periodLabel = updatePeriod();
    status.textContent = points.length ? (data.state === 'stale' ? t('Starší data') : '')
      : t(powerPeriod ? 'Pro toto období nejsou data grafu.' : 'Bez měření za posledních 24 h.');
    if (!points.length) return;
    const values = points.map(([, value]) => value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!energy) summary.textContent = t('Minimum') + ' ' + number(min, digits) + ' · ' + t('Maximum') + ' ' + number(max, digits) + ' ' + unit;
    canvas.setAttribute('aria-label', t(name) + ' · ' + periodLabel);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    const context = canvas.getContext('2d');
    context.scale(pixelRatio, pixelRatio);
    const low = key === 'power' ? Math.min(0, min) : min === max ? min - 1 : min;
    const high = Math.max(low + (digits ? 0.1 : 1), max);
    const axisStyle = getComputedStyle(hours);
    context.font = axisStyle.fontSize + ' ' + axisStyle.fontFamily;
    context.textBaseline = 'middle';
    const ticks = [low, low + (high - low) / 2, high];
    const left = Math.ceil(Math.max(...ticks.map((tick) => context.measureText(number(tick, digits)).width))) + 18;
    const right = width - 10;
    chart.style.setProperty('--history-axis-left', left + 'px');
    const x = (time) => left + (time - start) / (end - start) * (right - left);
    const y = (value) => height - 17 - (value - low) / (high - low) * (height - 34);
    context.fillStyle = '#b1c2d0';
    context.strokeStyle = '#344856';
    for (const tick of ticks) {
      const top = y(tick);
      context.beginPath();
      context.moveTo(left, top);
      context.lineTo(right, top);
      context.stroke();
      context.fillText(number(tick, digits), 8, top);
    }
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.beginPath();
    points.forEach(([time, value], index) => {
      const previous = points[index - 1];
      if (!previous || time - previous[0] > 35 * 60_000 && key !== 'power') context.moveTo(x(time), y(value));
      else {
        if (key === 'power') context.lineTo(x(time), y(previous[1]));
        context.lineTo(x(time), y(value));
      }
    });
    context.stroke();
    for (const [index, [time, value]] of points.entries()) {
      if (points.length > 1 && key === 'power') break;
      if (index && time - points[index - 1][0] <= 35 * 60_000) continue;
      context.beginPath();
      context.arc(x(time), y(value), 2, 0, 2 * Math.PI);
      context.fill();
    }
    const count = Math.max(2, Math.min(6, 1 + Math.floor((right - left) / 95)));
    const labels = labelPoints(points, start, end, count, (high - low) * 0.12);
    context.font = '700 ' + axisStyle.fontSize + ' ' + axisStyle.fontFamily;
    context.textAlign = 'center';
    context.strokeStyle = '#14202a';
    context.lineWidth = 5;
    let previousLabelRight = -Infinity;
    for (const [time, value] of labels) {
      const text = number(value, digits);
      const pointX = x(time);
      const pointY = y(value);
      const halfWidth = context.measureText(text).width / 2;
      const labelX = Math.max(left + halfWidth + 4, Math.min(right - halfWidth - 4, pointX));
      if (labelX - halfWidth < previousLabelRight + 8) continue;
      const labelY = pointY < 32 ? pointY + 15 : pointY - 15;
      context.beginPath();
      context.arc(pointX, pointY, 3, 0, 2 * Math.PI);
      context.fill();
      context.strokeText(text, labelX, labelY);
      context.fillText(text, labelX, labelY);
      previousLabelRight = labelX + halfWidth;
    }
    hours.replaceChildren(...[0, 0.25, 0.5, 0.75, 1].map((step) => {
      const label = document.createElement('span');
      label.textContent = clock.format(start + (end - start) * step);
      return label;
    }));
  }

  tabs.addEventListener('click', (event) => {
    const key = event.target.closest('[data-series]')?.dataset.series;
    if (key) draw(key);
  });
  periods.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hours]');
    if (!button) return;
    powerPeriod = Number(button.dataset.hours);
    if (data) draw(selection);
    else updatePeriod();
  });
  byId('history-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (!dialog.open) controller?.abort(); });
  window.addEventListener('resize', () => { if (dialog.open && data) draw(selection); });

  return async function openHistory(type, id, name, key) {
    if (dialog.open) return;
    controller?.abort();
    controller = new AbortController();
    const request = controller;
    data = undefined;
    titleName = name;
    powerPeriod = type === 'power' ? defaultPowerPeriod : null;
    chart.hidden = true;
    tabs.replaceChildren();
    tabs.hidden = Boolean(powerPeriod);
    periods.hidden = !powerPeriod;
    summary.textContent = '';
    const readings = type === 'room' ? roomReadings(id) : [];
    const tiles = readings.map(([name, reading, notice]) => {
      const tile = document.createElement('div');
      const term = document.createElement('dt');
      const value = document.createElement('dd');
      term.textContent = name;
      value.textContent = reading;
      tile.append(term, value);
      if (notice) {
        const warning = document.createElement('small');
        warning.textContent = notice;
        value.append(warning);
      }
      return tile;
    });
    roomCurrent.replaceChildren(...tiles);
    roomCurrent.hidden = !tiles.length;
    updatePeriod();
    status.textContent = t('Načítám historii…');
    dialog.showModal();
    try {
      const response = await fetch('/api/history/' + type + '/' + id, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
      if (!response.ok) {
        status.textContent = t(response.status === 404 ? 'Historie není dostupná.' : 'Historii se nepodařilo načíst.');
        return;
      }
      const result = await response.json();
      if (request.signal.aborted || controller !== request) return;
      data = result;
      for (const name of Object.keys(metrics).filter((metric) => metric !== 'power' && Object.hasOwn(result.series, metric))) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.series = name;
        button.textContent = t(metrics[name][0]);
        tabs.append(button);
      }
      draw(Object.hasOwn(result.series, key) ? key : Object.keys(result.series)[0]);
    } catch {
      if (!request.signal.aborted && controller === request) status.textContent = t('Historii se nepodařilo načíst.');
    }
  };
}

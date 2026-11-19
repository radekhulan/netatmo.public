import { createHash } from 'node:crypto';
import { env } from './config.mjs';
import { logEvent } from './log.mjs';

const origin = 'https://semsplus.goodwe.com';
const loginUrl = origin + '/web/sems/sems-user/api/v1/auth/cross-login';
const defaultGateway = 'https://eu-gateway.semsportal.com/web/sems';
const userAgent =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const emptyToken = { uid: '', timestamp: 0, token: '', client: 'semsPlusWeb', version: '', language: 'en' };
const expiredCodes = new Set(['401', '100002', 'C0602', 'C0607', 'A0301']);
const successCodes = new Set(['00000', '0']);
const plantApi = '/sems-plant/api';
let session;
let loginPending;
let loginAfter = 0;
let requestAfter = 0;

class SemsError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function encode(text) {
  return Buffer.from(text).toString('base64');
}

function signature(token) {
  const timestamp = Date.now();
  const digest = createHash('sha256').update(`${timestamp}@${token.uid}@${token.token}`).digest('hex');
  return encode(`${digest}@${timestamp}`);
}

function gatewayFor(value) {
  if (!value) return defaultGateway;
  const url = new URL(value);
  const hostAllowed = /^[a-z]{2,8}-gateway\.semsportal\.com$/.test(url.hostname);
  if (
    !hostAllowed ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/web/sems', '/web/sems/'].includes(url.pathname)
  ) {
    throw new Error('SEMS+ vrátilo neznámou adresu datové brány');
  }
  return url.origin + '/web/sems';
}

async function request(url, token, body) {
  if (Date.now() < requestAfter) throw new Error('SEMS+ dočasně omezuje počet požadavků');
  let response;
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        Origin: origin,
        Referer: origin + '/',
        Token: JSON.stringify(token),
        'X-Signature': signature(token),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error('SEMS+ je síťově nedostupné');
  }
  let payload;
  if (response.ok) {
    try {
      payload = await response.json();
    } catch {
      throw new Error('SEMS+ vrátilo neplatnou odpověď');
    }
  }
  const code = String(response.ok ? payload?.code : response.status);
  if (code === '429' || code === 'GY0429') {
    const retry = response.headers.get('retry-after');
    const delay = retry && (Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now());
    requestAfter = Date.now() + (Number.isFinite(delay) && delay > 0 ? Math.max(delay, 60_000) : 300_000);
    throw new SemsError('SEMS+ dočasně omezuje počet požadavků', code);
  }
  if (!successCodes.has(code)) {
    const safeCode = /^[A-Z0-9]{1,12}$/.test(code) ? code : 'neznámý kód';
    throw new SemsError('SEMS+ odmítlo požadavek (' + safeCode + ')', code);
  }
  return payload;
}

async function login() {
  if (Date.now() < loginAfter) throw new Error('SEMS+ přihlášení se zkusí znovu později');
  const pwd = encode(createHash('md5').update(env.GOODWE_SEMS_PASSWORD).digest('hex'));
  try {
    const { data: token, api } = await request(loginUrl, emptyToken, {
      account: env.GOODWE_SEMS_USER,
      pwd,
      agreement: 1,
      isLocal: false,
      isChinese: false,
    });
    if (token?.mfaRequired) throw new Error('SEMS+ vyžaduje dodatečné ověření účtu');
    if (typeof token?.token !== 'string' || !token.token || typeof token.uid !== 'string' || !token.uid) {
      throw new Error('SEMS+ neposkytlo relaci');
    }
    return { token, gateway: gatewayFor(token.api || api) };
  } catch (error) {
    loginAfter = Date.now() + 5 * 60_000;
    throw error;
  }
}

async function read(path, body) {
  if (!session) {
    loginPending ??= login().finally(() => { loginPending = undefined; });
    session = await loginPending;
  }
  const active = session;
  try {
    return (await request(active.gateway + plantApi + path, active.token, body)).data;
  } catch (error) {
    if (session === active && expiredCodes.has(error.code)) session = undefined;
    throw error;
  }
}

export async function semsStations() {
  const stations = [];
  let total;
  for (let current = 1; current <= 20; current++) {
    const page = await read('/portal/stations/page', { current, size: 100 });
    if (!Array.isArray(page?.dataList)) throw new Error('SEMS+ nevrátilo seznam elektráren');
    stations.push(...page.dataList);
    total = Number(page.total);
    if (!page.dataList.length || !Number.isFinite(total) || stations.length >= total) break;
  }
  return stations.filter((station) => typeof station?.id === 'string' && station.id);
}

function reading(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

const chartTime = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' });
const localDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' });
const dayMs = 86_400_000;
const charts = new Map();
const dailyProduction = new Map();
let knownStationId;
let lastChart;

function timeOffset(time) {
  return chartTime.formatToParts(time).find(({ type }) => type === 'timeZoneName').value.slice(3) || '+00:00';
}

function localTime(value) {
  const utc = Date.parse(value + 'Z');
  return Date.parse(value + timeOffset(Date.parse(value + timeOffset(utc))));
}

async function history(stationId, date) {
  const end = date ? localTime(new Date(Date.parse(date) + dayMs).toISOString().slice(0, 10) + 'T00:00:00') : Date.now();
  const start = date ? localTime(date + 'T00:00:00') : end - dayMs;
  const offset = timeOffset(start);
  const offsetHours = Number(offset.slice(0, 3));
  const data = await read('/v1/hems/power/statisticsAndPreV2', {
    stationId,
    items: ['pSystem'],
    timeScale: 1,
    timeZone: offsetHours,
    startTime: (date ?? localDay.format(start)) + ' 00:00:00',
    endTime: (date ?? localDay.format(end)) + ' 23:59:59',
  });
  const series = data?.dataList?.find(({ item, unit }) => item === 'pSystem' && unit === 'kW');
  if (!Array.isArray(series?.powerData)) throw new Error('SEMS+ nevrátilo graf výkonu');
  const points = new Map();
  for (const { tp, power } of series.powerData) {
    if (typeof tp !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(tp)) continue;
    const local = tp.replace(' ', 'T');
    const time = localTime(local);
    const kw = reading(power);
    if (time >= start && time < end && kw !== null) points.set(time, kw);
  }
  return { start, end, points: [...points].sort(([a], [b]) => a - b) };
}

function cachedDay(cache, key, ttl, load) {
  const entry = cache.get(key);
  if (entry && (entry.expires === undefined || entry.expires > Date.now())) return entry.promise;
  const pending = {};
  pending.promise = Promise.resolve().then(load).then((value) => {
    pending.expires = Date.now() + ttl;
    return value;
  }).catch((error) => {
    if (cache.get(key) === pending) cache.delete(key);
    throw error;
  });
  cache.delete(key);
  cache.set(key, pending);
  if (cache.size > 32) cache.delete(cache.keys().next().value);
  return pending.promise;
}

function productionForDay(stationId, date) {
  return cachedDay(dailyProduction, stationId + '/' + date, 30 * 60_000, async () => {
    const data = await read('/stations/production', {
      stationId,
      items: ['proSystemTotalStats'],
      dimension: 'day',
      isReport: false,
      startTime: date + ' 00:00:00',
      endTime: date + ' 23:59:59',
    });
    return reading(data?.proSystemTotalStats);
  });
}

async function stationForAccount() {
  const stations = await semsStations();
  const selected = env.GOODWE_SEMS_STATION_ID?.trim();
  const station = selected
    ? stations.find(({ id }) => id === selected)
    : stations.length === 1
      ? stations[0]
      : undefined;
  if (!station) {
    if (!stations.length) throw new Error('Účet SEMS+ nemá dostupnou elektrárnu');
    throw new Error('Zvolte elektrárnu SEMS+ pomocí GOODWE_SEMS_STATION_ID');
  }
  knownStationId = station.id;
  return station;
}

async function production() {
  const productionDate = localDay.format(Date.now());
  const station = await stationForAccount();
  let kw = reading(station.pSystem);
  const day = reading(station.productionToday);
  const total = reading(station.productionTotal);
  if (kw === null && day === null && total === null) throw new Error('SEMS+ nevrátilo údaje o výrobě');
  const offline = String(station.status) === '-1';
  const yesterdayDate = new Date(Date.parse(productionDate) - dayMs).toISOString().slice(0, 10);
  const [chart, yesterday] = await Promise.allSettled([history(station.id), productionForDay(station.id, yesterdayDate)]);
  if (chart.status === 'rejected')
    logEvent('warning', 'goodwe.chart_failed', { source: 'goodwe' }, chart.reason);
  if (yesterday.status === 'rejected')
    logEvent('warning', 'goodwe.yesterday_failed', { source: 'goodwe' }, yesterday.reason);
  const liveChart = chart.status === 'fulfilled' && chart.value.points.length ? chart.value : undefined;
  let measuredAt;
  let cachedChart;
  if (liveChart) {
    lastChart = { stationId: station.id, chart: liveChart };
  } else {
    if (lastChart?.stationId === station.id) {
      const end = Date.now();
      const start = end - dayMs;
      const points = lastChart.chart.points.filter(([at]) => at >= start && at < end);
      if (points.length) cachedChart = { start, end, points, partial: true };
    }
    try {
      const flow = await read('/stations/flow?stationId=' + encodeURIComponent(station.id));
      const power = reading(flow?.pSystem);
      const time = typeof flow?.refreshTime === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(flow.refreshTime)
        ? localTime(flow.refreshTime.replace(' ', 'T')) : NaN;
      if (power !== null && Number.isFinite(time)) {
        kw = power;
        measuredAt = time;
      }
    } catch (error) {
      logEvent('warning', 'goodwe.flow_failed', { source: 'goodwe' }, error);
    }
  }
  return {
    power: kw === null || offline ? null : kw * 1000,
    day: !liveChart && day === 0 ? null : day,
    productionDate,
    total,
    offline,
    provider: 'SEMS+',
    measuredAt,
    chart: liveChart ?? cachedChart,
    yesterday: yesterday.status === 'fulfilled' && (liveChart || yesterday.value !== 0) ? yesterday.value : null,
  };
}

async function withSessionRetry(load) {
  try {
    return await load();
  } catch (error) {
    if (!expiredCodes.has(error.code)) throw error;
  }
  try {
    return await load();
  } catch (error) {
    if (expiredCodes.has(error.code)) loginAfter = Date.now() + 5 * 60_000;
    throw error;
  }
}

export function goodweCloud() {
  return withSessionRetry(production);
}

export function goodweDay(date) {
  const time = Date.parse(date + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date ||
      date >= localDay.format(Date.now()) || date < '2000-01-01') return null;
  return withSessionRetry(async () => {
    const id = knownStationId ?? (await stationForAccount()).id;
    const [chart, production] = await Promise.allSettled([
      cachedDay(charts, id + '/' + date, 30 * 60_000, () => history(id, date)), productionForDay(id, date),
    ]);
    if (chart.status === 'rejected') {
      if (production.status === 'rejected' || !production.value) throw chart.reason;
      logEvent('warning', 'goodwe.day_chart_failed', { source: 'goodwe', date }, chart.reason);
    }
    if (production.status === 'rejected')
      logEvent('warning', 'goodwe.day_total_failed', { source: 'goodwe', date }, production.reason);
    return { date, chart: chart.value, production: production.value ?? null };
  });
}

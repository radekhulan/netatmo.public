import { config } from './config.mjs';
import { logEvent } from './log.mjs';

const radarRoot = 'https://opendata.chmi.cz/meteorology/weather/radar/composite/';
const observationRoot = radarRoot + 'maxz/png_masked/';
const predictionRoot = radarRoot + 'fct_maxz/png_masked/';
const observationPattern = /pacz2gmaps3\.z_max3d\.(\d{8})\.(\d{4})\.0\.png/g;
const archivePattern = /pacz2gmaps3\.fct_z_max\.(\d{8})\.(\d{4})\.ft60s10\.tar/g;
const predictionPattern = /^\d{8}\.\d{4}\/pacz2gmaps3\.fct_z_max\.(\d{8})\.(\d{4})\.(10|20|30|40|50|60)\.png$/;
const radarImages = new Map();

async function fetchData(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response;
}

const marker = config.radar?.marker;
const radarLocation = marker && [marker.x, marker.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
  ? { x: marker.x, y: marker.y }
  : null;

export async function weather() {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: config.location.latitude,
    longitude: config.location.longitude,
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,is_day',
    hourly: [
      'temperature_2m', 'precipitation_probability', 'precipitation', 'rain', 'showers', 'snowfall', 'weather_code', 'is_day',
      'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    ].join(','),
    minutely_15: 'precipitation,rain,showers,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'snowfall_sum',
      'wind_speed_10m_max', 'wind_gusts_10m_max', 'sunrise', 'sunset',
    ].join(','),
    forecast_days: '6',
    forecast_minutely_15: '15',
    timeformat: 'unixtime',
    timezone: 'Europe/Prague',
  });
  return (await fetchData(url)).json();
}

function utcDate(date, time) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${time.slice(0, 2)}:${time.slice(2)}:00Z`;
}

async function latestFiles(root, pattern, count) {
  const listing = await (await fetchData(root)).text();
  const matches = Array.from(listing.matchAll(pattern));
  return [...new Map(matches.map((match) => [match[0], match])).values()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-count);
}

function unpackPredictions(buffer) {
  const frames = [];
  for (let offset = 0; offset + 512 <= buffer.length; ) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.toString('ascii', 0, 100).split('\0')[0];
    if (!name) break;
    const size = Number.parseInt(header.toString('ascii', 124, 136).split('\0')[0].trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > buffer.length) {
      throw new Error('Neplatný archiv ČHMÚ');
    }
    const match = name.match(predictionPattern);
    if (match && header[156] === 48 && size > 8) {
      frames.push({
        id: 'f-' + match[1] + match[2] + '-' + match[3],
        time: utcDate(match[1], match[2]),
        minute: Number(match[3]),
        bytes: buffer.subarray(offset + 512, offset + 512 + size),
      });
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return frames.sort((a, b) => a.minute - b.minute);
}

export async function radar() {
  const [observations, archives] = await Promise.allSettled([
    latestFiles(observationRoot, observationPattern, 7),
    latestFiles(predictionRoot, archivePattern, 1),
  ]);
  if (observations.status === 'rejected') throw observations.reason;
  const frames = observations.value.map(([file, date, time]) => ({
    id: 'm-' + date + time,
    time: utcDate(date, time),
    minute: 0,
    url: observationRoot + file,
  }));
  if (!frames.length) throw new Error('ČHMÚ nevrátil žádné snímky');
  const latest = frames.at(-1).time;

  if (archives.status === 'rejected') {
    logEvent('warning', 'radar.forecast_failed', { source: 'radar' }, archives.reason);
  } else if (archives.value.length) {
    const [[file, date, time]] = archives.value;
    try {
      if (Date.parse(latest) - Date.parse(utcDate(date, time)) <= 15 * 60 * 1000) {
        const response = await fetchData(predictionRoot + file);
        const archive = Buffer.from(await response.arrayBuffer());
        if (archive.length <= 4_000_000) {
          frames.push(...unpackPredictions(archive).filter((frame) => frame.time > latest));
        }
      }
    } catch (error) {
      logEvent('warning', 'radar.forecast_failed', { source: 'radar' }, error);
    }
  }
  for (const frame of frames) {
    const existing = radarImages.get(frame.id);
    radarImages.set(frame.id, { ...frame, bytes: frame.bytes ?? existing?.bytes });
  }
  while (radarImages.size > 40) radarImages.delete(radarImages.keys().next().value);
  return {
    location: radarLocation,
    frames: frames.map(({ id, time, minute }) => ({ id, time, minute })),
  };
}

export async function radarImage(id) {
  const frame = radarImages.get(id);
  if (!frame) return null;
  if (!frame.bytes) {
    frame.bytes = Buffer.from(await (await fetchData(frame.url)).arrayBuffer());
  }
  return frame.bytes;
}

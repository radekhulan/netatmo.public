const timeZone = 'Europe/Prague';
const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' }).format;
const hourKey = new Intl.DateTimeFormat('cs-CZ', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format;
const outfit = /\b(?:na sebe|oblec\w*|pr[ei]oblec\w*|obout|obuti|vzit si (?:bund\w*|svetr\w*|destnik|plastenk\w*)|(?:vzit|potrebu\w*)[a-z ]{0,20}\b(?:bund\w*|svetr\w*|destnik|plastenk\w*)|(?:what|how|should i|do i need)[a-z ]{0,30}\b(?:wear|dress|jacket|umbrella))\b|ใส่อะไร|แต่งตัวยังไง|ควรใส่|เอาร่มไป/;
const forecast = /\b(?:pocasi|predpoved|dest\w*|prset|snih|snezi\w*|vitr|vetr\w*|vychod slunce|zapad slunce|venku|weather|forecast|rain\w*)\b|พยากรณ์อากาศ|ฝน/;

function relativeDay(text) {
  if (/\b(?:pozitri|day after tomorrow)\b|มะรืน/.test(text)) return 2;
  if (/\b(?:zitra|zitrejs\w*|tomorrow)\b|พรุ่งนี้/.test(text)) return 1;
  if (/\b(?:dnes|dnesn\w*|today|tonight)\b|วันนี้/.test(text)) return 0;
}

function weatherWords(text = '') {
  return text.toLowerCase().normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').trim();
}

export function voiceWeatherRequest(question, previous) {
  const current = weatherWords(question);
  const day = relativeDay(current);
  const partOfDay = /\b(?:rano|dopoledne|odpoledne|vecer|noc|morning|afternoon|evening|night)\b/.test(current);
  const followUp = (day !== undefined || partOfDay) && /^(?:a|tak|co|and|what about) /.test(current) && current.split(' ').length <= 6;
  const context = followUp ? weatherWords(previous) : '';
  const clothing = outfit.test(current) || outfit.test(context);
  if (!clothing && !forecast.test(current) && !forecast.test(context)) return null;
  return { purpose: clothing ? 'outfit' : 'forecast', dayOffset: day ?? relativeDay(context) ?? (clothing ? 0 : undefined) };
}

export function voiceWeatherData({ state, at, data }, request, location, now = Date.now()) {
  const { daily, hourly, current } = data ?? {};
  const hour = (time, index) => ({ time, temperature: hourly.temperature_2m?.[index],
    precipitationProbability: hourly.precipitation_probability?.[index], wind: hourly.wind_speed_10m?.[index] });
  const next24Hours = (hourly?.time ?? []).flatMap((time, index) => time >= now / 1000 - 3600 ? [hour(time, index)] : []).slice(0, 24);
  let requestedDay;
  if (request.dayOffset !== undefined) {
    const midnight = new Date(dateKey(now) + 'T00:00:00Z');
    midnight.setUTCDate(midnight.getUTCDate() + request.dayOffset);
    const date = midnight.toISOString().slice(0, 10);
    const index = daily?.time?.findIndex((time) => Number.isFinite(time) && dateKey(time * 1000) === date) ?? -1;
    const hours = (hourly?.time ?? []).flatMap((time, index) => Number.isFinite(time) && dateKey(time * 1000) === date
      ? [{ ...hour(time, index), localTime: hourKey(time * 1000), precipitationMm: hourly.precipitation?.[index],
        gustsKmh: hourly.wind_gusts_10m?.[index] }] : []);
    const summary = index >= 0 ? { minC: daily.temperature_2m_min?.[index], maxC: daily.temperature_2m_max?.[index],
      precipitationMm: daily.precipitation_sum?.[index], snowCm: daily.snowfall_sum?.[index],
      windKmh: daily.wind_speed_10m_max?.[index], gustsKmh: daily.wind_gusts_10m_max?.[index], weatherCode: daily.weather_code?.[index] } : null;
    requestedDay = { date, summary, hours };
  }
  return { state, at, location, timeZone, purpose: request.purpose, requestedDay, daily, current, next24Hours };
}

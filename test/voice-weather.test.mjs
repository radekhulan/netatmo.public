import assert from 'node:assert/strict';
import test from 'node:test';
import { voiceWeatherData, voiceWeatherRequest } from '../lib/voice-weather.mjs';

test('outfit and umbrella questions infer the need for local forecast data', () => {
  for (const question of ['Co si mám zítra vzít na sebe?', 'Jak se mám zítra obléct?', 'Mám si zítra vzít deštník?',
    'What should I wear tomorrow?', 'พรุ่งนี้ควรใส่อะไร']) {
    assert.deepEqual(voiceWeatherRequest(question), { purpose: 'outfit', dayOffset: 1 }, question);
  }
  assert.deepEqual(voiceWeatherRequest('A pozítří?', 'Co si mám zítra vzít na sebe?'), { purpose: 'outfit', dayOffset: 2 });
  assert.deepEqual(voiceWeatherRequest('Jaké bude zítra počasí?'), { purpose: 'forecast', dayOffset: 1 });
  assert.equal(voiceWeatherRequest('Vytři v kuchyni.'), null);
  assert.equal(voiceWeatherRequest('Co hraje na Spotify?', 'Jaké bude zítra počasí?'), null);
});

test('weather advice receives the requested Prague calendar day including its hourly precipitation and gusts', () => {
  const timestamp = (time) => Date.parse(time) / 1000;
  const times = ['2026-10-24T22:00:00Z', '2026-10-25T22:00:00Z', '2026-10-25T23:00:00Z', '2026-10-26T06:00:00Z'].map(timestamp);
  const source = { state: 'live', data: {
    daily: { time: [times[0], times[2]], temperature_2m_min: [12, 3], temperature_2m_max: [20, 8],
      precipitation_sum: [0, 5], wind_speed_10m_max: [10, 20], wind_gusts_10m_max: [20, 45] },
    hourly: { time: times, temperature_2m: [12, 14, 4, 6], precipitation: [0, 0, 0, 3],
      precipitation_probability: [0, 0, 30, 85], wind_speed_10m: [10, 10, 18, 20], wind_gusts_10m: [10, 14, 38, 45] },
  } };
  const day = voiceWeatherData(source, voiceWeatherRequest('Co si mám zítra vzít na sebe?'), 'Ukázková domácnost',
    Date.parse('2026-10-24T22:30:00Z'));
  assert.equal(day.location, 'Ukázková domácnost');
  assert.equal(day.purpose, 'outfit');
  assert.equal(day.requestedDay.date, '2026-10-26');
  assert.equal(day.requestedDay.summary.minC, 3);
  assert.equal(day.requestedDay.summary.precipitationMm, 5);
  assert.equal(day.requestedDay.summary.gustsKmh, 45);
  assert.deepEqual(day.requestedDay.hours.map(({ localTime, gustsKmh }) => [localTime, gustsKmh]), [['00:00', 38], ['07:00', 45]]);
  const unavailable = voiceWeatherData({ state: 'error' }, voiceWeatherRequest('Co si mám zítra vzít na sebe?'), 'Ukázková domácnost');
  assert.equal(unavailable.requestedDay.summary, null);
  assert.deepEqual(unavailable.requestedDay.hours, []);
});

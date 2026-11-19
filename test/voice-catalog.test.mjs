import assert from 'node:assert/strict';
import test from 'node:test';
import { voiceActions } from '../lib/voice-actions.mjs';
import { planVoice, planVoiceAction } from '../lib/voice-assistant.mjs';
import { planCatalogOperation } from '../lib/voice-catalog.mjs';
import { wantsAction } from '../lib/voice-languages.mjs';
import { voiceWritePermission } from '../lib/voice-request.mjs';

const config = {
  rooms: [
    { name: 'Obývák', heatingId: 'demo-heating' },
    { name: 'Ložnice' },
    { name: 'Pracovna' },
  ],
  fibaro: {
    devices: {
      9201: { room: 'Jídelna', name: 'Světlo', light: true },
      9202: { room: 'Ložnice', name: 'LED', light: true },
      9203: { room: 'Pracovna', name: 'LED', light: true },
    },
    actions: [
      { key: 'all-off', type: 'scene', name: 'Zhasnout' },
      { key: 'lamps-on', type: 'scene', name: 'Rozsvítit lampičky' },
      { key: 'lamp', type: 'scene', name: 'Lampa' },
    ],
  },
};
const live = (data) => ({ state: 'live', data });
const permissions = Object.fromEntries(Object.values(voiceActions).map(({ permission }) => [permission, true]));
const deps = {
  config,
  connections: () => permissions,
  lights: async () => live(Object.entries(config.fibaro.devices).filter(([, device]) => device.light).map(([id, device]) =>
    ({ ...device, id: Number(id), switchable: true, online: true, on: true, rgb: device.name === 'LED' }))),
  heating: async () => live({ rooms: config.rooms.map(({ name, heatingId }) => ({ name, id: heatingId, reachable: true, target: 21 })) }),
  climate: async () => live({ online: true, on: false, mode: 'heat', unit: 'C', temperature: 22, measured: 20.5 }),
  eco: () => ({ available: true, enabled: true, status: 'waiting', limits: {} }),
  timer: () => ({ enabled: true, timer: { active: true, id: 'x' }, presets: [{ id: 'evening', name: 'Večer', draft: { unit: 'C' } }] }),
  air: async () => live([{ room: 'Ložnice', model: 'demo-humidifier', available: true, on: true, mode: 'sleep', humiditySupported: true, humidityTarget: 50 },
    { room: 'Pracovna', model: 'demo-purifier', available: true, on: null, humiditySupported: false }]),
  vacuum: async (details) => live({ mapId: 4, state: 'returning_home', ...(details && { rooms: [
    { id: 1, name: 'Kuchyně' }, { id: 2, name: 'Chodba' }, { id: 3, name: 'Ložnice pro hosty' }] }) }),
  station: async () => live({}), rooms: () => config.rooms.map(({ name }) => ({ name, meter: { temperature: 21 } })),
  washer: async () => live({ connected: true, machMode: '2', remainingTimeMM: '35' }),
  coffee: async () => live({ status: 'standby', readings: { groundsPct: 38, espressoCount: 12 } }),
  solar: async () => live({ power: 123, day: 3 }),
  power: async () => live([]),
  outdoor: () => ({ temperature: 10 }),
  async command() { throw new Error('The catalog audit only plans commands'); },
};

test('every published writable example reaches its action locally or can propose the action through the whitelist', async () => {
  for (const [action, spec] of Object.entries(voiceActions)) {
    if (spec.access !== 'write') continue;
    const plan = await planVoice(spec.example, deps);
    const local = plan?.operation ?? plan?.client?.operation;
    if (local) {
      assert.equal(local, action, spec.example);
      assert.notEqual(plan.failed, true, spec.example);
    } else {
      const route = voiceWritePermission(spec.example, 'cs', null, wantsAction);
      assert.ok(route.allowed && route.domains.includes(action.split('.')[0]) && (!route.operations || route.operations.includes(action)),
        spec.example + ' must allow ' + action);
    }
  }
});

test('named controller settings and future timers do not grant other writes', () => {
  for (const [phrase, allowed] of [
    ['Oprav stav klimatizace na vypnuto', ['climate.sync']],
    ['Zapni chlazení v 18:00 a vypni ve 22:00', ['climate.timer.schedule', 'climate.timer.save']],
    ['Naplánuj klimatizaci od 18:00 do 22:00 na 23 stupňů', ['climate.timer.schedule', 'climate.timer.save']],
    ['Smaž uložený plán klimatizace Večer', ['climate.timer.delete']],
    ['Nahraď týdenní program topení stejným rozvrhem na každý den', ['heating.program']],
  ]) assert.deepEqual(voiceWritePermission(phrase, 'cs', null, wantsAction).operations, allowed, phrase);
  for (const phrase of ['Vypni kávovar', 'Vysaj všude, vynechej ložnici', 'Zapni chlazení v 18:00 a zhasni světlo']) {
    assert.equal(voiceWritePermission(phrase, 'cs', null, wantsAction).allowed, false, phrase);
  }
});

test('readings describe the requested statistic and Roborock validates the mode and active map', async () => {
  assert.match((await planVoice('Kdy dopere pračka?', deps)).message, /35 minut/);
  assert.match((await planVoice('Běží čistička v ložnici?', deps)).message, /je zapnutá/);
  assert.match((await planCatalogOperation('air.read', { room: 'Ložnice', metric: 'humidityTarget' }, deps)).message, /50 procent/);
  assert.equal((await planCatalogOperation('air.read', { room: 'Pracovna', metric: 'state' }, deps)).failed, true);
  assert.match((await planCatalogOperation('coffee.read', { metric: 'espresso' }, deps)).message, /12/);
  assert.match((await planCatalogOperation('climate.read', { metric: 'target' }, deps)).message, /22 stupňů/);
  assert.match((await planVoice('Co tedy dělá vysavač?', deps)).message, /vrací do doku/);
  assert.match((await planVoice('Ukonči vysávání.', deps)).message, /už se vrací/);
  const scoped = await planVoice('Vytři v ložnici pro hosty.', { ...deps, async command(path, body) {
    assert.equal(path, '/api/roborock');
    assert.deepEqual(body.segments, [3]);
    assert.equal(body.mapId, 4);
    return { status: 200 };
  } });
  assert.ok(scoped.run);
  await scoped.run();
  for (const args of [{ mode: 'mop', fan: 'quiet' }, { mode: 'mop', water: 'custom_water_flow' }]) {
    assert.equal((await planVoiceAction({ ...args, action: 'vacuum.start', room: 'kuchyne' }, deps)).run, undefined);
  }
});

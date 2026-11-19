import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVoiceIntent, repairCzechVoiceCommand } from '../lib/voice-intents.mjs';
import { planVoice } from '../lib/voice-assistant.mjs';
import { mayChange, planCatalogOperation, voiceCatalog } from '../lib/voice-catalog.mjs';

function fixture() {
  const calls = [];
  const rooms = [{ name: 'Obývák', meter: { temperature: 21.4 } }, { name: 'Ložnice', meter: { temperature: 19.2 } }];
  const heating = { state: 'live', data: { rooms: [{ name: 'Obývák', id: 'living', target: 21, reachable: true }] } };
  const deps = {
    config: { rooms, fibaro: { devices: { 1: { name: 'LED', room: 'Ložnice', light: true } },
      actions: [{ key: 'lamp', name: 'Lampa', type: 'scene' }] } },
    connections: () => ({ vacuum: true, heat: true, heating: true, station: true, fibaro: true, climate: true }),
    heating: async () => heating, station: async () => ({ state: 'live' }),
    rooms: () => rooms,
    vacuum: async (details) => ({ state: 'live', data: { mapId: 4, ...(details && { rooms: [{ id: 33, name: 'Kuchyň' }] }) } }),
    async command(path, body) { calls.push([path, body]); return { status: 200, data: { temperature: 22 } }; },
  };
  return { deps, calls };
}

test('Czech request for mopping selects only the matched segment', async () => {
  const { deps, calls } = fixture();
  const plan = await planVoice('Potřebuji vytřít v kuchyni', deps);
  assert.match(plan.announcement, /vytírání.*V kuchyni/);
  assert.match((await planVoice('Potřebuji vytřijít v kuchyni.', deps)).announcement, /vytírání.*V kuchyni/);
  await plan.run();
  assert.deepEqual(calls, [['/api/roborock', { action: 'start', mode: 'mop', segments: [33], mapId: 4, settings: {} }]]);
  deps.vacuum = async (details) => ({ state: 'live', data: { mapId: details ? 4 : 5, rooms: [{ id: 33, name: 'Kuchyň' }] } });
  assert.equal((await planVoice('Vytři v kuchyni', deps)).run, undefined);
  assert.equal((await planVoice('Nevytírej v kuchyni', deps)), null);
  assert.equal(calls.length, 1);
});

test('a vacuum mode request with a named room cleans only that room', async () => {
  const { deps, calls } = fixture();
  deps.vacuum = async (details) => ({ state: 'live', data: { mapId: 4,
    ...(details && { rooms: [{ id: 6, name: 'Chodba' }, { id: 33, name: 'Kuchyně' }] }) } });
  for (const [phrase, mode] of [
    ['Zapni vysavač pro vysávání v chodbě.', 'vacuum'],
    ['Zapni mi vysavač na chodbě.', 'vacuum'],
    ['Spusť vysavač na vytírání v chodbě.', 'mop'],
  ]) {
    const plan = await planVoice(phrase, deps);
    assert.match(plan.announcement, /Na chodbě/);
    await plan.run();
    assert.deepEqual(calls.at(-1), ['/api/roborock', { action: 'start', mode, segments: [6], mapId: 4, settings: {} }]);
  }
  const unavailable = await planVoice('Zapni vysavač pro vysávání v pracovně.', deps);
  assert.equal(unavailable.run, undefined);
  assert.equal(calls.length, 3);
  const multiple = await planVoice('Vytři v kuchyni a na chodbě.', deps);
  await multiple.run();
  assert.deepEqual(calls.at(-1), ['/api/roborock', { action: 'start', mode: 'mop', segments: [33, 6], mapId: 4, settings: {} }]);
  assert.equal((await planVoice('Vytři všude kromě kuchyně.', deps))?.run, undefined);
});

test('Spusť mi vysávání v kuchyni selects exactly the kitchen on the current map', async () => {
  const { deps, calls } = fixture();
  for (const phrase of ['Spusť mi vysávání v kuchyni.', 'Spusť mi vysavač pro kuchyni.']) {
    const plan = await planVoice(phrase, deps);
    assert.equal(plan.operation, 'vacuum.start');
    await plan.run();
    assert.deepEqual(calls.at(-1), ['/api/roborock', { action: 'start', mode: 'vacuum', segments: [33], mapId: 4, settings: {} }]);
  }
});

test('general light commands select the main ceiling light and recognize optional or merged mi', async () => {
  const { deps, calls } = fixture();
  const fibaro = { devices: {
    9101: { room: 'Pracovna', name: 'Stropní světlo', light: true },
    9102: { room: 'Pracovna', name: 'Světlo', light: true },
    9103: { room: 'Kuchyně', name: 'Světlo', light: true },
    9104: { room: 'Obývák', name: 'Světlo', light: true },
    9105: { room: 'Obývák', name: 'Lampa', light: true },
    9106: { room: 'Pracovna', name: 'LED', light: true },
  } };
  deps.lights = async () => ({ state: 'live',
    data: Object.entries(fibaro.devices).filter(([, device]) => device.light)
      .map(([id, device]) => ({ ...device, id: Number(id), switchable: true, online: true })) });
  const examples = new Map([
    ['Světlo v pracovně.', [9102, true]],
    ['V pracovně světla.', [9102, true]],
    ['Zapními světlo v pracovně.', [9102, true]],
    ['Rozsviť mi světla v kuchyni.', [9103, true]],
    ['Zapni mi v obýváku světlo.', [9104, true]],
    ['Vypni mi světlo v obýváku.', [9104, false]],
    ['Vypni stropní světla v kuchyni.', [9103, false]],
    ['Zhasni mi světla v pracovně.', [9102, false]],
    ['Zapni mi lampu v obýváku.', [9105, true]],
    ['Rozsviť LED v pracovně.', [9106, true]],
  ]);
  for (const verb of ['rozsviť', 'zapni', 'zhasni', 'vypni']) {
    const on = verb === 'rozsviť' || verb === 'zapni';
    for (const mi of ['', ' mi', 'mi']) examples.set(verb + mi + ' světlo v pracovně', [9102, on]);
  }
  for (const [phrase, [id, on]] of examples) {
    const plan = await planVoice(phrase, deps);
    assert.ok(plan?.run, phrase);
    await plan.run();
    assert.deepEqual(calls.at(-1), ['/api/fibaro/devices', { id, on }], phrase);
  }
  const missingRoom = await planVoice('Světla', deps);
  assert.equal(missingRoom.message, 'Ve které místnosti?');
  assert.equal(missingRoom.run, undefined);
  await (await planVoice('V kuchyni.', deps, missingRoom.context)).run();
  assert.deepEqual(calls.at(-1), ['/api/fibaro/devices', { id: 9103, on: true }]);
  const fallback = await planCatalogOperation('light.set', { room: 'Kuchyně', value: true }, deps);
  await fallback.run();
  assert.deepEqual(calls.at(-1), ['/api/fibaro/devices', { id: 9103, on: true }]);
  const ledOnly = { ...deps, lights: async () => ({ state: 'live',
    data: [{ name: 'LED', room: 'Pracovna', id: 9106, switchable: true, online: true }] }) };
  assert.equal((await planVoice('Zapni světlo v pracovně.', ledOnly)).run, undefined);
});

test('standalone Czech end phrases close the current conversation', async () => {
  let last;
  for (const phrase of ['Konec.', 'Na konec.', 'Stop!', 'Hotovo.', 'Hoitovo.', 'Děkuji.']) {
    const answer = await planVoice(phrase, {});
    assert.equal(answer.end, true);
    assert.match(answer.message, /Loučím se|Tak zatím|Měj se|Jsem tu/);
    assert.notEqual(answer.message, last);
    last = answer.message;
  }
  assert.equal(await planVoice('Stop vysavač.', {}), null);
});

test('Spotify queries and transport are delegated to the originating browser', async () => {
  const { deps, calls } = fixture();
  for (const phrase of ['Přehraj Lucie.', 'Přehrajme Lucie na Spotify.', 'Přehrajmi na Spotify Lucie!',
    'Če hraj Lucie na Spotify?', 'Če hraj Lucie.', 'Přehraj, Lucie.', 'Přehrají Lucie na Spotify.',
    'Zahrali Lucie.', 'Zahráli Lucie.', 'Chci přehrát Lucie.', 'Přehraj Lucie (na Spotify).', 'Prosím, přehraj Lucie.']) {
    const plan = await planVoice(phrase, deps);
    assert.deepEqual(plan.client, { operation: 'spotify.play', query: 'Lucie' });
  }
  for (const [phrase, client] of [
    ['Pusť mi playlist Večerní hudba.', { operation: 'spotify.play', query: 'Večerní hudba', kind: 'playlist' }],
    ['Přehraj kapelu Lucie.', { operation: 'spotify.play', query: 'Lucie', kind: 'artist' }],
    ['Přehraj skladbu Voda živá od Anety Langerové.', { operation: 'spotify.play', query: 'Voda živá od Anety Langerové', kind: 'track' }],
    ['Najdi mi na Spotify Lucie.', { operation: 'spotify.search', query: 'Lucie' }],
    ['Další skladba.', { operation: 'spotify.next' }],
    ['Zastav hudbu.', { operation: 'spotify.pause' }],
    ['Pokračuj v přehrávání hudby na Spotify.', { operation: 'spotify.resume' }],
    ['Pokračuj v přehrávání na Sporify.', { operation: 'spotify.resume' }],
    ['Co teď hraje?', { operation: 'spotify.read' }],
  ]) {
    assert.deepEqual((await planVoice(phrase, deps)).client, client);
  }
  assert.equal((await planVoice('Spusť vysavač.', deps)).context?.clarify, true);
  assert.ok((await planVoice('Spusť vysavač všude.', deps)).run);
  assert.equal(await planVoice('Če hraje Lucie?', deps), null);
  assert.equal(await planVoice('Přehrají Lucie na Spotify?', deps), null);
  assert.equal(await planVoice('Můžeš pokračovat.', deps), null);
  assert.equal(await planVoice('Můžeš pokračovat.', deps, { intent: { action: 'vacuum.read' } }), null);
  assert.deepEqual(calls, []);
});

test('temperature reading and Czech follow-up keep the association with the previous question', async () => {
  const { deps, calls } = fixture();
  const first = await planVoice('Kolik je teď v obýváká stupňů?', deps);
  const second = await planVoice('A vložnice.', deps, first.context);
  assert.equal(first.message, 'V obýváku je 21,4 stupňů.');
  assert.equal(second.message, 'V ložnici je 19,2 stupňů.');
  assert.deepEqual(calls, []);
});

test('relative heating command asks the server for a delta against its latest setpoint', async () => {
  const { deps, calls } = fixture();
  const plan = await planVoice('Zvyšmy teplotu v obýváku na dvě hodiny o jeden stupeň.', deps);
  assert.match((await plan.run()).message, /22 stupňů na 2 hodiny/);
  assert.deepEqual(calls, [['/api/heating', { id: 'living', delta: 1, durationHours: 2 }]]);
});

test('a relative heating request can refer to the room from the previous temperature reading', async () => {
  const { deps, calls } = fixture();
  const heating = await deps.heating();
  heating.data.rooms.push({ name: 'Ložnice', id: 'bedroom', target: 19, reachable: true });
  const first = await planVoice('Jaká je teplota v obýváku?', deps);
  assert.equal(first.message, 'V obýváku je 21,4 stupňů.');
  for (const phrase of ['Zvětši mi tu teplotu o 1 stupeň na 2 hodiny.', 'Zvěšmej tu teplotu o 1 stupeň na 2 hodiny.']) {
    const plan = await planVoice(phrase, deps, first.context);
    assert.match(plan.announcement, /Obývák/);
    await plan.run();
  }
  await (await planVoice('Zvyš mi teplotu v ložnici o půl stupně na hodinu.', deps, first.context)).run();
  assert.deepEqual(calls, [
    ['/api/heating', { id: 'living', delta: 1, durationHours: 2 }],
    ['/api/heating', { id: 'living', delta: 1, durationHours: 2 }],
    ['/api/heating', { id: 'bedroom', delta: 0.5, durationHours: 1 }],
  ]);
  const noContext = await planVoice('Zvětši mi tu teplotu o 1 stupeň.', deps);
  assert.equal(noContext.message, 'V které místnosti mám změnit topení?');
  assert.equal(noContext.run, undefined);
  const outdoor = { intent: { action: 'outdoor.read', metric: 'temperature' } };
  assert.equal((await planVoice('Zvyš tu teplotu o 1 stupeň.', deps, outdoor)).run, undefined);
});

test('a comparative temperature request changes the target relatively with an optional duration', async () => {
  const { deps, calls } = fixture();
  for (const phrase of [
    'Nastav mi v obýváku teplotu o 1 stupen vyšěší.',
    'Nastav v obýváku teplotu o jeden stupeň vyšší.',
    'Nastav teplotu v obýváku o stupeň nižší na hodinu.',
    'Dej mi v obýváku topení na tři hodiny o půl stupně níž.',
  ]) {
    const plan = await planVoice(phrase, deps);
    assert.ok(plan?.run, phrase);
    await plan.run();
  }
  assert.deepEqual(calls.map(([, { delta, durationHours }]) => [delta, durationHours]), [[1, 2], [1, 2], [-1, 1], [-0.5, 3]]);
  assert.equal((await planVoice('Nastav teplotu v obýváku o 1,2 stupně výš', deps))?.run, undefined);
});

test('catalog exposes connected controls and validates planned actions before a write', async () => {
  const { deps, calls } = fixture();
  const catalog = voiceCatalog(deps);
  assert.ok(catalog.operations['vacuum.start']);
  assert.equal(catalog.actions['vacuum.start'].access, 'write');
  assert.equal(catalog.actions['light.read'].access, 'read');
  assert.equal(catalog.operations['air.set'], undefined);
  assert.equal(mayChange('Co se stane, když vypneš světlo?'), false);
  assert.equal(mayChange('Můžeš mi říct, co by se stalo, kdybys zhasnul v ložnici?'), false);
  assert.equal(mayChange('Mohl bys mi říct, jestli svítí v ložnici?'), false);
  assert.equal(mayChange('Mohl bys zhasnout v ložnici?'), true);
  assert.equal(mayChange('Potřebuji uklidit v kuchyni'), true);
  assert.equal(mayChange('Chci, abys nevypnul světla'), false);
  assert.equal(await planCatalogOperation('vacuum.start', { room: 'kuchyne', mode: 'unsupported' }, deps), null);
  assert.equal(await planCatalogOperation('vacuum.start', { room: 'kuchyne', mode: 'mop', segments: [] }, deps), null);
  assert.deepEqual(calls, []);
  const mop = await planCatalogOperation('vacuum.start', { room: 'kitchen', mode: 'mop' }, deps);
  assert.match(mop.announcement, /vytírání.*V kuchyni/);
  await mop.run();
  await (await planVoice('Spusť scénu Lampa', deps)).run();
  assert.deepEqual(calls, [
    ['/api/roborock', { action: 'start', mode: 'mop', segments: [33], mapId: 4, settings: {} }],
    ['/api/fibaro', { key: 'lamp' }],
  ]);
});

test('editing a weekly heating program requires explicit confirmation and the same revision', async () => {
  const { deps, calls } = fixture();
  let revision = 'first';
  deps.heatingProgram = async () => ({ editable: true, revision, zones: [{ id: 1, rooms: [{ id: 'living' }] }] });
  const args = { periods: [{ minute: 0, zoneId: 1 }], temperatures: [] };
  const invalid = await planCatalogOperation('heating.program', { ...args, periods: [{ minute: 60, zoneId: 1 }] }, deps);
  assert.equal(invalid.failed, true);
  const draft = await planCatalogOperation('heating.program', args, deps);
  assert.match(draft.message, /sedm dní/);
  assert.equal(draft.run, undefined);
  const { operation, args: confirmed } = draft.context.confirm;
  const plan = await planCatalogOperation(operation, confirmed, deps, true);
  await plan.run();
  assert.deepEqual(calls, [['/api/heating/program', { ...args, revision: 'first' }]]);
  revision = 'second';
  const stale = await planCatalogOperation(operation, confirmed, deps, true);
  assert.equal(stale.failed, true);
  assert.equal(stale.run, undefined);
});


test('merged Czech switch commands work across device families', () => {
  const examples = [
    ['Zapníme světlo v pracovně.', { action: 'light.set', room: 'pracovna', value: true }],
    ['Zapnime klimatizaci.', { action: 'climate.power', value: true }],
    ['Zapni mi klimatizaci.', { action: 'climate.power', value: true }],
    ['Zapníme, čističku v ložnici.', { action: 'air.set', room: 'loznice', value: true }],
    ['Zapnimi vysavač na vytírání v chodbě.', { action: 'vacuum.start', room: 'chodba', mode: 'mop' }],
    ['Prosím, zapneme kávovar.', { action: 'coffee.wake' }],
    ['Zapněme kávovar.', { action: 'coffee.wake' }],
    ['zapněmě kávovar', { action: 'coffee.wake' }],
    ['Zapni mě kávovar.', { action: 'coffee.wake' }],
    ['Spusťmě vysávání v kuchyni.', { action: 'vacuum.start', room: 'kuchyne', mode: 'vacuum' }],
    ['Rozsvítmě světlo v pracovně.', { action: 'light.set', room: 'pracovna', value: true }],
    ['Nastavmě teplotu v obýváku na 22.', { action: 'heat.set', room: 'obyvak', value: 22 }],
    ['Vypníme klimatizaci.', { action: 'climate.power', value: false }],
  ];
  for (const [phrase, expected] of examples) assert.deepEqual(parseVoiceIntent(phrase), expected, phrase);
  assert.equal(repairCzechVoiceCommand('A zapneme ho potom?'), 'A zapneme ho potom?');
  assert.equal(parseVoiceIntent('Nezapneme světlo v pracovně.'), null);
  assert.equal(parseVoiceIntent('Zapneme světlo v pracovně, pokud bude tma?'), null);
});


test('Czech device repair is constrained to an unambiguous connected device in command context', () => {
  const connected = { vacuum: true, solar: true, climate: true };
  for (const [input, output] of [
    ['Jak se má vesavač?', 'Jak se má vysavač?'],
    ['Spusť vysvač v chodbě.', 'Spusť vysavač v chodbě.'],
    ['Zapníme vesavač v chodbě.', 'Zapni mi vysavač v chodbě.'],
    ['Kolik vyrobila fotovoltajka včera?', 'Kolik vyrobila fotovoltaika včera?'],
    ['Vypni klymatizaci.', 'Vypni klimatizaci.'],
    ['Přehraj Vesavač.', 'Přehraj Vesavač.'],
    ['Co znamená vesavač?', 'Co znamená vesavač?'],
    ['Zapni světlo vedle vesavače.', 'Zapni světlo vedle vesavače.'],
    ['Zapni. Vesavač.', 'Zapni. Vesavač.'],
  ]) assert.equal(repairCzechVoiceCommand(input, connected), output, input);
  assert.equal(repairCzechVoiceCommand('Jak se má vesavač?', {}), 'Jak se má vesavač?');
});


test('finishing vacuuming returns the robot to the dock while pausing stops it in place', async () => {
  const { deps, calls } = fixture();
  for (const phrase of ['Ukonči vysávání.', 'Ukonči mi úklid.', 'Vysavač zpět do doku.',
    'Vysavač zpět do docklu.', 'Pošli vysavač zpět do doklu.', 'Roborock do stanice.']) {
    const plan = await planVoice(phrase, deps);
    assert.equal(plan.operation, 'vacuum.dock', phrase);
    await plan.run();
    assert.deepEqual(calls.at(-1), ['/api/roborock', { action: 'dock' }]);
  }
  const last = { intent: { action: 'vacuum.read' } };
  const finish = await planVoice('Tak ho ukonči.', deps, last);
  assert.equal(finish.operation, 'vacuum.dock');
  await (await planVoice('Pozastav vysávání.', deps)).run();
  assert.deepEqual(calls.at(-1), ['/api/roborock', { action: 'pause' }]);
  assert.equal(await planVoice('Neukonči vysávání.', deps), null);
});

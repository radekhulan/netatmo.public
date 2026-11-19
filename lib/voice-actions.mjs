const choice = (...values) => ({ enum: values });
const text = (maxLength) => ({ type: 'string', maxLength });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const number = (minimum, maximum, multipleOf) => ({ type: 'number', minimum, maximum, multipleOf });
const shape = (required = {}, optional = {}) => ({ type: 'object', properties: { ...required, ...optional },
  required: Object.keys(required), additionalProperties: false });
const list = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const flag = { type: 'boolean' };
const room = text(60);
const name = text(40);
const target = choice('led', 'lamp', 'ceiling');
const light = { room, target, device: text(60) };
const brightness = integer(1, 100);
const duration = choice(1, 2, 3, 6, 8, 12);
const temperature = number(7, 28, 0.5);
const mode = choice('cool', 'heat', 'auto', 'dry', 'fan');
const climateTemperature = integer(0, 110);
const time = { ...text(5), pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' };
const change = nullable(shape({ time, temperature: climateTemperature }, { eco: flag }));
const timerRequired = { startTime: nullable(time), startTemperature: climateTemperature, change, stopTime: nullable(time) };
const timerOptional = { startEco: flag, extraChange: change, mode: choice('cool', 'heat'), ecoPercent: integer(50, 500) };
const setting = text(25);
const kind = choice('track', 'playlist', 'artist', 'album');
const query = text(90);
const metrics = choice('temperature', 'humidity', 'co2', 'noise');
export const vacuumSettingsByMode = {
  vacuum: ['fan'], mop: ['water', 'route', 'waterLevel'], vac_and_mop: ['fan', 'water', 'route', 'waterLevel'],
  vac_then_mop: ['fan', 'water', 'route', 'waterLevel'], smart_mode: [], custom: [],
};
const write = (permission, summary, example, args = shape()) => ({ permission, access: 'write', summary, example, args });
const read = (permission, summary, example, args = shape()) => ({ permission, access: 'read', summary, example, args });

export const voiceActions = {
  'light.set': write('fibaro', 'Zapnutí nebo vypnutí světla. room + target, nebo přesný device. Výchozí v místnosti je strop.',
    'Zapni světlo Jídelna', shape({ value: flag }, light)),
  'light.allOff': write('fibaro', 'Scéna zhasnutí všech světel', 'Zhasni světla všude'),
  'light.lamps': write('fibaro', 'Scéna lampiček', 'Zapni lampičky', shape({ value: flag })),
  'light.scene': write('fibaro', 'Spuštění nakonfigurované scény podle názvu nebo klíče', 'Spusť scénu Lampa', shape({ value: text(60) })),
  'light.brightness': write('fibaro', 'Jas RGB světla v procentech', 'Ztlum LED v ložnici na 30 procent', shape({ value: brightness }, light)),
  'light.color': write('fibaro', 'Barva a volitelný jas RGB světla', 'Nastav LED v pracovně na modrou',
    shape({ value: choice('red', 'pink', 'yellow', 'green', 'blue', 'white', 'purple') }, { ...light, brightness })),
  'light.read': read('fibaro', 'Stav světla, případně jas a barva RGB', 'Svítí LED v pracovně?', shape({}, { ...light, metric: choice('state', 'brightness', 'color') })),
  'heat.set': write('heat', 'Dočasná cílová teplota ve °C. Výchozí doba 2 hodiny.', 'Nastav v obýváku 22 stupňů',
    shape({ room, value: temperature }, { duration })),
  'heat.adjust': write('heat', 'Relativní změna aktuálního cíle v °C. Záporná hodnota snižuje, výchozí doba 2 hodiny.',
    'Zvyš v obýváku cíl o stupeň na dvě hodiny', shape({ room, value: number(-10, 10, 0.5) }, { duration })),
  'heat.resume': write('heat', 'Zrušení ruční změny v místnosti', 'Vrať topení v obýváku na program', shape({ room })),
  'heat.mode': write('heat', 'Režim domácnosti podle programu nebo nepřítomnost', 'Zapni režim Pryč', shape({ value: choice('schedule', 'away') })),
  'heat.read': read('heating', 'Cílová a naměřená teplota hlavice, režim a doba ruční změny', 'Jaký je cíl topení v obýváku?',
    shape({ room }, { metric: choice('target', 'temperature', 'mode', 'until') })),
  'heat.mode.read': read('heating', 'Aktivní režim domácnosti', 'V jakém režimu je topení?'),
  'boiler.read': read('heating', 'Stav kotle a požadavky hlavic', 'Topí kotel?'),
  'room.read': read('station', 'Aktuální měření v místnosti', 'Kolik je v obýváku stupňů?', shape({ room }, { metric: metrics })),
  'outdoor.read': read('station', 'Venkovní teplota nebo vlhkost', 'Jaká je venkovní teplota?', shape({}, { metric: choice('temperature', 'humidity') })),
  'heating.program': write('heat', 'Výslovná náhrada programu stejným denním rozvrhem pro všech sedm dní. Vyžaduje potvrzení.',
    'Nahraď týdenní program topení stejným rozvrhem na každý den', shape({
      periods: list(shape({ minute: integer(0, 1439), zoneId: integer(0, Number.MAX_SAFE_INTEGER) }), 1, 48),
      temperatures: list(shape({ zoneId: integer(0, Number.MAX_SAFE_INTEGER), roomId: room, temperature: number(5, 30, 0.5) }), 0, 150),
    })),
  'climate.set': write('climate', 'Zapnutí režimu klimatizace, volitelná teplota v jednotce zařízení', 'Zapni chlazení na 23 stupňů',
    shape({ value: mode }, { temperature: climateTemperature })),
  'climate.power': write('climate', 'Zapnutí nebo vypnutí klimatizace', 'Vypni klimatizaci', shape({ value: flag })),
  'climate.fan': write('climate', 'Rychlost ventilátoru z aktuálně podporovaných hodnot', 'Nastav ventilátor klimatizace na tichý', shape({ value: text(30) })),
  'climate.temperature': write('climate', 'Cílová teplota v běžícím režimu', 'Nastav klimatizaci na 22 stupňů', shape({ value: climateTemperature })),
  'climate.sync': write('climate', 'Pouze oprava hlášeného stavu po použití ovladače', 'Oprav stav klimatizace na vypnuto', shape({ value: flag })),
  'climate.read': read('climate', 'Napájení, režim, ventilátor a měřená či cílová teplota klimatizace', 'Je klimatizace zapnutá?',
    shape({}, { metric: choice('state', 'mode', 'fan', 'temperature', 'target') })),
  'climate.eco.set': write('eco', 'Zapnutí nebo vypnutí řízení klimatizace z fotovoltaiky', 'Zapni Eco klimatizace', shape({ value: flag })),
  'climate.eco': read('eco', 'Stav a důvod čekání režimu Eco', 'Proč Eco čeká?'),
  'climate.eco.limits': write('climate', 'Změna zadaných limitů Eco', 'Nastav v Eco limit domu na 60 procent výroby',
    shape({}, { climatePercent: number(50, 500), householdPercent: number(1, 100), minimumSolarW: integer(0, Number.MAX_SAFE_INTEGER) })),
  'climate.timer.start': write('climate', 'Spuštění uloženého plánu', 'Spusť plán klimatizace Večer', shape({ value: name })),
  'climate.timer.schedule': write('climate', 'Naplánování zapnutí, změn a vypnutí klimatizace v místním čase', 'Zapni chlazení v 18:00 a vypni ve 22:00',
    shape(timerRequired, timerOptional)),
  'climate.timer.save': write('climate', 'Uložení plánu. Přepsání vyžaduje potvrzení.', 'Ulož plán klimatizace jako Večer',
    shape({ ...timerRequired, name, unit: choice('C', 'F') }, timerOptional)),
  'climate.timer.cancel': write('climate', 'Zrušení aktivního časovače', 'Zruš časovač klimatizace'),
  'climate.timer.delete': write('climate', 'Smazání uloženého plánu s potvrzením', 'Smaž uložený plán klimatizace Večer', shape({ name })),
  'climate.timer.read': read('climate', 'Stav časovače a další krok', 'Běží časovač klimatizace?'),
  'climate.timer.list': read('climate', 'Názvy uložených plánů', 'Vyjmenuj uložené plány klimatizace'),
  'vacuum.start': write('vacuum', 'Úklid zadaných místností. wholeHome pouze při výslovném požadavku na celý domov.',
    'Vytři kuchyni a chodbu', shape({ mode: choice('vacuum', 'mop', 'vac_and_mop', 'vac_then_mop', 'smart_mode', 'custom') },
      { room, rooms: list(room, 1, 32), wholeHome: flag, fan: setting, water: setting, route: setting, waterLevel: integer(1, 30) })),
  'vacuum.dock': write('vacuum', 'Ukončení úklidu a návrat do doku', 'Ukonči vysávání'),
  'vacuum.pause': write('vacuum', 'Pozastavení úklidu', 'Pozastav vysavač'),
  'vacuum.resume': write('vacuum', 'Pokračování přerušeného úklidu', 'Pokračuj v úklidu'),
  'vacuum.read': read('vacuum', 'Stav, dok, baterie, průběh, doba a plocha úklidu, údržba, historie nebo aktivní mapa', 'Které místnosti vidí vysavač?',
    shape({}, { metric: choice('state', 'battery', 'progress', 'rooms', 'duration', 'area', 'dock', 'maintenance', 'history') })),
  'air.set': write('air', 'Zapnutí nebo vypnutí Philips Air+', 'Zapni čističku v ložnici', shape({ value: flag }, { room })),
  'air.mode': write('air', 'Režim Philips Air+', 'Přepni čističku v ložnici na noční režim', shape({ value: choice('auto', 'sleep', 'medium', 'turbo') }, { room })),
  'air.humidity': write('air', 'Cílová vlhkost u modelu s nádržkou', 'Nastav vlhkost v ložnici na 50 procent', shape({ value: choice(40, 50, 60, 70) }, { room })),
  'air.read': read('air', 'Stav, režim, PM2.5, alergeny, filtr, vlhkost nebo nádržka čističky', 'Kolik zbývá filtru čističky v ložnici?',
    shape({}, { room, metric: choice('state', 'mode', 'pm25', 'allergens', 'filter', 'humidity', 'humidityTarget', 'water') })),
  'washer.read': read('washer', 'Stav a zbývající čas cyklu Haier', 'Za jak dlouho dopere pračka?'),
  'coffee.read': read('coffee', 'Stav, zbývající kapacita údržby a počty nápojů', 'Je kávovar připravený?',
    shape({}, { metric: choice('state', 'grounds', 'descale', 'coffee', 'espresso', 'cappuccino', 'coldBrew', 'water') })),
  'coffee.wake': write('coffee', 'Probuzení kávovaru', 'Probuď kávovar'),
  'solar.read': read('solar', 'Výkon nebo výroba fotovoltaiky', 'Kolik teď vyrábí fotovoltaika?',
    shape({}, { metric: choice('power', 'today', 'yesterday') })),
  'power.read': read('power', 'Okamžitý příkon domu nebo jmenovaného měřiče Fibaro', 'Jaký příkon má počítač v pracovně?', shape({}, { device: text(60) })),
  'batteries.refresh': write('batteries', 'Vynucená kontrola baterií Netatmo', 'Aktualizuj baterie'),
  'spotify.play': write('spotify', 'Přehrání v prohlížeči přihlášeného tabletu', 'Přehraj Lucie', shape({ query }, { kind })),
  'spotify.search': read('spotify', 'Vyhledání v přihlášeném prohlížeči', 'Najdi na Spotify Lucie', shape({ query }, { kind })),
  'spotify.pause': write('spotify', 'Pozastavení hudby', 'Pozastav Spotify'),
  'spotify.resume': write('spotify', 'Pokračování v přehrávání', 'Pokračuj ve Spotify'),
  'spotify.next': write('spotify', 'Další skladba', 'Další skladba'),
  'spotify.previous': write('spotify', 'Předchozí skladba', 'Předchozí skladba'),
  'spotify.read': read('spotify', 'Právě přehrávaná skladba na tabletu', 'Co hraje na Spotify?'),
  'spotify.volume': write('spotify', 'Hlasitost hudby v procentech', 'Nastav hlasitost Spotify na 30 procent', shape({ volume: integer(0, 100) })),
};

export function voiceActionAllowed(action, permissions) {
  const spec = Object.hasOwn(voiceActions, action) ? voiceActions[action] : null;
  if (!spec) return false;
  if (action === 'room.read') return Boolean(permissions.station || permissions.heating);
  return Boolean(permissions[spec.permission]);
}

export function validVoiceValue(schema, value) {
  if (schema.anyOf) return schema.anyOf.some((member) => validVoiceValue(member, value));
  if (schema.enum) return schema.enum.includes(value);
  if (schema.type === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    schema.required.every((key) => Object.hasOwn(value, key)) &&
    Object.entries(value).every(([key, entry]) => Object.hasOwn(schema.properties, key) && validVoiceValue(schema.properties[key], entry)));
  if (schema.type === 'array') return Array.isArray(value) && value.length >= schema.minItems && value.length <= schema.maxItems &&
    value.every((entry) => validVoiceValue(schema.items, entry));
  if (schema.type === 'string') return typeof value === 'string' && Boolean(value.trim()) && value.length <= schema.maxLength &&
    !/[\r\n\u0000]/.test(value) && (!schema.pattern || new RegExp(schema.pattern).test(value));
  if (schema.type === 'number' || schema.type === 'integer') return Number.isFinite(value) &&
    (schema.type !== 'integer' || Number.isSafeInteger(value)) && value >= schema.minimum && value <= schema.maximum &&
    (!schema.multipleOf || Number.isInteger(value / schema.multipleOf));
  return schema.type === 'null' ? value === null : typeof value === schema.type;
}

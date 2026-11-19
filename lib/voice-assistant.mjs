import { czechLightWish, mentionedVoiceRoom, normalizeVoiceText, parseVoiceIntent, repairCzechVoiceCommand, resolveVoiceRoom, spokenNumber } from './voice-intents.mjs';
import { voiceActionAllowed, voiceActions, vacuumSettingsByMode } from './voice-actions.mjs';
import { czechVoiceFollowUp, planContextualVoice, voiceContextDomain } from './voice-context.mjs';
import { closesVoice, voiceFarewell } from './voice-farewell.mjs';

const unavailable = (name) => ({ message: name + ' právě není k dispozici.', failed: true });
const number = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format;
const metrics = {
  temperature: ['Teplota', 'stupňů'],
  humidity: ['Vlhkost', 'procent'],
  co2: ['Oxid uhličitý', 'pé pé em'],
  noise: ['Hluk', 'decibelů'],
};
const lightNames = { led: 'LED', lamp: 'lampu', ceiling: 'stropní světlo' };
const roomPlaces = { obyvak: 'V obýváku', pracovna: 'V pracovně', loznice: 'V ložnici', studovna: 'Ve studovně',
  kuchyne: 'V kuchyni', jidelna: 'V jídelně', koupelna: 'V koupelně', chodba: 'Na chodbě' };
const readActions = new Set(['room.read', 'outdoor.read']);
const clock = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: 'numeric', minute: 'numeric' });
const climateModes = { cool: 'chlazení', heat: 'topení', auto: 'automatický režim', dry: 'odvlhčování', fan: 'ventilace' };
const fanNames = { auto: 'automatická', quiet: 'tichá', low: 'nízká', medium: 'střední', medium_high: 'středně vysoká', high: 'vysoká', strong: 'maximální' };
const rgbNames = { red: 'červená', pink: 'růžová', yellow: 'žlutá', green: 'zelená', blue: 'modrá', white: 'bílá', purple: 'fialová' };
const vacuumStates = { idle: 'čeká', charger_disconnected: 'je mimo dok', cleaning: 'uklízí', paused: 'má pozastavený úklid',
  charging: 'se nabíjí', charging_complete: 'je v doku a plně nabitý', returning_home: 'se vrací do doku',
  emptying_the_bin: 'vysypává zásobník', washing_the_mop: 'pere mopy', washing_the_mop_2: 'pere mopy',
  error: 'hlásí chybu', charging_problem: 'hlásí chybu nabíjení', device_offline: 'je nedostupný',
  updating: 'se aktualizuje', mapping: 'právě mapuje byt' };
const vacuumDocked = new Set(['charging', 'charging_complete', 'emptying_the_bin', 'washing_the_mop', 'washing_the_mop_2']);


const capabilityQuestions = {
  cs: /^(?:(?:a|tak|jarvisi?|prosim)[, ]+)*(?:co (?:vsechno )?(?:(?:pro me )?muzes(?: (?:pro me )?(?:udelat|delat|ovladat|nabidnout))?|umis|dokazes)|jak mi muzes (?:pomoct|pomoci)|s cim mi (?:muzes (?:pomoct|pomoci)|pomuzes)|jaka zarizeni (?:mas|ovladas|umis ovladat)|seznam zarizeni)$/,
  en: /^(?:and )?(?:what (?:can you do(?: for me)?|can you help (?:me )?with|can you control|are your capabilities)|how can you help(?: me)?|what devices can you control)$/,
  th: /^(?:คุณ|จาร์วิส)?\s*(?:ทำอะไรได้บ้าง|ช่วยอะไร(?:ฉัน)?ได้บ้าง|ช่วยฉันทำอะไรได้บ้าง|ควบคุมอุปกรณ์อะไรได้บ้าง)(?:ครับ|ค่ะ)?$/,
};
const capabilityFeatures = [
  { action: 'room.read', cs: 'říct ti teplotu v místnostech', en: 'check room temperatures', th: 'บอกอุณหภูมิในห้อง' },
  { action: 'light.set', cs: 'ovládat světla', en: 'control the lights', th: 'ควบคุมไฟ' },
  { action: 'heat.set', cs: 'upravit topení', en: 'adjust the heating', th: 'ปรับเครื่องทำความร้อน' },
  { action: 'climate.set', cs: 'nastavit klimatizaci', en: 'adjust the air conditioning', th: 'ปรับเครื่องปรับอากาศ' },
  { action: 'vacuum.start', cs: 'poslat vysavač uklidit vybraný pokoj', en: 'send the vacuum to clean a room', th: 'สั่งหุ่นยนต์ให้ทำความสะอาดห้อง' },
  { action: 'solar.read', cs: 'zjistit výrobu fotovoltaiky', en: 'check solar production', th: 'ตรวจการผลิตไฟฟ้าจากแผงโซลาร์' },
  { action: 'weather', cs: 'poradit podle počasí', en: 'give advice based on the forecast', th: 'แนะนำตามพยากรณ์อากาศ' },
  { action: 'spotify.play', cs: 'pustit hudbu ze Spotify', en: 'play music on Spotify', th: 'เปิดเพลงจาก Spotify' },
];

export function planVoiceCapabilities(command, deps, language) {
  if (!capabilityQuestions[language].test(command)) return null;
  const permissions = deps.connections?.() ?? {};
  const enabled = capabilityFeatures.filter(({ action }) => action === 'weather' ? permissions.weather : voiceActionAllowed(action, permissions));
  const prefix = { cs: 'Můžu ', en: 'I can ', th: 'ฉันช่วย' }[language];
  const empty = { cs: 'Moje možnosti se zobrazí po připojení zařízení v panelu.',
    en: 'My controls become available when devices are connected to the panel.', th: 'ฉันควบคุมอุปกรณ์ได้เมื่อเชื่อมต่อกับแผงควบคุมแล้ว' }[language];
  const message = enabled.length ? prefix + new Intl.ListFormat(language).format(enabled.map((feature) => feature[language])) + '.' : empty;
  return { message, operation: 'conversation.capabilities' };
}

function sameRoom(a, b) {
  const key = resolveVoiceRoom(a);
  return Boolean(key && key === resolveVoiceRoom(b));
}

export function lightType(device) {
  const label = normalizeVoiceText(device.name);
  if (device.rgb || device.icon === 'led' || label.includes('led')) return 'led';
  return label.includes('lamp') ? 'lamp' : 'ceiling';
}

function measurement(value, prefix, units) {
  return Number.isFinite(value) ? { message: prefix + ' ' + number.format(value) + (units ? ' ' + units : '') + '.', reading: { value } }
    : unavailable('Měření');
}

function command(deps, path, body, announcement, message) {
  return {
    announcement,
    async run() {
      const result = await deps.command(path, body);
      if (result.status >= 200 && result.status < 300) return { message: typeof message === 'function' ? message(result.data) : message };
      return { message: result.data?.error ?? 'Zařízení akci nepotvrdilo.', failed: true };
    },
  };
}
export { command as voiceCommand };

function clarify(message, intent) {
  return { message, context: { intent, clarify: true } };
}

function followUp(text, previous, deps) {
  if (!previous?.intent) return null;
  if (previous.clarify && voiceActions[previous.intent.action]?.access === 'write' &&
      (/\?\s*$/.test(text) || /^(?:co|jak|kde|kdy|proc|kolik)\b/.test(normalizeVoiceText(text)))) return null;
  const spoken = normalizeVoiceText(text).replace(/^(a|tak|co) /, '').replace(/^v(loznic[ei]|obyvak[ua]|pracovn[eu]|kuchyn[ei])$/, 'v $1');
  if (previous.intent.action === 'solar.read') {
    const metric = { dnes: 'today', vcera: 'yesterday', ted: 'power', 'prave ted': 'power', aktualne: 'power' }[spoken];
    if (metric) return { action: 'solar.read', metric };
  }
  const target = /^(led|ledky|led pas|led pasek|lampa|lampu|strop|stropni|stropni svetlo)$/.test(spoken)
    ? spoken.startsWith('led') ? 'led' : spoken.startsWith('lamp') ? 'lamp' : 'ceiling'
    : null;
  if (previous.clarify && target && previous.intent.action === 'light.set') return { ...previous.intent, target };
  if ((previous.clarify || readActions.has(previous.intent.action)) && /^(v|ve|na) [a-z ]+$/.test(spoken)) {
    return {
      ...previous.intent,
      action: previous.intent.action === 'outdoor.read' ? 'room.read' : previous.intent.action,
      room: resolveVoiceRoom(spoken),
    };
  }
  if (previous.clarify && /^(?:light\.|heat\.|vacuum\.|air\.)/.test(previous.intent.action)) {
    const room = resolveVoiceRoom(spoken);
    const rooms = [...(deps.config.rooms ?? []).map(({ name }) => name), ...Object.values(deps.config.fibaro?.devices ?? {}).map(({ room }) => room)]
      .filter(Boolean);
    if (room && mentionedVoiceRoom(spoken, rooms) === room) return { ...previous.intent, room };
  }
  if (readActions.has(previous.intent.action) && /^(venku|venkovni)$/.test(spoken)) {
    return { action: 'outdoor.read', metric: previous.intent.metric };
  }
  return null;
}

const lightFollowUp = /^(?:(?:a|tak|prosim)[, ]+)*(?:(?:je|ho|ji|to) )?(?:(?:mi|zas|zase) )?(zapni|vypni|rozsvit|zhasni)(?: (?:je|ho|ji|to))?(?: prosim)?$/;

export function repairVoiceFollowUp(text, context) {
  if (typeof text !== 'string' || !(voiceContextDomain(context) || context?.room)) return text;
  const fragment = /^si /.test(normalizeVoiceText(text)) && czechLightWish(text, true);
  if (fragment && /^(?:rozsvit|zhasni) (?:je|ho|ji|to|tam)$/.test(fragment)) {
    return fragment.replace(/^rozsvit/, 'Rozsviť').replace(/^zhasni/, 'Zhasni') + '.';
  }
  const repaired = text.replace(/(?<!\p{L})(?:vyp +n[eě]|ve +pn[eě]|vy +pni|za +pni|zap +n[eě])(?!\p{L})/giu,
    (word) => (/^za/i.test(word) ? 'zapni' : 'vypni').replace(/^./, (letter) =>
      word[0] === word[0].toUpperCase() ? letter.toUpperCase() : letter));
  return lightFollowUp.test(normalizeVoiceText(repaired)) ? repaired : text;
}

export async function planVoice(text, deps, previous) {
  const repaired = repairVoiceFollowUp(repairCzechVoiceCommand(text), previous);
  const spoken = czechLightWish(repaired) || normalizeVoiceText(repaired);
  if (!spoken) return { message: 'Neslyšel jsem žádný povel.' };
  if (closesVoice(spoken, 'cs')) return { message: voiceFarewell('cs'), end: true };
  const capabilities = planVoiceCapabilities(spoken, deps, 'cs');
  if (capabilities) return capabilities;
  const spotify = spotifyIntent(repaired, previous?.intent?.action?.startsWith('spotify.'));
  if (spotify) return { client: spotify, announcement: 'Čekám na Spotify.' };
  const scene = /^(?:spust|aktivuj) scenu (.{1,60})$/.exec(spoken);
  const contextual = planContextualVoice(czechVoiceFollowUp(spoken, previous), previous);
  if (contextual?.message) return contextual;
  if (contextual?.action?.startsWith('spotify.')) {
    const { action, ...args } = contextual;
    return { client: { operation: action, ...args }, announcement: 'Čekám na Spotify.' };
  }
  let intent = contextual ?? (scene ? { action: 'light.scene', value: scene[1] } : parseVoiceIntent(repaired));
  if (!intent) {
    const named = /^(zapni|rozsvit|vypni|zhasni)(?: ?mi)? (.{1,60})$/.exec(spoken);
    const device = named && Object.values(deps.config?.fibaro?.devices ?? {}).find(({ light, name, room }) =>
      light && room && resolveVoiceRoom(name) && resolveVoiceRoom(name) === resolveVoiceRoom(named[2]));
    if (device) intent = { action: 'light.set', device: device.name, value: /^(zapni|rozsvit)$/.test(named[1]) };
  }
  intent ??= followUp(text, previous, deps);
  if (!intent) return null;
  const prior = previous?.intent;
  const focus = previous?.room === null ? null : previous?.room ?? prior?.room;
  if (!intent.room && !intent.device && focus && /^(light\.(set|read|brightness|color)|heat\.(set|adjust|read|resume)|air\.(set|mode|humidity|read))$/.test(intent.action)) {
    intent = { ...intent, room: focus };
  }
  if (intent.action === 'room.read' && deps.config?.rooms?.length &&
      !deps.config.rooms.some(({ name }) => sameRoom(name, intent.room))) return null;
  const result = await planVoiceAction(intent, deps);
  return result && { ...result, operation: intent.action };
}

function spotifyIntent(text, musicContext) {
  const command = text.trim().normalize('NFC')
    .replace(/^(?:(?:prosím|prosim|a|tak)[, ]+)+/iu, '')
    .replace(/^(?:chci|cht[eě]l[ao]? bych|pot[řr]ebuji|pot[řr]ebuju) (?:si )?(p[řr]ehr[aá]t|zahr[aá]t|pustit) /iu,
      (_, verb) => ({ prehrat: 'přehraj', zahrat: 'zahraj', pustit: 'pusť' }[normalizeVoiceText(verb)]) + ' ')
    .replace(/^[čc]e\s+hraj(?=[\s,])/iu, 'přehraj')
    .replace(/^(p[řr]ehraj|zahraj)(?:m[iyeě])?,\s*/iu, '$1 ')
    .replace(/[.!?]+$/, '');
  const normalized = normalizeVoiceText(command).replace(/\b(?:spotifaj|sporify)\b/g, 'spotify');
  const resume = /^(?:(?:a |tak )?(?:pokracuj(?:i)?|pokracovat|muzes pokracovat|mohl bys pokracovat)(?: mi)?)(?: (?:v prehravani(?: hudby)?(?: (?:na )?spotify)?|(?:ve|na|se) spotify))?$/;
  if (resume.test(normalized) && (musicContext || /\b(?:spotify|prehravani)\b/.test(normalized))) return { operation: 'spotify.resume' };
  const transport = [
    ['pause', /^(?:pozastav|vypni|zastav|stopni|stop)(?: mi)? (?:spotify|hudbu|prehravani)(?: na spotify)?$/],
    ['resume', /^(?:(?:pust|prehraj|zapni)(?: mi)? (?:spotify|hudbu)(?: na spotify)?)$/],
    ['next', /^(?:preskoc(?: skladbu| pisnicku)?|(?:pust |prehraj )?dalsi (?:skladb[au]|pisnick[au]|song))(?: na spotify)?$/],
    ['previous', /^(?:pust |prehraj )?predchozi (?:skladb[au]|pisnick[au]|song)(?: na spotify)?$/],
    ['read', /^(?:co (?:ted |prave )?hraje|jaka skladba (?:ted )?hraje)(?: na spotify)?$/],
  ].find(([, pattern]) => pattern.test(normalized));
  if (transport) return { operation: 'spotify.' + transport[0] };

  if (/\b(?:az|jakmile|pokud|kdyz|zitra|pozdeji)\b/.test(normalized)) return null;
  const volume = /^(?:nastav|zmen|ztis|ztlum|zesil) (?:hlasitost )?(?:spotify|hudby) na (.+?) ?(?:procent|%)$/.exec(normalized);
  const level = volume && spokenNumber(volume[1]);
  if (Number.isInteger(level) && level >= 0 && level <= 100) return { operation: 'spotify.volume', volume: level };
  const request = /^(pus[ťt]|p[řr]ehraj|zahraj|najdi|vyhledej)(?:m[iyeě])?\s+(?:mi\s+)?(.+)$/iu
    .exec(command);
  if (!request) return null;
  const [, verb, rest] = request;
  const topic = rest.replace(/^na\s+(?:spotif(?:y|aj)|sporify)\s+/iu, '').replace(/[, ]+(?:\(\s*)?na\s+(?:spotif(?:y|aj)|sporify)\)?$/iu, '').trim();
  const typed = /^(playlist|skladbu|p[ií]sni[čc]ku|interpreta|skupinu|kapelu|album)\s+(.+)$/iu.exec(topic);
  const action = normalizeVoiceText(verb);
  if (rest === topic && !typed && !['prehraj', 'zahraj'].includes(action)) return null;
  const kind = typed && { playlist: 'playlist', skladbu: 'track', pisnicku: 'track',
    interpreta: 'artist', skupinu: 'artist', kapelu: 'artist', album: 'album' }[normalizeVoiceText(typed[1])];
  const query = (typed?.[2] ?? topic).trim();
  if (!query || query.length > 90) return null;
  return { operation: ['najdi', 'vyhledej'].includes(action) ? 'spotify.search' : 'spotify.play',
    query, ...(kind && { kind }) };
}

export async function planVoiceAction(intent, deps) {
  if (deps.connections && !voiceActionAllowed(intent.action, deps.connections())) return unavailable('Tato funkce');
  const plan = await planConnectedAction(intent, deps);
  return plan && !plan.context && (plan.run || voiceActions[intent.action]?.access === 'read') ? { ...plan, context: { intent } } : plan;
}

async function planConnectedAction(intent, deps) {
  const { action, room, target, value, duration, metric, device: requestedDevice } = intent;

  if (action === 'light.scene') {
    const scenes = (deps.config.fibaro?.actions ?? []).filter((item) => item.type === 'scene' &&
      [item.key, item.name].some((name) => normalizeVoiceText(name) === normalizeVoiceText(value)));
    if (scenes.length !== 1) return { message: 'Tuhle scénu jsem nenašel.', failed: true };
    return command(deps, '/api/fibaro', { key: scenes[0].key }, 'Spouštím scénu. ' + scenes[0].name + '.',
      'Fibaro přijalo povel ke spuštění scény. ' + scenes[0].name + '.');
  }
  if (action === 'light.allOff' || action === 'light.lamps') {
    const key = action === 'light.allOff' ? 'all-off' : value ? 'lamps-on' : 'lamps-off';
    if (!deps.config.fibaro?.actions?.some((item) => item.key === key)) return unavailable('Ovládání světel');
    const name = action === 'light.allOff' ? 'všechna světla' : 'lampičky';
    return command(deps, '/api/fibaro', { key }, (value ? 'Rozsvěcím ' : 'Zhasínám ') + name + '.',
      action === 'light.allOff' ? 'Fibaro přijalo povel ke zhasnutí všech světel.'
        : (value ? 'Lampičky svítí.' : 'Lampičky jsou zhasnuté.'));
  }
  if (['light.set', 'light.brightness', 'light.color', 'light.read'].includes(action)) {
    const switchOrRead = action === 'light.set' || action === 'light.read';
    const { lightId } = intent;
    if (switchOrRead && !room && !target && !requestedDevice && lightId == null) return clarify('Ve které místnosti?', intent);
    const source = await deps.lights();
    if (source?.state !== 'live') return unavailable('Ovládání světel');
    const devices = source.data.filter((device) => device.switchable && (switchOrRead || device.rgb));
    const named = requestedDevice ?? (room && !target && !devices.some((device) => sameRoom(device.room, room))
      ? devices.find(({ name }) => normalizeVoiceText(name) === room)?.name : undefined);
    const lightTarget = target ?? (!named && switchOrRead ? 'ceiling' : undefined);
    const matches = devices.filter((device) =>
      (lightId == null || device.id === lightId) && (!room || (named && !requestedDevice) || sameRoom(device.room, room)) &&
      (!named || normalizeVoiceText(device.name) === normalizeVoiceText(named)) &&
      (!lightTarget || lightTarget === lightType(device)));
    let device = matches.length === 1 ? matches[0] : null;
    if (room && lightTarget === 'ceiling' && matches.length > 1 && !requestedDevice) {
      const configured = Object.keys(deps.config.fibaro?.devices ?? {}).map(Number);
      device = matches.find(({ name }) => normalizeVoiceText(name) === 'svetlo') ??
        configured.map((id) => matches.find((item) => item.id === id)).find(Boolean) ?? matches[0];
    }
    if (!device && matches.length > 1) {
      const choices = [...new Set(matches.map(lightType))];
      const question = room && choices.length > 1
        ? 'Myslíš ' + choices.map((item) => lightNames[item]).join(', nebo ') + '?'
        : 'Ve které místnosti?';
      return clarify(question, intent);
    }
    if (!device) return { message: 'Takové světlo jsem v panelu nenašel.', failed: true };
    if (!device.online) return unavailable('Světlo');
    const name = [device.room, device.name].filter(Boolean).join(', ');
    const context = { intent: { ...intent, room: resolveVoiceRoom(device.room), device: device.name, lightId: device.id, rgb: Boolean(device.rgb) } };
    if (action === 'light.read') {
      if (typeof device.on !== 'boolean') return unavailable('Stav světla');
      const brightness = device.rgbColor?.brightness;
      if (metric === 'brightness') return { ...measurement(brightness, name + '. Nastavený jas je', 'procent'), context };
      if (metric === 'color') {
        const color = rgbNames[device.rgbColor?.preset];
        if (!color) return unavailable('Nastavená barva světla');
        return { message: name + '. Nastavená barva je ' + color + '.', context };
      }
      return { message: name + (device.on ? ' svítí.' : ' je zhasnuté.') +
        (device.on && Number.isFinite(brightness) ? ' Jas je ' + brightness + ' procent.' : ''),
        context };
    }
    if (action === 'light.color') {
      const brightness = intent.brightness ?? device.rgbColor?.brightness ?? 50;
      const color = { red: 'červenou', pink: 'růžovou', yellow: 'žlutou', green: 'zelenou', blue: 'modrou',
        white: 'bílou', purple: 'fialovou' }[value];
      return { ...command(deps, '/api/fibaro/devices', { id: device.id, color: value, brightness },
        'Měním barvu světla. ' + name + '.', name + '. Nastavená barva je ' + color.replace(/ou$/, 'á') +
        ' a jas je ' + brightness + ' procent.'), context };
    }
    if (action === 'light.brightness') {
      return { ...command(deps, '/api/fibaro/devices', { id: device.id, color: 'current', brightness: value },
        'Nastavuji jas. ' + name + '.', name + '. Jas je ' + value + ' procent.'), context };
    }
    return { ...command(deps, '/api/fibaro/devices', { id: device.id, on: value },
      (value ? 'Rozsvěcím. ' : 'Zhasínám. ') + name + '.', name + (value ? ' svítí.' : ' je zhasnuté.')),
      context };
  }
  if (action === 'heat.mode') {
    const mode = value === 'away' ? 'Pryč' : 'podle programu';
    return command(deps, '/api/heating/mode', { mode: value }, 'Přepínám topení. ' + mode + '.',
      'Netatmo přijalo změnu režimu domácnosti. ' + mode + '.');
  }
  if (action === 'heat.mode.read') {
    const source = await deps.heating();
    if (source.state !== 'live') return unavailable('Stav topení');
    return { message: source.data?.mode === 'away' ? 'Topení je v režimu Pryč.'
      : source.data?.mode === 'schedule' ? 'Topení jede podle programu.' : 'Aktuální režim je na panelu.' };
  }
  if (action === 'heat.set' || action === 'heat.resume' || action === 'heat.adjust' || action === 'heat.read') {
    if (!room) return clarify('V které místnosti mám změnit topení?', intent);
    const heating = await deps.heating();
    if (heating?.state !== 'live') return unavailable('Topení');
    const configured = deps.config.rooms.find((item) => sameRoom(item.name, room));
    const devices = heating.data.rooms.filter((item) => configured?.heatingId
      ? item.id === configured.heatingId : sameRoom(item.name, room));
    const device = devices.length === 1 ? devices[0] : undefined;
    if (!device?.reachable) return unavailable('Topení v této místnosti');
    const name = configured?.name ?? device.name;
    if (action === 'heat.read') {
      const ends = Number.isFinite(device.endsAt) && device.endsAt > Date.now() ? clock.format(device.endsAt) : null;
      const mode = { schedule: 'podle programu', home: 'podle režimu domácnosti', manual: 'ruční nastavení',
        away: 'nepřítomnost', hg: 'ochrana před mrazem', off: 'vypnuto', max: 'maximální ohřev' }[device.mode];
      if (metric === 'mode') return mode ? { message: name + '. Režim topení je ' + mode + '.' } : unavailable('Režim topení');
      if (metric === 'until') return { message: ends ? name + '. Ruční nastavení platí do ' + ends + '.' : name + '. Nemám údaj o konci ručního nastavení.' };
      return measurement(metric === 'temperature' ? device.temperature : device.target,
        name + (metric === 'temperature' ? '. Teplota u hlavice je' : '. Cílová teplota topení je'), 'stupňů');
    }
    if (action === 'heat.resume') return command(deps, '/api/heating', { id: device.id, temperature: null },
      'Vracím topení k programu. ' + name + '.', 'Netatmo přijalo návrat k programu. ' + name + '.');
    const hours = duration ?? 2;
    const setting = (target) => name + ', ' + number.format(target) + ' stupňů na ' + hours +
      (hours === 1 ? ' hodinu.' : hours < 5 ? ' hodiny.' : ' hodin.');
    if (action === 'heat.adjust') return command(deps, '/api/heating', { id: device.id, delta: value, durationHours: hours },
      (value > 0 ? 'Zvyšuji' : 'Snižuji') + ' cílovou teplotu. ' + name + '.',
      (data) => 'Netatmo přijalo změnu cíle. ' + setting(data.temperature));
    return command(deps, '/api/heating', { id: device.id, temperature: value, durationHours: hours },
      'Nastavuji topení. ' + setting(value), 'Netatmo přijalo nastavení. ' + setting(value));
  }
  if (readActions.has(action)) {
    if (action === 'room.read' && !room) return clarify('Ve které místnosti chceš měření?', intent);
    const [station, heating] = await Promise.all([deps.station(), action === 'room.read' ? deps.heating() : null]);
    const [prefix, units] = metrics[metric] ?? metrics.temperature;
    const field = metric ?? 'temperature';
    if (action === 'outdoor.read') {
      const result = measurement(station.state === 'live' ? deps.outdoor(station)?.[field] : null, prefix + ' venku je', units);
      return { ...result, context: { intent } };
    }
    const selected = deps.rooms(station, heating).find((item) => sameRoom(item.name, room));
    const reading = station.state === 'live' ? selected?.meter[field] : null;
    const heater = heating?.state === 'live'
      ? selected?.heat ?? heating.data.rooms.find((item) => sameRoom(item.name, room)) : null;
    const place = roomPlaces[room];
    const result = measurement(reading ?? (field === 'temperature' ? heater?.temperature : null), place
      ? place + ' je' + (field === 'temperature' ? '' : ' ' + prefix.toLocaleLowerCase('cs'))
      : (selected?.name ?? heater?.name ?? 'Místnost') + '. ' + prefix + ' je', units);
    return { ...result, context: { intent } };
  }
  if (action === 'climate.set' || action === 'climate.power') {
    const name = { heat: 'topení klimatizací', cool: 'chlazení', fan: 'ventilaci',
      dry: 'odvlhčování', auto: 'automatický režim' }[value] ?? 'klimatizaci';
    const temperature = intent.temperature;
    const property = action === 'climate.set' ? 'mode' : 'on';
    const setting = temperature == null ? '' : ' na ' + number.format(temperature) + ' stupňů';
    return command(deps, '/api/sensibo', { property, value, temperature }, (value ? 'Zapínám ' : 'Vypínám ') + name + setting + '.',
      'Sensibo potvrdilo změnu. ' + (value ? 'Zapnuto. ' : 'Vypnuto. ') + name + setting + '.');
  }
  if (action === 'climate.fan' || action === 'climate.sync' || action === 'climate.temperature') {
    const property = { 'climate.fan': 'fanLevel', 'climate.sync': 'syncOn', 'climate.temperature': 'targetTemperature' }[action];
    let setting = action === 'climate.fan' ? 'rychlost ventilátoru' : 'hlášený stav klimatizace';
    if (action === 'climate.temperature') {
      const source = await deps.climate();
      if (source.state !== 'live' || !source.data?.online) return unavailable('Ovládání klimatizace');
      if (source.data.unit !== 'C') return { message: 'Klimatizace používá stupně Fahrenheita. Povel vyžaduje volbu na panelu.', failed: true };
      setting = 'cílovou teplotu na ' + number.format(value) + ' stupňů';
    }
    return command(deps, '/api/sensibo', { property, value }, 'Měním ' + setting + '.',
      'Sensibo přijalo změnu. ' + setting + '.');
  }
  if (action === 'climate.eco.set') {
    return command(deps, '/api/sensibo/eco', { enabled: value }, value ? 'Zapínám Eco.' : 'Vypínám Eco.',
      value ? 'Eco je zapnuté.' : 'Eco je vypnuté.');
  }
  if (action === 'climate.eco') {
    const eco = deps.eco();
    if (!eco.available) return unavailable('Měření Eco');
    if (!eco.enabled) return { message: 'Eco je vypnuté.' };
    const waiting = eco.constraint === 'household' ? 'Výroba nepokrývá limit příkonu domu.' : 'Výroba fotovoltaiky je pod potřebnou hranicí.';
    const status = {
      running: 'Eco je zapnuté a klimatizace běží.', low: waiting, waiting, ready: 'Výroba už stačí. Eco ještě ověřuje, zda vydrží.',
      missing: 'Eco čeká na aktuální měření výroby nebo spotřeby.', householdMissing: 'Eco čeká na údaj o příkonu domu.',
      timer: 'Režim Eco teď řídí časovač.', mismatch: 'Hlášený stav klimatizace nesouhlasí s měřeným příkonem.',
      mode: 'Eco potřebuje podporovaný režim chlazení nebo topení.', error: 'Eco hlásí chybu při ovládání klimatizace.',
    }[eco.status];
    return { message: status ?? 'Eco je zapnuté.' };
  }
  if (action === 'climate.read') {
    const source = await deps.climate();
    if (source.state !== 'live' || !source.data?.online) return unavailable('Stav klimatizace');
    const device = source.data;
    const unit = 'stupňů ' + (device.unit === 'F' ? 'Fahrenheita' : 'Celsia');
    if (metric === 'temperature' || metric === 'target') return measurement(metric === 'temperature' ? device.measured : device.temperature,
      metric === 'temperature' ? 'Klimatizace naměřila' : 'Cílová teplota klimatizace je', unit);
    const mode = climateModes[device.mode];
    if (metric === 'mode') return mode ? { message: 'Režim klimatizace je ' + mode + '.' } : unavailable('Režim klimatizace');
    const fan = fanNames[device.fan];
    if (metric === 'fan') return fan ? { message: 'Rychlost ventilátoru je ' + fan + '.' } : unavailable('Rychlost ventilátoru');
    if (typeof device.on !== 'boolean') return unavailable('Napájení klimatizace');
    return { message: (device.on ? 'Klimatizace je zapnutá.' : 'Klimatizace je vypnutá.') + (mode ? ' Zvolený režim je ' + mode + '.' : '') };
  }
  if (action.startsWith('climate.timer.')) {
    const timer = deps.timer();
    if (!timer.enabled) return unavailable('Časovač klimatizace');
    if (action === 'climate.timer.read') {
      if (!timer.timer?.active) return { message: 'Časovač klimatizace je neaktivní.' };
      const next = timer.timer.steps.find((step) => step.status === 'pending');
      const time = next && clock.format(next.at);
      return { message: 'Časovač je aktivní.' + (time ? ' Další krok je v ' + time + '.' : '') };
    }
    if (action === 'climate.timer.list') return { message: timer.presets.length
      ? 'Uložené plány: ' + timer.presets.map((preset) => preset.name).join(', ').slice(0, 360) + '.'
      : 'Seznam uložených plánů je prázdný.' };
    if (action === 'climate.timer.cancel') return timer.timer?.active
      ? command(deps, '/api/sensibo/timer', { action: 'cancel', id: timer.timer.id },
        'Ruším časovač klimatizace.', 'Časovač klimatizace je zrušený.')
      : { message: 'Časovač klimatizace je už neaktivní.' };
    if (action === 'climate.timer.start') {
      const presets = timer.presets.filter(({ name }) => normalizeVoiceText(name) === normalizeVoiceText(value));
      if (presets.length !== 1) return { message: 'Uložený plán s tímto názvem jsem nenašel.', failed: true };
      const device = await deps.climate();
      const [preset] = presets;
      if (device.state !== 'live' || preset.draft.unit !== device.data?.unit) return unavailable('Spuštění tohoto plánu');
      return command(deps, '/api/sensibo/timer', { ...preset.draft, action: 'start' },
        'Spouštím časovač podle plánu ' + preset.name + '.', 'Časovač je naplánovaný. ' + preset.name + '.');
    }
  }
  if (action === 'solar.read') {
    const source = await deps.solar();
    const data = source.data;
    if (source.state !== 'live' || !data) return unavailable('Měření fotovoltaiky');
    const now = Date.now();
    if (metric === 'power') return measurement(!data.offline && (data.measuredAt == null || now - data.measuredAt <= 8 * 60_000) ? data.power : null,
      'Fotovoltaika teď vyrábí', 'wattů');
    if (data.productionDate && data.productionDate !== dateKey(now)) return unavailable('Denní měření výroby');
    return measurement(metric === 'yesterday' ? data.yesterday : data.day,
      'Fotovoltaika ' + (metric === 'yesterday' ? 'včera' : 'dnes') + ' vyrobila', 'kilowatthodin');
  }
  if (action === 'power.read') {
    const meters = deps.config.fibaro?.powerMeters ?? [];
    const matches = requestedDevice ? meters.filter(({ name }) => normalizeVoiceText(name) === normalizeVoiceText(requestedDevice)) : [];
    if (requestedDevice && matches.length !== 1) return { message: 'Tento měřič příkonu jsem v panelu nenašel.', failed: true };
    const id = matches[0]?.id ?? deps.config.climate?.householdPowerMeterId;
    const source = await deps.power();
    return measurement(source.state === 'live' ? source.data?.find((meter) => meter.id === id)?.power : null,
      matches[0] ? 'Příkon měřiče ' + matches[0].name + ' je' : 'Dům právě odebírá', 'wattů');
  }
  if (action === 'boiler.read') {
    const source = await deps.heating();
    if (source.state !== 'live' || typeof source.data?.boilerOn !== 'boolean') return unavailable('Hlášení kotle');
    return { message: source.data.boilerOn ? 'Termostat hlásí sepnutý kotel.'
      : source.data.boilerDemandRooms?.length ? 'Termostat hlásí vypnutý kotel. Některé hlavice žádají o teplo.'
        : 'Termostat hlásí vypnutý kotel.' };
  }
  if (action === 'washer.read') {
    const source = await deps.washer();
    const data = source.data;
    if (source.state !== 'live' || !data || data.connected === false) return unavailable('Hlášení pračky');
    const mode = Number(data.machMode);
    const minutes = data.remainingTimeMM == null || data.remainingTimeMM === '' ? NaN : Number(data.remainingTimeMM);
    if (data.machMode == null || data.machMode === '' || !Number.isFinite(mode)) return unavailable('Stav pračky');
    if ([2, 3, 9].includes(mode)) return Number.isFinite(minutes)
      ? measurement(minutes, 'Do konce zbývá přibližně', 'minut')
      : { message: 'Pračka běží. Odhad času zatím chybí.' };
    if (mode === 7) return { message: 'Pračka má dopráno.' };
    return { message: 'Pračka momentálně nepere.' };
  }
  if (action === 'coffee.read') {
    const source = await deps.coffee();
    if (source.state !== 'live') return unavailable('Hlášení kávovaru');
    const data = source.data;
    const state = data?.status;
    if (metric && metric !== 'state') {
      const readings = data?.readings ?? {};
      const [value, label, unit] = {
        grounds: [readings.groundsPct, 'Zásobník sedliny je zaplněný na', 'procent'],
        descale: [readings.descaleRemainingPct, 'Do odvápnění zbývá', 'procent životnosti'],
        coffee: [readings.coffeeCount, 'Kávovar eviduje', 'káv'], espresso: [readings.espressoCount, 'Kávovar eviduje', 'espress'],
        cappuccino: [readings.cappuccinoCount, 'Kávovar eviduje', 'cappuccin'], coldBrew: [readings.coldBrewCount, 'Kávovar eviduje', 'studených káv'],
        water: [readings.waterLiters, 'Kávovar eviduje spotřebu', 'litrů vody'],
      }[metric];
      return measurement(value, label, unit);
    }
    if (state === 'ready') return { message: 'Kávovar je připravený.' };
    if (state === 'standby') return { message: 'Kávovar je v pohotovostním režimu.' };
    const label = { waking_up: 'se zahřívá', wake_pending: 'se probouzí', rinsing: 'se proplachuje',
      descaling: 'se odvápňuje', preparing_beverage: 'připravuje nápoj', preparing_milk: 'připravuje mléko',
      preparing_steam: 'připravuje páru', going_to_sleep: 'se vypíná' }[state];
    return label ? { message: 'Kávovar ' + label + '.' } : unavailable('Stav kávovaru');
  }
  if (action === 'coffee.wake') return command(deps, '/api/coffeelink', { action: 'wake' }, 'Probouzím kávovar.', 'Kávovar potvrdil probuzení.');
  if (action === 'batteries.refresh') return command(deps, '/api/batteries/refresh', { batteries: true }, 'Kontroluji baterie.', 'Stav baterií je aktualizovaný.');
  if (['air.read', 'air.set', 'air.mode', 'air.humidity'].includes(action)) {
    const source = await deps.air();
    if (source.state !== 'live') return unavailable('Hlášení čističek');
    const devices = source.data.filter((device) => (!room || sameRoom(device.room, room)) &&
      (action !== 'air.humidity' || device.humiditySupported === true));
    if (devices.length > 1) return clarify('Kterou čističku? K dispozici jsou ' + devices.map(({ room }) => room).join(', ') + '.', intent);
    const device = devices[0];
    if (!device?.available) return unavailable('Ovládání čističky');
    const context = { intent: { ...intent, room: resolveVoiceRoom(device.room) } };
    if (action === 'air.read') {
      if (metric === 'water') return typeof device.waterEmpty === 'boolean'
        ? { message: device.room + '. Nádržka čističky ' + (device.waterEmpty ? 'je prázdná.' : 'není prázdná.'),
          context }
        : unavailable('Stav nádržky čističky');
      if (metric === 'mode') {
        const mode = { auto: 'automatický', sleep: 'noční', medium: 'střední', turbo: 'turbo' }[device.mode];
        return mode ? { message: device.room + '. Režim čističky je ' + mode + '.', context } : unavailable('Režim čističky');
      }
      if (metric === 'state') return typeof device.on === 'boolean'
        ? { message: device.room + (device.on ? '. Čistička je zapnutá.' : '. Čistička je vypnutá.'), context }
        : unavailable('Napájení čističky');
      const [reading, label, unit] = {
        pm25: [device.pm25, 'Jemné částice mají hodnotu', 'mikrogramů na metr krychlový'],
        allergens: [device.allergens, 'Index alergenů je', ''], filter: [device.filter, 'Zbývá', 'procent filtru'],
        humidity: [device.humidity, 'Vlhkost je', 'procent'],
        humidityTarget: [device.humidityTarget, 'Cílová vlhkost je', 'procent'],
      }[metric ?? 'pm25'];
      return { ...measurement(reading, device.room + '. ' + label, unit), context };
    }
    if (action === 'air.mode' || action === 'air.humidity') {
      const property = action.split('.')[1];
      return { ...command(deps, '/api/airplus', { model: device.model, action: property, value },
        'Nastavuji čističku. ' + device.room + '.', 'Čistička potvrdila nastavení. ' + device.room + '.'), context };
    }
    return { ...command(deps, '/api/airplus', { model: device.model, action: 'power', value },
      (value ? 'Zapínám' : 'Vypínám') + ' čističku. ' + device.room + '.',
      'Čistička je ' + (value ? 'zapnutá' : 'vypnutá') + '. ' + device.room + '.'), context };
  }
  if (action.startsWith('vacuum.')) {
    const operation = action.slice('vacuum.'.length);
    if (operation === 'read') {
      const reading = metric ?? 'state';
      if (['rooms', 'history', 'maintenance'].includes(reading)) {
        const details = await (reading === 'rooms' && deps.vacuumMap ? deps.vacuumMap() : deps.vacuum(true));
        if (details.state !== 'live') return unavailable('Údaje vysavače');
        if (reading === 'rooms') return details.data?.rooms?.length
          ? { message: 'Vysavač má na aktivní mapě místnosti ' + details.data.rooms.map(({ name }) => name).join(', ') + '.' }
          : unavailable('Mapa vysavače');
        if (reading === 'history') return measurement(details.data?.history?.total, 'Vysavač eviduje', 'úklidů');
        const readings = Object.entries({ filter: 'Filtr', mainBrush: 'hlavní kartáč', sideBrush: 'boční kartáč', sensors: 'čidla' })
          .flatMap(([key, title]) => Number.isFinite(details.data?.maintenance?.[key]) ? [title + ' ' + details.data.maintenance[key] + ' hodin'] : []);
        return readings.length ? { message: 'Do údržby podle vysavače zbývá. ' + readings.join(', ') + '.' } : unavailable('Stav údržby');
      }
      const source = await deps.vacuum(false);
      if (source.state !== 'live') return unavailable('Hlášení vysavače');
      const data = source.data ?? {};
      if (reading === 'progress') return measurement(data.progress, 'Průběh úklidu je', 'procent');
      if (reading === 'duration') return measurement(Number.isFinite(data.duration) ? Math.round(data.duration / 60) : null, 'Úklid trval', 'minut');
      if (reading === 'area') return measurement(data.area, 'Vysavač uklidil', 'metrů čtverečních');
      if (reading === 'dock') return { message: vacuumDocked.has(data.state) ? 'Vysavač je v doku.' :
        data.state === 'returning_home' ? 'Vysavač se vrací do doku.' : 'Vysavač teď není v doku.' };
      if (reading === 'battery') return measurement(data.battery, 'Baterie vysavače má', 'procent');
      const status = vacuumStates[data.state];
      return status ? { message: 'Vysavač ' + status + '.' } : unavailable('Aktuální stav vysavače');
    }
    if (operation === 'dock') {
      const current = await deps.vacuum(false);
      if (current.state === 'live' && vacuumDocked.has(current.data?.state)) return { message: 'Vysavač už je v doku.' };
      if (current.state === 'live' && current.data?.state === 'returning_home') return { message: 'Vysavač už se vrací do doku.' };
    }
    const body = { action: operation };
    let scope = '';
    if (operation === 'start') {
      const rooms = intent.rooms ?? (room ? [room] : []);
      if (rooms.length > 0 && intent.wholeHome === true) return { message: 'Vyber místnosti, nebo úklid všude.', failed: true };
      if (!rooms.length && intent.wholeHome !== true) return clarify('Kterou místnost mám uklidit, nebo říkáš všude?', intent);
      body.mode = intent.mode ?? 'vacuum';
      body.segments = [];
      const { fan, water, route, waterLevel } = intent;
      const options = { fan, water, route, waterLevel };
      if (Object.keys(options).some((option) => options[option] != null && !vacuumSettingsByMode[body.mode]?.includes(option))) {
        return { message: 'Tento režim úklidu zadané nastavení nepodporuje.', failed: true };
      }
      if ((water === 'custom_water_flow') !== (waterLevel != null)) {
        return { message: 'K vlastní dávce vody zadej hodnotu od 1 do 30.', failed: true };
      }
      if (rooms.length || fan || water || route || waterLevel != null) {
        const details = await (deps.vacuumMap?.() ?? deps.vacuum(true));
        const mapId = details.data?.mapId;
        if (details.state !== 'live') return unavailable('Možnosti vysavače');
        if (Array.isArray(details.data?.modes) && !details.data.modes.includes(body.mode)) return unavailable('Tento režim vysavače');
        if (rooms.length) {
          const state = await deps.vacuum(false);
          if (state.state !== 'live' || !Number.isSafeInteger(mapId) || state.data?.mapId !== mapId) {
            return unavailable('Aktuální mapa vysavače');
          }
          const matching = rooms.map((room) => (details.data.rooms ?? []).filter((item) => sameRoom(item.name, room)));
          if (matching.some((list) => list.length !== 1)) return { message: 'Některou z požadovaných místností jsem v aktivní mapě nenašel.', failed: true };
          const selected = matching.map(([item]) => item);
          body.segments = [...new Set(selected.map(({ id }) => id))];
          body.mapId = mapId;
          scope = ' ' + (selected.length === 1 ? roomPlaces[rooms[0]] ?? selected[0].name :
            'Vybrané místnosti ' + selected.map(({ name }) => name).join(', ')) + '.';
        }
        body.settings = {};
        for (const [key, label] of Object.entries({ fan, water, route })) {
          if (label == null) continue;
          const number = typeof label === 'number' ? label : details.data.cleaningOptions?.[key]?.[label];
          if (!Number.isSafeInteger(number)) return { message: 'Vysavač tuto volbu úklidu nepodporuje.', failed: true };
          body.settings[key] = number;
        }
        if (waterLevel != null) body.settings.waterLevel = waterLevel;
      }
    }
    const cleaning = { mop: 'vytírání', vac_and_mop: 'současné vysávání a vytírání', vac_then_mop: 'vysávání a následné vytírání',
      smart_mode: 'SmartPlan', custom: 'vlastní úklid', vacuum: 'vysávání' }[body.mode];
    const label = { start: cleaning, dock: 'návrat do doku', pause: 'pozastavení úklidu', resume: 'pokračování v úklidu' }[operation];
    if (label) return command(deps, '/api/roborock', body, 'Připravuji ' + label + '.' + scope,
      'Roborock přijal povel pro ' + label + '.' + scope);
  }
  return null;
}

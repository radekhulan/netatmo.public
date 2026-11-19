const roomAliases = new Map(Object.entries({
  obyvak: ['obyvaku', 'obyvaka', 'obyvaci pokoj', 'obyvacim pokoji', 'obyvaciho pokoje', 'living room'],
  pracovna: ['pracovne', 'pracovnu', 'pracovny', 'office'],
  'loznice pro hosty': ['loznici pro hosty', 'hostovska loznice', 'hostovske loznici', 'pokoj pro hosty', 'guest bedroom'],
  loznice: ['loznici', 'bedroom'],
  studovna: ['studovne', 'studovnu', 'studovny', 'study'],
  kuchyne: ['kuchyni', 'kuchyn', 'kuchynio', 'kitchen'],
  jidelna: ['jidelne', 'jidelnu', 'jidelny', 'dining room'],
  koupelna: ['koupelne', 'koupelnu', 'koupelny', 'bathroom'],
  chodba: ['chodbe', 'chodbu', 'chodby', 'hallway'],
  komora: ['komore', 'komoru', 'pantry'],
  zachod: ['zachode', 'zachodu', 'wc', 'toaleta', 'toalete', 'toaletu', 'toilet'],
}).flatMap(([name, aliases]) => [name, ...aliases].map((alias) => [alias, name])));

const units = new Map(Object.entries({
  nula: 0, jeden: 1, jedna: 1, jedno: 1, jedne: 1, jednu: 1,
  dva: 2, dve: 2, dvou: 2, tri: 3, trech: 3, ctyri: 4, ctyrech: 4,
  pet: 5, sest: 6, sedm: 7, osm: 8, devet: 9, deset: 10,
  jedenact: 11, dvanact: 12, trinact: 13, ctrnact: 14, patnact: 15,
  sestnact: 16, sedmnact: 17, osmnact: 18, devatenact: 19, sto: 100,
}));
const tens = new Map(Object.entries({
  dvacet: 20, tricet: 30, ctyricet: 40, padesat: 50,
  sedesat: 60, sedmdesat: 70, osmdesat: 80, devadesat: 90,
}));
const colorNames = new Map(Object.entries({
  red: ['cervenou', 'cervene', 'cervena'], pink: ['ruzovou', 'ruzove', 'ruzova'],
  yellow: ['zlutou', 'zlute', 'zluta'], green: ['zelenou', 'zelene', 'zelena'],
  blue: ['modrou', 'modre', 'modra'], white: ['bilou', 'bile', 'bila'],
  purple: ['fialovou', 'fialove', 'fialova'],
}).flatMap(([key, names]) => names.map((name) => [name, key])));
const colorCommand = new RegExp('^(?:nastav(?: barvu)?|zmen(?: barvu)?|rozsvit) (.+?) (?:na |do )?(' +
  [...colorNames.keys()].join('|') + ')(?: barvu)?(?: (?:na|s jasem|pri jasu|a jas na) (.+?) ?(?:%|procent(?:a|o)?))?$');

const deviceWords = Object.entries({
  vacuum: ['vysavač', 'vysavače', 'Roborock'],
  climate: ['klimatizace', 'klimatizaci', 'Sensibo'],
  air: ['čistička', 'čističku', 'čističky'],
  coffee: ['kávovar', 'kávovaru'],
  washer: ['pračka', 'pračku', 'pračky'],
  solar: ['fotovoltaika', 'fotovoltaiky', 'elektrárna', 'elektrárny', 'panely'],
}).flatMap(([permission, terms]) => terms.map((term) => ({ permission, term, key: normalizeVoiceText(term) })));
const devicePrefix = /^(?:(?:he[yj] jarvis|prosim|a|tak) )*(?:zapni|vypni|spust|zastav|pozastav|probud|ukotvi|posli|vrat|co dela|jak se ma|jak je na tom|jaky je stav|stav|kde je|bezi|vysava|kolik(?: energie| elektriny)?(?: dnes| vcera)? vyrobil[ay](?: dnes| vcera)?) (?:(?:mi|ted|ten|ta|tu) )*/;

function similarDeviceWord(word, key) {
  if (Math.abs(word.length - key.length) > 1) return false;
  let index = 0;
  while (index < word.length && word[index] === key[index]) index++;
  const given = word.slice(index);
  const known = key.slice(index);
  if (given.length > known.length) return given.slice(1) === known;
  if (given.length < known.length) return given === known.slice(1);
  return (given.length > 0 && ['aeiouy', 'ij', 'bv'].some((group) => group.includes(given[0]) && group.includes(known[0])) &&
      given.slice(1) === known.slice(1)) ||
    (given.length >= 2 && given[0] === known[1] && given[1] === known[0] && given.slice(2) === known.slice(2));
}

export function normalizeVoiceText(value) {
  if (typeof value !== 'string') return '';
  return value.toLocaleLowerCase('cs').normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ').trim().replace(/^[?!.,:; ]+|[?!.,:; ]+$/g, '');
}

export function repairCzechVoiceCommand(value, connections) {
  if (typeof value !== 'string') return value;
  const original = value.normalize('NFC');
  const conditional = /\b(?:potom|pak|zitra|pozdeji|az|pokud|kdyz|jestli|kdyby)\b/.test(normalizeVoiceText(original));
  const imperative = conditional ? original : original.replace(
    /^(\s*(?:(?:he[yj] jarvis|prosím|a|tak)[, ]+)*)(?:(zapn|vypn|zhasn)[iíeě]|(rozsv)[ií][tť]|(nastav|zv[yý][sš]|sn[ií][zž]|dej|spus[tť]|p[řr]epni|vysaj|vyt[řr]i|probu[dď]))[, ]*m[iyeě][, ]+(?=\p{L})/iu,
    (_, prefix, switchStem, lightStem, verb) => prefix + (switchStem ? switchStem + 'i' : lightStem ? lightStem + 'iť' : verb) + ' mi ');
  const playback = conditional || /\?\s*$/.test(original) ? imperative : imperative
    .replace(/^(\s*(?:(?:prosím|a|tak)[, ]+)*)(p[řr]ehraj)(?:[ií]|te)(?=[, ]+\p{L})/iu, '$1$2')
    .replace(/^(\s*(?:(?:prosím|a|tak)[, ]+)*)(zahr)(?:[aá]l[iy]|aj[ií])(?=[, ]+\p{L})/iu, '$1$2aj');
  const repaired = playback.replace(/^(\s*)(nastav) *te plotu(?=\s|[.!?]|$)/iu, '$1$2 teplotu');
  if (!connections) return repaired;
  const tokens = [...repaired.matchAll(/\p{L}+/gu)];
  const words = tokens.map(([word]) => normalizeVoiceText(word));
  const prefix = devicePrefix.exec(words.join(' '));
  if (!prefix) return repaired;
  const index = prefix[0].trimEnd().split(' ').length;
  const word = words[index];
  const token = tokens[index];
  if (!word || word.length < 5 || /[!?;:.]/.test(repaired.slice(0, token.index)) || deviceWords.some(({ key }) => key === word)) return repaired;
  const matches = deviceWords.filter(({ key }) => similarDeviceWord(word, key));
  if (matches.length !== 1 || !connections[matches[0].permission]) return repaired;
  return repaired.slice(0, token.index) + matches[0].term + repaired.slice(token.index + token[0].length);
}

export function resolveVoiceRoom(value) {
  const name = normalizeVoiceText(value).replace(/^(?:v|ve|na|do) /, '');
  if (!/^[a-z0-9]+(?: [a-z0-9]+){0,3}$/.test(name) ||
      /\b(?:a|i|ale|nebo|at|ze|aby|pak|potom|ne|nikdy|prosim|tam|tady|tu|to|on|ona|ji|ho|je|jsou|v|ve|na|do|se|si|vsude|vsechno|vsechna|vsechny|dum|cely|cele|svetlo|svetla|led|lampa|vysavac|topeni|klimatizaci)\b/.test(name)) return '';
  return roomAliases.get(name) ?? name;
}

export function mentionedVoiceRoom(text, names) {
  const known = new Set(names.map(resolveVoiceRoom).filter(Boolean));
  const aliases = new Map([...roomAliases].filter(([, room]) => known.has(room)));
  for (const name of names) {
    const room = resolveVoiceRoom(name);
    if (room) aliases.set(normalizeVoiceText(name), room);
  }
  if (!aliases.size) return undefined;
  const alternatives = [...aliases.keys()].sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')).join('|');
  const hits = new Set([...normalizeVoiceText(text).matchAll(new RegExp('\\b(?:' + alternatives + ')\\b', 'g'))]
    .map(([alias]) => aliases.get(alias)));
  return hits.size === 1 ? [...hits][0] : hits.size ? null : undefined;
}

export function spokenNumber(value) {
  if (/^\d{1,3}(?:[.,]\d{1,2})?$/.test(value)) return Number(value.replace(',', '.'));
  const base = value.replace(/ (?:a |s )?pul$/, '');
  const fractional = base === value ? 0 : 0.5;
  if (/^\d{1,3}$/.test(base)) return Number(base) + fractional;
  const known = units.get(base) ?? tens.get(base);
  if (known !== undefined) return known + fractional;
  const [ten, unit, ...rest] = base.split(' ');
  const tail = units.get(unit);
  if (!rest.length && tens.has(ten) && tail >= 1 && tail <= 9) return tens.get(ten) + tail + fractional;
  const reversed = /^(jedn|jeden|dva|tri|ctyri|pet|sest|sedm|osm|devet)a(dvacet|tricet|ctyricet|padesat|sedesat|sedmdesat|osmdesat|devadesat)$/.exec(base);
  if (reversed) return (units.get(reversed[1]) ?? 1) + tens.get(reversed[2]) + fractional;
}

function locateLight(text) {
  if (!text) return {};
  const device = /\b(stropni svetl[oa]|stropni osvetleni|led(?: pasek| svetlo)?|pasek|lam(?:pa|pu|pe)|lampicku|svetlo|svetla|osvetleni)\b/.exec(text);
  const location = device ? text.replace(device[0], '').trim().replace(/\b(?:v|ve|na)$/, '').trim() : text;
  const room = resolveVoiceRoom(location);
  if (!room && !/^(?:tam|tu|tady|zde|ho|ji|je|to)?$/.test(location)) return null;
  const name = device?.[0];
  const target = name?.startsWith('stropni') ? 'ceiling' : name?.startsWith('lam') ? 'lamp' :
    name?.startsWith('led') || name === 'pasek' ? 'led' : undefined;
  return { ...(room && { room }), ...(target && { target }) };
}

function lightIntent(text, question) {
  const status = /^(?:a )?(?:sviti|je rozsvicene|je rozsviceno) (.+)$/.exec(text);
  if (status) {
    const location = locateLight(status[1].replace(/\b(?:prave ted|ted|aktualne|jeste)\b/g, '').trim());
    if (location) return { action: 'light.read', ...location };
  }
  const color = colorCommand.exec(text);
  if (color) {
    const location = locateLight(color[1]);
    const brightness = color[3] && spokenNumber(color[3]);
    if (location && (!color[3] || Number.isInteger(brightness) && brightness >= 1 && brightness <= 100)) {
      return { action: 'light.color', ...location, value: colorNames.get(color[2]), ...(brightness && { brightness }) };
    }
    return null;
  }
  if (/^(?:svetlo|svetla)(?: (?:v|ve|na) [a-z0-9 ]+)?$|^(?:v|ve|na) [a-z0-9 ]+ (?:svetlo|svetla)$/.test(text)) {
    const location = locateLight(text);
    if (location) return question ? { action: 'light.read', ...location } : { action: 'light.set', ...location, value: true };
  }
  const power = /^(rozsvit|zhasni|zapni|vypni)(?: mi)?(?: (.+))?$/.exec(text);
  if (power) {
    const [, verb, device = ''] = power;
    if (device === 'lampicky') return { action: 'light.lamps', value: verb === 'rozsvit' || verb === 'zapni' };
    if ((verb === 'zhasni' || verb === 'vypni') && /^(?:vsude|vsechno|vsechn[ay](?: svetla)?|svetla vsude)$/.test(device)) {
      return { action: 'light.allOff' };
    }
    if (verb === 'rozsvit' || verb === 'zhasni' || /\b(?:svetlo|svetla|led|lampu|lampa|lampicku|osvetleni|pasek)\b/.test(device)) {
      const location = locateLight(device);
      if (location) return { action: 'light.set', ...location, value: verb === 'rozsvit' || verb === 'zapni' };
    }
  }
  const dim = /^(ztlum|zesil|nastav(?: jas)?|zmen jas) (.+?) na (.+?) ?(?:%|procent(?:a|o)?)$/.exec(text);
  if (!dim) return null;
  const location = locateLight(dim[2]);
  const value = spokenNumber(dim[3]);
  if (location && (dim[1] !== 'nastav' || location.target) && Number.isInteger(value) && value >= 1 && value <= 100) {
    return { action: 'light.brightness', ...location, value };
  }
  return null;
}

function targetHeat(text) {
  const positionFirst = /^(.+?) na (.+)$/.exec(text);
  const temperatureFirst = /^(?:na )?(.+?) (v|ve|na) (.+)$/.exec(text);
  const pairs = [
    positionFirst && [positionFirst[1], positionFirst[2]],
    temperatureFirst && [temperatureFirst[2] + ' ' + temperatureFirst[3], temperatureFirst[1]],
  ].filter(Boolean);
  const words = text.split(' ');
  for (let index = 1; index < words.length; index++) {
    pairs.push([words.slice(0, index).join(' '), words.slice(index).join(' ')]);
  }
  for (const [roomText, temperature] of pairs) {
    const room = resolveVoiceRoom(roomText);
    const value = spokenNumber(temperature.replace(/ ?(?:°\s*c?|stup(?:en|ne|nu))$/, ''));
    if (room && value !== undefined) return { room, value };
  }
}

function heatAdjustment(roomText, amount, period, decrease, allowMissingRoom = false) {
  const room = resolveVoiceRoom(roomText);
  const deltaText = amount.replace(/ ?(?:°\s*c?|stup(?:en|ne|nu)(?: celsia)?)$/, '');
  const delta = deltaText === 'pul' ? 0.5 : deltaText === '' ? 1 : spokenNumber(deltaText);
  const duration = period === undefined ? 2 : period ? spokenNumber(period) : 1;
  if ((!room && !allowMissingRoom) || ![1, 2, 3, 6, 8, 12].includes(duration) ||
      !(delta > 0 && delta <= 10 && Number.isInteger(delta * 2))) return null;
  return { action: 'heat.adjust', room, value: decrease ? -delta : delta, duration };
}

function heatIntent(text) {
  const targetLast = /^(nastav|dej)(?: mi)?(?: (.+?))? (o .+? \w+) ((?:cilovou )?teplotu)(?: (.+))?$/.exec(text);
  const comparativeText = targetLast ? [targetLast[1], targetLast[4], targetLast[5], targetLast[2], targetLast[3]]
    .filter(Boolean).join(' ') : text;
  const comparative = /^(?:nastav|dej)(?: mi)? (.+?) o (.+?) (vyssi|vysesi|vys|vyse|tepleji|nizsi|niz|nize|chladneji)(?: na (.*?) ?hodin(?:u|y)?)?$/.exec(comparativeText);
  if (comparative) {
    const [, scope, amount, direction, after] = comparative;
    const [, location, before] = /^(.*?)(?: na (.*?) ?hodin(?:u|y)?)?$/.exec(scope);
    const target = /(?:^| )(?:(?:cilovou )?teplotu|topeni|termostat)(?= |$)/;
    if (!target.test(location) || (before !== undefined && after !== undefined)) return null;
    const room = location.replace(target, '').trim();
    return heatAdjustment(room, amount, after ?? before, /^(niz|chlad)/.test(direction), /^(?:tam|tady)?$/.test(room));
  }
  const adjust = /^(zvys|zvetsi|sniz|zvedni|uber|pridej)(?: mi)? (.+)$/.exec(text);
  if (adjust) {
    const parts = /^(.*) na (.+?) hodin(?:u|y)? o (.+)$/.exec(adjust[2]) ??
      /^(.*) o (.+?)(?: na (.*?) ?hodin(?:u|y)?)?$/.exec(adjust[2]);
    if (!parts) return null;
    const durationFirst = /^.* na .+? hodin(?:u|y)? o /.test(adjust[2]);
    const amount = parts[durationFirst ? 3 : 2];
    const period = parts[durationFirst ? 2 : 3];
    const temperature = /(?:^| )(?:(?:tu )?(?:cilovou )?(?:teplotu|cil)|topeni)(?= |$)/;
    const room = parts[1].replace(temperature, '').trim();
    const allowMissingRoom = temperature.test(parts[1]) && (room === '' || room === 'tam');
    return heatAdjustment(room, amount, period, /^(sniz|uber)$/.test(adjust[1]), allowMissingRoom);
  }
  if (/^(?:nastav|prepni|zapni) (?:topeni |netatmo )?(?:na |do )?rezim(?:u)? (?:pryc|nepritomnosti|nepritomnost)$/.test(text) ||
      /^(?:nastav|prepni) (?:topeni|netatmo) na (?:pryc|nepritomnost)$/.test(text)) {
    return { action: 'heat.mode', value: 'away' };
  }
  if (/^(?:(?:zapni|obnov) (?:bezny |tydenni )?program topeni|(?:vrat|prepni|nastav) topeni (?:zpet )?(?:na (?:bezny |tydenni )?program|podle programu))$/.test(text)) {
    return { action: 'heat.mode', value: 'schedule' };
  }
  if (/^(?:jaky je rezim topeni|v jakem rezimu je topeni|jaky program topeni bezi|je topeni v rezimu pryc)$/.test(text)) {
    return { action: 'heat.mode.read' };
  }
  const scheduledTemperature = /^(?:nastav|vrat|prepni|obnov)(?: mi)? (.+?) (?:zpet )?(?:(?:na )?(?:(?:bezny|normalni|standardni|tydenni|puvodni) )?(?:program|rozvrh)|(?:na )?podle (?:programu|rozvrhu))$/.exec(text);
  if (scheduledTemperature && /\b(?:teplotu|topeni|termostat)\b/.test(scheduledTemperature[1])) {
    const location = scheduledTemperature[1].replace(/\b(?:(?:cilovou|docasnou|vlastni|custom) )?(?:teplotu|topeni|termostat)\b/, '').trim();
    const room = resolveVoiceRoom(location);
    return room || !location ? { action: 'heat.resume', ...(room && { room }) } : null;
  }
  const resume = /^(?:obnov|vrat|prepni|zrus) (?:topeni|rucni topeni|rucni nastaveni|program topeni|program) (.+?)(?: (?:na program|podle programu))?$/.exec(text);
  if (resume) {
    const room = resolveVoiceRoom(resume[1]);
    return room ? { action: 'heat.resume', room } : null;
  }
  const heat = /^(?:nastav|dej|zatop|vytop)(?: (?:topeni|termostat|(?:cilovou )?teplotu))? (.+)$/.exec(text);
  if (!heat) return null;
  const period = /^(.*) na (.+?) hodin(?:u|y)?$/.exec(heat[1]);
  const duration = period && spokenNumber(period[2]);
  if (period && (!Number.isInteger(duration) || duration < 1)) return null;
  const target = targetHeat(period?.[1] ?? heat[1]);
  return target && { action: 'heat.set', ...target, ...(duration && { duration }) };
}

function climateIntent(text) {
  const timer = /^(?:spust|zapni|aktivuj) (?:(?:ulozeny )?plan klimatizace|ulozeny plan|casovac klimatizace)(?: s nazvem)? (.+)$/.exec(text);
  if (timer) {
    const value = timer[1].replace(/^["“„]|["“„]$/g, '').trim();
    if (value.length > 0 && value.length <= 40) return { action: 'climate.timer.start', value };
  }
  if (/^(?:zrus|vypni|zastav) (?:casovac klimatizace|plan klimatizace)$/.test(text)) return { action: 'climate.timer.cancel' };
  if (/^(?:jake (?:jsou|mam)|rekni mi|vyjmenuj) (?:ulozene )?plany klimatizace$/.test(text)) return { action: 'climate.timer.list' };
  if (/^(?:bezi|je aktivni|stav|jaky je stav) casovac(?:e)? klimatizace$/.test(text)) return { action: 'climate.timer.read' };
  const ecoPower = /^(zapni|vypni|spust|ukonci|aktivuj|deaktivuj) (?:rezim )?eco(?: rezim)?(?: klimatizace)?$/.exec(text);
  if (ecoPower) return { action: 'climate.eco.set', value: /^(?:zapni|spust|aktivuj)$/.test(ecoPower[1]) };
  const fan = /^(?:nastav|prepni) ventilator klimatizace (?:na )?(auto|automatiku|automaticky|tichy|nizky|stredni|vysoky|maximalni)(?: vykon| otacky)?$/.exec(text);
  if (fan) return { action: 'climate.fan', value: { auto: 'auto', automatiku: 'auto', automaticky: 'auto', tichy: 'quiet',
    nizky: 'low', stredni: 'medium', vysoky: 'high', maximalni: 'strong' }[fan[1]] };
  const mode = /^(?:zapni|spust|nastav|prepni)(?: klimatizaci(?: na| do)?)?(?: rezim)? (chlazeni|topeni|chlad|teplo|automatiku|automaticky rezim|odvlhcovani|ventilaci|ventilace)(?: na (.+))?$/.exec(text);
  if (mode && (/\bklimatizaci\b/.test(text) || /^(?:chlazeni|chlad)$/.test(mode[1]))) {
    const temperature = mode[2] && spokenNumber(mode[2].replace(/ ?(?:°\s*c?|stup(?:en|ne|nu))$/, ''));
    if (mode[2] && temperature === undefined) return null;
    const value = { chlazeni: 'cool', chlad: 'cool', topeni: 'heat', teplo: 'heat', automatiku: 'auto',
      'automaticky rezim': 'auto', odvlhcovani: 'dry', ventilaci: 'fan', ventilace: 'fan' }[mode[1]];
    if (temperature !== undefined && !['cool', 'heat'].includes(value)) return null;
    return { action: 'climate.set', value, ...(temperature !== undefined && { temperature }) };
  }
  const target = /^nastav (?:cilovou )?teplotu klimatizace na (.+)$/.exec(text);
  if (target) {
    const value = spokenNumber(target[1].replace(/ ?(?:°\s*c?|stup(?:en|ne|nu))$/, ''));
    return value !== undefined ? { action: 'climate.temperature', value } : null;
  }
  const power = /^(zapni|vypni|spust|zastav) klimatizaci$/.exec(text);
  if (power) return { action: 'climate.power', value: power[1] === 'zapni' || power[1] === 'spust' };
  if (/^(?:bezi|jede|je|funguje|je zapnuty) (?:klimatizace v |klima v )?eco(?: rezim)?$/.test(text) ||
      /^(?:jak je na tom|stav|co dela) eco(?: rezim)?$/.test(text)) return { action: 'climate.eco' };
  if (/^(?:bezi|jede|funguje|jak je nastavena|jak je na tom|stav|co dela) (?:klimatizace|klima)$/.test(text) ||
      /^je (?:klimatizace|klima) zapnuta$/.test(text)) return { action: 'climate.read' };
  return null;
}

export const vacuumDockDestination = /^(?:zpet )?(?:do do(?:c)?kl?u|do stanice|do nabijecky|na zakladnu|domu)$/;

function vacuumIntent(text) {
  const dock = /^(?:(?:posli|vrat|dej)(?: mi)?(?: zpet)? )?(?:vysavac|roborock)[, ]+(.+)$/.exec(text);
  if ((dock && vacuumDockDestination.test(dock[1])) ||
      /^(?:(?:ukotvi|zaparkuj)(?: mi)? (?:vysavac|roborock)|ukonci(?: mi)? (?:ten )?(?:vysavani|vytirani|uklid))$/.test(text)) {
    return { action: 'vacuum.dock' };
  }
  if (/^(?:pozastav|zastav) (?:vysavac|vysavani|uklid)$/.test(text)) return { action: 'vacuum.pause' };
  if (/^pokracuj (?:v|ve) (?:uklidu|vysavani|vytirani)$/.test(text) || /^(?:obnov|pust dal) (?:vysavac|vysavani|uklid)$/.test(text)) {
    return { action: 'vacuum.resume' };
  }
  if (/^(?:a )?(?:co (?:tedy |ted )?dela|kde je|jak se ma|jak je na tom|stav|bezi|vysava) (?:vysavac|roborock)$/.test(text)) return { action: 'vacuum.read' };
  const placeFirst = /^(?:potrebuji|potrebuju|chci) ((?:v|ve|na) .+) (vysat|vytrit)$/.exec(text);
  const clean = (placeFirst ? placeFirst[2] + ' ' + placeFirst[1] : text.replace(/^(?:potrebuji|potrebuju|chci) /, ''))
    .replace(/^(?:zapni|spust)(?: mi)? vysavac(?: (?:pro|na) (vysavani|vytirani|mopovani))? (?=(?:v|ve|na) )/,
      (_, mode) => mode && mode !== 'vysavani' ? 'vytri ' : 'vysaj ');
  const start = /^(vysaj(?: a vytri(?: zaroven)?|,? potom vytri)?|vysat(?: a vytrit(?: zaroven)?|,? potom vytrit)?|vysavej|vytri|vytrit|vytirej|uklid|uklidni|(?:spust|zapni) (?:vysavac|uklid|vysavani|vytirani|smartplan))(?: (.+))?$/.exec(clean);
  if (!start) return null;
  const [, verb, scope] = start;
  const place = scope?.replace(/^pro /, '');
  const mode = /potom/.test(verb) ? 'vac_then_mop' : / a vytri/.test(verb) ? 'vac_and_mop' :
    /^(?:vytri|vytir)|vytirani$/.test(verb) ? 'mop' : /vysa/.test(verb) ? 'vacuum' :
    /smartplan$/.test(verb) ? 'smart_mode' : undefined;
  const intent = { action: 'vacuum.start', ...(mode && { mode }) };
  if (!place) return intent;
  if (/^(?:vsude|vsechno|cely (?:byt|dum))$/.test(place)) return { ...intent, wholeHome: true };
  if (/\b(?:krome|mimo|vyjma|bez)\b/.test(place)) return null;
  const places = place.split(/,\s*| a /);
  if (places.length > 1) {
    const rooms = places.map(resolveVoiceRoom);
    return rooms.every(Boolean) ? { ...intent, rooms } : null;
  }
  const room = resolveVoiceRoom(place);
  return room ? { ...intent, room } : null;
}

function airIntent(text) {
  const setting = /^(?:nastav|prepni|zapni) cistick[ue](?: vzduchu)?(?: (.+?))? (?:na |do )?(?:rezim )?(automatiku|automaticky|automatickeho|nocni|nocniho|tichy|ticheho|stredni|stredniho|turbo)(?: rezim(?:u)?)?$/.exec(text);
  if (setting) {
    const room = setting[1] && resolveVoiceRoom(setting[1]);
    if (setting[1] && !room) return null;
    const value = { automatiku: 'auto', automaticky: 'auto', automatickeho: 'auto', nocni: 'sleep', nocniho: 'sleep',
      tichy: 'sleep', ticheho: 'sleep', stredni: 'medium', stredniho: 'medium', turbo: 'turbo' }[setting[2]];
    return { action: 'air.mode', value, ...(room && { room }) };
  }
  const humidity = /^(?:nastav|zmen) (?:cilovou )?vlhkost(?: (?:cisticky|zvlhcovace))?(?: (.+?))? na (.+?) ?(?:%|procent(?:a|o)?)$/.exec(text);
  if (humidity) {
    const room = humidity[1] && resolveVoiceRoom(humidity[1]);
    const value = spokenNumber(humidity[2]);
    if ((!humidity[1] || room) && [40, 50, 60, 70].includes(value)) {
      return { action: 'air.humidity', value, ...(room && { room }) };
    }
    return null;
  }
  const power = /^(zapni|vypni|spust|zastav) cisticku(?: vzduchu)?(?: (.+))?$/.exec(text);
  if (power) {
    const room = power[2] && resolveVoiceRoom(power[2]);
    return !power[2] || room ? { action: 'air.set', value: power[1] === 'zapni' || power[1] === 'spust', ...(room && { room }) } : null;
  }
  const status = /^(?:(?:bezi|jede|co dela|jak je na tom|stav) cistick[ay](?: vzduchu)?|(?:jaky je stav|kolik je) (?:pm\s*2[.,]?5|prachu)|jaka je kvalita vzduchu)(?: (.+))?$/.exec(text);
  if (status) {
    const room = status[1] && resolveVoiceRoom(status[1]);
    return !status[1] || room ? { action: 'air.read', ...(/^(?:bezi|jede|co dela|jak je na tom|stav) cistick/.test(text) && { metric: 'state' }),
      ...(room && { room }) } : null;
  }
  return null;
}

function roomReading(text) {
  if (/^(?:jaka je|rekni mi|zmer) venkovni teplot[au]$/.test(text)) return { action: 'outdoor.read', metric: 'temperature' };
  const measurement = /^(kolik(?: je)?(?: ted| prave ted)?|jaka je|jake je|jaky je|rekni mi|zmer) (.+)$/.exec(text);
  if (!measurement) return null;
  const [, question, detail] = measurement;
  const [prefix, firstUnit] = /^(teplota|teplotu|stupnu|stupne|vlhkost|co\s*2|oxidu uhliciteho)\b/.exec(detail) ?? [];
  const [suffix, lastUnit] = / (stupnu|stupne|vlhkost|co\s*2|oxidu uhliciteho)$/.exec(detail) ?? [];
  const unit = firstUnit ?? lastUnit;
  const metric = unit === 'vlhkost' ? 'humidity' : /^(?:co\s*2|oxidu uhliciteho)$/.test(unit) ? 'co2' : 'temperature';
  if (!unit && !question.startsWith('kolik')) return null;
  const place = detail.slice(prefix?.length ?? 0, suffix && !prefix ? -suffix.length : undefined)
    .trim().replace(/^(?:je|mame) /, '');
  if (/^(?:venku|venkovni)$/.test(place)) return { action: 'outdoor.read', metric };
  const room = resolveVoiceRoom(place);
  return room ? { action: 'room.read', metric, room } : null;
}

function otherReading(text) {
  if (/^(?:kolik(?: energie| elektriny)?(?: dnes| vcera)? vyrobil[ay](?: dnes| vcera)?|(?:dnesni|vcerejsi) vyroba) (?:fotovoltaik[ay]|fve|elektrarn[ay]|panely)(?: dnes| vcera)?$/.test(text)) {
    return { action: 'solar.read', metric: /\b(?:vcera|vcerejsi)\b/.test(text) ? 'yesterday' : 'today' };
  }
  if (/^(?:kolik(?: ted| prave| aktualne)? vyrabi|jaky vykon ma|(?:jaky je )?vykon) (?:fotovoltaika|fotovoltaiky|fve|elektrarna|elektrarny|panely|panelu)$/.test(text)) {
    return { action: 'solar.read', metric: 'power' };
  }
  if (/^(?:(?:jaky je )?(?:celkovy )?prikon (?:domu|bytu)|kolik (?:ted )?(?:bere|spotrebovava|zere) (?:dum|byt)|kolik (?:ted )?(?:dum|byt) (?:bere|spotrebovava|zere))$/.test(text)) {
    return { action: 'power.read' };
  }
  if (/^(?:za jak dlouho dopere|kdy dopere|je hotova|co dela|bezi|stav|jak je na tom) prack[ay]$/.test(text) ||
      /^kolik (?:jeste )?zbyva (?:pracce|do konce prani)$/.test(text)) return { action: 'washer.read' };
  if (/^(?:(?:co dela|stav|jak je na tom|je pripraveny|je pripraven) kavovar(?: delonghi)?|je kavovar(?: delonghi)? pripraveny)$/.test(text)) return { action: 'coffee.read' };
  if (/^(?:bezi|topi|jede|stav|co dela|jak je na tom) kotel$/.test(text) || /^je kotel zapnuty$/.test(text)) return { action: 'boiler.read' };
  return null;
}

function coffeeIntent(text) {
  if (/^(?:probud|zapni|spust) kavovar(?: delonghi)?$/.test(text)) return { action: 'coffee.wake' };
  return null;
}

export function czechLightWish(value, withContext = false) {
  const text = normalizeVoiceText(value);
  const wish = /^(?:(?:a|tak) )?(?:(chci|chtel bych|chtela bych|potrebuji|potrebuju)(?: si)?|si) (?:(je|ho|ji|to|tam) )?(rozsvitit|rozsvitet|zhasnout)(?: (.+))?$/.exec(text);
  if (!wish || (!wish[1] && !withContext)) return '';
  return [wish[3] === 'zhasnout' ? 'zhasni' : 'rozsvit', wish[2], wish[4]].filter(Boolean).join(' ');
}

export function parseVoiceIntent(value) {
  const text = (czechLightWish(value) || normalizeVoiceText(repairCzechVoiceCommand(value))).replace(/^(?:hey jarvis|hej jarvis)(?:,| )\s*/, '')
    .replace(/\bvytrijit\b/g, 'vytrit')
    .replace(/^(?:prosim|muzes)(?:,| )\s*/, '').replace(/(?:,| )\s*prosim$/, '')
    .replace(/^zvesmej (?=(?:tu )?(?:cilovou )?teplotu\b)/, 'zvys mi ')
    .replace(/^(zvys|zvetsi|sniz|zvedni|uber|pridej|rozsvit|zhasni|zapni|vypni)m[iy](?= |$)/, '$1 mi')
    .replace(/^(zapni|vypni|rozsvit|zhasni|spust|nastav|prepni|zmen|zrus|ukonci|obnov|posli|vrat|pozastav|zastav|vysaj|vytri|probud) mi(?= )/, '$1');
  if (!text || text.length > 180 || /[!?;:]/.test(text) || /\b(?:nebo|pak|jinak|ale|nechci)\b/.test(text)) return null;
  return lightIntent(text, /\?\s*$/.test(value)) ?? climateIntent(text) ?? heatIntent(text) ?? vacuumIntent(text) ?? airIntent(text) ??
    coffeeIntent(text) ?? otherReading(text) ?? roomReading(text);
}

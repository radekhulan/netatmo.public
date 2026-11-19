import { normalizeVoiceText, parseVoiceIntent, spokenNumber, vacuumDockDestination } from './voice-intents.mjs';
import { voiceActions } from './voice-actions.mjs';

const shorthand = /^(?:(?:a|tak|prosim)[, ]+)*(?:(?:je|ho|ji|to|tam) )?(?:(?:mi|zas|zase) )?(zapni|vypni|rozsvit|zhasni|pust|nastav|zmen|uprav|prepni|zvys|sniz|ztlum|zesil|spust|pozastav|zastav|ukonci|pokracuj|vrat|posli|probud|zrus)(?: (?:je|ho|ji|to|tam))?(?: (.+))?$/;

export function voiceContextDomain(context) {
  const intent = context?.intent;
  if (!intent || context.clarify || !voiceActions[intent.action]) return null;
  if (intent.action === 'room.read') return intent.room && (!intent.metric || intent.metric === 'temperature') ? 'heat' : null;
  const domain = intent.action.split('.')[0];
  if (domain === 'light') return Number.isSafeInteger(intent.lightId) ? domain : null;
  if (domain === 'air') return intent.room ? domain : null;
  return ['heat', 'climate', 'vacuum', 'coffee', 'spotify'].includes(domain) ? domain : null;
}

export function czechVoiceFollowUp(text, previous) {
  const domain = voiceContextDomain(previous);
  if (!domain) return null;
  const spoken = normalizeVoiceText(text);
  if (domain === 'heat' && /^(?:(?:a|tak) )?(?:(?:na )?(?:bezny |normalni |puvodni )?program|podle programu)$/.test(spoken)) {
    return { domain, verb: 'vrat', argument: 'program' };
  }
  const parts = shorthand.exec(spoken);
  const pending = previous.setting;
  if (!parts && (!pending || !/^(?:(?:na|o) )?(?:[0-9]|jedn|dv|tri|ctyr|pet|sest|sedm|osm|devet|deset|desat|dvacet|tricet|ctyricet|padesat|pul|nocni|turbo|automat|chlad|topeni|modr|cerven|ruzov|zelen|zlut|bil|fial)/.test(spoken))) return null;
  const verb = parts?.[1] ?? pending;
  let argument = parts?.[2] ?? (parts ? '' : spoken);
  if (!parts && !/^(?:na|o)\b/.test(argument)) argument = (['zvys', 'sniz'].includes(verb) ? 'o ' : 'na ') + argument;
  if (/[!?;]|\b(?:a pak|nebo|pokud|kdyby|jestli|krome|vyjma|az|zitra|pozitri)\b/.test(argument) ||
      (argument && !/^(?:na|o|do|v|ve|podle|zpet|jas|barvu|hlasitost|rezim|vykon|rychlost|teplotu|vlhkost)\b/.test(argument))) return null;
  return { domain, verb, argument, pending: !parts, topic: previous.intent.action };
}

const settings = {
  light: ['light.brightness', 'light.color'], heat: ['heat.set', 'heat.adjust'],
  climate: ['climate.temperature', 'climate.set', 'climate.fan'], air: ['air.humidity', 'air.mode'], spotify: ['spotify.volume'],
};
const settingQuestions = {
  light: 'Jaký jas nebo jakou barvu chceš pro tohle světlo?', heat: 'Na kolik stupňů?',
  climate: 'Jakou teplotu nebo režim mám nastavit?', air: 'Jaký režim nebo cílovou vlhkost mám nastavit?',
  spotify: 'Jakou hlasitost v procentech?',
};

export function contextualVoiceOperations(followUp) {
  const { domain, verb, argument, topic } = followUp;
  if (topic && /^climate\.(?:timer|eco)\b/.test(topic)) return [];
  if (domain === 'light' && /\b(?:stup\w*|o .+ procent)\b/.test(argument)) return [];
  if (argument && /^(?:nastav|uprav|zmen|prepni|ztlum|zesil|zvys|sniz)$/.test(verb)) return settings[domain] ?? [];
  return [];
}

export function planContextualVoice(followUp, previous) {
  if (!followUp) return null;
  const { domain, verb, argument, pending } = followUp;
  const last = previous.intent;
  const room = last.room ?? '';
  const power = ['zapni', 'rozsvit', 'spust', 'probud', 'pust'].includes(verb) ? true :
    ['vypni', 'zhasni', 'zastav', 'pozastav'].includes(verb) ? false : undefined;
  if (!argument && power !== undefined) {
    if (domain === 'light' && !['spust', 'probud', 'pozastav', 'pust'].includes(verb)) return { ...last, action: 'light.set', value: power };
    if (domain === 'climate' && !['rozsvit', 'zhasni', 'probud'].includes(verb)) {
      if (last.action.startsWith('climate.eco')) return { action: 'climate.eco.set', value: power };
      if (!power && last.action.startsWith('climate.timer.')) return { action: 'climate.timer.cancel' };
      if (!last.action.startsWith('climate.timer.')) return { action: 'climate.power', value: power };
    }
    if (domain === 'air' && !['rozsvit', 'zhasni', 'probud'].includes(verb)) return { action: 'air.set', room, value: power };
    if (domain === 'vacuum' && !['rozsvit', 'zhasni', 'probud'].includes(verb)) return power
      ? { action: 'vacuum.start', room: last.action === 'vacuum.start' ? last.room : undefined,
        rooms: last.action === 'vacuum.start' ? last.rooms : undefined, mode: last.mode }
      : { action: 'vacuum.pause' };
    if (domain === 'coffee' && ['zapni', 'spust', 'probud'].includes(verb)) return { action: 'coffee.wake' };
    if (domain === 'spotify' && !['rozsvit', 'zhasni', 'probud'].includes(verb)) return { action: power ? 'spotify.resume' : 'spotify.pause' };
  }
  if (verb === 'pokracuj' && !argument && ['vacuum', 'spotify'].includes(domain)) return { action: domain + '.resume' };
  if (domain === 'vacuum' && ((verb === 'ukonci' && !argument) ||
      (['vrat', 'posli'].includes(verb) && vacuumDockDestination.test(argument)))) return { action: 'vacuum.dock' };
  if (domain === 'vacuum' && power === true && ['spust', 'zapni'].includes(verb) && /^(?:v|ve|na) /.test(argument)) {
    return parseVoiceIntent('spust vysavac ' + argument);
  }
  if (domain === 'heat' && room && ['vrat', 'nastav', 'prepni'].includes(verb) &&
      /^(?:zpet )?(?:(?:na )?(?:(?:bezny|normalni|standardni|tydenni|puvodni) )?(?:program|rozvrh)|(?:na )?podle (?:programu|rozvrhu))$/.test(argument)) {
    return { action: 'heat.resume', room };
  }
  if (domain === 'climate' && last.action.startsWith('climate.timer.') && verb === 'zrus' && !argument) return { action: 'climate.timer.cancel' };

  if ((domain === 'climate' && /^climate\.(?:timer|eco)\b/.test(last.action)) || !settings[domain] || !/^(?:nastav|uprav|zmen|prepni|ztlum|zesil|zvys|sniz)$/.test(verb)) return null;
  if (domain === 'light' && last.rgb === false) return { message: 'Tohle světlo můžu zapnout nebo vypnout.', context: { intent: last } };
  if (!argument) return { message: ['zvys', 'sniz'].includes(verb) && domain === 'heat' ? 'O kolik stupňů?' : settingQuestions[domain],
    context: { intent: last, setting: verb } };
  const valueText = argument.replace(/^(?:jas|barvu|hlasitost|rezim|teplotu|vlhkost) /, '');
  const value = spokenNumber(valueText.replace(/^na /, '').replace(/ ?(?:procent|%|stup(?:en|ne|nu)|°c?)$/, ''));
  const numberOnly = Number.isFinite(value);
  const percent = /(?:procent|%)$/.test(valueText);
  if (domain === 'light') {
    if (numberOnly && Number.isInteger(value) && value >= 1 && value <= 100 && !/stup|°/.test(valueText)) {
      return { ...last, action: 'light.brightness', value };
    }
    const color = parseVoiceIntent('nastav led ' + valueText);
    return color?.action === 'light.color' ? { ...last, ...color, target: last.target } : null;
  }
  if (domain === 'heat' && room && !percent) {
    if (['zvys', 'sniz'].includes(verb)) return parseVoiceIntent(verb + ' teplotu ' + room + ' ' + valueText);
    return parseVoiceIntent('nastav teplotu ' + room + ' ' + valueText);
  }
  if (domain === 'climate' && !percent) {
    if (numberOnly && Number.isInteger(value) && value >= 5 && value <= 40) return { action: 'climate.temperature', value };
    return parseVoiceIntent('nastav klimatizaci ' + valueText);
  }
  if (domain === 'air') {
    if (numberOnly && [40, 50, 60, 70].includes(value) && (percent || pending)) return { action: 'air.humidity', room, value };
    return parseVoiceIntent('nastav cisticku ' + room + ' ' + valueText);
  }
  if (domain === 'spotify' && numberOnly && Number.isInteger(value) && value >= 0 && value <= 100 && !/stup|°/.test(valueText)) {
    return { action: 'spotify.volume', volume: value };
  }
  return null;
}

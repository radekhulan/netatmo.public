import { normalizeVoiceText, resolveVoiceRoom } from './voice-intents.mjs';
import { contextualVoiceOperations, czechVoiceFollowUp } from './voice-context.mjs';

const denied = Object.freeze({ allowed: false, domains: Object.freeze([]), followUp: false });
const slots = new Set(['room', 'scope', 'value', 'temperature', 'brightness', 'duration', 'target', 'mode', 'name']);
const domains = new Set(['light', 'heat', 'heating', 'climate', 'vacuum', 'air', 'coffee', 'batteries', 'spotify']);
const csVerbs = [
  'rozsvit(?:it)?', 'zhasni', 'zhasnout', 'zapn(?:i|out)', 'vypn(?:i|out)', 'spus(?:t|tit)', 'zastav(?:it)?',
  'nastav(?:it)?', 'oprav(?:it)?', 'nahrad(?:it)?', 'prepni', 'prepnout', 'zmen(?:it)?', 'uprav(?:it)?', 'prepis', 'prepsat', 'zvys(?:it)?', 'sniz(?:it)?',
  'zvedni', 'zvednout', 'uber', 'ubrat', 'pridej', 'pridat', 'ztlum(?:it)?', 'zesil(?:it)?',
  'vysaj', 'vysat', 'vysavej', 'vysavat', 'vytri', 'vytrit', 'vytirej', 'vytirat', 'uklid(?:it|ni)?',
  'posli', 'poslat', 'pozastav(?:it)?', 'ukonci(?:t)?', 'zaparkuj', 'pokracuj', 'pokracovat', 'vrat(?:it)?', 'obnov(?:it)?', 'zrus(?:it)?',
  'smaz(?:at)?', 'uloz(?:it)?', 'probud(?:it)?', 'pritop(?:it)?', 'zatop(?:it)?', 'vytop(?:it)?',
  'prehraj', 'prehrat', 'pust(?:it)?', 'zahraj', 'zahrat', 'hledej', 'vyhledej', 'najdi', 'preskoc',
  'aktualizuj', 'naplanuj', 'naplanovat', 'aktivuj', 'deaktivuj',
].join('|');
const enVerbs = 'turn|switch|set|raise|lower|warm|cool|mop|vacuum|start|stop|pause|resume|play|clean|return|send|enable|disable|cancel|dim|schedule|save|delete|wake|refresh|search|find|skip|change';

const rules = {
  cs: {
    lead: /^(?:(?:(?:hey|hej) jarvis|prosim|muzes|mohl bys|mohla bys|potreboval bych|potrebovala bych|potrebuju|potrebuji|je potreba|chtel bych|chtela bych|chci|rad bych|rada bych|mi|ted|prave ted|a|tak)(?:, *| +))+/,
    query: /^(?:(?:se |mi )?(?:vedet|znat|poradit|porad|zjistit|zjisti|rict|rekni|povedet|povez|vysvetlit|vysvetli|ukazat|ukaz|podivat|podivej)\b|co\b|jak\b|jaka?\b|kdy\b|kde\b|proc\b|kolik\b|zda\b|jestli\b|funguje\b|bezi\b)/,
    veto: /\b(?:ne|nikdy|nikam|ani|krome|vyjma|mimo|bez|vynech|vynechej|nebo|jestli|jestlize|pokud|kdyby(?:ch|s|ste|chom)?|kdyz|leda(?:ze)?|az|hypoteticky|napriklad|ukazka|priklad|simuluj|nanecisto|posleze|zitra|pozitri|pozdeji|potom co|v pripade|po (?:prijezdu|navratu|odchodu)|(?:je|jsou|bude|budou|budu|budete)-li)\b|\bne(?:chc|potreb|rozsv|zhas|zap|vyp|nastav|spous|spus|uklid|vytr|vytir|vysa|sniz|zvys|uber|pridej|probud|vrat|poust|pust|prehr|smaz|zrus|prep|prov)/,
    action: new RegExp('^(?:' + csVerbs + ')(?:mi)?\\b'),
    verb: new RegExp('\\b(?:' + csVerbs + ')(?:mi)?\\b'),
    multiple: new RegExp('(?:\\b(?:a|potom|pak|take)\\b|[;,]) *(?:mi |prosim )?(?:' + csVerbs + ')\\b'),
    vacuumPair: /\b(vysaj|vysat)(?: a|,? potom) (vytri|vytrit)\b/,
    frontRoom: /^(?:v|ve|na) [a-z]+(?: [a-z]+){0,2}$/, delegated: /^(?:abys|abyste|aby ses)$/,
    future: /\b(?:v|ve) (?:[0-2]?\d[:.]\d{2}|(?:\d{1,2}|jednu|dve|tri|ctyri|pet|sest|sedm|osm|devet|deset|jedenact|dvanact|osmnact) hodin\w*|noci|pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli)\b|\bza (?:\d+|[a-z]+) (?:minut|vterin|hodin|dn)\w*\b|\b(?:vecer|odpoledne|rano|o vikendu|pristi tyden)\b/,
    timer: /\b(?:casovac\w*|plan\w*|naplanuj|naplanovat)\b/,
    whole: /\b(?:vsude|vsechno|cely (?:byt|dum)|vsechny mistnosti)\b/,
    place: /^(?:v|ve|na|do) /,
    number: /^(?:na |o )?(?:\d{1,3}(?:[.,]\d{1,2})?|(?:jedn\w*|dv\w*|tr\w*|ctyr\w*|pet|sest|sedm|osm|devet|deset|sto|pul|dvacet|tricet|ctyricet|padesat|sedesat|sedmdesat|osmdesat|devadesat)(?: (?:jedna|dva|dve|tri|ctyri|pet|sest|sedm|osm|devet|a pul))?)(?: ?(?:%|procent\w*|stup\w*|hodin\w*|minut\w*))?$/,
    targets: /^(?:led|ledky|led pasek|lampa|lampu|strop|stropni svetlo)$/,
    booleanReply: /^(?:ano|jo|jasne|jiste|dobre|asi|potvrzuji|potvrd|odmitam|nevim)$/,
    modes: /^(?:na |do )?(?:vysavani|vytirani|smartplan|nocni(?: rezim)?|turbo|automatiku|chlazeni|topeni|eco|rezimu pryc)$/,
    word: {
      light: /\b(?:svetl|sviti|lamp|osvetl|rozsv|zhas|scen|led(?:\b|k))\w*/, heat: /\b(?:topen|termostat|radiator|hlavic|pritop|zatop|vytop)\w*/,
      climate: /\b(?:klimatiz|klima|sensibo|chlazen|odvlhcov|eco|ventilator|casovac|ulozeny plan|limit domu)\w*/,
      vacuum: /\b(?:vysav|vysaj|vysat|roborock|mop|vytri|vytir|uklid|smartplan)\w*/,
      air: /\b(?:cistick|philips|airplus|zvlhcov|vlhkost)\w*/, coffee: /\b(?:kavovar|delonghi)\w*/,
      batteries: /\bbateri\w*/, spotify: /\b(?:spotify|hudb|pisnic|skladb|playlist|interpret|album|prehrav|prehraj|zahraj)\w*/,
    },
    temperature: /\bteplot\w*/, program: /\b(?:program|rozvrh|harmonogram|tydenn)\w*/,
    climateHeat: /\bklimatizaci (?:na|do) (?:rezim\w* )?topeni\b/,
  },
  en: {
    lead: /^(?:(?:hey jarvis|please|can you|would you|could you|i (?:need|want)(?: you)? to|i would like(?: you)? to|(?:and|then))(?:, *| +))+/,
    query: /^(?:what|how|why|where|which|who|when|tell me|check|explain|show me|(?:find|learn) out|(?:is|are|does|did|will)\b)/,
    veto: /\b(?:no|not|never|don['’]t|do not|without|except|excluding|apart from|unless|if|assuming|once|after|before|when|hypothetically|for example|or|tomorrow|later)\b/,
    action: new RegExp('^(?:' + enVerbs + ')\\b'),
    verb: new RegExp('\\b(?:' + enVerbs + ')\\b'),
    multiple: new RegExp('(?:\\b(?:and|then|also)\\b|[;,]) *(?:' + enVerbs + ')\\b'),
    vacuumPair: /\bvacuum(?: and|,? then) mop\b/,
    frontRoom: /^(?:in|at|inside) [a-z]+(?: [a-z]+){0,2}$/,
    future: /\bat (?:\d{1,2}(?::\d\d)?(?: ?[ap]m)?|(?:one|two|three|four|five|six|seven|eight|nine|ten) o[’']clock)\b|\bin \w+ (?:minutes?|hours?)\b|\b(?:tonight|this evening|this afternoon|next week|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/,
    timer: /\b(?:timer|schedule|preset|plan)\b/,
    whole: /\b(?:everywhere|the whole (?:house|home)|whole (?:house|home)|entire house|all rooms)\b/,
    place: /^(?:in|at|inside|to) /,
    number: /^(?:to |by )?\d{1,3}(?:[.,]\d{1,2})?(?: ?(?:degrees|%|percent|hours?|minutes?))?$/,
    targets: /^(?:led|lamp|ceiling(?: light)?)$/,
    booleanReply: /^(?:yes|yeah|yep|okay|ok|sure|confirm|maybe)$/,
    modes: /^(?:to )?(?:vacuuming|mopping|smartplan|night(?: mode)?|turbo|automatic|cooling|heating|eco|away)$/,
    word: {
      light: /\b(?:lights?|lighting|lamps?|led|scene)\b/, heat: /\b(?:heating|thermostat|radiator)\b/,
      climate: /\b(?:air condition\w*|a\/?c|sensibo|cooling|eco|dehumidifier|timer)\b/,
      vacuum: /\b(?:vacuum\w*|mop\w*|roborock|smartplan|clean(?:ing)? the floor)\b/,
      air: /\b(?:air purifier|airplus|humidifier|philips|humidity)\b/, coffee: /\b(?:coffee machine|coffee maker|delonghi)\b/,
      batteries: /\bbatter(?:y|ies)\b/, spotify: /\b(?:spotify|songs?|music|tracks?|playlist|artist|album|playback|play)\b/,
    },
    temperature: /\btemperature\b/, program: /\b(?:program|schedule|timetable)\b/,
    climateHeat: /\b(?:air conditioner|a\/?c) (?:to|into) (?:the )?heating\b/,
  },
  th: {
    lead: /^(?:เฮ้ จาร์วิส|ช่วย|กรุณา|ขอให้|อยากให้)\s*/,
    query: /^(?:อะไร|ทำไม|อยากรู้|บอก|ตรวจสอบ|ขอดู|เท่าไหร่|กี่)/,
    veto: /(?:ถ้า|หาก|เมื่อ|ก่อนที่|หลังจาก|อย่า|ไม่ต้อง|ไม่ให้|ไม่อยาก|ไม่เปิด|ไม่ปิด|ไม่ถู|ไม่ดูด|ยกเว้น|หรือ|พรุ่งนี้|ทีหลัง)/,
    action: /^(?:เปิด|ปิด|เปลี่ยน|ตั้ง|ปรับ|เพิ่ม|ลด|ถู|ดูด|ทำความสะอาด|เริ่ม|หยุด|เล่น|ส่ง|กลับ|ยกเลิก)/,
    verb: /(?:เปิด|ปิด|เปลี่ยน|ตั้ง|ปรับ|เพิ่ม|ลด|ถู|ดูด|ทำความสะอาด|เริ่ม|หยุด|เล่น|ส่ง|กลับ|ยกเลิก)/,
    multiple: /(?:และ|แล้ว)\s*(?:เปิด|ปิด|เปลี่ยน|ตั้ง|ปรับ|เพิ่ม|ลด|ถู|ดูด|เริ่ม|หยุด|เล่น|ส่ง|กลับ|ยกเลิก)/,
    vacuumPair: /ดูดฝุ่น(?:และ|แล้ว)ถูพื้น/,
    future: /(?:ตอนเย็น|คืนนี้|เวลา\s*[0-9๐-๙]|อีก\s*[0-9๐-๙]+\s*(?:นาที|ชั่วโมง))/,
    timer: /(?:ตั้งเวลา|ตาราง|แผน)/, whole: /(?:ทั้งบ้าน|ทุกห้อง)/, place: /^(?:ใน|ที่|ห้อง)/,
    number: /^(?:เป็น|อีก)?\s*[0-9๐-๙]{1,3}(?:[.,][0-9๐-๙]{1,2})?\s*(?:องศา|เปอร์เซ็นต์|%|ชั่วโมง|นาที)?$/,
    targets: /^(?:ไฟเพดาน|โคมไฟ|ไฟแอลอีดี)$/,
    booleanReply: /^(?:ใช่|ยืนยัน|ตกลง|โอเค|ไม่|ไม่ใช่)$/,
    modes: /^(?:ดูดฝุ่น|ถูพื้น|โหมดกลางคืน|โหมดอัตโนมัติ|โหมดเย็น|โหมดร้อน)$/,
    word: {
      light: /ไฟ|โคมไฟ/, heat: /เครื่องทำความร้อน|หม้อน้ำ|เทอร์โมสตัท/, climate: /เครื่องปรับอากาศ|แอร์|ตั้งเวลา|อีโค/,
      vacuum: /ดูดฝุ่น|ถูพื้น|หุ่นยนต์|ทำความสะอาด/, air: /เครื่องฟอกอากาศ|เครื่องเพิ่มความชื้น/, coffee: /เครื่องชงกาแฟ/,
      batteries: /แบตเตอรี่/, spotify: /เพลง|สปอติฟาย|spotify/,
    },
    temperature: /อุณหภูมิ/, program: /โปรแกรม|ตาราง/, climateHeat: /(?:เครื่องปรับอากาศ|แอร์).*เครื่องทำความร้อน/,
  },
};

function normalize(question, language) {
  if (typeof question !== 'string') return '';
  return language === 'cs' ? normalizeVoiceText(question) : question.toLowerCase().replace(/\s+/g, ' ')
    .trim().replace(/^[!?.,:; ]+|[!?.,:; ]+$/g, '');
}

function directPermission(question, language, wantsAction) {
  const rule = rules[language];
  const text = normalize(question, language);
  if (!rule || !text || text.length > 450 || rule.veto.test(text)) return denied;
  const command = text.replace(rule.lead, '');
  if (rule.query.test(command)) return denied;
  if (language === 'cs' && rule.word.climate.test(command)) {
    if (/^oprav (?:hlaseny )?stav klimatizace (?:na|jako) .+/.test(command)) {
      return { allowed: true, domains: ['climate'], operations: ['climate.sync'], followUp: false };
    }
    if (/^(?:nastav|zmen) (?:v eco )?limit\w* (?:domu|eco|klimatizace)\b/.test(command)) {
      return { allowed: true, domains: ['climate'], operations: ['climate.eco.limits'], followUp: false };
    }
    if (/^smaz (?:ulozeny )?plan klimatizace .+/.test(command)) {
      return { allowed: true, domains: ['climate'], operations: ['climate.timer.delete'], followUp: false };
    }
    const timerStart = /^(?:naplanuj\b|nastav (?:casovac|plan)|(?:zapni|spust) .+(?: v| ve| od) \d{1,2}:\d{2}\b)/.test(command);
    const timerSteps = /(?:^| )(?:v|ve|od|do) \d{1,2}:\d{2}\b/.test(command);
    const remaining = command.replace(/(?:,? a| pak) vypni(?: (?:klimatizaci|chlazeni))? (?:v|ve) \d{1,2}:\d{2}\b/, '');
    if (timerStart && (timerSteps || rule.future.test(command)) && !rule.multiple.test(remaining) &&
        !/\b(?:svetlo|lampu|vysavac|kavovar|cisticku|spotify)\b/.test(command)) {
      return { allowed: true, domains: ['climate'], operations: ['climate.timer.schedule', 'climate.timer.save'], followUp: false };
    }
  }
  if (rule.multiple.test(command.replace(rule.vacuumPair, ''))) return denied;
  const verb = rule.verb.exec(command);
  const prefix = verb ? command.slice(0, verb.index).trim() : '';
  if (!rule.action.test(command) && !rule.frontRoom?.test(prefix) &&
      !(rule.delegated?.test(prefix) && typeof wantsAction === 'function' && wantsAction(question, language))) return denied;
  const selected = Object.entries(rule.word).filter(([, pattern]) => pattern.test(command)).map(([name]) => name);
  if (selected.includes('climate') && selected.includes('heat') && rule.climateHeat.test(command)) selected.splice(selected.indexOf('heat'), 1);
  if (!selected.length && rule.temperature.test(command)) selected.push('heat');
  if (selected.length !== 1 || (selected[0] === 'coffee' && voicePowerDirection(question, language) !== true)) return denied;
  if (selected[0] === 'heat' && rule.program.test(command)) {
    if (language === 'cs' && /^(?:nahrad|prepis)\b/.test(command)) {
      return { allowed: true, domains: ['heating'], operations: ['heating.program'], followUp: false };
    }
    selected.push('heating');
  }
  const future = rule.future.test(command);
  if (future && (selected[0] !== 'climate' || !rule.timer.test(command))) return denied;
  return { allowed: true, domains: selected, followUp: false, wholeHouse: selected[0] === 'vacuum' && rule.whole.test(command),
    ...(future && { operations: ['climate.timer.schedule', 'climate.timer.save'] }) };
}

export function voicePowerDirection(question, language) {
  const text = normalize(question, language).replace(rules[language].lead, '');
  if (language === 'cs') {
    if (/^(?:(?:je|ho|ji|to) )?(?:zapni|rozsvit|spust|probud)(?:mi)?\b/.test(text)) return true;
    if (/^(?:(?:je|ho|ji|to) )?(?:vypni|zhasni|zastav)(?:mi)?\b/.test(text)) return false;
  } else if (language === 'en') {
    if (/^(?:wake|start)\b|^(?:turn|switch)\b.*\bon\b/.test(text)) return true;
    if (/^stop\b|^(?:turn|switch)\b.*\boff\b/.test(text)) return false;
  } else {
    if (/^(?:เปิด|ปลุก|เริ่ม)/.test(text)) return true;
    if (/^(?:ปิด|หยุด)/.test(text)) return false;
  }
}

export function voiceWritePermission(question, language, prior, wantsAction) {
  const direct = directPermission(question, language, wantsAction);
  if (direct.allowed) return direct;
  if (language === 'cs' && !rules.cs.veto.test(normalizeVoiceText(question)) && !rules.cs.future.test(normalizeVoiceText(question))) {
    const followUp = czechVoiceFollowUp(question, prior);
    const operations = followUp ? contextualVoiceOperations(followUp) : [];
    if (operations.length) return { allowed: true, domains: [followUp.domain], operations, contextual: true, followUp: false };
  }
  const pending = prior?.model;
  if (pending?.write !== true || typeof pending.question !== 'string' || typeof question !== 'string' || /[!?;:]/.test(question)) return denied;
  const original = directPermission(pending.question, language, wantsAction);
  if (!original.allowed) return denied;
  const rule = rules[language];
  const text = normalize(question, language);
  const slot = slots.has(pending.slot) ? pending.slot : 'room';
  if (!text || text.length > 48 || rule.query.test(text) || rule.veto.test(text) || rule.future.test(text) || rule.booleanReply.test(text)) return denied;
  const wholeHouse = ['room', 'scope'].includes(slot) && original.domains.includes('vacuum') &&
    rule.whole.test(text) && text.split(' ').length <= 3;
  const roomValue = language === 'cs' ? Boolean(resolveVoiceRoom(text)) : /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+){0,3}$/u.test(text);
  const room = slot === 'room' && roomValue && !rule.verb.test(text) && (pending.slot === 'room' || rule.place.test(text));
  const scalar = ['value', 'temperature', 'brightness', 'duration'].includes(slot) && rule.number.test(text);
  const target = slot === 'target' && rule.targets.test(text);
  const mode = slot === 'mode' && rule.modes.test(text);
  if (!wholeHouse && !room && !scalar && !target && !mode) return denied;
  const selected = Array.isArray(pending.domains) ? original.domains.filter((domain) => pending.domains.includes(domain)) : original.domains;
  return selected.length ? { ...original, domains: selected, followUp: true, wholeHouse } : denied;
}

export function voiceModelContext(prior) {
  const model = prior?.model;
  if (typeof model?.question === 'string') {
    return { question: model.question.slice(0, 450), answer: typeof model.answer === 'string' ? model.answer.slice(0, 400) : '',
      write: model.write === true, ...(slots.has(model.slot) && { slot: model.slot }),
      ...(Array.isArray(model.domains) && { domains: model.domains.filter((domain) => domains.has(domain)) }) };
  }
  const intent = prior?.intent;
  if (!intent || typeof intent.action !== 'string') return undefined;
  const fields = ['action', 'room', 'device', 'metric', 'target', 'value', 'duration', 'temperature', 'brightness', 'mode'];
  const data = Object.fromEntries(fields.filter((key) => ['string', 'number', 'boolean'].includes(typeof intent[key]))
    .map((key) => [key, intent[key]]));
  return { intent: data, question: prior.question, clarify: prior.clarify === true, write: false };
}

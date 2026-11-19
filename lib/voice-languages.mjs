import { planVoice, planVoiceAction, planVoiceCapabilities } from './voice-assistant.mjs';
import { mayChange } from './voice-catalog.mjs';
import { closesVoice, voiceFarewell } from './voice-farewell.mjs';

const languages = new Set(['cs', 'en', 'th']);

export function voiceLanguage(value) {
  return languages.has(value) ? value : 'cs';
}

export const voiceMessages = {
  cs: { lookup: 'Zjišťuji odpověď.', unknown: 'Tomuhle povelu nerozumím. Zkus ho prosím říct jinak.',
    unavailable: 'Hlasová služba je právě nedostupná.', noAnswer: 'Podrobnější odpověď teď není dostupná.',
    canceled: 'Změna je zrušená.', whichRoom: 'Kterou místnost mám uklidit, nebo říkáš všude?' },
  en: { lookup: 'Finding the answer.', unknown: 'I didn’t understand that. Please try saying it differently.',
    unavailable: 'The voice assistant is temporarily unavailable.', noAnswer: 'I can’t find a more detailed answer right now.',
    canceled: 'Change cancelled.', whichRoom: 'Which room should I clean, or did you mean everywhere?',
    sending: 'Sending the command to the device.', accepted: 'The device accepted the command.',
    failed: 'The device could not confirm the command.', missing: 'The measurement is unavailable.',
    clarify: 'Which device or room did you mean?',
    programConfirm: 'Replace the heating schedule for all seven days? Say yes or no.',
    presetConfirm: 'Change the saved air conditioning plan? Say yes or no.' },
  th: { lookup: 'กำลังหาคำตอบ', unknown: 'ไม่เข้าใจคำสั่ง กรุณาลองพูดอีกครั้ง',
    unavailable: 'ระบบเสียงไม่พร้อมใช้งาน', noAnswer: 'ตอนนี้ยังหาคำตอบเพิ่มเติมไม่ได้',
    canceled: 'ยกเลิกการเปลี่ยนแปลงแล้ว', whichRoom: 'ให้ทำความสะอาดห้องไหน หรือต้องการทำทั้งบ้าน',
    sending: 'กำลังส่งคำสั่งไปยังอุปกรณ์', accepted: 'อุปกรณ์รับคำสั่งแล้ว',
    failed: 'อุปกรณ์ยังไม่ยืนยันคำสั่ง', missing: 'ไม่มีข้อมูลการวัด',
    clarify: 'หมายถึงอุปกรณ์หรือห้องไหน',
    programConfirm: 'เปลี่ยนตารางทำความร้อนทั้งเจ็ดวันหรือไม่ พูดว่าใช่หรือไม่',
    presetConfirm: 'เปลี่ยนแผนเครื่องปรับอากาศที่บันทึกไว้หรือไม่ พูดว่าใช่หรือไม่' },
};

const places = [
  ['obyvak', /\b(?:living room|lounge)\b/i, /ห้องนั่งเล่น/, 'the living room', 'ห้องนั่งเล่น'],
  ['pracovna', /\b(?:office|workroom)\b/i, /ห้องทำงาน/, 'the office', 'ห้องทำงาน'],
  ['loznice', /\bbedroom\b/i, /ห้องนอน/, 'the bedroom', 'ห้องนอน'],
  ['studovna', /\b(?:study|reading room)\b/i, /ห้องอ่านหนังสือ/, 'the study', 'ห้องอ่านหนังสือ'],
  ['', /\b(?:outside|outdoors)\b/i, /ข้างนอก|นอกบ้าน|ภายนอก/, 'outside', 'ข้างนอก'],
];

function compact(text) {
  return text.trim().toLowerCase().replace(/^[\s.!?,]+|[\s.!?,]+$/g, '');
}

export { closesVoice as interruptsVoice };

export function confirmation(text, language) {
  const word = compact(text);
  const options = { cs: [/^(ano|jo|potvrzuji|potvrd)$/, /^(ne|zruš|zrus)$/],
    en: [/^(yes|confirm)$/, /^(no|cancel)$/], th: [/^(ใช่|ยืนยัน|ตกลง)$/, /^(ไม่|ไม่ใช่|ยกเลิก)$/] };
  const [positive, negative] = options[language];
  return positive.test(word) ? true : negative.test(word) ? false : null;
}

export function wantsAction(text, language) {
  if (language === 'cs') return mayChange(text);
  const word = compact(text);
  if (language === 'th') {
    return !/อย่า|ไม่ต้อง|ไม่ให้|ไม่อยาก|หรือ/.test(word) &&
      /^(?:ช่วย|กรุณา|ขอให้|อยากให้)?\s*(?:เปิด|ปิด|เปลี่ยน|ตั้ง|ปรับ|เพิ่ม|ลด|ถู|ดูด|ทำความสะอาด|เริ่ม|หยุด|เล่น|ส่ง|กลับ|ยกเลิก)/.test(word);
  }
  return !/\b(?:not|never|don['’]t|or|if|unless)\b/.test(word) &&
    /^(?:(?:please|can you|could you|would you|i need you to|i want you to)\s+)*(?:turn|switch|set|raise|lower|mop|vacuum|start|stop|pause|resume|play|clean|return|send|enable|disable|cancel|dim)\b/.test(word);
}

export function wantsWholeHouse(text, language) {
  return (language === 'en' ? /\b(everywhere|whole house|whole home|entire house|all rooms)\b/i
    : language === 'th' ? /ทั้งบ้าน|ทุกห้อง/ : /\b(vsude|cely dum|cely byt|vsechno)\b/i).test(text);
}

export async function planVoiceInLanguage(text, deps, previous, language) {
  if (language === 'cs') return planVoice(text, deps, previous);
  const message = voiceMessages[language];
  const command = compact(text);
  if (closesVoice(command, language)) return { message: voiceFarewell(language), end: true };
  const capabilities = planVoiceCapabilities(command, deps, language);
  if (capabilities) return capabilities;
  const english = language === 'en';
  const place = places.find((item) => item[english ? 1 : 2].test(command));
  const previousAction = previous?.intent;
  const followup = previousAction && (english ? /^(and |what about )/ : /^(แล้ว|แล้วก็)/).test(command);
  const metric = (english ? /humidity/ : /ความชื้น/).test(command) ? 'humidity'
    : (english ? /temperature|how (?:warm|cold|hot)|how many degrees/ : /อุณหภูมิ|กี่องศา|ร้อนไหม|หนาวไหม/).test(command) ? 'temperature'
      : followup && previousAction.metric;
  if (!place || !metric || wantsAction(text, language)) return null;
  const [room, , , en, th] = place;
  const intent = { action: room ? 'room.read' : 'outdoor.read', room, metric };
  const result = await planVoiceAction(intent, deps);
  if (!result.reading) return { message: message.missing, failed: true, context: { intent } };
  const number = new Intl.NumberFormat(english ? 'en-GB' : 'th-TH', { maximumFractionDigits: 1 }).format(result.reading.value);
  const answer = english
    ? (metric === 'humidity' ? 'Humidity' : 'The temperature') + ' ' + (room ? 'in ' : '') + en + ' is ' + number +
      (metric === 'humidity' ? ' percent.' : ' degrees Celsius.')
    : th + (metric === 'humidity' ? 'มีความชื้น ' + number + ' เปอร์เซ็นต์' : 'มีอุณหภูมิ ' + number + ' องศาเซลเซียส');
  return { message: answer, context: { intent } };
}

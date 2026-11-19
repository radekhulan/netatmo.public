import { normalizeVoiceText } from './voice-intents.mjs';

const closings = {
  cs: /^(?:konec|na konec|stop|hotovo|hoitovo|ukonci rozhovor|ukonci konverzaci|to je vse|dekuji(?: moc)?|diky(?: moc)?|dakujem|jakujem)$/,
  en: /^(?:thanks|thank you|end conversation|that['’]s all|stop(?: listening)?|done)$/,
  th: /^(?:ขอบคุณ|จบ|จบการสนทนา|พอแล้ว|หยุดฟัง|เสร็จแล้ว)(?:ครับ|ค่ะ)?$|^stop$/,
};
const farewells = {
  cs: ['Loučím se.', 'Tak zatím.', 'Měj se.', 'Jsem tu, až mě budeš potřebovat.'],
  en: ['See you later.', 'Talk to you later.', 'I’ll be here if you need me.'],
  th: ['แล้วพบกันใหม่', 'ไว้คุยกันใหม่', 'เรียกฉันได้เมื่อต้องการ'],
};
const lastFarewell = {};

export function closesVoice(text, language) {
  const words = language === 'cs' ? normalizeVoiceText(text) : text.trim().toLowerCase().replace(/^[\s.!?,]+|[\s.!?,]+$/g, '');
  return closings[language].test(words);
}

export function voiceFarewell(language) {
  const options = farewells[language];
  const previous = lastFarewell[language];
  const index = previous === undefined ? Math.floor(Math.random() * options.length)
    : (previous + 1 + Math.floor(Math.random() * (options.length - 1))) % options.length;
  lastFarewell[language] = index;
  return options[index];
}

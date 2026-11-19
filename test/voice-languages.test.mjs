import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmation, interruptsVoice, planVoiceInLanguage, voiceLanguage, wantsAction } from '../lib/voice-languages.mjs';

const rooms = [
  { name: 'Obývák', meter: { temperature: 20.9 } },
  { name: 'Ložnice', meter: { temperature: 19.8 } },
];
const deps = {
  station: async () => ({ state: 'live' }),
  heating: async () => ({ state: 'off' }),
  rooms: () => rooms,
};

test('temperature and follow-up stay in the chosen language', async () => {
  const first = await planVoiceInLanguage('What is the temperature in the living room?', deps, null, 'en');
  assert.equal(first.message, 'The temperature in the living room is 20.9 degrees Celsius.');
  const next = await planVoiceInLanguage('And in the bedroom?', deps, first.context, 'en');
  assert.match(next.message, /bedroom is 19.8/);
  const thai = await planVoiceInLanguage('อุณหภูมิในห้องนั่งเล่นเท่าไหร่', deps, null, 'th');
  assert.equal(thai.message, 'ห้องนั่งเล่นมีอุณหภูมิ 20.9 องศาเซลเซียส');
});

test('foreign commands distinguish explicit requests from questions and negation', () => {
  assert.equal(voiceLanguage('invalid'), 'cs');
  assert.equal(wantsAction('Could you turn on the kitchen light?', 'en'), true);
  assert.equal(wantsAction('Is the kitchen light on?', 'en'), false);
  assert.equal(wantsAction('Please do not turn on the light.', 'en'), false);
  assert.equal(wantsAction('ช่วยเปิดไฟในห้องนั่งเล่น', 'th'), true);
  assert.equal(wantsAction('อย่าเปิดไฟในห้องนั่งเล่น', 'th'), false);
  assert.equal(confirmation('No.', 'en'), false);
  assert.equal(confirmation('ยืนยัน', 'th'), true);
});

test('only standalone end commands can interrupt an ongoing reply', () => {
  for (const phrase of ['Stop.', 'Hotovo!', 'Konec?', '  HOITOVO. ', 'Děkuji.']) assert.equal(interruptsVoice(phrase, 'cs'), true);
  for (const phrase of ['', 'Vysavač hlásí hotovo.', 'Stop vysavač.', 'Tady je konec programu.']) {
    assert.equal(interruptsVoice(phrase, 'cs'), false);
  }
  assert.equal(interruptsVoice('Done.', 'en'), true);
  assert.equal(interruptsVoice('พอแล้วครับ', 'th'), true);
});


test('capabilities are described in the chosen language', async () => {
  const connected = { connections: () => ({ weather: true }) };
  const english = await planVoiceInLanguage('What can you do for me?', connected, null, 'en');
  const thai = await planVoiceInLanguage('คุณทำอะไรได้บ้าง', connected, null, 'th');
  assert.equal(english.message, 'I can give advice based on the forecast.');
  assert.equal(thai.message, 'ฉันช่วยแนะนำตามพยากรณ์อากาศ.');
});

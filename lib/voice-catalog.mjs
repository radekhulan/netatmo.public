import { normalizeVoiceText, resolveVoiceRoom } from './voice-intents.mjs';
import { lightType, planVoiceAction, voiceCommand } from './voice-assistant.mjs';
import { voiceActions, voiceActionAllowed, validVoiceValue } from './voice-actions.mjs';
import { repeatHeatingDay } from './heating-plan.mjs';

const readOperations = {
  Světla: 'stav světel, jas a dostupnost scén Fibaro',
  Netatmo: 'teplota, vlhkost, CO₂, hluk, cíle topení, hlavice, stav kotle, program, baterie a historie',
  Sensibo: 'výkon, stav klimatizace, režimy, teplota, ventilátor, Eco, časovač, limity a historie Eco',
  Roborock: 'stav a baterie, aktivní mapa a místnosti, režimy, průběh, údržba a historie úklidu',
  Philips: 'stav, režim, PM2.5, vlhkost, filtr, alergeny a nádržka u podporovaných modelů',
  Haier: 'stav a program, zbývající čas, spotřeba a dokončení cyklu',
  'De’Longhi': 'stav, hlášení, údržba a počty nápojů',
  GoodWe: 'okamžitý výkon FVE, denní výroba a historie',
  Fibaro: 'příkon domu, kotle, pračky a dalších nakonfigurovaných měřičů',
  Počasí: 'aktuální počasí a předpověď',
  Spotify: 'právě hraná skladba a vyhledávání ve Spotify v tomto prohlížeči',
};

export function voiceCatalog(deps) {
  const permissions = deps.connections();
  const actions = Object.fromEntries(Object.entries(voiceActions).filter(([name]) => voiceActionAllowed(name, permissions))
    .map(([name, { access, summary, example, args }]) => [name, { access, summary, example, args }]));
  const operations = Object.fromEntries(Object.entries(actions).map(([name, { summary }]) => [name, summary]));
  const lights = permissions.fibaro ? Object.values(deps.config.fibaro?.devices ?? {}).filter((device) => device.light === true)
    .map((device) => ({ room: device.room, name: device.name, target: lightType(device) })) : [];
  for (const room of new Set(lights.map(({ room }) => room))) {
    const ceiling = lights.filter((light) => light.room === room && light.target === 'ceiling');
    const main = ceiling.find(({ name }) => normalizeVoiceText(name) === 'svetlo') ?? ceiling[0];
    if (main) main.main = true;
  }
  const readGroups = { Světla: 'fibaro', Sensibo: 'climate', Roborock: 'vacuum', Philips: 'air', Haier: 'washer',
    'De’Longhi': 'coffee', GoodWe: 'solar', Fibaro: 'power', Počasí: 'weather', Spotify: 'spotify' };
  const reads = Object.fromEntries(Object.entries(readOperations).filter(([name]) => name === 'Netatmo'
    ? permissions.station || permissions.heating : permissions[readGroups[name]]));
  const scenes = permissions.fibaro ? (deps.config.fibaro?.actions ?? []).filter(({ type }) => type === 'scene')
    .map(({ key, name }) => ({ key, name })) : [];
  const meters = permissions.power ? (deps.config.fibaro?.powerMeters ?? []).map(({ name, room }) => ({ name, room })) : [];
  const rooms = [...new Set([...(deps.config.rooms ?? []).map(({ name }) => name), ...lights.map(({ room }) => room),
    ...meters.map(({ room }) => room)].filter(Boolean))];
  return { operations, actions, reads, rooms, lights, scenes, meters };
}

export function mayChange(text) {
  const normalized = normalizeVoiceText(text).replace(/^(?:(?:hey|hej) jarvis|prosim)(?:,| )\s*/, '');
  if (/\bne(?:chci|rozsvi|zhas|zapn|zapin|vypn|vypin|nastav|spoust|uklid|vytr)/.test(normalized)) return false;
  if (/\b(?:co (?:by se stalo|se stane)|hypoteticky)\b/.test(normalized) ||
      /^(?:(?:mohl bys|muzes|mohla bys)(?: mi)? )?(?:rict|povedet|vysvetlit|ukazat|rekni|povez|vysvetli)(?: mi)?[ ,]+(?:co|jak|kolik|kdy|kde|jestli|zda|proc)\b/.test(normalized)) return false;
  return /^(?:(?:potrebuju|potrebuji|chci|mohl bys|muzes|rad bych|rada bych),? |(?:rozsvit|zhasni|ztlum|zjasni|zapni|vypni|spust|zastav|nastav|prepni|zmen|oprav|nahrad|ukonci|zvys|sniz|zvedni|uber|pridej|vysaj|vysavej|vytri|vytrej|uklid|uklidni|posli|pozastav|pokracuj|vrat|obnov|zrus|smaz|uloz|probud|precti|prehravej|prehraj|pust|vyhledej|najdi|preskoc|prejdi|ztis|zesil|aktualizuj)\b)/.test(normalized);
}

const conflicting = { message: 'Plán nebo stav zařízení se mezitím změnil.', failed: true };

function confirmation(message, operation, args) {
  return { message, context: { confirm: { operation, args } } };
}

export async function planCatalogOperation(operation, args, deps, confirmed = false, selection) {
  if (!voiceActionAllowed(operation, deps.connections())) return null;
  const { revision, ...values } = confirmed ? args ?? {} : {};
  if (!validVoiceValue(voiceActions[operation].args, confirmed ? values : args)) return null;
  if (confirmed) args = values;
  if (operation === 'climate.eco.limits') {
    if (!Object.keys(args).length) return null;
    return voiceCommand(deps, '/api/sensibo/eco/settings', { ...deps.eco().limits, ...args },
      'Ukládám limity Eco.', 'Limity Eco jsou uložené.');
  }
  if (operation === 'heating.program') {
    const current = await deps.heatingProgram();
    if (!current?.editable || !current.revision || (confirmed && revision !== current.revision)) return conflicting;
    const zones = new Map(current.zones.map(({ id, rooms }) => [id, new Set(rooms.map(({ id }) => id))]));
    const changed = args.temperatures.map(({ zoneId, roomId }) => JSON.stringify([zoneId, roomId]));
    if (!repeatHeatingDay(current, args.periods) || new Set(changed).size !== changed.length ||
        !args.temperatures.every(({ zoneId, roomId }) => zones.get(zoneId)?.has(roomId))) {
      return { message: 'Zkontroluj časy, zóny a místnosti v programu topení.', failed: true };
    }
    const payload = { ...args, revision: current.revision };
    if (!confirmed) return confirmation('Přepsat program topení stejným rozvrhem pro všech sedm dní? Řekni ano, nebo ne.', operation, payload);
    return voiceCommand(deps, '/api/heating/program', payload, 'Ukládám týdenní program.', 'Netatmo přijalo nový program topení.');
  }
  if (['climate.timer.schedule', 'climate.timer.save', 'climate.timer.delete'].includes(operation)) {
    const timer = deps.timer();
    const matchingPresets = args.name ? timer.presets.filter(({ name }) => normalizeVoiceText(name) === normalizeVoiceText(args.name)) : [];
    if (matchingPresets.length > 1) return { message: 'Více uložených plánů má tento název.', failed: true };
    const [preset] = matchingPresets;
    const presetRevision = preset && JSON.stringify([preset.id, preset.draft]);
    if (confirmed && (!presetRevision || revision !== presetRevision)) return conflicting;
    if (operation === 'climate.timer.delete') {
      if (!preset) return conflicting;
      if (!confirmed) return confirmation('Smazat uložený plán ' + preset.name + '? Řekni ano, nebo ne.', operation, { ...args, revision: presetRevision });
      return voiceCommand(deps, '/api/sensibo/timer', { action: 'deletePreset', id: preset.id },
        'Mažu plán časovače.', 'Plán je smazaný.');
    }
    const saving = operation === 'climate.timer.save';
    if (timer.timer?.active && !saving) return { message: 'Časovač už běží. Nejdřív ho zastav.', failed: true };
    if (saving && preset && !confirmed) return confirmation('Přepsat uložený plán ' + preset.name + '? Řekni ano, nebo ne.', operation, { ...args, revision: presetRevision });
    return voiceCommand(deps, '/api/sensibo/timer', { ...args, action: saving ? 'savePreset' : 'start' },
      saving ? 'Ukládám plán časovače.' : 'Plánuji časovač.', saving ? 'Plán časovače je uložený.' : 'Časovač je naplánovaný.');
  }
  if (operation.startsWith('spotify.')) return { client: { operation, ...args }, announcement: 'Čekám na Spotify.' };
  if (operation === 'heat.adjust' && args.value === 0) return null;
  if (operation === 'vacuum.start' && [Boolean(args.room), Boolean(args.rooms), args.wholeHome === true].filter(Boolean).length > 1) return null;
  const room = args.room && resolveVoiceRoom(args.room);
  const rooms = args.rooms?.map(resolveVoiceRoom);
  if ((args.room && !room) || rooms?.some((name) => !name)) return null;
  return planVoiceAction({ ...args, room, rooms, action: operation,
    ...(operation.startsWith('light.') && selection?.lightId != null && { lightId: selection.lightId }) }, deps);
}

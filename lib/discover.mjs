import { goodweSems } from './config.mjs';
import { semsStations } from './goodwe-cloud.mjs';
import { enabled, station, homes, fibaroInventory, goodwe } from './devices.mjs';

const sources = {
  station: async () => (await station()).map(({ id, name, outdoor }) => ({ id, name, outdoor })),
  heating: async () =>
    (await homes()).map(({ id, name, rooms }) => ({
      id,
      name,
      rooms: (rooms ?? []).map((room) => ({ id: room.id, name: room.name })),
    })),
  fibaro: fibaroInventory,
  goodwe: async () => {
    if (!goodweSems) return goodwe();
    const stations = (await semsStations()).map(({ id, name }) => ({ id, name }));
    if (stations.length === 1) return { stations, production: await goodwe() };
    return { stations };
  },
};
const keys = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(sources).filter((key) => enabled[key]);
if (keys.length === 0) console.error('Doplňte připojení v .env.');
const results = await Promise.allSettled(
  keys.map(async (key) => {
    if (!Object.hasOwn(sources, key) || !enabled[key]) throw new Error('Zdroj není nakonfigurován');
    return sources[key]();
  }),
);
for (const [index, result] of results.entries()) {
  if (result.status === 'rejected') {
    console.error(keys[index] + ': ' + result.reason.message);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ [keys[index]]: result.value }, null, 2));
  }
}

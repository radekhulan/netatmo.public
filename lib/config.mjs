import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const env = process.env;
const configFile = env.CONFIG_FILE || (existsSync('panel.json') ? 'panel.json' : 'panel.example.json');
export const config = JSON.parse(readFileSync(configFile, 'utf8'));
export const stateDir = resolve(env.STATE_DIR || '.state');
export const demo = env.DEMO !== 'false';
export const heatControl = env.NETATMO_HEATING_CONTROL === 'true';

export const goodweSems = Boolean(env.GOODWE_SEMS_USER && env.GOODWE_SEMS_PASSWORD);

const { latitude, longitude } = config.location ?? {};
export const enabled = {
  weather: Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180,
  radar: config.radar?.enabled === true,
  station: Boolean(env.NETATMO_CLIENT_ID && env.NETATMO_CLIENT_SECRET),
  heating: Boolean(env.NETATMO_CLIENT_ID && env.NETATMO_CLIENT_SECRET),
  fibaro: Boolean(env.FIBARO_URL && env.FIBARO_USER && env.FIBARO_PASSWORD),
  goodwe: goodweSems || Boolean(env.GOODWE_HOST),
};

enabled.fibaroPower = enabled.fibaro && Boolean(config.fibaro?.powerMeters?.length);

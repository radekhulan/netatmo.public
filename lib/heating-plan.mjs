import { createHash } from 'node:crypto';

const dayMs = 86_400_000;
const day = 1440;
const week = 7 * day;

export const activeHeatingSchedule = (home) => home.schedules?.find((item) => item.selected && item.type === 'therm');

export function heatingProgram(home) {
  const schedule = activeHeatingSchedule(home);
  if (!schedule?.id || !schedule.zones?.length || !schedule.timetable?.length) return null;
  const { id, name, away_temp, hg_temp } = schedule;
  const zones = schedule.zones.map(({ id, name, type, rooms_temp }) => ({
    id, name, type,
    rooms: (rooms_temp ?? []).map(({ room_id, temp }) => ({ id: String(room_id), therm_setpoint_temperature: temp }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  })).sort((a, b) => a.id - b.id);
  const roomIds = new Set(zones.flatMap(({ rooms }) => rooms.map(({ id }) => id)));
  const rooms = (home.rooms ?? []).filter(({ id }) => roomIds.has(String(id)))
    .map(({ id, name }) => ({ id: String(id), name }));
  const zoneIds = new Set(zones.map(({ id }) => id));
  const timetable = schedule.timetable.map(({ zone_id, m_offset }) => ({ zone_id, m_offset }))
    .sort((a, b) => a.m_offset - b.m_offset);
  const snapshot = { id, name, away_temp, hg_temp, zones, timetable };
  const revision = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const editable = roomIds.size > 0 && [0, 1, 4].every((id) => zoneIds.has(id)) &&
    [away_temp, hg_temp].every(Number.isFinite) && rooms.length === roomIds.size &&
    zones.every(({ rooms }) => rooms.length === roomIds.size && new Set(rooms.map(({ id }) => id)).size === roomIds.size &&
      rooms.every(({ therm_setpoint_temperature }) => Number.isFinite(therm_setpoint_temperature))) &&
    timetable.every(({ zone_id, m_offset }, index) => zoneIds.has(zone_id) && Number.isInteger(m_offset) &&
      m_offset >= 0 && m_offset < week && m_offset !== timetable[index - 1]?.m_offset);
  const monday = timetable.filter(({ m_offset }) => m_offset < day)
    .map(({ m_offset, zone_id }) => ({ minute: m_offset, zoneId: zone_id }));
  if (monday[0]?.minute !== 0) monday.unshift({ minute: 0, zoneId: timetable.at(-1).zone_id });
  return { ...snapshot, rooms, revision, editable, monday };
}

export function repeatHeatingDay(program, periods) {
  if (!Array.isArray(periods) || !periods.length || periods[0]?.minute !== 0) return null;
  const zoneIds = new Set(program.zones.map(({ id }) => id));
  if (!periods.every((period, index) => period && zoneIds.has(period.zoneId) &&
      Number.isInteger(period.minute) && period.minute >= 0 && period.minute < day &&
      (index === 0 || period.minute > periods[index - 1].minute))) return null;
  return Array.from({ length: 7 }, (_, index) => periods.map(({ minute, zoneId }) => ({
    zone_id: zoneId,
    m_offset: index * day + minute,
  }))).flat();
}

export function heatingPlan(home, status, now = Date.now()) {
  const schedule = activeHeatingSchedule(home);
  const mode = status.therm_mode ?? home.therm_mode;
  const format = new Intl.DateTimeFormat('sv-SE', {
    timeZone: home.timezone || 'Europe/Prague', dateStyle: 'short', timeStyle: 'medium',
  });
  const wallTime = (time) => Date.parse(format.format(time).replace(' ', 'T') + 'Z');
  const wall = wallTime(now);
  const date = new Date(wall);
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - ((date.getUTCDay() + 6) % 7) * dayMs;
  const changes = (schedule?.timetable ?? []).filter(({ m_offset }) => Number.isInteger(m_offset) && m_offset >= 0 && m_offset < week)
    .sort((a, b) => a.m_offset - b.m_offset);
  const zones = new Map((schedule?.zones ?? []).map(({ id, rooms_temp }) => [id, new Map((rooms_temp ?? []).map(({ room_id, temp }) => [room_id, temp]))]));
  const awayEnd = status.therm_mode === 'away' || mode === 'away'
    ? (status.therm_setpoint_end_time ?? status.therm_mode_end_time ?? home.therm_setpoint_end_time ?? home.therm_mode_end_time) * 1000
    : null;
  const roomPlans = new Map();
  for (const room of status.rooms ?? []) {
    const temporary = mode === 'away' || room.therm_setpoint_mode === 'manual' || room.therm_setpoint_mode === 'max';
    const until = (room.therm_setpoint_end_time ?? 0) * 1000 || awayEnd;
    const plan = { resumeAt: temporary && until > now ? until : null };
    roomPlans.set(room.id, plan);
    if (!changes.length || (!plan.resumeAt && (mode !== 'schedule' || temporary))) continue;
    if (plan.resumeAt) {
      const minute = (((wallTime(until) - monday) / 60_000) % week + week) % week;
      const zone = changes.findLast(({ m_offset }) => m_offset <= minute) ?? changes.at(-1);
      const target = zones.get(zone.zone_id)?.get(room.id);
      if (Number.isFinite(target)) plan.next = { at: until, target };
      continue;
    }
    const minute = (wall - monday) / 60_000;
    const current = changes.findLast(({ m_offset }) => m_offset <= minute) ?? changes.at(-1);
    const target = zones.get(current.zone_id)?.get(room.id);
    const next = [...changes.filter(({ m_offset }) => m_offset > minute),
      ...changes.filter(({ m_offset }) => m_offset <= minute).map((item) => ({ ...item, m_offset: item.m_offset + week }))]
      .find(({ zone_id }) => Number.isFinite(zones.get(zone_id)?.get(room.id)) && zones.get(zone_id).get(room.id) !== target);
    if (next) {
      const local = monday + next.m_offset * 60_000;
      const candidate = local - (wallTime(local) - local);
      const at = local - (wallTime(candidate) - candidate);
      plan.next = { at, target: zones.get(next.zone_id).get(room.id) };
    }
  }
  return { roomPlans, scheduleName: schedule?.name, awayTarget: schedule?.away_temp };
}

import asyncio
import fcntl
import json
import logging
import os
import sys
from pathlib import Path
from time import monotonic, time


def reading(properties, key):
    return properties.get(key, {}).get("value")


async def wake_machine(client, dsn, properties):
    from vendor.ayla_client import normalize_signed_app_id
    from vendor.command_builder import (
        build_session_refresh_encoded,
        build_wake_with_session_tail_encoded,
        decode_command,
        device_signature_from_frame,
    )
    from vendor.monitor import parse_monitor_b64

    standby = parse_monitor_b64(reading(properties, "d302_monitor_machine")).get("status_name")
    if standby != "standby":
        return {"result": "unavailable"}

    command_property = "app_data_request"
    connected_property = "app_device_connected"
    frame = reading(properties, command_property)
    decoded = decode_command(frame)
    signature = device_signature_from_frame(frame) if decoded.get("crc_valid") and decoded.get("prefix") == "0x0d" else None
    if not signature or connected_property not in properties:
        return {"result": "unavailable"}
    app_id = normalize_signed_app_id(int.from_bytes(signature, "big"))
    if not app_id:
        return {"result": "unavailable"}

    async def current_app_id():
        prop = await client.async_get_property(dsn, "app_id")
        try:
            return normalize_signed_app_id(int(str(prop.get("value")).strip()))
        except (ValueError, TypeError):
            return None

    owner = await current_app_id()
    if owner is None:
        return {"result": "unavailable"}
    if owner not in (0, app_id):
        return {"result": "in_use"}
    if owner != app_id:
        await client.async_post_cloud_session(dsn, connected_property, app_id)
        deadline = monotonic() + 14
        while monotonic() < deadline:
            await asyncio.sleep(2)
            owner = await current_app_id()
            if owner == app_id:
                break
            if owner not in (None, 0):
                return {"result": "in_use"}
        else:
            return {"result": "unconfirmed"}

    async def current_status():
        monitor = await client.async_get_property(dsn, "d302_monitor_machine")
        return parse_monitor_b64(monitor.get("value")).get("status_name")

    if await current_status() != "standby":
        return {"result": "unavailable"}
    await client.async_set_property_value(dsn, command_property, build_session_refresh_encoded(app_id))
    await client.async_set_property_value(dsn, command_property, build_wake_with_session_tail_encoded(app_id))

    deadline = monotonic() + 24
    while monotonic() < deadline:
        await asyncio.sleep(2)
        if await current_status() in {"waking_up", "rinsing", "ready"}:
            return {"result": "confirmed"}
    return {"result": "unconfirmed"}


def format_status(report, properties):
    from vendor.const import BREAKDOWN_COUNTER_SENSORS, MONITOR_PROPERTY_CANDIDATES
    from vendor.counters import (
        coffee_link_black_coffee_total,
        counter_breakdown_sum,
        parse_counter_value,
        parse_percentage_value,
        parse_remaining_percentage,
        parse_total_water_volume_liters,
    )
    from vendor.monitor import parse_monitor_b64

    def value(name):
        return reading(properties, name)

    status = report.get("status", "unknown")
    alerts = [name for name, active in report.get("alerts", {}).items() if active]
    monitor = next(
        (monitor for key in MONITOR_PROPERTY_CANDIDATES
         if (monitor := parse_monitor_b64(value(key))).get("status_name") == status),
        {},
    )
    return {
        "status": status,
        "alerts": alerts,
        "progress": parse_percentage_value(monitor.get("progress_percentage")) if status == "preparing_beverage" else None,
        "groundsPct": report.get("grounds_pct"),
        "descaleRemainingPct": parse_remaining_percentage(value("d512_percentage_to_deca")),
        "descaleCount": report.get("descale_count"),
        "filterCount": parse_counter_value(value("d554_cnt_filter_tot")),
        "coffeeCount": coffee_link_black_coffee_total(value("d701_tot_bev_b"), value("d733_tot_bev_counters")),
        "espressoCount": parse_counter_value(value("d705_tot_id1_espr")),
        "cappuccinoCount": parse_counter_value(value("d710_tot_id7_capp")),
        "coldBrewCount": next((
            counter_breakdown_sum(value(keys[0]), breakdown)
            for keys, name, _, _, breakdown in BREAKDOWN_COUNTER_SENSORS if name == "total_cold_brew"
        ), None),
        "waterLiters": parse_total_water_volume_liters(value("d553_water_tot_qty")),
    }


async def request(setup, wake):
    sys.path.insert(0, str(setup))
    from aiohttp import ClientSession
    model = os.environ.get("COFFEELINK_OEM_MODEL", "").strip()
    if not model:
        return {"result": "unavailable"} if wake else {"status": "unavailable"}

    from connect import save_session, summarize
    from vendor.ayla_client import AuthError, DelonghiAylaClient

    class StoredSessionClient(DelonghiAylaClient):
        async def _async_authenticate_locked(self):
            raise AuthError("Coffee Link requires a new login")

    with (setup / "session.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        credentials = json.loads((setup / "session.json").read_text(encoding="utf-8"))
        async with ClientSession() as session:
            client = StoredSessionClient(session, "", "")
            client._access_token = credentials["access_token"]
            client._refresh_token = credentials.get("refresh_token")
            client._expires_at = monotonic() + max(0, credentials["expires_at"] - time())

            def persist_refresh():
                if client._access_token and client._access_token != credentials["access_token"]:
                    save_session(client)
                    credentials["access_token"] = client._access_token

            try:
                async with asyncio.timeout(50 if wake else 14):
                    devices = await client.async_get_devices()
                    persist_refresh()
                    machines = [device for device in devices if device.dsn and device.oem_model == model]
                    if len(machines) != 1:
                        return {"result": "unavailable"} if wake else {"status": "unavailable"}
                    machine = machines[0]
                    connection = machine.connection_status.strip().casefold()
                    if connection != "online":
                        return {"result": "unavailable"} if wake else {
                            "status": "offline" if connection == "offline" else "unavailable"
                        }
                    properties = await client.async_get_properties(machine.dsn)
                    if wake:
                        return await wake_machine(client, machine.dsn, properties)
                    return format_status(summarize(machine, properties), properties)
            except AuthError:
                return {"result": "reauth"} if wake else {"status": "reauth"}
            finally:
                persist_refresh()


if __name__ == "__main__":
    logging.disable(logging.CRITICAL)
    try:
        wake = sys.argv[2:] == ["wake"]
        print(json.dumps(asyncio.run(request(Path(sys.argv[1]).resolve(), wake))))
    except Exception as error:
        raise SystemExit(type(error).__name__) from None

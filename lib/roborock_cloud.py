import asyncio
import base64
import json
import logging
import os
import sys
from pathlib import Path

from aiohttp import ClientError, ClientSession, ClientTimeout
from roborock import CleaningMode, RoborockCommand as Command, RoborockStateCode as State, StatusV2
from roborock import get_cleaning_mode_parameters, get_cleaning_mode_options
from roborock.data import Consumable, UserData
from roborock.data.v1.v1_clean_modes import WaterModes, get_clean_modes, get_clean_routes, get_water_modes
from roborock.devices.cache import DeviceCache, NoCache
from roborock.devices.rpc.v1_channel import create_v1_channel
from roborock.devices.traits.v1.clean_summary import CleanRecordConverter, CleanSummaryConverter
from roborock.devices.traits.v1.device_features import DeviceTraitsConverter
from roborock.devices.traits.v1.maps import MultiMapsListConverter
from roborock.devices.traits.v1.rooms import RoomsConverter
from roborock.exceptions import RoborockException, RoborockUnsupportedFeature
from roborock.map.map_parser import MapParser, MapParserConfig
from roborock.mqtt.roborock_session import create_lazy_mqtt_session
from roborock.protocol import create_mqtt_params
from roborock.web_api import RoborockApiClient


DOCKED = {State.charging, State.charging_complete}
CLEANING = {
    State.starting, State.cleaning, State.spot_cleaning, State.zoned_cleaning, State.segment_cleaning,
    State.robot_status_mopping, State.clean_mop_cleaning, State.clean_mop_mopping, State.segment_mopping,
    State.segment_clean_mop_cleaning, State.segment_clean_mop_mopping, State.zoned_mopping,
    State.zoned_clean_mop_cleaning, State.zoned_clean_mop_mopping,
}
RETURNING = {State.returning_home, State.docking, State.going_to_wash_the_mop, State.back_to_dock_washing_duster}
STARTABLE = DOCKED | {State.idle, State.charger_disconnected}
RESUME = {2: Command.RESUME_ZONED_CLEAN, 3: Command.RESUME_SEGMENT_CLEAN, 4: Command.APP_RESUME_BUILD_MAP}
AUTOMATIC_MODES = {CleaningMode.SMART_MODE, CleaningMode.CUSTOM}


class VacuumBusy(RoborockException):
    pass


class InvalidRooms(RoborockException):
    pass


def unpack(result):
    if isinstance(result, list) and len(result) == 1:
        result = result[0]
    if not isinstance(result, dict):
        raise RoborockException("Invalid response structure")
    return result


def actions(status):
    phase = status.state
    return {
        "start": phase in STARTABLE and not status.in_cleaning and not status.in_returning,
        "pause": phase in CLEANING | RETURNING,
        "resume": phase == State.paused and bool(status.in_cleaning or status.in_returning),
        "dock": phase in (CLEANING | STARTABLE | {State.paused, State.error}) - DOCKED,
    }


def status_payload(status):
    state = status.state
    if state in CLEANING:
        state = State.cleaning
    if state in RETURNING:
        state = State.returning_home
    if state == State.charging and status.battery == 100:
        state = State.charging_complete
    return {
        "state": state.name,
        "battery": status.battery,
        "area": status.square_meter_clean_area,
        "duration": status.clean_time,
        "progress": status.clean_percent,
        "error": int(status.error_code or 0),
        "dockError": int(status.dock_error_status or 0),
        "drying": bool(status.dry_status == 1),
        "mapId": status.current_map,
        "actions": actions(status),
    }


def cleaning_options(features):
    modes = [mode.value for mode in get_cleaning_mode_options(features)]
    if features.is_clean_then_mop_mode_supported and CleaningMode.VAC_AND_MOP in modes:
        modes.append("vac_then_mop")
    levels = {
        "fan": get_clean_modes(features),
        "water": get_water_modes(features),
        "route": get_clean_routes(features, "eu"),
    }
    automatic = {"custom", "smart_mode", "off", "off_raise_main_brush", "gentle"}
    return {"modes": modes, "cleaningOptions": {
        key: {option.value: option.code for option in options if option.value not in automatic}
        for key, options in levels.items()
    }}


def cleaning_parameters(mode, settings, features):
    profile = cleaning_options(features)
    if mode not in profile["modes"]:
        raise RoborockUnsupportedFeature("Unsupported cleaning mode")
    cleaning_mode = CleaningMode.VAC_AND_MOP if mode == "vac_then_mop" else CleaningMode(mode)
    params = get_cleaning_mode_parameters(cleaning_mode, features)[0]
    if not settings:
        return params

    allowed = {"fan", "water", "route", "waterLevel"}
    if cleaning_mode == CleaningMode.VACUUM:
        allowed = {"fan"}
    elif cleaning_mode == CleaningMode.MOP:
        allowed.remove("fan")
    if cleaning_mode in AUTOMATIC_MODES or settings.keys() - allowed:
        raise RoborockUnsupportedFeature("Unsupported cleaning settings for this mode")

    for key, field in (("fan", "fan_power"), ("water", "water_box_mode"), ("route", "mop_mode")):
        if key in settings:
            value = settings[key]
            if value not in profile["cleaningOptions"][key].values():
                raise RoborockUnsupportedFeature("Unsupported cleaning setting")
            params[field] = value
    if params["water_box_mode"] == WaterModes.CUSTOM.code:
        level = settings.get("waterLevel")
        if type(level) is not int or not 1 <= level <= 30:
            raise RoborockUnsupportedFeature("Unsupported water level")
        params["distance_off"] = 210 - 5 * level
    elif "waterLevel" in settings:
        raise RoborockUnsupportedFeature("Custom water flow is required")
    return params


class Vacuum:
    def __init__(self, channel, product, room_names):
        self.rpc = channel.mqtt_rpc_channel
        self.map_rpc = channel.map_rpc_channel
        self.room_names = room_names
        self.feature_converter = DeviceTraitsConverter(product)
        self.features = None
        self.map_parser = MapParser(MapParserConfig(show_background=False))

    async def status(self):
        result = await self.rpc.send_command(Command.GET_STATUS)
        status = StatusV2.from_dict(unpack(result))
        if status.state is None:
            raise RoborockException("Missing vacuum status")
        return status

    async def capabilities(self):
        if self.features is None:
            self.features = self.feature_converter.convert(await self.rpc.send_command(Command.APP_GET_INIT_STATUS))
        return self.features

    async def cleaning_profile(self):
        return cleaning_options(await self.capabilities())

    async def rooms(self):
        result = await self.rpc.send_command(Command.GET_ROOM_MAPPING)
        ids = RoomsConverter.extract_segment_map(result)
        return [{"id": int(segment), "name": self.room_names.get(room)} for segment, room in ids.items()]

    async def maps(self):
        result = await self.rpc.send_command(Command.GET_MULTI_MAPS_LIST)
        return len(MultiMapsListConverter().convert(result).map_info or [])

    async def map_image(self):
        result = await self.map_rpc.send_command(Command.GET_MAP_V1)
        if not isinstance(result, bytes):
            raise RoborockException("Map unavailable")
        image = await asyncio.to_thread(self.map_parser.parse, result)
        return base64.b64encode(image.image_content).decode("ascii") if image and image.image_content else None

    async def history(self):
        result = await self.rpc.send_command(Command.GET_CLEAN_SUMMARY)
        stats = CleanSummaryConverter().convert(result)
        latest = None
        if stats.records:
            try:
                record = CleanRecordConverter().convert(
                    await self.rpc.send_command(Command.GET_CLEAN_RECORD, params=[stats.records[0]])
                )
                latest = {
                    "startedAt": record.begin * 1000 if record.begin else None,
                    "area": record.square_meter_area,
                    "duration": record.duration,
                    "complete": bool(record.complete) if record.complete is not None else None,
                }
            except (RoborockException, ValueError, TypeError):
                pass
        return {"total": stats.clean_count, "area": stats.square_meter_clean_area,
                "duration": stats.clean_time, "latest": latest}

    async def maintenance(self):
        result = await self.rpc.send_command(Command.GET_CONSUMABLE)
        supplies = Consumable.from_dict(unpack(result))
        return {name: max(0, round(seconds / 3600)) for name, seconds in {
            "mainBrush": supplies.main_brush_time_left,
            "sideBrush": supplies.side_brush_time_left,
            "filter": supplies.filter_time_left,
            "sensors": supplies.sensor_time_left,
        }.items() if seconds is not None}

    async def scope(self):
        status, rooms, profile = await asyncio.gather(self.status(), self.rooms(), self.cleaning_profile())
        return {"mapId": status.current_map, "rooms": rooms, **profile}

    async def details(self):
        async def optional(run):
            try:
                return await run
            except (RoborockException, ValueError, TypeError, TimeoutError, OSError):
                return None

        status, rooms, maps, image, history, maintenance, profile = await asyncio.gather(
            optional(self.status()),
            optional(self.rooms()), optional(self.maps()), optional(self.map_image()),
            optional(self.history()), optional(self.maintenance()), optional(self.cleaning_profile()),
        )
        if all(data is None for data in (rooms, maps, image, history, maintenance, profile)):
            raise RoborockException("Vacuum details unavailable")
        return {"rooms": rooms, "maps": maps, "image": image, "mapId": status.current_map if status else None,
                "history": history, "maintenance": maintenance, **(profile or {})}

    async def control(self, request):
        action = request["action"]
        status = await self.status()
        if not actions(status).get(action):
            raise VacuumBusy()
        if action == "pause":
            await self.rpc.send_command(Command.APP_PAUSE)
        elif action == "dock":
            await self.rpc.send_command(Command.APP_CHARGE)
        elif action == "resume":
            command = Command.APP_CHARGE if status.in_returning else RESUME.get(status.in_cleaning, Command.APP_START)
            await self.rpc.send_command(command)
        elif action == "start":
            await self.start(request, status)

    async def start(self, request, status):
        mode = request["mode"]
        segments = request["segments"]
        if segments:
            if request["mapId"] != status.current_map:
                raise InvalidRooms()
            available = {room["id"] for room in await self.rooms()}
            if not available.issuperset(segments):
                raise InvalidRooms()
        sequential = mode == "vac_then_mop"
        features = await self.capabilities()
        params = cleaning_parameters(mode, request.get("settings"), features)
        if sequential:
            await self.rpc.send_command("app_set_clean_sequence_type", params={**params, "type": 1, "repeat": 1})
        else:
            if features.is_clean_then_mop_mode_supported:
                try:
                    await self.rpc.send_command("app_set_clean_sequence_type", params={**params, "type": 0})
                except RoborockUnsupportedFeature:
                    pass
            await self.rpc.send_command(Command.SET_CLEAN_MOTOR_MODE, params=[params])
        if segments:
            region = {"segments": segments, "repeat": 1}
            if sequential:
                region.update({"clean_mop": 0, "clean_order_mode": 0})
            await self.rpc.send_command(Command.APP_SEGMENT_CLEAN, params=[region])
        else:
            await self.rpc.send_command(Command.APP_START, params={"clean_mop": 1} if sequential else None)


def reply(payload):
    print(json.dumps(payload, allow_nan=False), flush=True)


async def main():
    model = os.environ.get("ROBOROCK_MODEL", "").strip()
    if not model:
        raise RoborockException("ROBOROCK_MODEL is required")
    auth = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    user = UserData.from_dict(auth["user_data"])
    async with ClientSession(timeout=ClientTimeout(total=10)) as http:
        cloud = RoborockApiClient(auth["email"], session=http)
        home = await cloud.get_home_data_v3(user)
        devices = [(device, product) for device, product in home.device_products.values()
                   if product.model == model and device.pv == "1.0"]
        if len(devices) != 1:
            raise RoborockException("Expected exactly one matching Roborock with protocol v1")
        device, product = devices[0]
        room_names = {room.iot_id: room.name for room in home.rooms}
        try:
            room_names.update({room.iot_id: room.name for room in await cloud.get_rooms(user)})
        except (RoborockException, ClientError, TimeoutError, OSError):
            pass

    params = create_mqtt_params(user.rriot)
    mqtt = await create_lazy_mqtt_session(params)
    try:
        channel = create_v1_channel(user, params, mqtt, device, DeviceCache(device.duid, NoCache()))
        vacuum = Vacuum(channel, product, room_names)
        while line := await asyncio.to_thread(sys.stdin.readline):
            try:
                request = json.loads(line)
                operation = request["operation"]
                if operation == "status":
                    data = status_payload(await vacuum.status())
                elif operation == "scope":
                    data = await vacuum.scope()
                elif operation == "details":
                    data = await vacuum.details()
                elif operation == "control":
                    await vacuum.control(request)
                    data = None
                else:
                    raise ValueError("Unknown operation")
                reply({"ok": True, "data": data})
            except Exception as error:
                reply({"ok": False, "code": type(error).__name__})
    finally:
        await mqtt.close()


if __name__ == "__main__":
    logging.disable(logging.CRITICAL)
    try:
        asyncio.run(main())
    except Exception as error:
        reply({"ok": False, "code": type(error).__name__, "fatal": True})

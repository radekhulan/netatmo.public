import asyncio
import json
import secrets
import sys
import threading
import time
from pathlib import Path


MODES = {0: "auto", 17: "sleep", 18: "turbo", 19: "medium"}
HUMIDITY_TARGETS = (40, 50, 60, 70)


def command_payload(humidity_supported, action, value):
    if action == "power" and type(value) is bool:
        return {"D03102": int(value)}
    if action == "mode" and value in MODES.values():
        code = next(code for code, mode in MODES.items() if mode == value)
        desired = {"D03102": 1, "D0310C": code}
        if humidity_supported:
            desired["D0310D"] = {0: 3, 17: 1, 18: 18, 19: 3}[code]
        return desired
    if action == "humidity" and humidity_supported and type(value) is int and value in HUMIDITY_TARGETS:
        return {"D03128": value}
    raise ValueError("Unsupported purifier command")


def shadow(connection, desired=None):
    import paho.mqtt.client as mqtt

    prefix = f"$aws/things/{connection.device_id}/shadow"
    action = "get"
    token = ""
    ready = threading.Event()
    done = threading.Event()
    result = None
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=connection.client_id, transport="websockets")
    client.tls_set()
    client.ws_set_options(path=connection.path)
    client.connect_timeout = 5

    def connected(client, _, flags, reason, properties):
        if reason.is_failure:
            ready.set()
        else:
            actions = ("get", "update") if desired else ("get",)
            client.subscribe([(f"{prefix}/{operation}/{status}", 0) for operation in actions for status in ("accepted", "rejected")])

    def subscribed(client, _, mid, reasons, properties):
        nonlocal result
        result = not any(reason.is_failure for reason in reasons)
        ready.set()

    def received(_, userdata, message):
        nonlocal result
        try:
            data = json.loads(message.payload)
            if data.get("clientToken") != token:
                return
        except (ValueError, AttributeError):
            return
        if message.topic == f"{prefix}/{action}/accepted":
            result = data
        elif message.topic != f"{prefix}/{action}/rejected":
            return
        done.set()

    def request(operation, values=None, timeout=4):
        nonlocal action, result, token
        action, result, token = operation, None, secrets.token_hex(12)
        done.clear()
        body = {"clientToken": token}
        if values:
            body["state"] = {"desired": values}
        if client.publish(f"{prefix}/{operation}", json.dumps(body), qos=1).rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError("Air+ publish failed")
        if not done.wait(timeout) or result is None:
            raise RuntimeError("Air+ did not accept the request")
        return result.get("state", {}).get("reported", {})

    client.on_connect = connected
    client.on_subscribe = subscribed
    client.on_message = received
    try:
        client.connect(connection.host, 443, keepalive=15)
        client.loop_start()
        if not ready.wait(5) or result is not True:
            raise RuntimeError("Air+ subscription failed")
        if not desired:
            return request("get")
        request("update", desired)
        for attempt in range(4):
            if attempt:
                time.sleep(0.65)
            reported = request("get", timeout=2)
            if all(str(reported.get(key)) == str(value) for key, value in desired.items() if key != "D0310D"):
                return reported
        raise RuntimeError("Purifier did not confirm the change")
    finally:
        client.disconnect()
        client.loop_stop()


def measurements(reported, humidity_supported):
    def number(key, maximum):
        value = reported.get(key)
        if isinstance(value, str) and value.isascii() and value.isdecimal() and len(value) <= 9:
            value = int(value)
        return value if type(value) is int and 0 <= value <= maximum else None

    nominal = number("D05408", 100000)
    remaining = number("D0540E", 100000)
    power = number("D03102", 1)
    result = {
        "pm25": number("D03221", 1000),
        "allergens": number("D03120", 12),
        "filter": round(100 * remaining / nominal) if nominal and remaining is not None and remaining <= nominal else None,
        "on": None if power is None else bool(power),
        "mode": MODES.get(number("D0310C", 255)),
    }
    if humidity_supported:
        result.update(humidity=number("D03125", 100), humidityTarget=number("D03128", 100))
        error_code = reported.get("D03240")
        if str(error_code) in ("-16128", "49408", "0"):
            result["waterEmpty"] = str(error_code) != "0"
    return result


async def main(path, profiles, command=None):
    sys.path.insert(0, str(path.parent))
    from aiohttp import ClientSession
    from airmatters import AirCloudClient

    auth = json.loads(path.read_text(encoding="utf-8"))
    async with ClientSession() as session:
        cloud = AirCloudClient(session, auth["uid"], auth["signing_key"])
        records = await cloud.devices()
        if command is not None:
            model = command["model"]
            profile = profiles[model]
            humidity_supported = profile["humidity"]
            desired = command_payload(humidity_supported, command["action"], command["value"])
            matches = [record for record in records if record["device_info"].get("modelid") == model]
            if len(matches) != 1:
                raise RuntimeError("Purifier is not uniquely identified")
            connection = await cloud.connection(matches[0]["device_id"])
            reported = await asyncio.to_thread(shadow, connection, desired)
            reading = {"room": profile["room"], "model": model, "humiditySupported": humidity_supported,
                       "available": True, **measurements(reported, humidity_supported)}
            print(json.dumps(reading, ensure_ascii=False, allow_nan=False))
            return

        async def read(record):
            model = record["device_info"]["modelid"]
            profile = profiles[model]
            humidity_supported = profile["humidity"]
            reading = {"room": profile["room"], "model": model, "humiditySupported": humidity_supported,
                       "available": False}
            try:
                reported = await asyncio.to_thread(shadow, await cloud.connection(record["device_id"]))
            except Exception:
                return reading
            if reported:
                reading.update(measurements(reported, humidity_supported), available=True)
            return reading

        devices = [record for record in records if record["device_info"].get("modelid") in profiles]
        readings = await asyncio.gather(*(read(record) for record in devices))
        if readings and not any(reading["available"] for reading in readings):
            raise RuntimeError("Air+ did not return measurements")
        print(json.dumps(readings, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    try:
        command = json.loads(sys.argv[3]) if len(sys.argv) > 3 else None
        asyncio.run(main(Path(sys.argv[1]), json.loads(sys.argv[2]), command))
    except Exception as error:
        raise SystemExit(f"Philips Air+ ({type(error).__name__})") from None

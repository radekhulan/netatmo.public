import base64
import fcntl
import hashlib
import json
import os
import secrets
import sys
import time
from getpass import getpass
from http.client import HTTPSConnection, HTTPException
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlencode


FIELDS = (
    "machMode", "prPhase", "remainingTimeMM", "doorStatus", "doorLockStatus", "errors",
    "temp", "spinSpeed", "currentWaterUsed", "totalWaterUsed", "totalWashCycle",
)
STATE = Path(os.environ.get("STATE_DIR") or Path(__file__).resolve().parents[1] / ".state")


class HonHttpError(RuntimeError):
    def __init__(self, status):
        super().__init__(f"hOn vrátil HTTP {status}.")
        self.status = status


def request(connection, method, path, *, headers=None, data=None):
    connection.request(method, path, body=None if data is None else json.dumps(data), headers={
        "Accept": "application/json",
        "Content-Type": "application/json",
        **(headers or {}),
    })
    with connection.getresponse() as response:
        if response.status != 200:
            raise HonHttpError(response.status)
        return json.load(response)


def exchange_token(connection, session):
    tokens = request(connection, "POST", "/ciam/token", data={
        "session_id": session["sessionId"],
        "code_verifier": session["verifier"],
    })["tokens"]
    return {
        **session,
        "headers": {"cognito-token": tokens["cognito_token"], "id-token": tokens["id_token"]},
        "renewAt": int(time.time()) + 600,
    }


def sign_in(connection, email, password):
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    query = urlencode({"username": email, "password": password, "code_challenge": challenge})
    authorization = request(connection, "GET", "/ciam/authorize?" + query)
    session_id = authorization.get("session_id")
    if not session_id:
        raise RuntimeError("hOn nepovolil přihlášení. Ověř e-mail a heslo v mobilní aplikaci.")
    return exchange_token(connection, {"sessionId": session_id, "verifier": verifier})


def find_washer(connection, headers):
    model = os.environ.get("HAIER_MODEL", "").strip().upper().removesuffix("-S")
    product_code = os.environ.get("HAIER_PRODUCT_CODE", "").strip()
    if not model and not product_code:
        raise RuntimeError("Pro připojení pračky nastav HAIER_MODEL nebo HAIER_PRODUCT_CODE.")
    inventory = request(connection, "POST", "/unified-api/v1/view/appliance-list",
                        headers=headers, data={"deviceId": "homeassistant"})
    appliances = inventory["modules"]["applianceList"]["payload"]["appliances"]
    matches = [appliance for appliance in appliances if (
        (product_code and str(appliance.get("code")) == product_code)
        or (model and str(appliance.get("modelName")).strip().upper().removesuffix("-S") == model)
    ) and appliance.get("macAddress") and appliance.get("applianceTypeName")]
    if len(matches) != 1:
        raise RuntimeError(f"hOn našel {len(matches)} odpovídajících spárovaných praček. Pro ověření potřebuji jednu.")
    return {key: matches[0][key] for key in ("macAddress", "applianceTypeName")}


def read_washer(connection, session):
    washer = session["washer"]
    headers = session["headers"]
    query = urlencode({"macAddress": washer["macAddress"], "applianceType": washer["applianceTypeName"], "category": "CYCLE"})
    context = request(connection, "GET", "/commands/v1/context?" + query, headers=headers)["payload"]
    parameters = (context.get("shadow") or {}).get("parameters") or {}
    activity = (context.get("activity") or {}).get("attributes") or {}
    program = activity.get("programName") or context.get("programName") or (parameters.get("prStr") or {}).get("parNewVal")
    result = {"model": "Haier"}
    if isinstance(program, str) and program.strip() not in ("", "0"):
        result["programName"] = program.strip()[:120]
    category = (context.get("lastConnEvent") or {}).get("category")
    if category in ("CONNECTED", "DISCONNECTED"):
        result["connected"] = category == "CONNECTED"
    for field in FIELDS:
        value = (parameters.get(field) or {}).get("parNewVal")
        if isinstance(value, (str, int, float, bool)):
            result[field] = value
    return result


def save_session(path, session):
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temporary = Path(file.name)
        try:
            json.dump(session, file)
            file.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def panel_status(connection, path):
    session = json.loads(path.read_text(encoding="utf-8"))
    try:
        if session["renewAt"] > time.time():
            return {"data": read_washer(connection, session)}
    except HonHttpError as error:
        if error.status not in (401, 403):
            raise

    try:
        session = exchange_token(connection, session)
        save_session(path, session)
        return {"data": read_washer(connection, session)}
    except HonHttpError as error:
        if error.status not in (401, 403):
            raise

    login = session.get("login")
    if not login:
        return {"reauth": True}
    now = int(time.time())
    if now < session.get("retryLoginAt", 0):
        raise RuntimeError("hOn dočasně nepovolil obnovení relace.")
    session["retryLoginAt"] = now + 1800
    save_session(path, session)
    try:
        renewed = sign_in(connection, login["email"], login["password"])
        renewed.update(washer=session["washer"], login=login, retryLoginAt=session["retryLoginAt"])
        result = read_washer(connection, renewed)
    except HonHttpError as error:
        if error.status not in (401, 403):
            raise
        return {"reauth": True}
    save_session(path, renewed)
    return {"data": result}


def interactive(connection, path, connect, remember):
    if not sys.stdin.isatty():
        raise SystemExit("Spusť ověření v interaktivním terminálu na serveru panelu.")
    email = input("E-mail účtu hOn: ").strip()
    password = getpass("Heslo účtu hOn: ")
    if not email or not password:
        raise SystemExit("Zadej e-mail a heslo účtu z aplikace hOn.")
    session = sign_in(connection, email, password)
    session["washer"] = find_washer(connection, session["headers"])
    result = read_washer(connection, session)
    if connect:
        if remember:
            session["login"] = {"email": email, "password": password}
        STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
        with (STATE / "hon.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            save_session(path, session)
        print("Relace hOn byla uložena pro Domácí panel.")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if len(result) == 1:
        print("Pračka je v účtu, ale hOn teď nevrátil žádný z ověřovaných provozních údajů.")


def main():
    options = sys.argv[1:]
    if options not in ([], ["--connect"], ["--connect", "--remember"], ["--status"]):
        raise SystemExit("Použití: hon_probe.py [--connect [--remember]|--status]")
    path = STATE / "hon.json"
    connection = HTTPSConnection("api-iot.he.services", timeout=6)
    try:
        if options == ["--status"]:
            with (STATE / "hon.lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                print(json.dumps(panel_status(connection, path), ensure_ascii=False))
        else:
            interactive(connection, path, "--connect" in options, "--remember" in options)
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
    except (HTTPException, OSError, KeyError, ValueError, TypeError, AttributeError) as error:
        raise SystemExit(f"Ověření hOn nedoběhlo ({type(error).__name__}).") from None
    finally:
        connection.close()


if __name__ == "__main__":
    main()

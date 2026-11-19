import asyncio
import json
import os
from getpass import getpass
from pathlib import Path
from tempfile import NamedTemporaryFile

from aiohttp import ClientError, ClientSession, ClientTimeout
from roborock.exceptions import RoborockException
from roborock.web_api import RoborockApiClient


async def main():
    model = os.environ.get("ROBOROCK_MODEL", "").strip()
    if not model:
        raise SystemExit("Nastav ROBOROCK_MODEL na kód kompatibilního vysavače.")
    state = Path(os.environ.get("STATE_DIR") or Path(__file__).resolve().parents[1] / ".state")
    email = input("E-mail účtu Roborock: ").strip()
    if not email:
        raise SystemExit("Zadej e-mail účtu z aplikace Roborock.")

    async with ClientSession(timeout=ClientTimeout(total=20)) as session:
        cloud = RoborockApiClient(email, session=session)
        await cloud.request_code_v4()
        code = getpass("Ověřovací kód z e-mailu: ").strip()
        user_data = await cloud.code_login_v4(code)
        home = await cloud.get_home_data_v3(user_data)

    devices = [
        device for device, product in home.device_products.values()
        if product.model == model and device.pv == "1.0"
    ]
    if len(devices) != 1:
        raise SystemExit("V účtu musí být právě jeden odpovídající vysavač Roborock s protokolem v1.")

    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=state, delete=False) as file:
        temporary = Path(file.name)
        try:
            json.dump({"email": email, "user_data": user_data.as_dict()}, file)
            file.close()
            temporary.replace(state / "roborock.json")
        finally:
            temporary.unlink(missing_ok=True)
    print("Přihlášení k vysavači Roborock bylo uloženo pro panel.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (RoborockException, ClientError, TimeoutError) as error:
        raise SystemExit(f"Připojení k Roborocku se nezdařilo ({type(error).__name__}).") from None

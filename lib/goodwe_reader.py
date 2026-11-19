import asyncio
import json
import math
import sys

import goodwe


def number(value):
    return value if isinstance(value, (int, float)) and math.isfinite(value) and value >= 0 else None


async def main():
    inverter = await goodwe.connect(sys.argv[1], port=int(sys.argv[2]), timeout=2, retries=1)
    data = await inverter.read_runtime_data()
    print(json.dumps({
        "power": number(data.get("ppv")),
        "day": number(data.get("e_day")),
        "total": number(data.get("e_total")),
    }))


asyncio.run(main())

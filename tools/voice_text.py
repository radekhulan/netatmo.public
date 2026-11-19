import re


SMALL_NUMBERS = (
    "nula", "jeden", "dva", "tři", "čtyři", "pět", "šest", "sedm", "osm", "devět",
    "deset", "jedenáct", "dvanáct", "třináct", "čtrnáct", "patnáct", "šestnáct",
    "sedmnáct", "osmnáct", "devatenáct",
)
TENS = ("", "", "dvacet", "třicet", "čtyřicet", "padesát", "šedesát", "sedmdesát", "osmdesát", "devadesát")
HUNDREDS = ("", "sto", "dvě stě", "tři sta", "čtyři sta", "pět set", "šest set", "sedm set", "osm set", "devět set")
FRACTIONS = (
    ("desetina", "desetiny", "desetin"),
    ("setina", "setiny", "setin"),
    ("tisícina", "tisíciny", "tisícin"),
)
TEMPERATURE = re.compile(
    r"(?<![\w.,])(?P<sign>[+−-]?)(?P<whole>[0-9]{1,3})(?:[,.](?P<fraction>[0-9]{1,3}))?[^\S\r\n]*"
    r"(?:°[^\S\r\n]*(?P<symbol>[CF])|(?:stupeň|stupně|stupňů)(?:[^\S\r\n]+(?P<scale>Celsia|Fahrenheita))?)\b",
    re.IGNORECASE,
)
WEATHER_QUANTITY = re.compile(
    r"(?<![\w.,])(?P<sign>[+−-]?)(?P<whole>[0-9]{1,4})(?:[,.](?P<fraction>[0-9]{1,3}))?[^\S\r\n]*"
    r"(?P<unit>mm|km[^\S\r\n]*/[^\S\r\n]*h|m[^\S\r\n]*/[^\S\r\n]*s)\b",
    re.IGNORECASE,
)
WEATHER_UNITS = {
    "mm": (("milimetr", "milimetry", "milimetrů"), "milimetru", ""),
    "km/h": (("kilometr", "kilometry", "kilometrů"), "kilometru", " za hodinu"),
    "m/s": (("metr", "metry", "metrů"), "metru", " za sekundu"),
}
CZECH_DECIMAL = re.compile(
    r"(?<![\w.,])(?P<sign>[+−-]?)(?P<whole>[0-9]{1,3}[ \u00a0\u202f][0-9]{3}|[0-9]{1,6}),"
    r"(?P<fraction>[0-9]{1,3})(?!\w|[.,][0-9])"
)
SIGN = {"+": "plus ", "-": "minus ", "−": "minus "}
THAI_DIGITS = ("ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า")
THAI_PLACES = ("", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน")
THAI_NUMBER = re.compile(r"(?<![0-9.,])([+−-]?)([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.([0-9]+))?(?![0-9])")
THAI_TO_ASCII = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")


def cardinal(value, feminine=False):
    if value >= 1000:
        thousands, rest = divmod(value, 1000)
        prefix = "tisíc" if thousands == 1 else cardinal(thousands) + " " + quantity_form(
            thousands, ("tisíc", "tisíce", "tisíc")
        )
        return prefix + (" " + cardinal(rest, feminine) if rest else "")
    if feminine and value in (1, 2):
        return ("jedna", "dvě")[value - 1]
    if value < 20:
        return SMALL_NUMBERS[value]
    if value < 100:
        tens, units = divmod(value, 10)
        return TENS[tens] + (" " + cardinal(units, feminine) if units else "")
    hundreds, remainder = divmod(value, 100)
    return HUNDREDS[hundreds] + (" " + cardinal(remainder, feminine) if remainder else "")


def quantity_form(count, forms):
    return forms[0 if count == 1 else 1 if 2 <= count <= 4 else 2]


def decimal_words(whole, fraction):
    count = int(fraction)
    entire = quantity_form(whole or 1, ("celá", "celé", "celých"))
    part = quantity_form(count, FRACTIONS[len(fraction) - 1])
    return f"{cardinal(whole, feminine=True)} {entire} {cardinal(count, feminine=True)} {part}"


def say_czech_decimal(match):
    whole = int("".join(match["whole"].split()))
    fraction = match["fraction"].rstrip("0")
    return SIGN.get(match["sign"], "") + (decimal_words(whole, fraction) if fraction else cardinal(whole))


def say_temperature(match):
    whole = int(match["whole"])
    fraction = (match["fraction"] or "").rstrip("0")
    sign = SIGN.get(match["sign"], "")
    scale = (match["symbol"] or match["scale"] or "").lower()
    unit = {"c": " Celsia", "celsia": " Celsia", "f": " Fahrenheita", "fahrenheita": " Fahrenheita"}.get(scale, "")
    if not fraction:
        number = cardinal(whole) + " " + quantity_form(whole, ("stupeň", "stupně", "stupňů"))
    elif fraction == "5":
        number = (cardinal(whole) + " a " if whole else "") + "půl stupně"
    else:
        number = decimal_words(whole, fraction) + " stupně"
    return sign + number + unit


def say_weather_quantity(match):
    whole = int(match["whole"])
    fraction = (match["fraction"] or "").rstrip("0")
    forms, fractional_unit, suffix = WEATHER_UNITS["".join(match["unit"].lower().split())]
    if fraction == "5":
        number = (cardinal(whole) + " a " if whole else "") + "půl"
    else:
        number = decimal_words(whole, fraction) if fraction else cardinal(whole)
    unit = fractional_unit if fraction else quantity_form(whole, forms)
    return SIGN.get(match["sign"], "") + number + " " + unit + suffix


def thai_cardinal(value):
    if value >= 1_000_000:
        millions, rest = divmod(value, 1_000_000)
        return thai_cardinal(millions) + "ล้าน" + (thai_cardinal(rest) if rest else "")
    if value == 0:
        return THAI_DIGITS[0]
    digits = str(value)
    chunks = []
    for position, digit in zip(range(len(digits) - 1, -1, -1), map(int, digits)):
        if not digit:
            continue
        if position == 1 and digit in (1, 2):
            lead = "" if digit == 1 else "ยี่"
        elif position == 0 and digit == 1 and value >= 10:
            lead = "เอ็ด"
        else:
            lead = THAI_DIGITS[digit]
        chunks.append(lead + THAI_PLACES[position])
    return "".join(chunks)


def say_thai_number(match):
    sign, whole, fraction = match.groups()
    prefix = {"+": "บวก", "-": "ลบ", "−": "ลบ"}.get(sign, "")
    return prefix + thai_cardinal(int(whole.replace(",", ""))) + (
        "จุด" + "".join(THAI_DIGITS[int(digit)] for digit in fraction) if fraction else ""
    )


def prepare_voice_text(text, language="cs"):
    if language == "cs":
        text = TEMPERATURE.sub(say_temperature, text)
        text = WEATHER_QUANTITY.sub(say_weather_quantity, text)
        return CZECH_DECIMAL.sub(say_czech_decimal, text)
    if language == "th":
        return THAI_NUMBER.sub(say_thai_number, text.translate(THAI_TO_ASCII))
    return text


def prepare_piper_text(text, language):
    spoken = prepare_voice_text(text, language)
    if language == "cs":
        return re.sub(r"\bdvacet\b", "[[dvˈatsɛt]]", spoken, flags=re.IGNORECASE)
    return spoken

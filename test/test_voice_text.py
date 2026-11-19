import unittest

from tools.voice_text import prepare_piper_text, prepare_voice_text


class VoiceTextTest(unittest.TestCase):
    def test_temperature_in_panel_reply(self):
        self.assertEqual(
            prepare_voice_text("V obýváku je 20,9 stupňů."),
            "V obýváku je dvacet celých devět desetin stupně.",
        )

    def test_half_degree_and_sign(self):
        self.assertEqual(
            prepare_voice_text("Venku je −2,5 °C a doma 21,5 °C."),
            "Venku je minus dva a půl stupně Celsia a doma dvacet jeden a půl stupně Celsia.",
        )

    def test_integer_forms_and_fahrenheit(self):
        self.assertEqual(
            prepare_voice_text("1 stupeň, 2 stupně, 5 stupňů a 72 °F."),
            "jeden stupeň, dva stupně, pět stupňů a sedmdesát dva stupňů Fahrenheita.",
        )

    def test_fraction_with_leading_zeroes(self):
        self.assertEqual(
            prepare_voice_text("1.05 °C a 0,002 °C."),
            "jedna celá pět setin stupně Celsia a nula celá dvě tisíciny stupně Celsia.",
        )

    def test_unrelated_values_are_preserved(self):
        text = "Dne 19.11.2026 do 18:30. Pořadí 1,2,3."
        self.assertEqual(prepare_voice_text(text), text)

    def test_czech_decimals_outside_temperatures(self):
        self.assertEqual(
            prepare_voice_text("Uklidil 4,6 m² a spotřeboval 1,25 kWh."),
            "Uklidil čtyři celé šest desetin m² a spotřeboval jedna celá dvacet pět setin kWh.",
        )
        self.assertEqual(prepare_voice_text("−1\u00a0234,06"), "minus tisíc dvě stě třicet čtyři celých šest setin")
        self.assertEqual(prepare_voice_text("4,6."), "čtyři celé šest desetin.")

    def test_weather_units_are_spoken_in_czech(self):
        self.assertEqual(
            prepare_voice_text("Asi 5 mm srážek a nárazy větru až 45 km/h."),
            "Asi pět milimetrů srážek a nárazy větru až čtyřicet pět kilometrů za hodinu.",
        )
        self.assertEqual(
            prepare_voice_text("1 mm, 2 mm, 0,5 mm a vítr 3 m/s."),
            "jeden milimetr, dva milimetry, půl milimetru a vítr tři metry za sekundu.",
        )
        self.assertEqual(prepare_voice_text("5 mm at 45 km/h.", "en"), "5 mm at 45 km/h.")

    def test_language_selects_speech_normalization(self):
        self.assertEqual(prepare_voice_text("20.9 degrees Celsius.", "en"), "20.9 degrees Celsius.")
        self.assertEqual(prepare_voice_text("อุณหภูมิ 20.9 องศา", "th"), "อุณหภูมิ ยี่สิบจุดเก้า องศา")
        self.assertEqual(prepare_voice_text("๒๑,๕๐๐", "th"), "สองหมื่นหนึ่งพันห้าร้อย")

    def test_piper_uses_the_czech_e_in_dvacet(self):
        self.assertEqual(prepare_piper_text("20,9 °C.", "cs"), "[[dvˈatsɛt]] celých devět desetin stupně Celsia.")
        self.assertEqual(prepare_piper_text("Two people.", "en"), "Two people.")

# Netatmo domácí panel

PWA pro tablet, která spojuje údaje o domácnosti a její ovládání. Na jednom místě ukazuje teplotu, kvalitu vzduchu, předpověď a výrobu fotovoltaiky. Jarvis po oslovení „Hey Jarvis“ přijímá hlasové dotazy a povely, ukazuje jejich průběh na obrazovce a odpovídá hlasem.

**Projekt je pouze inspirace pro vlastní domácí panel a automatizaci.** Integrace a jejich možnosti závisejí na vašich zařízeních, účtech a nastavení.

- Autor projektu [Radek Hulán](https://radekhulan.cz/)
- Vývoj aplikací na míru [MyWebdesign.cz](https://mywebdesign.cz/)
- Automatizace [MyBoard.cz](https://myboard.cz/)

## Spuštění ukázky

Stačí Node.js 22.9 nebo novější. Ukázka běží bez účtů a připojených zařízení.

```sh
npm start
```

Otevřete [panel na localhostu](http://localhost:8765/). Panel zobrazí ukázkové místnosti a údaje. Hlasové funkce a živé zdroje se zapínají samostatně.

## Vlastní instalace

```sh
cp .env.example .env
cp panel.example.json panel.json
chmod 600 .env panel.json
npm start
```

V `.env` nastavte připojení. V `panel.json` popište své místnosti a přiřazení zařízení. Oba soubory a adresář `.state/` patří do místní instalace. `CONFIG_FILE` a `STATE_DIR` umožňují zvolit jejich vlastní umístění. Pomocí `npm run devices` lze vypsat identifikátory podporovaných integrací. Výpis používejte ve své soukromé konfiguraci.

Výchozí server naslouchá na loopbacku. Pro tablet použijte HTTPS reverzní proxy v důvěryhodné síti. Soubory v `deploy/` jsou šablony pro nginx a systemd. Upravte doménu, certifikát, přístupovou síť, uživatele a cesty pro své prostředí. Do `PANEL_ORIGINS` přidejte skutečný HTTPS origin panelu. V Chrome na tabletu lze panel nainstalovat jako PWA.

### Integrace

| Integrace | Funkce a nastavení |
| --- | --- |
| Netatmo | Teplota, CO₂, vlhkost a topení. Nastavte vlastní OAuth přístup a mapování místností. Pro zápis musí mít integrace příslušné oprávnění a `NETATMO_HEATING_CONTROL=true`. |
| Fibaro | Světla, scény a elektroměry. Zařízení a akce se přiřazují v `panel.json`. Pro HTTPS lze nastavit vlastní CA nebo otisk certifikátu. |
| Sensibo | Klimatizace, časovač a volitelně řízení podle výroby fotovoltaiky. |
| GoodWe | Výkon a historie výroby podle dostupné integrace. Pro místní čtení nainstalujte závislosti z `requirements.txt` do `.venv`. |
| Vysavač Roborock | Stav a úklid podle aktivní mapy. Použijte níže uvedené přihlášení. |
| Pračka Haier | Přehled programu, času a průběhu přes hOn. Po spárování v aplikaci spusťte `python3 lib/hon_probe.py --connect` s vlastním `HAIER_MODEL` nebo `HAIER_PRODUCT_CODE` a stejným `STATE_DIR` jako server. |
| Čističky Philips Air+ | Stav, kvalita vzduchu, filtr a podporované ovládání. V soukromém `airplus.devices` nastavte mapování identifikátoru z účtu na `room` a případně `humidity: true` u zařízení se zvlhčováním. Adaptér očekává lokálně připraveného klienta `airmatters`, Python s `aiohttp` a `paho-mqtt` v `STATE_DIR/airplus-probe/venv` a vlastní relaci v `STATE_DIR/airplus-probe/session.json`. |
| Kávovar De’Longhi | Stav, údržba a u kompatibilního zařízení probuzení přes Coffee Link. Vyžaduje lokálního klienta a relaci v `STATE_DIR/coffeelink-probe/`, Python s `aiohttp` a vlastní hodnotu `COFFEELINK_OEM_MODEL`. |
| Spotify | Přehrávání přes relaci v prohlížeči. Nastavte Client ID a přesnou HTTPS návratovou adresu s cestou `/spotify/callback` v aplikaci Spotify i v `.env`. Přehrávání vyžaduje účet Spotify Premium. |
| Počasí a radar | Open-Meteo se zapne po nastavení vlastní polohy v soukromém `panel.json`. Radar ČHMÚ se zapíná zvlášť přes `radar.enabled`. Jeho volitelný `radar.marker` používá poměrné hodnoty `x` a `y` od nuly do jedné v ploše radarového snímku. [Radar ČHMÚ](https://opendata.chmi.cz/meteorology/weather/radar/) · [Open-Meteo](https://open-meteo.com/) |

Pro Roborock vytvořte virtuální prostředí ve stavovém adresáři. Příkazy níže předpokládají výchozí `STATE_DIR=.state`. `ROBOROCK_MODEL` nastavte podle vlastního zařízení s podporou protokolu v1 a exportujte před přihlášením. Použijte stejnou hodnotu v `.env` serveru.

```sh
python3 -m venv .state/roborock-venv
.state/roborock-venv/bin/python -m pip install 'python-roborock==7.23.2'
.state/roborock-venv/bin/python lib/roborock_login.py
```

Pro Philips Air+ a Coffee Link se schéma relace řídí vstupy adaptérů v `lib/airplus_cloud.py` a `lib/coffeelink_cloud.py`. Tyto integrace vyžadují vlastní přihlášení a kompatibilního klienta.

## Hlasové ovládání

Spusťte `bash tools/voice-install.sh` a nastavte `VOICE_ENABLED=true`. Mikrofon podporují localhost a důvěryhodná HTTPS stránka s uděleným oprávněním prohlížeče. Probouzecí frázi vyhodnocuje openWakeWord ve Web Workeru na tabletu. Po probuzení panel odešle krátký povel na server.

- **Přepis** zajišťuje místní Whisper `large-v3-turbo` nebo volitelný ElevenLabs Scribe. Češtinu, angličtinu nebo thajštinu vyberete vlajkou.
- **Odpověď** se zobrazí a přečte hlasem Piperu nebo ElevenLabs podle volby v panelu. Služba ElevenLabs potřebuje vlastní klíč a oprávnění pro zvolené funkce.
- **Povely** řeší místní parser a katalog zařízení. Pro složitější formulace lze připojit Codex přes Unix socket. Před provedením změny server ověřuje dostupnost operace a její parametry.
- **Příklady** „Kolik je v obýváku stupňů?“, „Rozsviť v kuchyni“, „Zvyš teplotu o stupeň na dvě hodiny“, „Potřebuji vytřít v kuchyni“ nebo „Kolik dnes vyrobila fotovoltaika?“. Po odpovědi lze krátce navázat další větou. Rozhovor ukončuje například „Stop“ nebo „Děkuji“.

Pro Codex spusťte po přihlášení CLI `node tools/voice-codex.mjs` pod stejným uživatelem jako panel. V `VOICE_CODEX_SOCKET` obou procesů použijte shodnou cestu. Pro cloudový přepis ElevenLabs se posílá krátký povel po probuzení, pro cloudovou syntézu text odpovědi. Historie na serveru obsahuje přepisy, výsledky a časování. Zvukové nahrávky se do historie neukládají.

## Testy a licence

```sh
node --test test/*.test.mjs
python3 -m unittest discover -s test
```

Zdrojový kód je pod [licencí MIT](LICENSE). Písmo [DM Sans](public/dm-sans-license.txt) a volitelně stahované [hlasové modely a runtime](tools/voice-assets.NOTICE.md) mají vlastní licenční podmínky. Pokud zapnete radar, radarová data pocházejí z otevřených dat ČHMÚ. [Podmínky otevřených dat ČHMÚ](https://www.chmi.cz/-/jak-mohu-pou%C5%BE%C3%ADvat-otev%C5%99en%C3%A1-data-%C4%8Dhm%C3%BA-)

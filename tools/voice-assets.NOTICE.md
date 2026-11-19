# Hlasová detekce v prohlížeči

Modely `melspectrogram.onnx`, `embedding_model.onnx` a `hey_jarvis_v0.1.onnx` pocházejí z vydání [openWakeWord v0.5.1](https://github.com/dscripka/openWakeWord/releases/tag/v0.5.1). Autorem openWakeWord je David Scripka. Předtrénované modely jsou dostupné za podmínek [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Integrace používá soubory modelů v původní podobě. Popis předzpracování vychází z [openWakeWord v0.6.0](https://github.com/dscripka/openWakeWord/blob/v0.6.0/openwakeword/utils.py), jehož zdrojový kód je licencován pod [Apache License 2.0](https://github.com/dscripka/openWakeWord/blob/v0.6.0/LICENSE).

ONNX Runtime Web 1.22.0, copyright Microsoft Corporation, je licencován pod [MIT License](https://github.com/microsoft/onnxruntime/blob/main/LICENSE). JavaScript a WASM se instalují v původní podobě z [balíčku onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web/v/1.22.0).

Český model `vosk-model-small-cs-0.4-rhasspy` pro rozpoznání přerušení se instaluje v původní podobě z [katalogu Vosk](https://alphacephei.com/vosk/models) pod licencí MIT.

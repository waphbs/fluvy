import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

CARDS = os.path.join('packages', 'cards', 'src')
EN = os.path.join('packages', 'core', 'src', 'i18n', 'locales', 'en', 'energy.json')
CARD = os.path.join(CARDS, 'forecast', 'forecast-days-card.ts')
WIRE = os.path.join(CARDS, 'strategy', 'views', 'energy.ts')

# 1. English keys went in at the top level of en/energy.json; they belong under "forecast".
with open(EN, encoding='utf-8') as handle:
    doc = json.load(handle)
loose = {key: doc.pop(key) for key in list(doc) if key.startswith('days_')}
doc.setdefault('forecast', {}).update(loose)
with open(EN, 'w', encoding='utf-8', newline='\n') as handle:
    json.dump(doc, handle, ensure_ascii=False, indent=2)
    handle.write('\n')
print('en/energy.json: moved', sorted(loose), 'under forecast')

# 2. "entities" is a Lovelace-wide key the card base already owns; name the sensor list "forecast".
with open(CARD, encoding='utf-8') as handle:
    card = handle.read()
card = card.replace(
    '  /** Sensors whose attributes carry the hours of a day (Solcast and friends): one day each, all of them summed per day. */\n  entities?: readonly string[];',
    '  /** Sensors whose attributes carry the hours of a day (Solcast and friends): one day each, all of them summed per day. */\n  forecast?: readonly string[];',
)
card = card.replace('return this.config?.entities ?? [];', 'return this.config?.forecast ?? [];')
card = card.replace('const ids = (this.config?.entities ?? [])', 'const ids = (this.config?.forecast ?? [])')
card = card.replace("    'entities',\n    'days',", "    'forecast',\n    'days',")
card = card.replace("          name: 'entities',", "          name: 'forecast',")
with open(CARD, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(card)
print('card: entities -> forecast')

# 3. The strategy passes the same list under the new name.
with open(WIRE, encoding='utf-8') as handle:
    wire = handle.read()
wire = wire.replace('        entities: [solarForecast, solarForecastTomorrow].filter(', '        forecast: [solarForecast, solarForecastTomorrow].filter(')
with open(WIRE, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(wire)
print('strategy: wired as forecast')

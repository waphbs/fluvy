import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

CARDS = os.path.join('packages', 'cards', 'src')


def patch(path, anchor, insert, before=False):
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    if insert.strip() in text:
        print('already', os.path.basename(path))
        return
    if anchor not in text:
        raise SystemExit(f'{path}: anchor missing')
    text = text.replace(anchor, insert + anchor if before else anchor + insert, 1)
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)
    print('patched', os.path.basename(path))


patch(
    os.path.join(CARDS, 'energy-cards.ts'),
    "import { FluvyForecastCard } from './forecast/forecast-card.js';\n",
    "import { FluvyForecastDaysCard } from './forecast/forecast-days-card.js';\n",
    before=True,
)
patch(
    os.path.join(CARDS, 'energy-cards.ts'),
    "  'fluvy-forecast-card': FluvyForecastCard,\n",
    "  'fluvy-forecast-days-card': FluvyForecastDaysCard,\n",
)
patch(
    os.path.join(CARDS, 'energy-family.ts'),
    "  [\n    'fluvy-history-bars-card',\n",
    "  [\n    'fluvy-forecast-days-card',\n"
    "    'Fluvy · Days ahead',\n"
    "    'The days ahead as bars: each day the forecast sensors reach, with the total, the daily average and the best day under them.',\n"
    "    () => 300,\n"
    "  ],\n",
    before=True,
)

import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

PATH = os.path.join('packages', 'cards', 'src', 'strategy', 'views', 'energy.ts')

with open(PATH, encoding='utf-8') as handle:
    text = handle.read()

anchor = "    ...when(solarForecastTomorrow, (id) => [full('forecast', { tomorrow: id })]),\n"
insert = (
    "    ...when(solarForecast ?? solarForecastTomorrow, () => [\n"
    "      full('forecast-days', {\n"
    "        entities: [solarForecast, solarForecastTomorrow].filter(\n"
    "          (id): id is string => id !== undefined,\n"
    "        ),\n"
    "        days: 7,\n"
    "      }),\n"
    "    ]),\n"
)

if "full('forecast-days'" in text:
    print('already wired')
else:
    if anchor not in text:
        raise SystemExit('anchor missing')
    text = text.replace(anchor, anchor + insert, 1)
    with open(PATH, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)
    print('wired')

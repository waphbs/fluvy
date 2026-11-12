import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = 'packages/cards/src/forecast/forecast-days-card.ts'
with open(path, encoding='utf-8') as f:
    text = f.read()

def swap(old, new, label):
    global text
    if old not in text:
        raise SystemExit('anchor missing: ' + label)
    text = text.replace(old, new, 1)
    print('ok', label)

# 1. the row over the chart: the week's totals, or the day the pointer picks
swap(
    "    const row = statsRow(this.head.ruler, this.contentWidth, stats);\n"
    "    const under = this.hovered === null ? undefined : days[this.hovered];\n"
    "    const reading =\n"
    "      under && under.value !== null\n"
    "        ? html`<div class=\"fd-reading\">\n"
    "            ${readout({\n"
    "              label: under.label,\n"
    "              value: figure(under.value),\n"
    "              unit: 'kWh',\n"
    "              size: 'm',\n"
    "            })}\n"
    "          </div>`\n"
    "        : nothing;\n",
    "    const row = statsRow(this.head.ruler, this.contentWidth, stats);\n"
    "    const under = this.hovered === null ? undefined : days[this.hovered];\n"
    "    const total = sum(known.map((day) => day.value ?? 0));\n"
    "    // the row over the chart: the week's own after all, the day under the pointer while it is held — the strip\n"
    "    // under the chart keeps the week's high, low and average either way\n"
    "    const reading =\n"
    "      under && under.value !== null\n"
    "        ? html`<div class=\"fd-reading\">\n"
    "            ${readout({\n"
    "              label: under.label,\n"
    "              value: figure(under.value),\n"
    "              unit: 'kWh',\n"
    "              size: 'm',\n"
    "            })}\n"
    "          </div>`\n"
    "        : html`<div class=\"fd-reading fd-reading--pair\">\n"
    "            ${readout({ label: this.t('forecast.days_total'), value: figure(total), unit: 'kWh', size: 'm' })}\n"
    "            ${readout({\n"
    "              label: this.t('forecast.days_average'),\n"
    "              value: figure(known.length ? total / known.length : 0),\n"
    "              unit: 'kWh',\n"
    "              size: 'm',\n"
    "            })}\n"
    "          </div>`;\n",
    'reading row',
)

# 2. the strip under the chart: high, low, average
swap(
    "    const stats: StatText[] = [\n"
    "      {\n"
    "        label: this.t('forecast.days_total'),\n"
    "        value: known.length ? figure(sum(known.map((day) => day.value ?? 0))) : '—',\n"
    "        unit: known.length ? 'kWh' : '',\n"
    "      },\n"
    "      {\n"
    "        label: this.t('forecast.days_average'),\n"
    "        value: known.length ? figure(sum(known.map((day) => day.value ?? 0)) / known.length) : '—',\n"
    "        unit: known.length ? 'kWh' : '',\n"
    "      },\n"
    "      {\n"
    "        label: this.t('forecast.days_best'),\n"
    "        value: known.length ? figure(ceiling) : '—',\n"
    "        unit: known.length ? 'kWh' : '',\n"
    "      },\n"
    "    ];\n",
    "    const floor = known.length ? Math.min(...known.map((day) => day.value ?? 0)) : 0;\n"
    "    const stats: StatText[] = [\n"
    "      {\n"
    "        label: this.t('forecast.days_best'),\n"
    "        value: known.length ? figure(ceiling) : '—',\n"
    "        unit: known.length ? 'kWh' : '',\n"
    "      },\n"
    "      {\n"
    "        label: this.t('forecast.days_worst'),\n"
    "        value: known.length ? figure(floor) : '—',\n"
    "        unit: known.length ? 'kWh' : '',\n"
    "      },\n"
    "      {\n"
    "        label: this.t('forecast.days_average'),\n"
    "        value: known.length ? figure(sum(known.map((day) => day.value ?? 0)) / known.length) : '—',\n"
    "        unit: known.length ? 'kWh' : '',\n"
    "      },\n"
    "    ];\n",
    'stats strip',
)

# 3. the body: reading row, the chart, then the strip — the strip never leaves
swap(
    "          ${reading ??\n"
    "          html`<div\n"
    "            class=\"so-cols fv-cols ${row.odd ? 'fv-cols--odd' : ''}\"\n"
    "            style=\"grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))\"\n"
    "          >\n"
    "            ${stats.map((stat) => readout({ ...stat, size: row.size }))}\n"
    "          </div>`}\n",
    "          ${reading}\n"
    "          ${this.renderBars(days, 'kWh')}\n"
    "          <div\n"
    "            class=\"so-cols fv-cols ${row.odd ? 'fv-cols--odd' : ''}\"\n"
    "            style=\"grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))\"\n"
    "          >\n"
    "            ${stats.map((stat) => readout({ ...stat, size: row.size }))}\n"
    "          </div>\n",
    'body order',
)

# 4. the old chart call in the body's head must go (it is drawn between the two rows now)
swap(
    "          ${this.renderBars(days, 'kWh')}\n"
    "          ${reading}\n",
    "          ${reading}\n",
    'drop early chart',
) if "          ${this.renderBars(days, 'kWh')}\n          ${reading}\n" in text else print('skip drop')

# 5. the row sits over the chart: not a flex pair only, and the strip keeps its own air
swap(
    "      .fd-reading {\n"
    "        display: flex;\n"
    "        justify-content: center;\n"
    "        min-height: 44px;\n"
    "        margin-top: 8px;\n"
    "      }\n",
    "      .fd-reading {\n"
    "        display: flex;\n"
    "        justify-content: center;\n"
    "        min-height: 44px;\n"
    "        margin-top: 8px;\n"
    "      }\n"
    "      .fd-reading--pair {\n"
    "        justify-content: space-between;\n"
    "        gap: 16px;\n"
    "      }\n"
    "      .fd-reading--pair > * {\n"
    "        flex: 1 1 0;\n"
    "        min-width: 0;\n"
    "      }\n",
    'reading css',
)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text)
print('written')

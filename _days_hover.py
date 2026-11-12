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

# 1. fields beside the head
swap(
    "  private readonly head = new HeadFit(this);\n",
    "  private readonly head = new HeadFit(this);\n"
    "  /** The day the pointer or the finger is on, and the bars' measure to read it by. */\n"
    "  private hovered: number | null = null;\n"
    "  private plot = { inset: 0, slot: 1, count: 0 };\n",
    'fields',
)

# 2. remember the geometry as it is drawn
swap(
    "    const { slot, bar, radius } = barGeometry(count, plotWidth);\n",
    "    const { slot, bar, radius } = barGeometry(count, plotWidth);\n"
    "    this.plot = { inset, slot, count };\n",
    'plot measure',
)

# 3. the bars wear the hover
swap(
    "      const rect = empty\n"
    "        ? svg`<rect class=\"fd-bar is-empty\" x=${x} y=${(zero - 2).toFixed(1)} width=${bar} height=\"2\" rx=${Math.min(1, radius)}></rect>`\n"
    "        : svg`<path class=\"fd-bar\" d=${barPath(cx - bar / 2, zero - tall, bar, tall, radius, 'top')} style=\"--bar-delay:${i * 18}ms\"></path>`;\n",
    "      const hover = this.hovered === i ? 'is-hover' : '';\n"
    "      const rect = empty\n"
    "        ? svg`<rect class=\"fd-bar is-empty ${hover}\" x=${x} y=${(zero - 2).toFixed(1)} width=${bar} height=\"2\" rx=${Math.min(1, radius)}></rect>`\n"
    "        : svg`<path class=\"fd-bar ${hover}\" d=${barPath(cx - bar / 2, zero - tall, bar, tall, radius, 'top')} style=\"--bar-delay:${i * 18}ms\"></path>`;\n",
    'bar hover class',
)

# 4. the chart follows the pointer
swap(
    "    return html`<div class=\"fd-chart\">\n"
    "      <svg width=${width} height=${height} viewBox=\"0 0 ${width} ${height}\" data-measure=\"drawn\">\n",
    "    return html`<div\n"
    "      class=\"fd-chart ${this.hovered !== null ? 'is-scrub' : ''}\"\n"
    "      @pointermove=${this.onPoint}\n"
    "      @pointerdown=${this.onPoint}\n"
    "      @pointerleave=${this.onLeave}\n"
    "    >\n"
    "      <svg width=${width} height=${height} viewBox=\"0 0 ${width} ${height}\" data-measure=\"drawn\">\n",
    'chart handlers',
)

# 5. the pointer's reading
swap(
    "  protected renderCard(): TemplateResult {\n",
    "  /** The bar under the pointer, from the chart's own measure. */\n"
    "  private indexAt(event: PointerEvent): number | null {\n"
    "    const box = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();\n"
    "    if (!box) return null;\n"
    "    const { inset, slot, count } = this.plot;\n"
    "    if (count <= 0 || slot <= 0) return null;\n"
    "    const index = Math.floor((event.clientX - box.left - inset) / slot);\n"
    "    return index >= 0 && index < count ? index : null;\n"
    "  }\n"
    "\n"
    "  private readonly onPoint = (event: PointerEvent): void => {\n"
    "    const index = this.indexAt(event);\n"
    "    if (index === this.hovered) return;\n"
    "    this.hovered = index;\n"
    "    this.requestUpdate();\n"
    "  };\n"
    "\n"
    "  private readonly onLeave = (): void => {\n"
    "    if (this.hovered === null) return;\n"
    "    this.hovered = null;\n"
    "    this.requestUpdate();\n"
    "  };\n"
    "\n"
    "  protected renderCard(): TemplateResult {\n",
    'pointer helpers',
)

# 6. the day under the pointer reads instead of the week's totals
swap(
    "    const row = statsRow(this.head.ruler, this.contentWidth, stats);\n",
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
    'reading',
)

swap(
    "          <div\n"
    "            class=\"so-cols fv-cols ${row.odd ? 'fv-cols--odd' : ''}\"\n"
    "            style=\"grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))\"\n"
    "          >\n"
    "            ${stats.map((stat) => readout({ ...stat, size: row.size }))}\n"
    "          </div>\n",
    "          ${reading ??\n"
    "          html`<div\n"
    "            class=\"so-cols fv-cols ${row.odd ? 'fv-cols--odd' : ''}\"\n"
    "            style=\"grid-template-columns:repeat(${row.columns}, minmax(0, 1fr))\"\n"
    "          >\n"
    "            ${stats.map((stat) => readout({ ...stat, size: row.size }))}\n"
    "          </div>`}\n",
    'stats or reading',
)

# 7. the chart's cursor, the quiet bars, and the reading's room
swap(
    "      .fd-chart {\n"
    "        --ink: var(--tone-ink, var(--fluvy-accent));\n"
    "        position: relative;\n"
    "        margin-top: 12px;\n"
    "        touch-action: pan-y;\n"
    "      }\n",
    "      .fd-chart {\n"
    "        --ink: var(--tone-ink, var(--fluvy-accent));\n"
    "        position: relative;\n"
    "        margin-top: 12px;\n"
    "        touch-action: pan-y;\n"
    "        cursor: crosshair;\n"
    "      }\n"
    "      .fd-chart.is-scrub .fd-bar:not(.is-hover) {\n"
    "        opacity: 0.4;\n"
    "      }\n"
    "      .fd-chart.is-scrub .fd-bar.is-empty:not(.is-hover) {\n"
    "        opacity: 0.1;\n"
    "      }\n"
    "      .fd-bar {\n"
    "        transition: opacity var(--fv-base) var(--fv-ease);\n"
    "      }\n"
    "      .fd-reading {\n"
    "        display: flex;\n"
    "        justify-content: center;\n"
    "        min-height: 44px;\n"
    "        margin-top: 8px;\n"
    "      }\n",
    'chart css',
)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text)
print('written')

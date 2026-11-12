import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

CARD = os.path.join('packages', 'cards', 'src', 'forecast', 'forecast-card.ts')

with open(CARD, encoding='utf-8') as handle:
    text = handle.read()


def swap(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'anchor missing: {label}')
    text = text.replace(old, new, 1)
    print('patched', label)


# 1. the big number becomes a readout with a label over it, as the production card's figure is
swap(
    """            <div class="fc-total">
              <span class="fc-value">${figure(shown)}</span>
              <span class="fc-unit">kWh</span>
              ${hour !== null
                ? html`<span class="fc-peak"
                    >${this.hourLabel(hour)} – ${this.hourLabel(hour + 1)}</span
                  >`
                : nothing}
            </div>""",
    """            <div class="fc-top fv-value-row">
              ${hour !== null
                ? readout({
                    label: `${this.hourLabel(hour)} – ${this.hourLabel(hour + 1)}`,
                    value: figure(shown),
                    unit: 'kWh',
                    size: this.contentWidth < AXIS_FULL ? 'm' : 'l',
                  })
                : readout({
                    label: this.t('forecast.expected'),
                    value: figure(shown),
                    unit: 'kWh',
                    size: this.contentWidth < AXIS_FULL ? 'm' : 'l',
                  })}
              <span class="fc-when">${this.dayLabel()}</span>
            </div>""",
    'top row as readout + date',
)

# 2. today's word for tomorrow's date, under the figure
swap(
    """  private get hour12(): boolean {
    return clock12(this.hass);
  }""",
    """  private get hour12(): boolean {
    return clock12(this.hass);
  }

  /** The day this card draws, as the house writes a date: "11月13日" or "Nov 13". */
  private dayLabel(): string {
    const hass = this.hass as HomeAssistant | undefined;
    const at = new Date(houseMidnight(hass as HomeAssistant, new Date()).getTime() + 24 * HOUR + 12 * HOUR);
    return dateFormat(hass?.language ?? 'en', { month: 'short', day: 'numeric' }).format(at);
  }""",
    'day label helper',
)

# 3. styles: the hand-made total row gives way to the shared value row and a quiet date
swap(
    """      .fc-total {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .fc-total .fc-value {
        font-size: 40px;
        font-weight: 650;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .fc-total .fc-unit {
        font-size: 14px;
        color: var(--fluvy-text-secondary);
      }
      .fc-peak {
        margin-inline-start: auto;
        font-size: 12px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
      }""",
    """      .fc-when {
        margin-inline-start: auto;
        align-self: flex-end;
        padding-block-end: 6px;
        font-size: 12px;
        color: var(--fluvy-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }""",
    'value-row styles',
)

with open(CARD, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(text)
print('done')

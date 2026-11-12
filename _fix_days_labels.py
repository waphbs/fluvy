import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

CARD = os.path.join('packages', 'cards', 'src', 'forecast', 'forecast-days-card.ts')

with open(CARD, encoding='utf-8') as handle:
    text = handle.read()

old_label = """      .fd-date {
        font-size: 11px;"""
new_label = """      .fd-date {
        font-size: 10px;"""
if old_label not in text:
    raise SystemExit('label style anchor missing')
text = text.replace(old_label, new_label, 1)

old_markup = """            ${days.map(
              (day) => html`<div class="fd-col ${day.value === null ? 'is-empty' : ''}">
                <span class="fd-value">${day.value === null ? '' : figure(day.value, 0)}</span>
                <span class="fd-bar" style="height:${height(day.value)}"></span>
                <span class="fd-date">${day.label}</span>
              </div>`,
            )}"""
new_markup = """            ${days.map(
              (day, index) => html`<div class="fd-col ${day.value === null ? 'is-empty' : ''}">
                <span class="fd-value">${day.value === null ? '' : figure(day.value, 0)}</span>
                <span class="fd-bar" style="height:${height(day.value)}"></span>
                <span class="fd-date"
                  >${index % 2 === 0 || index === days.length - 1 ? day.label : ''}</span
                >
              </div>`,
            )}"""
if old_markup not in text:
    raise SystemExit('markup anchor missing')
text = text.replace(old_markup, new_markup, 1)

with open(CARD, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(text)
print('date labels: every other day, 10px')

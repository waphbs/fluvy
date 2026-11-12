import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

for path, marker in [
    ('packages/cards/src/forecast/forecast-card.ts', '.fc-body'),
    ('packages/cards/src/forecast/forecast-days-card.ts', '.fd-body'),
]:
    with open(path, encoding='utf-8') as f:
        text = f.read()
    old = 'padding: 0 16px 16px;'
    new = '/* the card holds the side padding: the chart is drawn at contentWidth, so the body must not add its own */\n        padding: 0 0 16px;'
    if old not in text:
        raise SystemExit('anchor missing in ' + path)
    text = text.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('patched', path)

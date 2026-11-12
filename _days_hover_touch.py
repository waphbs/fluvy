import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = 'packages/cards/src/forecast/forecast-days-card.ts'
with open(path, encoding='utf-8') as f:
    text = f.read()

old = (
    "  private readonly onLeave = (): void => {\n"
    "    if (this.hovered === null) return;\n"
    "    this.hovered = null;\n"
    "    this.requestUpdate();\n"
    "  };\n"
)
new = (
    "  private readonly onLeave = (event: PointerEvent): void => {\n"
    "    // a finger lifting is a pointer leaving too: the day it picked stays read, as the hour card's does\n"
    "    if (event.pointerType === 'touch') return;\n"
    "    if (this.hovered === null) return;\n"
    "    this.hovered = null;\n"
    "    this.requestUpdate();\n"
    "  };\n"
)
if old not in text:
    raise SystemExit('anchor missing')
text = text.replace(old, new, 1)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text)
print('patched leave')

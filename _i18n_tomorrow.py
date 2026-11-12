import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = os.path.join('packages', 'core', 'src', 'i18n', 'locales', 'zh-Hans.json')
with open(path, encoding='utf-8') as handle:
    text = handle.read()

old = '''  "forecast": {
    "title": "发电预报",
    "today": "今天",
    "tomorrow": "明天",'''
new = '''  "forecast": {
    "title": "发电预报",
    "today": "今天",
    "tomorrow": "明日预测",'''
if old not in text:
    raise SystemExit('forecast block anchor missing')
text = text.replace(old, new, 1)

with open(path, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(text)
print('zh-Hans forecast.tomorrow -> 明日预测')

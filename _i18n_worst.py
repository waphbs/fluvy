import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

root = 'packages/core/src/i18n/locales'

en_path = os.path.join(root, 'en', 'energy.json')
with open(en_path, encoding='utf-8') as f:
    en = json.load(f)
forecast = en['forecast']
forecast['days_worst'] = 'Lowest'
with open(en_path, 'w', encoding='utf-8', newline='') as f:
    json.dump(en, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('en forecast keys', len(forecast))

zh_path = os.path.join(root, 'zh-Hans.json')
with open(zh_path, encoding='utf-8') as f:
    zh = json.load(f)
zhfc = zh['forecast']
zhfc['days_worst'] = '最低'
with open(zh_path, 'w', encoding='utf-8', newline='') as f:
    json.dump(zh, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('zh forecast keys', len(zhfc))
print('zh days_*', {k: v for k, v in zhfc.items() if k.startswith('days_')})

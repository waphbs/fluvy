import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = os.path.join('packages', 'core', 'src', 'i18n', 'locales')

# English is a folder of parts; every other language is one file holding all the parts.
EN = os.path.join(BASE, 'en', 'energy.json')
ZH = os.path.join(BASE, 'zh-Hans.json')

ADD_EN = {
    'days_title': 'Next {n} days',
    'days_sub': 'Day by day',
    'days_total': 'Total',
    'days_average': 'Daily',
    'days_best': 'Best',
    'days_none': 'No forecast for the days ahead yet',
}
ADD_ZH = {
    'days_title': '未来 {n} 天',
    'days_sub': '逐日预测',
    'days_total': '合计',
    'days_average': '日均',
    'days_best': '最好',
    'days_none': '还没有未来几天的预报',
}


def patch(path, words, nested):
    with open(path, encoding='utf-8') as handle:
        doc = json.load(handle)
    holder = doc.setdefault('forecast', {}) if nested else doc
    if not isinstance(holder, dict):
        raise SystemExit(f'{path}: forecast is not an object')
    before = len(holder)
    holder.update(words)
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(doc, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print(os.path.basename(path), 'forecast keys', before, '->', len(holder))


patch(EN, ADD_EN, False)
patch(ZH, ADD_ZH, True)

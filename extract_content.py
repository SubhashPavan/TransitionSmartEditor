import json
import re
import os

SRC = r'C:\Users\naimi\TS Video Parser\Agentic Layer\output\ariba\sop_content.json'
DST_DIR = r'C:\Users\naimi\TS Video Parser\sop-editor\frontend\src\data'
os.makedirs(DST_DIR, exist_ok=True)
DST = os.path.join(DST_DIR, 'sopContent.json')

with open(SRC) as f:
    data = json.load(f)

sections = data['sections']

def clean(text, section_title):
    if not text:
        return ''
    text = re.sub(r'<!--\s*source_ref:.*?-->\s*\n?', '', text)
    text = re.sub(r'```markdown\s*\n?', '', text)
    text = re.sub(r'```\s*\n?', '', text)
    lines = text.split('\n')
    filtered = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('## ') and stripped[3:].strip().lower() == section_title.lower():
            continue
        if stripped.startswith('### ') and stripped[4:].strip().lower() == section_title.lower():
            continue
        filtered.append(line)
    return '\n'.join(filtered).strip()

out = []
for s in sections:
    out.append({
        'section_number': s.get('section_number', ''),
        'section_title': s.get('section_title', ''),
        'section_type': s.get('section_type', ''),
        'time_range': s.get('time_range', ''),
        'content': clean(s.get('content', ''), s.get('section_title', '')),
    })

with open(DST, 'w', encoding='utf-8') as f:
    json.dump({'meta': data.get('statistics', {}), 'sections': out}, f, indent=2)

print(f'Wrote {len(out)} sections to {DST}')
for s in out[:5]:
    print(f'  {s["section_number"]:5} {s["section_title"][:50]:50} ({s["section_type"]:9}) {len(s["content"]):5} chars')

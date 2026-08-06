import os
import re

files = ['frontend/app/page.tsx', 'frontend/app/machines/page.tsx', 'frontend/app/m/page.tsx']
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace all rounded classes with rounded-none
    new_content = re.sub(r'\brounded-(xl|lg|md|sm|full|t-[a-z]+|b-[a-z]+|2xl|3xl)\b', 'rounded-none', content)
    new_content = re.sub(r'\brounded\b', 'rounded-none', new_content)
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(new_content)
    print(f'Stripped rounded corners from {f}')

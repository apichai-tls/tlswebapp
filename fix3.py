import re

with open('src/app/admin/page.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(r'itemsPayload\.push\(\{\s*name:\s*name\s*\|\|\s*key,\s*quantity:\s*val\.quantity,\s*price:\s*0\s*\}\);', 'itemsPayload.push({ name: name || key, nameEn: name || key, quantity: val.quantity, price: 0, serviceId: key, unit: "pcs" });', c)

c = c.replace('<Lock ', '<LockIcon ')
c = c.replace('</Lock>', '</LockIcon>')
c = c.replace('import { Lock,', 'import { Lock as LockIcon,')
if 'LockIcon' not in c.split('from "lucide-react"')[0]:
    c = c.replace('import { ', 'import { Lock as LockIcon, ', 1)

with open('src/app/admin/page.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

with open('src/components/admin-dashboard.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
if 'useCallback' not in c:
    c = c.replace('import React, { useState, useEffect, useMemo } from "react";', 'import React, { useState, useEffect, useMemo, useCallback } from "react";')
    if 'useCallback' not in c:
        c = 'import { useCallback } from "react";\n' + c
with open('src/components/admin-dashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

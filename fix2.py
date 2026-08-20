import re

with open('src/app/admin/page.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('itemsPayload.push({\n              name: name || key,\n              quantity: val.quantity,\n              price: 0\n            });', 'itemsPayload.push({\n              name: name || key,\n              nameEn: name || key,\n              quantity: val.quantity,\n              price: 0,\n              serviceId: key,\n              unit: "pcs"\n            });')

c = c.replace('<LockIcon ', '<Lock ')
c = c.replace('</LockIcon>', '</Lock>')
c = c.replace('import { Lock as LockIcon,', 'import { Lock,')

with open('src/app/admin/page.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

with open('src/components/admin-dashboard.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
if 'useCallback' not in c:
    c = c.replace('import React, { useState, useEffect, useMemo } from "react";', 'import React, { useState, useEffect, useMemo, useCallback } from "react";')
with open('src/components/admin-dashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

import re

with open('src/app/admin/page.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('import { Lock as LockIcon, useState', 'import { useState')
c = c.replace('import {\n  Dialog,', 'import { Lock as LockIcon } from "lucide-react";\nimport {\n  Dialog,')

c = c.replace('itemsPayload.push({\n          name: "Other (Custom Service)",\n          quantity: 1,\n          price: laundryPrice || 0\n        });', 'itemsPayload.push({\n          name: "Other (Custom Service)",\n          nameEn: "Other (Custom Service)",\n          quantity: 1,\n          price: laundryPrice || 0,\n          serviceId: "other",\n          unit: "pcs"\n        });')

with open('src/app/admin/page.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

with open('src/components/admin-dashboard.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";', 'import { useState, useEffect, useMemo, useRef, useSyncExternalStore, useCallback } from "react";')
with open('src/components/admin-dashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

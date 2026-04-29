const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, 'src', 'lib', 'api.ts');
let content = fs.readFileSync(apiPath, 'utf8');

// 1. Add import for db actions
if (!content.includes("import * as dbActions")) {
  content = content.replace("import type {", "import * as dbActions from '@/actions/db';\nimport type {");
}

// 2. Remove delay() calls to make it fast
content = content.replace(/await delay\([^)]*\);/g, '');
content = content.replace(/await delay\(\);/g, '');

// 3. Replace saveDb(db) with dbActions
const replacements = [
  { match: /saveDb\(db\);\s+return newCustomer;/g, replace: 'await dbActions.addCustomerAction(newCustomer);\n    return newCustomer;' },
  { match: /saveDb\(db\);\s+return updatedCustomer;/g, replace: 'await dbActions.updateCustomerAction(id, updates);\n    return updatedCustomer;' },
  { match: /db\.customers = db\.customers\.filter\(c => c\.id !== id\);\s+saveDb\(db\);/g, replace: 'db.customers = db.customers.filter(c => c.id !== id);\n    await dbActions.deleteCustomerAction(id);' },
  
  { match: /saveDb\(db\);\s+return newJob;/g, replace: 'await dbActions.addJobAction(newJob);\n    return newJob;' },
  { match: /saveDb\(db\);\s+return updatedJob;/g, replace: 'await dbActions.updateJobAction(id, updates);\n    return updatedJob;' },
  
  { match: /saveDb\(db\);\s+return newService;/g, replace: 'await dbActions.addServiceAction(newService);\n    return newService;' },
  { match: /saveDb\(db\);\s+return updatedService;/g, replace: 'await dbActions.updateServiceAction(id, updates);\n    return updatedService;' },
  { match: /db\.services = db\.services\.filter\(s => s\.id !== id\);\s+saveDb\(db\);/g, replace: 'db.services = db.services.filter(s => s.id !== id);\n    await dbActions.deleteServiceAction(id);' },

  { match: /saveDb\(db\);\s+return updatedRider;/g, replace: 'await dbActions.updateRiderAction(id, updates);\n    return updatedRider;' },
  { match: /saveDb\(db\);\s+return newRider;/g, replace: 'await dbActions.addRiderAction(newRider);\n    return newRider;' },
  { match: /db\.riders = db\.riders\.filter\(r => r\.id !== id\);\s+saveDb\(db\);/g, replace: 'db.riders = db.riders.filter(r => r.id !== id);\n    await dbActions.deleteRiderAction(id);' },

  { match: /saveDb\(db\);\s+return newList;/g, replace: 'await dbActions.addPriceListAction(newList);\n    return newList;' },
  { match: /saveDb\(db\);\s+return updatedList;/g, replace: 'await dbActions.updatePriceListAction(id, updates);\n    return updatedList;' },
  { match: /db\.customers = db\.customers\.map\(c => c\.priceListId === id \? \{ \.\.\.c, priceListId: "regular" \} : c\);\s+saveDb\(db\);/g, replace: 'db.customers = db.customers.map(c => c.priceListId === id ? { ...c, priceListId: "regular" } : c);\n    await dbActions.deletePriceListAction(id);' },

  { match: /saveDb\(db\);\s+return newShop;/g, replace: 'await dbActions.addShopLocationAction(newShop);\n    return newShop;' },
  { match: /saveDb\(db\);\s+return updatedShop;/g, replace: 'await dbActions.updateShopLocationAction(id, updates);\n    return updatedShop;' },
  { match: /db\.shopLocations = db\.shopLocations\.filter\(s => s\.id !== id\);\s+saveDb\(db\);/g, replace: 'db.shopLocations = db.shopLocations.filter(s => s.id !== id);\n    await dbActions.deleteShopLocationAction(id);' },

  { match: /saveDb\(db\);\s+return db\.settings;/g, replace: 'await dbActions.updateSettingAction(key, value);\n    return db.settings;' },

  { match: /saveDb\(db\);\s+return newPoi;/g, replace: 'await dbActions.addPOIAction(newPoi);\n    return newPoi;' },
  { match: /saveDb\(db\);\s+return updatedPoi;/g, replace: 'await dbActions.updatePOIAction(id, updates);\n    return updatedPoi;' },
  { match: /db\.pois = db\.pois\.filter\(p => p\.id !== id\);\s+saveDb\(db\);/g, replace: 'db.pois = db.pois.filter(p => p.id !== id);\n    await dbActions.deletePOIAction(id);' },
];

for (const r of replacements) {
  content = content.replace(r.match, r.replace);
}

// 4. Remove saveDb helper entirely so we don't accidentally use it
content = content.replace(/\/\/ Helper to save to server[\s\S]*?const saveDb = async \(db: Database\) => \{[\s\S]*?try \{[\s\S]*?await fetch\('\/api\/db'[\s\S]*?\}\s*\};\s*/m, '');

fs.writeFileSync(apiPath, content, 'utf8');
console.log('Done rewriting api.ts');

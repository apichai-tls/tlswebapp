const fs = require('fs');
const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\components\\admin-crm.tsx';
let code = fs.readFileSync(path, 'utf8');

// Add isCorporate to state
code = code.replace(
  'const [isVIP, setIsVIP] = useState(false);',
  'const [isVIP, setIsVIP] = useState(false);\n  const [isCorporate, setIsCorporate] = useState(false);'
);

// Reset state
code = code.replace(
  'setIsVIP(false);',
  'setIsVIP(false);\n    setIsCorporate(false);'
);

// Edit customer set state
code = code.replace(
  'setIsVIP(customer.isVIP || false);',
  'setIsVIP(customer.isVIP || false);\n      setIsCorporate(customer.isCorporate || false);'
);

// Handle Save validation
code = code.replace(
  'if (!name.trim() || !phone.trim() || !address.trim()) {',
  'if (!name.trim() || !phone.trim() || !address.trim() || !secondaryAddress.trim()) {'
);

// Handle Save payload
code = code.replace(
  'isVIP: isVIP,\n      isMember: isMember,',
  'isVIP: isVIP,\n      isMember: isMember,\n      isCorporate: isCorporate,'
);

// Form Label Floor/Room
code = code.replace(
  '<Label className="text-xs font-semibold">Floor/Room</Label>',
  '<Label className="text-xs font-semibold text-rose-600">Floor/Room *</Label>'
);

// Add Checkbox for Corporate
const checkboxesCode = `<label className="flex items-center gap-3 p-3 bg-slate-50/80 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isCorporate} 
                  onChange={e => setIsCorporate(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-slate-600 focus:ring-slate-600 bg-white"
                />
                <div>
                  <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Building size={16} className="text-slate-600" /> Corporate Customer</p>
                  <p className="text-xs text-slate-500">Enable billing and invoicing features for B2B clients</p>
                </div>
              </label>`;

code = code.replace(
  '</div>\n          </div>',
  `  ${checkboxesCode}\n            </div>\n          </div>`
);


// Also add the badge for Corporate in the Table row
code = code.replace(
  '{customer.priceListId && customer.priceListId !== "regular" && (',
  `{customer.isCorporate && (
                              <Badge className="bg-slate-100 text-slate-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <Building size={10} className="text-slate-600" /> 
                                CORP
                              </Badge>
                            )}
                            {customer.priceListId && customer.priceListId !== "regular" && (`
);

fs.writeFileSync(path, code);
console.log('Successfully updated AdminCRM');

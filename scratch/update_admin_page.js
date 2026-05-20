const fs = require('fs');
const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\admin\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add "Add Customer" button next to search
const searchBlock = `<div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="customer-search"
                        placeholder="Search customer by name or phone..."
                        value={customerSearchQuery}
                        disabled={!!editingJobId}
                        onChange={(e) => {
                          setCustomerSearchQuery(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => {
                          if (customerSearchQuery) setShowCustomerDropdown(true);
                        }}
                        onBlur={() => {
                          setTimeout(() => setShowCustomerDropdown(false), 200);
                        }}
                        className="h-9 pl-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 rounded-full w-full"
                      />
                    </div>`;

const updatedSearchBlock = `<div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="customer-search"
                          placeholder="Search customer by name or phone..."
                          value={customerSearchQuery}
                          disabled={!!editingJobId}
                          onChange={(e) => {
                            setCustomerSearchQuery(e.target.value);
                            setShowCustomerDropdown(true);
                          }}
                          onFocus={() => {
                            if (customerSearchQuery) setShowCustomerDropdown(true);
                          }}
                          onBlur={() => {
                            setTimeout(() => setShowCustomerDropdown(false), 200);
                          }}
                          className="h-9 pl-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 rounded-full w-full"
                        />
                      </div>
                      <Button 
                        type="button"
                        onClick={() => {
                          setDialogOpen(false);
                          setTimeout(() => {
                            setActiveTab("crm");
                          }, 100);
                        }}
                        className="h-9 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm rounded-full flex items-center gap-1.5 font-bold"
                      >
                        <UserPlus size={14} />
                        <span className="text-xs">Add Customer</span>
                      </Button>
                    </div>`;

code = code.replace(searchBlock, updatedSearchBlock);

// 2. Lock Name and Phone
const nameBlock = `<Input
                              id="custName"
                              placeholder="Name"
                              value={customerName}
                              disabled={!!editingJobId}
                              onChange={(e) => {
                                setCustomerName(e.target.value);
                                setSelectedVIPLabel("");
                              }}
                              className="h-8 text-xs"
                            />`;
const newNameBlock = `<Input
                              id="custName"
                              placeholder="Name"
                              value={customerName}
                              disabled={true}
                              className="h-8 text-xs bg-slate-50 cursor-not-allowed text-slate-500"
                            />`;
code = code.replace(nameBlock, newNameBlock);

const phoneBlock = `<PhoneInput
                              placeholder="Phone number"
                              value={customerPhone}
                              onChange={setCustomerPhone}
                              className="w-full h-8"
                            />`;
const newPhoneBlock = `<PhoneInput
                              placeholder="Phone number"
                              value={customerPhone}
                              onChange={() => {}}
                              disabled={true}
                              className="w-full h-8 opacity-70 cursor-not-allowed"
                            />`;
code = code.replace(phoneBlock, newPhoneBlock);

// 3. Remove inline "Save Customer to DB"
const saveCustomerRegex = /\{customerName\.trim\(\) && !customers\.some\(c => c\.name === customerName \|\| \(customerPhone && c\.phone === customerPhone\)\) && \([\s\S]*?<\/div>\s*\)\}/;
code = code.replace(saveCustomerRegex, '');


fs.writeFileSync(path, code);
console.log('Successfully updated Admin page');

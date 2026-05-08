              <DialogContent className="w-full max-w-[95vw] lg:max-w-7xl p-0 overflow-hidden bg-slate-50 flex flex-col h-[95vh]">
                <DialogHeader className="p-4 pb-3 border-b border-slate-200 bg-white shrink-0">
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <Package size={18} />
                    Create New Job
                  </DialogTitle>
                </DialogHeader>

                {/* Main Content Grid */}
                <div className="flex-1 overflow-y-auto lg:overflow-hidden p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
                    
                    {/* COL 1: Basic Info (span 3) */}
                    <motion.div
                      className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1 pb-4 lg:pb-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.3 }}
                    >
                      {/* Customer Info Card */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="customer-select" className="flex items-center gap-1.5 text-sm font-medium">
                            <Users size={14} className="text-blue-600" />
                            Saved Contacts
                          </Label>
                          <select 
                            id="customer-select"
                            className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                            onChange={(e) => {
                              const cust = customers.find(c => c.id === e.target.value);
                              if (cust) {
                                setCustomerName(cust.name);
                                setCustomerPhone(cust.phone);
                                setPickupLoc(cust.defaultAddress);
                                setPickupCoords(cust.defaultCoords);
                                setDeliveryLoc(cust.defaultAddress);
                                setDeliveryCoords(cust.defaultCoords);
                                setIsDeliveryDirty(false);
                                setSelectedStoreIndex(getClosestShopIndex(cust.defaultCoords, shopLocations));
                              } else {
                                setCustomerName("");
                                setCustomerPhone("");
                              }
                            }}
                          >
                            <option value="">-- Manual Entry --</option>
                            {customers.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="custName" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <User size={12} />
                              Customer Name
                            </Label>
                            <Input
                              id="custName"
                              placeholder="Name"
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="custPhone" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <Phone size={12} />
                              Phone
                            </Label>
                            <Input
                              id="custPhone"
                              placeholder="Phone number"
                              value={customerPhone}
                              onChange={(e) => setCustomerPhone(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Service Info Card */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="store-select" className="flex items-center gap-1.5 text-xs font-medium">
                            <Store size={14} className="text-blue-600" />
                            Origin Store Branch
                          </Label>
                          <select 
                            id="store-select"
                            className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                            value={selectedStoreIndex}
                            onChange={(e) => setSelectedStoreIndex(Number(e.target.value))}
                          >
                            {shopLocations.map((shop, idx) => (
                              <option key={shop.id} value={idx}>{shop.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="service-select" className="flex items-center gap-1.5 text-xs font-medium">
                            <ArrowDownUp size={14} className="text-purple-600" />
                            Laundry Service Type
                          </Label>
                          <select 
                            id="service-select"
                            className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                            value={serviceType}
                            onChange={(e) => setServiceType(e.target.value as ServiceType)}
                          >
                            <option value="wash_fold">Wash/Fold</option>
                            <option value="wash_iron_fold">Wash/Iron/Fold</option>
                          </select>
                        </div>

                        <div className="space-y-2 pt-1">
                          <Label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">Service Speed</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <Label className={`flex items-center justify-center text-[10px] p-2 border rounded-lg cursor-pointer transition-colors ${serviceSpeed === "standard" ? "border-indigo-600 bg-indigo-50 font-bold text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                              <input type="radio" className="hidden" checked={serviceSpeed === "standard"} onChange={() => setServiceSpeed("standard")} />
                              Standard
                            </Label>
                            <Label className={`flex items-center justify-center text-[10px] p-2 border rounded-lg cursor-pointer transition-colors ${serviceSpeed === "express_50" ? "border-amber-500 bg-amber-50 font-bold text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                              <input type="radio" className="hidden" checked={serviceSpeed === "express_50"} onChange={() => setServiceSpeed("express_50")} />
                              Express 50%
                            </Label>
                            <Label className={`flex items-center justify-center text-[10px] p-2 border rounded-lg cursor-pointer transition-colors ${serviceSpeed === "express_100" ? "border-red-500 bg-red-50 font-bold text-red-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                              <input type="radio" className="hidden" checked={serviceSpeed === "express_100"} onChange={() => setServiceSpeed("express_100")} />
                              Express 100%
                            </Label>
                          </div>
                        </div>
                      </div>
                    </motion.div>

                    {/* COL 2: Logistics & Map (span 5) */}
                    <motion.div
                      className="lg:col-span-5 flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.3 }}
                    >
                      <div className="flex items-center gap-4 shrink-0">
                        <Label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isPickup}
                            onChange={(e) => setIsPickup(e.target.checked)}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
                          />
                          <span className="text-sm font-medium text-slate-700">บริการไปรับ (Pickup)</span>
                        </Label>
                        <Label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isDelivery}
                            onChange={(e) => setIsDelivery(e.target.checked)}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
                          />
                          <span className="text-sm font-medium text-slate-700">บริการไปส่ง (Delivery)</span>
                        </Label>
                      </div>

                      <div className="flex flex-col gap-3 shrink-0">
                        {isPickup && (
                          <div className="space-y-2">
                            <Label htmlFor="pickup-location" className="flex items-center gap-1.5 text-xs font-medium">
                              <MapPin size={14} className="text-emerald-600" />
                              ที่อยู่ไปรับ (Pickup Address)
                            </Label>
                            <LocationInput
                              id="pickup-location"
                              placeholder="Customer pickup address"
                              value={pickupLoc}
                              onChange={(v) => {
                                setPickupLoc(v);
                              }}
                              onSelectLocation={(loc) => {
                                const newCoords = { lat: loc.lat, lng: loc.lng };
                                setPickupCoords(newCoords);
                                setSelectedStoreIndex(getClosestShopIndex(newCoords, shopLocations));
                                if (!isDeliveryDirty) {
                                  setDeliveryLoc(loc.name);
                                  setDeliveryCoords(newCoords);
                                }
                              }}
                            />
                          </div>
                        )}

                        {isDelivery && (
                          <div className="space-y-2">
                            <Label htmlFor="delivery-location" className="flex items-center gap-1.5 text-xs font-medium">
                              <Navigation size={14} className="text-red-600" />
                              ที่อยู่ไปส่ง (Delivery Address)
                            </Label>
                            <LocationInput
                              id="delivery-location"
                              placeholder="Customer delivery address"
                              value={deliveryLoc}
                              onChange={(v) => {
                                setDeliveryLoc(v);
                                setIsDeliveryDirty(true);
                              }}
                              onSelectLocation={(loc) => {
                                const newCoords = { lat: loc.lat, lng: loc.lng };
                                setDeliveryCoords(newCoords);
                                setIsDeliveryDirty(true);
                                if (!isPickup) {
                                  setSelectedStoreIndex(getClosestShopIndex(newCoords, shopLocations));
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Interactive Map */}
                      <div className="flex-1 min-h-[250px] lg:h-auto rounded-lg overflow-hidden border border-slate-200 mt-1 relative">
                        <CreateJobMap 
                          branchCoords={shopLocations[selectedStoreIndex]?.coords || { lat: 13.7417, lng: 100.5526 }} 
                          pickupCoords={isPickup ? pickupCoords : null}
                          deliveryCoords={isDelivery ? deliveryCoords : null}
                          onMarkerDrag={(type, coords) => {
                            if (type === 'pickup') {
                              setPickupCoords(coords);
                              setSelectedStoreIndex(getClosestShopIndex(coords, shopLocations));
                              if (!isDeliveryDirty) {
                                setDeliveryCoords(coords);
                              }
                            } else if (type === 'delivery') {
                              setDeliveryCoords(coords);
                              setIsDeliveryDirty(true);
                              if (!isPickup) {
                                setSelectedStoreIndex(getClosestShopIndex(coords, shopLocations));
                              }
                            }
                          }}
                          onDistanceCalculated={(p, d) => {
                            setPickupDist(p);
                            setDeliveryDist(d);
                          }}
                        />
                      </div>
                    </motion.div>

                    {/* COL 3: Fulfillment & Summary (span 4) */}
                    <motion.div
                      className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto pl-1 pb-4 lg:pb-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3 }}
                    >
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4 flex-1 flex flex-col">
                        <div className="space-y-2">
                          <Label htmlFor="schedule" className="flex items-center gap-1.5 text-xs font-medium">
                            <Clock size={14} className="text-amber-500" />
                            Pickup Scheduled Time & Rider
                          </Label>
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              id="schedule-pickup"
                              type="time"
                              value={pickupScheduledTime}
                              onChange={(e) => setPickupScheduledTime(e.target.value)}
                              className="h-8 text-xs"
                            />
                            <select
                              className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                              value={pickupRiderId}
                              onChange={(e) => setPickupRiderId(e.target.value)}
                            >
                              <option value="">-- Assign Rider --</option>
                              {riders.map(r => (
                                <option key={`p-${r.id}`} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                          </div>
                          <p className="text-[10px] text-slate-500">Delivery assignment handled later.</p>
                        </div>

                        {/* Laundry Bag Photo Upload */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <Label className="flex items-center gap-1.5 text-xs font-medium">
                            <Package size={14} className="text-indigo-600" />
                            Laundry Bag Photos
                          </Label>
                          <MultiImageUploader
                            ref={uploaderRef}
                            entityType="job"
                            entityId={Date.now().toString()} // Temp ID since job isn't created yet
                            subType="bags"
                            value={bagImageUrls}
                            onValueChange={setBagImageUrls}
                            maxFiles={5}
                          />
                        </div>

                        {/* Admin Notes & Options */}
                        <div className="space-y-3 pt-4 border-t border-slate-100 mt-auto">
                          <div className="grid grid-cols-2 gap-3 mt-1">
                            <Label className={`flex items-center justify-center gap-2 cursor-pointer p-2 border rounded-lg transition-colors ${handoverType === "meet" ? 'border-indigo-600 bg-indigo-50 font-medium' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <input 
                                type="radio" 
                                name="handoverType"
                                className="hidden"
                                checked={handoverType === "meet"}
                                onChange={() => setHandoverType("meet")}
                              />
                              <span className="text-xs text-slate-900">นัดรับ / เจอตัว</span>
                            </Label>
                            <Label className={`flex items-center justify-center gap-2 cursor-pointer p-2 border rounded-lg transition-colors ${handoverType === "lobby" ? 'border-indigo-600 bg-indigo-50 font-medium' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <input 
                                type="radio" 
                                name="handoverType"
                                className="hidden"
                                checked={handoverType === "lobby"}
                                onChange={() => setHandoverType("lobby")}
                              />
                              <span className="text-xs text-slate-900">ฝาก Lobby</span>
                            </Label>
                          </div>

                          {!showAdminNote ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs border-dashed border-slate-300 text-slate-500 hover:text-slate-700"
                              onClick={() => setShowAdminNote(true)}
                            >
                              <Plus size={14} className="mr-1" /> Add Admin Note
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <Label htmlFor="adminNote" className="text-xs font-medium text-slate-500">Admin Note</Label>
                              <Input
                                id="adminNote"
                                placeholder="Enter instructions..."
                                value={adminNote}
                                onChange={(e) => setAdminNote(e.target.value)}
                                className="h-8 text-xs bg-white"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Summary Card */}
                      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md shrink-0">
                        <div className="flex flex-col gap-1 mb-2 pb-2 border-b border-slate-700">
                          {isPickup && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-400">Pickup Dist.</span>
                              <span className="text-xs font-medium">{pickupDist} km (×2)</span>
                            </div>
                          )}
                          {isDelivery && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-400">Delivery Dist.</span>
                              <span className="text-xs font-medium">{deliveryDist} km</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex justify-between items-center mb-2">
                          <Label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-slate-800"
                              checked={isFreeDelivery}
                              onChange={(e) => setIsFreeDelivery(e.target.checked)}
                            />
                            <span className="text-sm font-medium text-slate-300">ส่งฟรี (Free)</span>
                          </Label>
                        </div>

                        <div className="flex justify-between items-end">
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-400">Total Fee</span>
                            <span className="text-[10px] text-slate-500">Min 30฿</span>
                          </div>
                          <div className="text-right">
                            {isFreeDelivery && <span className="text-sm line-through text-slate-500 mr-2">฿{baseFee.toFixed(0)}</span>}
                            <span className={`text-2xl font-bold ${isFreeDelivery ? 'text-emerald-400' : 'text-white'}`}>฿{fee.toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>

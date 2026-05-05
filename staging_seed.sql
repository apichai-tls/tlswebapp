-- Seed default Price List
INSERT INTO "PriceList" (id, name, "isDefault", "servicePrices") 
VALUES ('regular', 'Regular (Standard Pricing)', true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Seed default Branches (ShopLocations)
INSERT INTO "ShopLocation" (id, name, address, lat, lng) VALUES 
('shop-main', 'Main branch', '220/13, Sukhumvit 1/1, Sukhumvit Road, North Klongtoey, Wattana, Bangkok 10110.', 13.7417, 100.5526),
('shop-head', 'Head Office', '12/500, 15 Sukhumvit Residences, G/F, Sukhumvit 15, North Klongtoey Wattana, Bangkok 10110.', 13.7438, 100.5583),
('shop-rhythm', 'Rhythm Asoke', '299/1, Rhythm Asoke, Asoke Din-Deang Road, Makkasan, Ratchathewi Bangkok 10400', 13.7540, 100.5645)
ON CONFLICT (id) DO NOTHING;

-- Seed basic Service Items
INSERT INTO "ServiceItem" (id, name, price, "memberPrice", category, unit) VALUES
('srv-wash-fold', 'Wash & Fold', 120, 100, 'Laundry', 'kg'),
('srv-wash-iron', 'Wash & Iron', 150, 130, 'Laundry', 'kg'),
('srv-dry-clean', 'Dry Cleaning', 200, 180, 'Specialty', 'piece')
ON CONFLICT (id) DO NOTHING;

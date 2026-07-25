CREATE TABLE IF NOT EXISTS legacy_flex_systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id VARCHAR(50) NOT NULL,
    bundle_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    flex_count INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    system_type VARCHAR(50) DEFAULT 'كلاسيك',
    color VARCHAR(20) DEFAULT '#E60000',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS legacy_flex_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    system_id UUID REFERENCES legacy_flex_systems(id) ON DELETE CASCADE,
    msisdn VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    error_reason TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert STATIC_BUNDLES
INSERT INTO legacy_flex_systems (system_id, bundle_id, product_id, name, price, flex_count, priority)
VALUES
('SYS_35', 'BUN_35', 'Flex_2024_625', 'فليكس 35', 35, 1400, 1),
('SYS_40', 'BUN_40', 'Flex_2021_511', 'فليكس 40', 40, 1800, 2),
('SYS_45', 'BUN_45', 'Flex_2024_627', 'فليكس 45', 45, 2000, 3),
('SYS_60', 'BUN_60', 'Flex_2021_513', 'فليكس 60', 60, 2700, 4),
('SYS_70', 'BUN_70', 'Flex_2024_629', 'فليكس 70', 70, 3200, 5),
('SYS_90', 'BUN_90', 'Flex_2021_515', 'فليكس 90', 90, 4300, 6),
('SYS_100', 'BUN_100', 'Flex_2024_631', 'فليكس 100', 100, 5000, 7),
('SYS_130', 'BUN_130', 'Flex_2021_517', 'فليكس 130', 130, 6500, 8),
('SYS_150', 'BUN_150', 'Flex_2024_633', 'فليكس 150', 150, 8000, 9),
('SYS_260', 'BUN_260', 'Flex_2021_523', 'فليكس 260', 260, 13000, 10),
('SYS_280', 'BUN_280', 'Flex_2024_635', 'فليكس 280', 280, 14500, 11),
('SYS_300', 'BUN_300', 'Flex_2024_637', 'فليكس 300', 300, 16000, 12)
ON CONFLICT DO NOTHING;

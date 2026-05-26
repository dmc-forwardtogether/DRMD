-- 010_brand_refactor: Remove is_default, add brand_type (业主/客户品牌)
-- ============================================================

-- ============================================
-- PART 1: Remove is_default from brands
-- ============================================
DROP INDEX IF EXISTS idx_brands_entity_default;
ALTER TABLE brands DROP COLUMN IF EXISTS is_default;

-- ============================================
-- PART 2: Add brand_type column
--   owner   = 业主品牌（房东，如银泰城）
--   customer = 客户品牌（租户，如肯德基）
--   both    = 两者皆可（如山姆会员超市）
-- ============================================
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS brand_type TEXT
  CHECK (brand_type IN ('owner', 'customer', 'both'));

-- ============================================
-- PART 3: Set reasonable defaults for existing data
-- ============================================
-- 商场系列品牌默认设为业主品牌
UPDATE brands SET brand_type = 'owner'
WHERE name IN ('万达广场', '万象城', '万象天地', '大悦城', 'K11',
               '太古里', 'IFC/IFS', '来福士', '恒隆广场', '龙湖天街', '印象城')
  AND brand_type IS NULL;

-- 其余品牌默认设为客户品牌
UPDATE brands SET brand_type = 'customer' WHERE brand_type IS NULL;

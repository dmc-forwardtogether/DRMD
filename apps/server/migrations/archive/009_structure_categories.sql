-- 009_structure_categories: 建筑分类持久化 + 商业属性 + 品牌类别
-- ============================================================

-- ============================================
-- PART 1: 建筑分类表（持久化，替代硬编码）
-- ============================================
CREATE TABLE structure_categories (
  id                SMALLSERIAL PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,        -- 'mall', 'shop', 'office', etc.
  name              TEXT NOT NULL,               -- '商场', '店铺', '写字楼'...
  can_be_commercial BOOLEAN NOT NULL DEFAULT FALSE, -- 是否可作为商业品牌分店
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 种子数据
INSERT INTO structure_categories (code, name, can_be_commercial, sort_order) VALUES
  ('mall',         '商场',     TRUE,  1),
  ('shop',         '店铺',     TRUE,  2),
  ('office',       '写字楼',   TRUE,  3),
  ('residential',  '住宅',     TRUE,  4),
  ('park',         '公园',     TRUE,  5),
  ('school',       '学校',     FALSE, 6),
  ('road',         '道路',     FALSE, 7),
  ('river',        '水系',     FALSE, 8),
  ('other',        '其他',     FALSE, 9)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  can_be_commercial = EXCLUDED.can_be_commercial,
  sort_order = EXCLUDED.sort_order;

-- ============================================
-- PART 2: structures 表关联分类
-- ============================================
ALTER TABLE structures
  ADD COLUMN IF NOT EXISTS category_id INT REFERENCES structure_categories(id) ON DELETE SET NULL;

-- 回填已有数据: 按 structure_subtype 匹配
UPDATE structures s SET category_id = sc.id
FROM structure_categories sc
WHERE s.structure_subtype = sc.code AND s.category_id IS NULL;

-- ============================================
-- PART 3: brands 表增加类别字段
-- ============================================
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS category TEXT;  -- 品牌类别，如'餐饮','零售','服饰','数码'...

-- ============================================
-- PART 4: 删除所有兜底品牌 + 移除自动创建逻辑
--   兜底品牌（is_default=TRUE）在新逻辑下不再需要
-- ============================================
DELETE FROM brands WHERE is_default = TRUE;

-- 防止 entity 创建时自动生成兜底品牌已在应用层移除（见 configRoutes.ts）

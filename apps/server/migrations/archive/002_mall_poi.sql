-- 002_mall_poi: 精细化商场 + POI分类 + 父子挂载
-- ============================================

-- 1. Fix: add 'commercial' to feature_type CHECK constraint
ALTER TABLE features DROP CONSTRAINT IF EXISTS features_feature_type_check;
ALTER TABLE features ADD CONSTRAINT features_feature_type_check
  CHECK (feature_type IN ('residential', 'commercial', 'road', 'poi'));

-- 2. POI 一级分类表
CREATE TABLE IF NOT EXISTS poi_categories (
  id   SMALLSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- e.g. 'dining', 'retail', 'entertainment', 'service'
  name TEXT NOT NULL,                 -- e.g. '餐饮', '零售', '娱乐', '服务'
  icon TEXT,                          -- optional icon identifier
  sort_order INT NOT NULL DEFAULT 0
);

-- 3. 商场精细化属性表 (one profile per commercial feature)
CREATE TABLE IF NOT EXISTS mall_profiles (
  id               BIGSERIAL PRIMARY KEY,
  feature_id       BIGINT NOT NULL UNIQUE REFERENCES features(id) ON DELETE CASCADE,
  -- 基础属性
  commercial_area_sqm   NUMERIC(12,2),   -- 商业面积（总建筑面积）
  rentable_area_sqm     NUMERIC(12,2),   -- 可租售面积
  floor_count           SMALLINT,        -- 楼层数（地上）
  opening_date          DATE,            -- 开业时间
  -- 扩展预留
  extra_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 为 features 添加父子关系 + POI来源/分类
ALTER TABLE features
  ADD COLUMN IF NOT EXISTS parent_feature_id BIGINT REFERENCES features(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS poi_source        TEXT,              -- 'manual' | 'amap' | 'osm' | 'brand_official' | 'dianping'
  ADD COLUMN IF NOT EXISTS poi_category_id   INT REFERENCES poi_categories(id) ON DELETE SET NULL;

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_features_parent ON features(parent_feature_id);
CREATE INDEX IF NOT EXISTS idx_features_poi_category ON features(poi_category_id);
CREATE INDEX IF NOT EXISTS idx_mall_profiles_feature ON mall_profiles(feature_id);

-- 6. mall_profiles 自动更新时间触发器
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mall_profiles_touch ON mall_profiles;
CREATE TRIGGER trg_mall_profiles_touch
  BEFORE UPDATE ON mall_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 7. 种子数据：默认POI一级分类
INSERT INTO poi_categories (code, name, sort_order) VALUES
  ('dining',        '餐饮',     1),
  ('retail',        '零售',     2),
  ('entertainment', '娱乐',     3),
  ('service',       '服务',     4)
ON CONFLICT (code) DO NOTHING;

-- 007_admin_brand_icons: 行政区划表 + 品牌图标 + 店铺品牌实体
-- ============================================================

-- ============================================
-- PART 1: 行政区划表 (参考 TREK atlas 模式)
--   支持国家/省/市/区县 多级行政区
--   每个行政区可选 PostGIS geometry 用于空间分析
-- ============================================
CREATE TABLE IF NOT EXISTS admin_districts (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,          -- 行政区划代码 (如 330106 = 杭州西湖区)
  name            TEXT NOT NULL,                 -- 名称
  level           TEXT NOT NULL CHECK (level IN ('country', 'province', 'city', 'district')),
  parent_code     TEXT REFERENCES admin_districts(code) ON DELETE SET NULL,
  full_name       TEXT,                          -- 全称: 浙江省杭州市西湖区
  center_lng      DOUBLE PRECISION,
  center_lat      DOUBLE PRECISION,
  geom            geometry(GEOMETRY, 4326),      -- PostGIS 边界 (可选)
  population      INT,                           -- 人口 (可选)
  extra_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_districts_parent ON admin_districts(parent_code);
CREATE INDEX IF NOT EXISTS idx_admin_districts_level ON admin_districts(level);
CREATE INDEX IF NOT EXISTS idx_admin_districts_geom ON admin_districts USING GIST (geom);

DROP TRIGGER IF EXISTS trg_admin_districts_touch ON admin_districts;
CREATE TRIGGER trg_admin_districts_touch
  BEFORE UPDATE ON admin_districts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================
-- PART 2: 建筑挂载行政区 (多对多)
-- ============================================
CREATE TABLE IF NOT EXISTS structure_districts (
  structure_id  BIGINT NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  district_code TEXT NOT NULL REFERENCES admin_districts(code) ON DELETE CASCADE,
  relation      TEXT NOT NULL DEFAULT 'located_in' CHECK (relation IN ('located_in', 'serves', 'boundary')),
  PRIMARY KEY (structure_id, district_code)
);

-- ============================================
-- PART 3: 品牌图标
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'icon'
  ) THEN
    ALTER TABLE brands ADD COLUMN icon TEXT DEFAULT NULL;
  END IF;
END $$;

-- ============================================
-- PART 4: 种子数据 — 中国行政区 (部分)
-- ============================================
INSERT INTO admin_districts (code, name, level, parent_code, full_name, center_lng, center_lat) VALUES
  ('CN',    '中国',    'country',  NULL,  '中华人民共和国', 104.0, 35.0),
  ('11',    '北京市',  'province', 'CN',  '北京市',         116.4, 39.9),
  ('31',    '上海市',  'province', 'CN',  '上海市',         121.47, 31.23),
  ('44',    '广东省',  'province', 'CN',  '广东省',         113.28, 23.13),
  ('33',    '浙江省',  'province', 'CN',  '浙江省',         120.15, 30.28),
  ('51',    '四川省',  'province', 'CN',  '四川省',         104.07, 30.67),
  ('110101', '东城区', 'district', '11', '北京市东城区',   116.42, 39.93),
  ('110105', '朝阳区', 'district', '11', '北京市朝阳区',   116.44, 39.92),
  ('330106', '西湖区', 'district', '33', '浙江省杭州市西湖区', 120.13, 30.27),
  ('330108', '滨江区', 'district', '33', '浙江省杭州市滨江区', 120.21, 30.21),
  ('440305', '南山区', 'district', '44', '广东省深圳市南山区', 113.93, 22.53),
  ('440304', '福田区', 'district', '44', '广东省深圳市福田区', 114.05, 22.52)
ON CONFLICT (code) DO NOTHING;

SELECT setval('admin_districts_id_seq', (SELECT COALESCE(MAX(id), 0) FROM admin_districts));

-- ============================================
-- PART 5: 店铺品牌实体
--   为经典店铺品牌创建独立的 entity 和 brand
-- ============================================

-- 5a. 创建餐饮/零售品牌实体
INSERT INTO entities (id, name, type, geo_scope, location) VALUES
  (20, '星巴克',           '企业', '国际', '西雅图'),
  (21, '喜茶',             '企业', '全国', '深圳'),
  (22, 'Apple',            '企业', '国际', '库比蒂诺'),
  (23, '無印良品',         '企业', '国际', '东京'),
  (24, '优衣库',           '企业', '国际', '东京'),
  (25, '奈雪的茶',         '企业', '全国', '深圳'),
  (26, '泡泡玛特',         '企业', '全国', '北京'),
  (27, '海底捞',           '企业', '国际', '成都'),
  (28, 'Inditex (ZARA)',   '企业', '国际', '拉科鲁尼亚'),
  (29, '麦当劳',           '企业', '国际', '芝加哥'),
  (30, '百胜餐饮 (KFC)',   '企业', '国际', '路易斯维尔'),
  (31, '蔚来汽车',         '企业', '国际', '上海'),
  (32, '霸王茶姬',         '企业', '全国', '昆明'),
  (33, '迪卡侬',           '企业', '国际', '里尔'),
  (34, '乐高',             '企业', '国际', '比隆'),
  (35, '海马体',           '企业', '全国', '杭州'),
  (36, '西西弗',           '企业', '全国', '重庆'),
  (37, '太二酸菜鱼',       '企业', '全国', '广州'),
  (38, '西贝莜面村',       '企业', '全国', '呼和浩特'),
  (39, 'MANNER COFFEE',    '企业', '全国', '上海'),
  (40, 'H&M',              '企业', '国际', '斯德哥尔摩')
ON CONFLICT DO NOTHING;

SELECT setval('entities_id_seq', (SELECT COALESCE(MAX(id), 0) FROM entities));

-- 5b. 为每个店铺品牌实体创建品牌系列
INSERT INTO brands (name, entity_id, sort_order, icon) VALUES
  ('星巴克臻选',   20, 1, '☕'),
  ('喜茶 LAB',     21, 1, '🍵'),
  ('Apple Store',  22, 1, '🍎'),
  ('MUJI',         23, 1, '🛒'),
  ('UNIQLO',       24, 1, '👕'),
  ('奈雪的茶',     25, 1, '🍰'),
  ('POP MART',     26, 1, '🧸'),
  ('海底捞火锅',   27, 1, '🍲'),
  ('ZARA',         28, 1, '🛍️'),
  ('麦当劳',       29, 1, '🍔'),
  ('肯德基',       30, 1, '🍗'),
  ('NIO House',    31, 1, '🚗'),
  ('霸王茶姬',     32, 1, '🍶'),
  ('Decathlon',    33, 1, '🏃'),
  ('LEGO Store',   34, 1, '🧱'),
  ('海马体照相馆', 35, 1, '📸'),
  ('西西弗书店',   36, 1, '📚'),
  ('太二酸菜鱼',   37, 1, '🐟'),
  ('西贝莜面村',   38, 1, '🥟'),
  ('MANNER',       39, 1, '☕'),
  ('H&M',          40, 1, '👗')
ON CONFLICT (entity_id, name) DO NOTHING;

-- 5c. 兜底品牌
INSERT INTO brands (name, entity_id, is_default, sort_order) 
SELECT '非标/其他', e.id, TRUE, 99
FROM entities e
WHERE e.id >= 20 AND e.id <= 40
  AND NOT EXISTS (SELECT 1 FROM brands WHERE entity_id = e.id AND is_default = TRUE)
ON CONFLICT DO NOTHING;

SELECT setval('brands_id_seq', (SELECT COALESCE(MAX(id), 0) FROM brands));

-- 5d. 更新种子 shop structures 关联品牌
-- 深圳万象城内的店铺
UPDATE structures SET operator_entity_id = 20 WHERE id = 200; -- 星巴克臻选
UPDATE structures SET operator_entity_id = 21 WHERE id = 201; -- 喜茶 LAB
UPDATE structures SET operator_entity_id = 22 WHERE id = 202; -- Apple Store
UPDATE structures SET operator_entity_id = 23 WHERE id = 203; -- MUJI
UPDATE structures SET operator_entity_id = 24 WHERE id = 204; -- UNIQLO
UPDATE structures SET operator_entity_id = 25 WHERE id = 205; -- 奈雪的茶
UPDATE structures SET operator_entity_id = 26 WHERE id = 206; -- POP MART
UPDATE structures SET operator_entity_id = 35 WHERE id = 207; -- 海马体
UPDATE structures SET operator_entity_id = 36 WHERE id = 208; -- 西西弗
UPDATE structures SET operator_entity_id = 34 WHERE id = 209; -- LEGO
UPDATE structures SET operator_entity_id = 33 WHERE id = 210; -- Decathlon
UPDATE structures SET operator_entity_id = 29 WHERE id = 212; -- 麦当劳
UPDATE structures SET operator_entity_id = 30 WHERE id = 213; -- KFC

-- 北京大悦城内的店铺
UPDATE structures SET operator_entity_id = 27 WHERE id = 220; -- 海底捞
UPDATE structures SET operator_entity_id = 28 WHERE id = 221; -- ZARA
UPDATE structures SET operator_entity_id = 40 WHERE id = 222; -- H&M
UPDATE structures SET operator_entity_id = 37 WHERE id = 223; -- 太二
UPDATE structures SET operator_entity_id = 38 WHERE id = 224; -- 西贝
UPDATE structures SET operator_entity_id = 31 WHERE id = 225; -- NIO House
UPDATE structures SET operator_entity_id = 39 WHERE id = 226; -- MANNER
UPDATE structures SET operator_entity_id = 32 WHERE id = 227; -- 霸王茶姬

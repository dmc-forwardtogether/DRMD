-- ============================================================
-- DRMD v0.1.0 Seed Data
-- Applied after 001_init.sql (schema)
-- ============================================================

-- ============================================================
-- POI Categories
-- ============================================================
INSERT INTO poi_categories (code, name, sort_order) VALUES
  ('dining',        '餐饮',     1),
  ('retail',        '零售',     2),
  ('entertainment', '娱乐',     3),
  ('service',       '服务',     4)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Structure Categories
-- ============================================================
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

-- ============================================================
-- Entities (企业/品牌主体)
-- ============================================================

-- 商业地产开发商
INSERT INTO entities (id, name, type, geo_scope, location) VALUES
  (1,  '万达集团',     '企业', '全国', '北京'),
  (2,  '华润置地',     '企业', '全国', '深圳'),
  (3,  '中粮集团',     '企业', '全国', '北京'),
  (4,  '新世界发展',   '企业', '全国', '香港'),
  (5,  '太古地产',     '企业', '全国', '香港'),
  (6,  '九龙仓',       '企业', '全国', '香港'),
  (7,  '凯德集团',     '企业', '国际', '新加坡'),
  (8,  '恒隆地产',     '企业', '全国', '香港'),
  (9,  '龙湖集团',     '企业', '全国', '重庆'),
  (10, '印力集团',     '企业', '全国', '深圳')
ON CONFLICT (id) DO NOTHING;

-- 餐饮/零售品牌实体
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
  (36, '西西弗',           '企业', '全国', '重庆')
ON CONFLICT (id) DO NOTHING;

-- Fix sequence after explicit ID inserts
SELECT setval('entities_id_seq', (SELECT COALESCE(MAX(id), 0) FROM entities));

-- ============================================================
-- Brands (品牌)
-- 使用 ON CONFLICT (entity_id, name) 兼容旧数据库已有数据
-- 先尝试 UPSERT 已有品牌（更新评分），再插入新品牌
-- ============================================================

-- 商场品牌系列 (owner brands) — 不指定 ID，让序列自动生成
INSERT INTO brands (name, entity_id, brand_type, sort_order) VALUES
  ('万达广场',   1,  'owner', 1),
  ('万象城',     2,  'owner', 2),
  ('万象天地',   2,  'owner', 3),
  ('大悦城',     3,  'owner', 4),
  ('K11',        4,  'owner', 5),
  ('太古里',     5,  'owner', 6),
  ('IFC/IFS',    6,  'owner', 7),
  ('来福士',     7,  'owner', 8),
  ('恒隆广场',   8,  'owner', 9),
  ('龙湖天街',   9,  'owner', 10),
  ('印象城',     10, 'owner', 11)
ON CONFLICT (entity_id, name) DO NOTHING;

-- 店铺品牌 (customer brands) — 不指定 ID，让序列自动生成
INSERT INTO brands (name, entity_id, brand_type, influence_score, avg_spend_score, topic_score, sort_order, category) VALUES
  -- 餐饮
  ('星巴克',      20, 'customer', 8, 5, 7,  1, '餐饮'),
  ('喜茶',        21, 'customer', 7, 4, 8,  2, '餐饮'),
  ('海底捞',      27, 'customer', 8, 7, 8,  3, '餐饮'),
  ('麦当劳',      29, 'customer', 9, 3, 8,  4, '餐饮'),
  ('肯德基',      30, 'customer', 9, 4, 8,  5, '餐饮'),
  ('奈雪的茶',    25, 'customer', 6, 4, 7,  6, '餐饮'),
  ('霸王茶姬',    32, 'customer', 6, 4, 8,  7, '餐饮'),
  -- 零售
  ('Apple Store', 22, 'customer', 10, 8, 9, 10, '数码'),
  ('优衣库',      24, 'customer', 7, 5, 6,  11, '服饰'),
  ('ZARA',        28, 'customer', 7, 6, 6,  12, '服饰'),
  ('無印良品',    23, 'customer', 7, 6, 5,  13, '生活'),
  ('迪卡侬',      33, 'customer', 8, 5, 6,  14, '运动'),
  ('乐高',        34, 'customer', 8, 7, 8,  15, '玩具'),
  ('泡泡玛特',    26, 'customer', 6, 5, 9,  16, '潮玩'),
  ('蔚来汽车',    31, 'customer', 8, 9, 8,  17, '汽车'),
  -- 服务
  ('海马体',      35, 'customer', 5, 6, 7,  20, '摄影'),
  ('西西弗书店',  36, 'customer', 7, 5, 7,  21, '书店')
ON CONFLICT (entity_id, name) DO NOTHING;

SELECT setval('brands_id_seq', (SELECT COALESCE(MAX(id), 0) FROM brands));

-- ============================================================
-- Admin Districts (中国行政区 种子数据)
-- ============================================================
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

-- 006_shop_nesting: 店铺子类型 + 建筑嵌套层级 + 序列修复
-- ============================================================

-- ============================================
-- PART 0: 修复序列 (如果 005 已应用且 seed 数据用了显式 ID)
-- ============================================
SELECT setval('entities_id_seq', (SELECT COALESCE(MAX(id), 0) FROM entities));
SELECT setval('brands_id_seq', (SELECT COALESCE(MAX(id), 0) FROM brands));

-- ============================================
-- PART 1: 建筑嵌套层级 (parent_structure_id)
--   店铺可以嵌套在商场内，水系可以嵌套在公园内，等等
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'structures' AND column_name = 'parent_structure_id'
  ) THEN
    ALTER TABLE structures
      ADD COLUMN parent_structure_id BIGINT REFERENCES structures(id) ON DELETE SET NULL;
    CREATE INDEX idx_structures_parent ON structures(parent_structure_id);
  END IF;
END $$;

-- ============================================
-- PART 2: 店铺属性表 (shop_attrs)
--   店铺是商场/写字楼/住宅底商的子建筑
-- ============================================
CREATE TABLE IF NOT EXISTS shop_attrs (
  structure_id    BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  shop_type       TEXT,                    -- '零售','餐饮','服务','娱乐','主力店','快闪'
  floor_location  TEXT,                    -- 'B1','F1','F2','F3',...
  area_sqm        NUMERIC(10,2),
  has_seating     BOOLEAN DEFAULT FALSE,   -- 是否有堂食区 (餐饮类)
  extra_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_shop_attrs_touch ON shop_attrs;
CREATE TRIGGER trg_shop_attrs_touch
  BEFORE UPDATE ON shop_attrs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================
-- PART 3: 店铺打分表
--   客流热度 + 租金坪效 + 品牌匹配度
-- ============================================
CREATE TABLE IF NOT EXISTS shop_scores (
  structure_score_id    INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  foot_traffic_score    SMALLINT NOT NULL CHECK (foot_traffic_score BETWEEN 1 AND 10),
  rent_efficiency_score SMALLINT NOT NULL CHECK (rent_efficiency_score BETWEEN 1 AND 10),
  brand_fit_score       SMALLINT NOT NULL CHECK (brand_fit_score BETWEEN 1 AND 10)
);

CREATE OR REPLACE FUNCTION shop_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE structure_scores
  SET total_score = NEW.foot_traffic_score + NEW.rent_efficiency_score + NEW.brand_fit_score
  WHERE id = NEW.structure_score_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shop_score_total ON shop_scores;
CREATE TRIGGER trg_shop_score_total
  AFTER INSERT OR UPDATE OF foot_traffic_score, rent_efficiency_score, brand_fit_score ON shop_scores
  FOR EACH ROW EXECUTE FUNCTION shop_calc_total_score();

-- ============================================
-- PART 4: 种子数据 — 示例店铺 (嵌套在商场内)
--   需要先有商场 structure 才能插入子店铺
--   这里提供参考 INSERT, 实际由运行时创建
-- ============================================

-- 示例: 为已知品牌添加种子商场结构体
-- (如果 structures 中还没有数据, 创建几个示例商场)
INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, owner_entity_id)
SELECT 100, 1, 'constructed', 'mall', '深圳万象城', 2, 2, 2
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 100);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, owner_entity_id)
SELECT 101, 1, 'constructed', 'mall', '北京大悦城', 4, 3, 3
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 101);

-- 示例店铺: 深圳万象城 (100) 内
INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 200, 1, 'constructed', 'shop', '星巴克臻选', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 200);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 201, 1, 'constructed', 'shop', '喜茶 LAB', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 201);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 202, 1, 'constructed', 'shop', 'Apple Store', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 202);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 203, 1, 'constructed', 'shop', 'MUJI 无印良品', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 203);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 204, 1, 'constructed', 'shop', '优衣库 UNIQLO', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 204);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 205, 1, 'constructed', 'shop', '奈雪的茶', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 205);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 206, 1, 'constructed', 'shop', '泡泡玛特 POP MART', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 206);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 207, 1, 'constructed', 'shop', '海马体照相馆', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 207);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 208, 1, 'constructed', 'shop', '西西弗书店', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 208);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 209, 1, 'constructed', 'shop', 'LEGO 乐高', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 209);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 210, 1, 'constructed', 'shop', '迪卡侬 Decathlon', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 210);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 211, 1, 'constructed', 'shop', '顺电 Sure', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 211);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 212, 1, 'constructed', 'shop', '麦当劳 McDonald''s', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 212);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 213, 1, 'constructed', 'shop', '肯德基 KFC', NULL, NULL, 100
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 213);

-- 示例店铺: 北京大悦城 (101) 内
INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 220, 1, 'constructed', 'shop', '海底捞', NULL, NULL, 101
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 220);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 221, 1, 'constructed', 'shop', 'ZARA', NULL, NULL, 101
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 221);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 222, 1, 'constructed', 'shop', 'H&M', NULL, NULL, 101
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 222);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 223, 1, 'constructed', 'shop', '太二酸菜鱼', NULL, NULL, 101
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 223);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 224, 1, 'constructed', 'shop', '西贝莜面村', NULL, NULL, 101
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 224);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 225, 1, 'constructed', 'shop', '蔚来 NIO House', NULL, NULL, 101
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 225);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 226, 1, 'constructed', 'shop', 'MANNER COFFEE', NULL, NULL, 101
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 226);

INSERT INTO structures (id, project_id, structure_type, structure_subtype, name, brand_id, operator_entity_id, parent_structure_id)
SELECT 227, 1, 'constructed', 'shop', '霸王茶姬', NULL, NULL, 101
WHERE NOT EXISTS (SELECT 1 FROM structures WHERE id = 227);

-- 为种子 structure 推进序列
SELECT setval('structures_id_seq', (SELECT COALESCE(MAX(id), 0) FROM structures));

-- 插入示例 mall_attrs
INSERT INTO mall_attrs (structure_id, commercial_area_sqm, rentable_area_sqm, floor_count, opening_date)
SELECT 100, 188000, 120000, 7, '2004-12-09'
WHERE NOT EXISTS (SELECT 1 FROM mall_attrs WHERE structure_id = 100);

INSERT INTO mall_attrs (structure_id, commercial_area_sqm, rentable_area_sqm, floor_count, opening_date)
SELECT 101, 200000, 140000, 8, '2010-05-28'
WHERE NOT EXISTS (SELECT 1 FROM mall_attrs WHERE structure_id = 101);

-- 插入示例 shop_attrs (深圳万象城内的店铺)
INSERT INTO shop_attrs (structure_id, shop_type, floor_location, area_sqm, has_seating) VALUES
  (200, '餐饮', 'F1', 280, TRUE),
  (201, '餐饮', 'B1', 180, TRUE),
  (202, '零售', 'F1', 850, FALSE),
  (203, '零售', 'F2', 750, FALSE),
  (204, '零售', 'F1', 900, FALSE),
  (205, '餐饮', 'B1', 120, TRUE),
  (206, '零售', 'B1', 65, FALSE),
  (207, '服务', 'F3', 200, FALSE),
  (208, '零售', 'F4', 380, FALSE),
  (209, '零售', 'F3', 200, FALSE),
  (210, '零售', 'B1', 2500, FALSE),
  (211, '零售', 'F4', 600, FALSE),
  (212, '餐饮', 'B1', 350, TRUE),
  (213, '餐饮', 'F1', 300, TRUE)
ON CONFLICT (structure_id) DO NOTHING;

-- 插入示例 shop_attrs (北京大悦城内的店铺)
INSERT INTO shop_attrs (structure_id, shop_type, floor_location, area_sqm, has_seating) VALUES
  (220, '餐饮', 'F5', 900, TRUE),
  (221, '零售', 'F2', 1800, FALSE),
  (222, '零售', 'F1', 1600, FALSE),
  (223, '餐饮', 'F4', 280, TRUE),
  (224, '餐饮', 'F4', 350, TRUE),
  (225, '零售', 'F1', 400, FALSE),
  (226, '餐饮', 'B1', 60, TRUE),
  (227, '餐饮', 'B1', 100, TRUE)
ON CONFLICT (structure_id) DO NOTHING;

-- 005_cti_refactor: 统一建筑抽象 + 主体(Entity) + 品牌(Brand) + CTI 打分体系
-- 方案 C: 重置旧表，采用 Class Table Inheritance
-- ============================================================

-- ============================================
-- PART 0: 清理旧表 & 旧函数
-- ============================================
DROP TABLE IF EXISTS mall_brands CASCADE;
DROP TABLE IF EXISTS mall_brand_groups CASCADE;
DROP TABLE IF EXISTS brands CASCADE;
DROP TABLE IF EXISTS brand_groups CASCADE;
DROP TABLE IF EXISTS mall_profiles CASCADE;

DROP FUNCTION IF EXISTS brand_calc_total_score() CASCADE;

-- ============================================
-- PART 1: 主体 (Entity)
--   替代旧 brand_groups.company 自由文本字段
--   支持企业/政府/事业单位/个人，支持集团层级树
-- ============================================
CREATE TABLE entities (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,                    -- 主体名称
  type            TEXT NOT NULL CHECK (type IN ('企业', '政府', '事业单位', '个人', '其他')),
  geo_scope       TEXT CHECK (geo_scope IN ('国际', '全国', '大区', '省', '市', '区', '本地')),
  location        TEXT,                             -- 总部/驻地，如 '深圳'
  admin_level     TEXT CHECK (admin_level IN ('省', '市', '区县', '乡镇')),
  parent_entity_id INT REFERENCES entities(id) ON DELETE SET NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 政府/事业单位必须有行政级别，企业可以没有
  CONSTRAINT chk_entity_admin_level CHECK (
    (type IN ('政府', '事业单位') AND admin_level IS NOT NULL)
    OR (type NOT IN ('政府', '事业单位'))
  )
);

CREATE INDEX idx_entities_parent ON entities(parent_entity_id);

DROP TRIGGER IF EXISTS trg_entities_touch ON entities;
CREATE TRIGGER trg_entities_touch
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================
-- PART 2: 品牌 (Brand)
--   挂在 Entity 下，替代旧的 brand_groups
--   is_default=TRUE 为"非标/其他"兜底品牌
-- ============================================
CREATE TABLE brands (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  entity_id     INT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  description   TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (entity_id, name)
);

CREATE INDEX idx_brands_entity ON brands(entity_id);

-- 每个 Entity 最多一个 default brand
CREATE UNIQUE INDEX idx_brands_entity_default
  ON brands(entity_id) WHERE is_default = TRUE;

DROP TRIGGER IF EXISTS trg_brands_touch ON brands;
CREATE TRIGGER trg_brands_touch
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================
-- PART 3: 建筑/构筑物基表 (Structure)
--   structure_type: constructed | natural | hybrid
--   structure_subtype: mall | road | school | park | river | office | residential | ...
-- ============================================
CREATE TABLE structures (
  id                  BIGSERIAL PRIMARY KEY,
  project_id          BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_id          BIGINT REFERENCES features(id) ON DELETE SET NULL,
  structure_type      TEXT NOT NULL CHECK (structure_type IN ('constructed', 'natural', 'hybrid')),
  structure_subtype   TEXT NOT NULL,
  name                TEXT,
  brand_id            INT REFERENCES brands(id) ON DELETE SET NULL,
  operator_entity_id  INT REFERENCES entities(id) ON DELETE SET NULL,
  owner_entity_id     INT REFERENCES entities(id) ON DELETE SET NULL,
  parent_structure_id BIGINT REFERENCES structures(id) ON DELETE SET NULL,
  extra_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_structures_project ON structures(project_id);
CREATE INDEX idx_structures_feature ON structures(feature_id);
CREATE INDEX idx_structures_brand ON structures(brand_id);
CREATE INDEX idx_structures_operator ON structures(operator_entity_id);
CREATE INDEX idx_structures_owner ON structures(owner_entity_id);
CREATE INDEX idx_structures_type ON structures(structure_type, structure_subtype);
CREATE INDEX idx_structures_parent ON structures(parent_structure_id);

DROP TRIGGER IF EXISTS trg_structures_touch ON structures;
CREATE TRIGGER trg_structures_touch
  BEFORE UPDATE ON structures
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================
-- PART 4: CTI 子表 — 各类型专用属性
--   每个子表以 structure_id 作为 PK+FK (即 1:1 继承)
-- ============================================

-- 4a. 商场属性 (替代旧 mall_profiles)
CREATE TABLE mall_attrs (
  structure_id        BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  commercial_area_sqm NUMERIC(12,2),
  rentable_area_sqm   NUMERIC(12,2),
  floor_count         SMALLINT,
  opening_date        DATE,
  extra_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_mall_attrs_touch ON mall_attrs;
CREATE TRIGGER trg_mall_attrs_touch
  BEFORE UPDATE ON mall_attrs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 4b. 道路属性
CREATE TABLE road_attrs (
  structure_id  BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  speed_kph     DOUBLE PRECISION,
  capacity      DOUBLE PRECISION,
  lane_count    SMALLINT,
  one_way       BOOLEAN NOT NULL DEFAULT FALSE,
  road_class    TEXT,                      -- '快速路', '主干道', '次干道', '支路', '步行街'
  extra_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_road_attrs_touch ON road_attrs;
CREATE TRIGGER trg_road_attrs_touch
  BEFORE UPDATE ON road_attrs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 4c. 学校属性
CREATE TABLE school_attrs (
  structure_id    BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  edu_level       TEXT,                    -- '幼儿园','小学','初中','高中','大学','职业学校'
  student_count   INT,
  teacher_count   INT,
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  extra_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_school_attrs_touch ON school_attrs;
CREATE TRIGGER trg_school_attrs_touch
  BEFORE UPDATE ON school_attrs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 4d. 公园/广场属性
CREATE TABLE park_attrs (
  structure_id        BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  area_sqm            NUMERIC(12,2),
  green_coverage_pct  NUMERIC(5,2),
  amenity_count       INT DEFAULT 0,
  extra_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_park_attrs_touch ON park_attrs;
CREATE TRIGGER trg_park_attrs_touch
  BEFORE UPDATE ON park_attrs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 4e. 水系/河流属性
CREATE TABLE river_attrs (
  structure_id  BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  width_m       NUMERIC(8,2),
  water_type    TEXT,                      -- '河流','湖泊','水库','湿地','人工湖'
  flood_season  TEXT,
  extra_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_river_attrs_touch ON river_attrs;
CREATE TRIGGER trg_river_attrs_touch
  BEFORE UPDATE ON river_attrs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================
-- PART 5: CTI 打分体系
--   基表存公共字段，子表存各类型专属打分维度
--   触发器自动汇总 total_score（后续可按论文方法加权）
-- ============================================

-- 5a. 打分基表
CREATE TABLE structure_scores (
  id            SERIAL PRIMARY KEY,
  structure_id  BIGINT NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  scored_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score_version TEXT NOT NULL DEFAULT '1.0',
  total_score   NUMERIC(8,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scores_structure ON structure_scores(structure_id);
CREATE INDEX idx_scores_scored_at ON structure_scores(scored_at);

-- 5b. 商场打分: 影响力 + 客单价 + 话题度
CREATE TABLE mall_scores (
  structure_score_id  INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  influence_score     SMALLINT NOT NULL CHECK (influence_score BETWEEN 1 AND 10),
  avg_spend_score     SMALLINT NOT NULL CHECK (avg_spend_score BETWEEN 1 AND 10),
  topic_score         SMALLINT NOT NULL CHECK (topic_score BETWEEN 1 AND 10)
);

-- 5c. 道路打分: 连通度 + 交通流量 + 路况品质
CREATE TABLE road_scores (
  structure_score_id    INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  connectivity_score    SMALLINT NOT NULL CHECK (connectivity_score BETWEEN 1 AND 10),
  traffic_volume_score  SMALLINT NOT NULL CHECK (traffic_volume_score BETWEEN 1 AND 10),
  road_quality_score    SMALLINT NOT NULL CHECK (road_quality_score BETWEEN 1 AND 10)
);

-- 5d. 学校打分: 学术声誉 + 设施 + 师资比
CREATE TABLE school_scores (
  structure_score_id  INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  academic_rep_score  SMALLINT NOT NULL CHECK (academic_rep_score BETWEEN 1 AND 10),
  facilities_score    SMALLINT NOT NULL CHECK (facilities_score BETWEEN 1 AND 10),
  teacher_ratio_score SMALLINT NOT NULL CHECK (teacher_ratio_score BETWEEN 1 AND 10)
);

-- 5e. 公园打分: 可达性 + 设施密度 + 绿化品质
CREATE TABLE park_scores (
  structure_score_id    INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  accessibility_score   SMALLINT NOT NULL CHECK (accessibility_score BETWEEN 1 AND 10),
  amenity_density_score SMALLINT NOT NULL CHECK (amenity_density_score BETWEEN 1 AND 10),
  green_quality_score   SMALLINT NOT NULL CHECK (green_quality_score BETWEEN 1 AND 10)
);

-- ============================================
-- PART 6: 自动计算 total_score 的触发器
--   当前阶段: 简单求和; 后续可替换为加权/熵权法
-- ============================================

CREATE OR REPLACE FUNCTION mall_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE structure_scores
  SET total_score = NEW.influence_score + NEW.avg_spend_score + NEW.topic_score
  WHERE id = NEW.structure_score_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mall_score_total ON mall_scores;
CREATE TRIGGER trg_mall_score_total
  AFTER INSERT OR UPDATE OF influence_score, avg_spend_score, topic_score ON mall_scores
  FOR EACH ROW EXECUTE FUNCTION mall_calc_total_score();

-- --

CREATE OR REPLACE FUNCTION road_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE structure_scores
  SET total_score = NEW.connectivity_score + NEW.traffic_volume_score + NEW.road_quality_score
  WHERE id = NEW.structure_score_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_road_score_total ON road_scores;
CREATE TRIGGER trg_road_score_total
  AFTER INSERT OR UPDATE OF connectivity_score, traffic_volume_score, road_quality_score ON road_scores
  FOR EACH ROW EXECUTE FUNCTION road_calc_total_score();

-- --

CREATE OR REPLACE FUNCTION school_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE structure_scores
  SET total_score = NEW.academic_rep_score + NEW.facilities_score + NEW.teacher_ratio_score
  WHERE id = NEW.structure_score_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_school_score_total ON school_scores;
CREATE TRIGGER trg_school_score_total
  AFTER INSERT OR UPDATE OF academic_rep_score, facilities_score, teacher_ratio_score ON school_scores
  FOR EACH ROW EXECUTE FUNCTION school_calc_total_score();

-- --

CREATE OR REPLACE FUNCTION park_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE structure_scores
  SET total_score = NEW.accessibility_score + NEW.amenity_density_score + NEW.green_quality_score
  WHERE id = NEW.structure_score_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_park_score_total ON park_scores;
CREATE TRIGGER trg_park_score_total
  AFTER INSERT OR UPDATE OF accessibility_score, amenity_density_score, green_quality_score ON park_scores
  FOR EACH ROW EXECUTE FUNCTION park_calc_total_score();

-- ============================================
-- PART 7: 种子数据
-- ============================================

-- 7a. 商业运营实体
INSERT INTO entities (id, name, type, geo_scope, location) VALUES
  (1,  '万达集团',     '企业', '全国',   '北京'),
  (2,  '华润置地',     '企业', '全国',   '深圳'),
  (3,  '中粮集团',     '企业', '全国',   '北京'),
  (4,  '新世界发展',   '企业', '全国',   '香港'),
  (5,  '太古地产',     '企业', '全国',   '香港'),
  (6,  '九龙仓',       '企业', '全国',   '香港'),
  (7,  '凯德集团',     '企业', '国际',   '新加坡'),
  (8,  '恒隆地产',     '企业', '全国',   '香港'),
  (9,  '龙湖集团',     '企业', '全国',   '重庆'),
  (10, '印力集团',     '企业', '全国',   '深圳')
ON CONFLICT DO NOTHING;

-- 7b. 品牌系列（挂在 Entity 下）
INSERT INTO brands (id, name, entity_id, sort_order) VALUES
  (1,  '万达广场',   1,  1),
  (2,  '万象城',     2,  1),
  (3,  '万象天地',   2,  2),
  (4,  '大悦城',     3,  1),
  (5,  'K11',        4,  1),
  (6,  '太古里',     5,  1),
  (7,  'IFC/IFS',    6,  1),
  (8,  '来福士',     7,  1),
  (9,  '恒隆广场',   8,  1),
  (10, '龙湖天街',   9,  1),
  (11, '印象城',     10, 1)
ON CONFLICT DO NOTHING;

-- 7c. 每个 Entity 的默认"非标"品牌
INSERT INTO brands (name, entity_id, is_default, sort_order) VALUES
  ('非标/其他', 1,  TRUE, 99),
  ('非标/其他', 2,  TRUE, 99),
  ('非标/其他', 3,  TRUE, 99),
  ('非标/其他', 4,  TRUE, 99),
  ('非标/其他', 5,  TRUE, 99),
  ('非标/其他', 6,  TRUE, 99),
  ('非标/其他', 7,  TRUE, 99),
  ('非标/其他', 8,  TRUE, 99),
  ('非标/其他', 9,  TRUE, 99),
  ('非标/其他', 10, TRUE, 99)
ON CONFLICT DO NOTHING;

-- 7d. 修复序列 (seed data 使用显式 ID 后必须推进序列, 否则新插入会冲突)
SELECT setval('entities_id_seq', (SELECT COALESCE(MAX(id), 0) FROM entities));
SELECT setval('brands_id_seq', (SELECT COALESCE(MAX(id), 0) FROM brands));

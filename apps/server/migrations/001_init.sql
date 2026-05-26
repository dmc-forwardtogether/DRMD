-- ============================================================
-- DRMD v0.1.0 Consolidated Schema
-- PostgreSQL 16 + PostGIS 3.4
-- ============================================================
-- This file replaces the 13 incremental migration files.
-- Run: npx tsx src/migrate.ts (auto-applied via runMigrations)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- CORE: Projects & Features (地图要素)
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  srid        INTEGER NOT NULL DEFAULT 4326,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS features (
  id                BIGSERIAL PRIMARY KEY,
  project_id        BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_type      TEXT NOT NULL CHECK (feature_type IN (
                      'parcel_residential', 'parcel_commercial', 'parcel_mixed',
                      'residential', 'commercial',  -- legacy
                      'road', 'poi'
                    )),
  geom              GEOMETRY(Geometry, 4326) NOT NULL,
  props             JSONB NOT NULL DEFAULT '{}'::jsonb,
  parent_feature_id BIGINT REFERENCES features(id) ON DELETE SET NULL,
  poi_source        TEXT,           -- 'manual' | 'amap' | 'osm' | 'brand_official' | 'dianping'
  poi_category_id   INT,            -- FK added after poi_categories created
  height_m          DOUBLE PRECISION DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_features_project ON features(project_id);
CREATE INDEX IF NOT EXISTS idx_features_geom ON features USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_features_parent ON features(parent_feature_id);
CREATE INDEX IF NOT EXISTS idx_features_poi_category ON features(poi_category_id);

-- ============================================================
-- ROAD GRAPH: 路网节点与边
-- ============================================================

CREATE TABLE IF NOT EXISTS road_nodes (
  id          BIGSERIAL PRIMARY KEY,
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_key    TEXT NOT NULL,
  geom        GEOMETRY(Point, 4326) NOT NULL,
  degree      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, node_key)
);

CREATE TABLE IF NOT EXISTS road_edges (
  id                BIGSERIAL PRIMARY KEY,
  project_id        BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_node_id    BIGINT NOT NULL REFERENCES road_nodes(id) ON DELETE CASCADE,
  target_node_id    BIGINT NOT NULL REFERENCES road_nodes(id) ON DELETE CASCADE,
  source_feature_id BIGINT REFERENCES features(id) ON DELETE SET NULL,
  length_m          DOUBLE PRECISION NOT NULL,
  speed_kph         DOUBLE PRECISION NOT NULL,
  capacity          DOUBLE PRECISION NOT NULL,
  travel_time_s     DOUBLE PRECISION NOT NULL,
  geom              GEOMETRY(LineString, 4326) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_road_nodes_project ON road_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_road_nodes_geom ON road_nodes USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_road_edges_project ON road_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_road_edges_geom ON road_edges USING GIST(geom);

-- ============================================================
-- POI CATEGORIES: 一级分类
-- ============================================================

CREATE TABLE IF NOT EXISTS poi_categories (
  id         SMALLSERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  icon       TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

-- FK for features.poi_category_id (after poi_categories exists)
DO $$ BEGIN
  ALTER TABLE features
    ADD CONSTRAINT fk_features_poi_category
    FOREIGN KEY (poi_category_id) REFERENCES poi_categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- ENTITIES: 主体（企业/政府/事业单位/个人）
-- ============================================================

CREATE TABLE IF NOT EXISTS entities (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('企业', '政府', '事业单位', '个人', '其他')),
  geo_scope        TEXT CHECK (geo_scope IN ('国际', '全国', '大区', '省', '市', '区', '本地')),
  location         TEXT,
  admin_level      TEXT CHECK (admin_level IN ('省', '市', '区县', '乡镇')),
  parent_entity_id INT REFERENCES entities(id) ON DELETE SET NULL,
  district_code    TEXT,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_entity_admin_level CHECK (
    (type IN ('政府', '事业单位') AND admin_level IS NOT NULL)
    OR (type NOT IN ('政府', '事业单位'))
  )
);

CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(parent_entity_id);

-- ============================================================
-- STRUCTURE CATEGORIES: 建筑分类持久化
-- ============================================================

CREATE TABLE IF NOT EXISTS structure_categories (
  id                SMALLSERIAL PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  can_be_commercial BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BRANDS: 品牌（挂载在 Entity 下）
-- ============================================================

CREATE TABLE IF NOT EXISTS brands (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  entity_id       INT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  brand_type      TEXT CHECK (brand_type IN ('owner', 'customer', 'both')),
  description     TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  icon            TEXT,
  influence_score SMALLINT NOT NULL DEFAULT 1 CHECK (influence_score BETWEEN 1 AND 10),
  avg_spend_score SMALLINT NOT NULL DEFAULT 1 CHECK (avg_spend_score BETWEEN 1 AND 10),
  topic_score     SMALLINT NOT NULL DEFAULT 1 CHECK (topic_score BETWEEN 1 AND 10),
  total_score     SMALLINT NOT NULL DEFAULT 3,
  category        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id, name)
);

CREATE INDEX IF NOT EXISTS idx_brands_entity ON brands(entity_id);

-- ============================================================
-- STRUCTURES: 建筑/构筑物基表 (Class Table Inheritance root)
-- ============================================================

CREATE TABLE IF NOT EXISTS structures (
  id                  BIGSERIAL PRIMARY KEY,
  project_id          BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_id          BIGINT REFERENCES features(id) ON DELETE SET NULL,
  structure_type      TEXT NOT NULL CHECK (structure_type IN ('constructed', 'natural', 'hybrid')),
  structure_subtype   TEXT NOT NULL,
  category_id         INT REFERENCES structure_categories(id) ON DELETE SET NULL,
  name                TEXT,
  brand_id            INT REFERENCES brands(id) ON DELETE SET NULL,
  operator_entity_id  INT REFERENCES entities(id) ON DELETE SET NULL,
  owner_entity_id     INT REFERENCES entities(id) ON DELETE SET NULL,
  parent_structure_id BIGINT REFERENCES structures(id) ON DELETE SET NULL,
  extra_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_structures_project ON structures(project_id);
CREATE INDEX IF NOT EXISTS idx_structures_feature ON structures(feature_id);
CREATE INDEX IF NOT EXISTS idx_structures_brand ON structures(brand_id);
CREATE INDEX IF NOT EXISTS idx_structures_operator ON structures(operator_entity_id);
CREATE INDEX IF NOT EXISTS idx_structures_owner ON structures(owner_entity_id);
CREATE INDEX IF NOT EXISTS idx_structures_type ON structures(structure_type, structure_subtype);
CREATE INDEX IF NOT EXISTS idx_structures_parent ON structures(parent_structure_id);

-- ============================================================
-- CTI SUBTYPE TABLES: 各类型专用属性 (1:1 with structures)
-- ============================================================

-- 商场属性
CREATE TABLE IF NOT EXISTS mall_attrs (
  structure_id        BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  commercial_area_sqm NUMERIC(12,2),
  rentable_area_sqm   NUMERIC(12,2),
  floor_count         SMALLINT,
  opening_date        DATE,
  extra_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 道路属性
CREATE TABLE IF NOT EXISTS road_attrs (
  structure_id  BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  speed_kph     DOUBLE PRECISION,
  capacity      DOUBLE PRECISION,
  lane_count    SMALLINT,
  one_way       BOOLEAN NOT NULL DEFAULT FALSE,
  road_class    TEXT,
  extra_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 学校属性
CREATE TABLE IF NOT EXISTS school_attrs (
  structure_id    BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  edu_level       TEXT,
  student_count   INT,
  teacher_count   INT,
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  extra_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 公园属性
CREATE TABLE IF NOT EXISTS park_attrs (
  structure_id        BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  area_sqm            NUMERIC(12,2),
  green_coverage_pct  NUMERIC(5,2),
  amenity_count       INT DEFAULT 0,
  extra_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 水系属性
CREATE TABLE IF NOT EXISTS river_attrs (
  structure_id  BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  width_m       NUMERIC(8,2),
  water_type    TEXT,
  flood_season  TEXT,
  extra_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 店铺属性
CREATE TABLE IF NOT EXISTS shop_attrs (
  structure_id    BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  shop_type       TEXT,
  floor_location  TEXT,
  area_sqm        NUMERIC(10,2),
  has_seating     BOOLEAN DEFAULT FALSE,
  extra_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARCEL ↔ STRUCTURE M:N: 地块↔建筑多对多关联
-- ============================================================

CREATE TABLE IF NOT EXISTS parcel_structures (
  parcel_id    BIGINT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  structure_id BIGINT NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  relation     TEXT NOT NULL DEFAULT 'located_in'
    CHECK (relation IN ('located_in', 'intersects', 'adjacent', 'part_of')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parcel_id, structure_id)
);

CREATE INDEX IF NOT EXISTS idx_parcel_structures_structure ON parcel_structures(structure_id);

-- ============================================================
-- ADMIN DISTRICTS: 行政区划
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_districts (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('country', 'province', 'city', 'district')),
  parent_code TEXT REFERENCES admin_districts(code) ON DELETE SET NULL,
  full_name   TEXT,
  center_lng  DOUBLE PRECISION,
  center_lat  DOUBLE PRECISION,
  geom        GEOMETRY(Geometry, 4326),
  population  INT,
  extra_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_districts_parent ON admin_districts(parent_code);
CREATE INDEX IF NOT EXISTS idx_admin_districts_level ON admin_districts(level);
CREATE INDEX IF NOT EXISTS idx_admin_districts_geom ON admin_districts USING GIST(geom);

-- 建筑↔行政区关联
CREATE TABLE IF NOT EXISTS structure_districts (
  structure_id  BIGINT NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  district_code TEXT NOT NULL REFERENCES admin_districts(code) ON DELETE CASCADE,
  relation      TEXT NOT NULL DEFAULT 'located_in'
    CHECK (relation IN ('located_in', 'serves', 'boundary')),
  PRIMARY KEY (structure_id, district_code)
);

-- ============================================================
-- SCORING SYSTEM: CTI 打分体系
-- ============================================================

-- 打分基表
CREATE TABLE IF NOT EXISTS structure_scores (
  id            SERIAL PRIMARY KEY,
  structure_id  BIGINT NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  scored_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score_version TEXT NOT NULL DEFAULT '1.0',
  total_score   NUMERIC(8,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scores_structure ON structure_scores(structure_id);
CREATE INDEX IF NOT EXISTS idx_scores_scored_at ON structure_scores(scored_at);

-- 商场打分
CREATE TABLE IF NOT EXISTS mall_scores (
  structure_score_id INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  influence_score    SMALLINT NOT NULL CHECK (influence_score BETWEEN 1 AND 10),
  avg_spend_score    SMALLINT NOT NULL CHECK (avg_spend_score BETWEEN 1 AND 10),
  topic_score        SMALLINT NOT NULL CHECK (topic_score BETWEEN 1 AND 10)
);

-- 道路打分
CREATE TABLE IF NOT EXISTS road_scores (
  structure_score_id    INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  connectivity_score    SMALLINT NOT NULL CHECK (connectivity_score BETWEEN 1 AND 10),
  traffic_volume_score  SMALLINT NOT NULL CHECK (traffic_volume_score BETWEEN 1 AND 10),
  road_quality_score    SMALLINT NOT NULL CHECK (road_quality_score BETWEEN 1 AND 10)
);

-- 学校打分
CREATE TABLE IF NOT EXISTS school_scores (
  structure_score_id  INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  academic_rep_score  SMALLINT NOT NULL CHECK (academic_rep_score BETWEEN 1 AND 10),
  facilities_score    SMALLINT NOT NULL CHECK (facilities_score BETWEEN 1 AND 10),
  teacher_ratio_score SMALLINT NOT NULL CHECK (teacher_ratio_score BETWEEN 1 AND 10)
);

-- 公园打分
CREATE TABLE IF NOT EXISTS park_scores (
  structure_score_id    INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  accessibility_score   SMALLINT NOT NULL CHECK (accessibility_score BETWEEN 1 AND 10),
  amenity_density_score SMALLINT NOT NULL CHECK (amenity_density_score BETWEEN 1 AND 10),
  green_quality_score   SMALLINT NOT NULL CHECK (green_quality_score BETWEEN 1 AND 10)
);

-- 店铺打分
CREATE TABLE IF NOT EXISTS shop_scores (
  structure_score_id    INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
  foot_traffic_score    SMALLINT NOT NULL CHECK (foot_traffic_score BETWEEN 1 AND 10),
  rent_efficiency_score SMALLINT NOT NULL CHECK (rent_efficiency_score BETWEEN 1 AND 10),
  brand_fit_score       SMALLINT NOT NULL CHECK (brand_fit_score BETWEEN 1 AND 10)
);

-- ============================================================
-- BUILDING SCORES: 建筑总分汇总
-- ============================================================

CREATE TABLE IF NOT EXISTS building_scores (
  structure_id  BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  total_score   NUMERIC(5,1) NOT NULL DEFAULT 0,
  child_count   INT NOT NULL DEFAULT 0,
  max_score     NUMERIC(5,1) NOT NULL DEFAULT 0,
  ratio         NUMERIC(5,2) NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HELPER VIEWS
-- ============================================================

CREATE OR REPLACE VIEW vw_parcel_buildings AS
SELECT
  f.id AS parcel_id,
  f.feature_type AS parcel_type,
  f.props->>'name' AS parcel_name,
  s.id AS structure_id,
  s.name AS structure_name,
  s.structure_subtype,
  ps.relation,
  b.name AS brand_name
FROM features f
JOIN parcel_structures ps ON ps.parcel_id = f.id
JOIN structures s ON s.id = ps.structure_id
LEFT JOIN brands b ON s.brand_id = b.id;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- touch_updated_at: auto-update timestamp
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- brand_calc_total_score: auto-compute brand total from 3 dimensions
CREATE OR REPLACE FUNCTION brand_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_score := NEW.influence_score + NEW.avg_spend_score + NEW.topic_score;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- recalc_building_scores: full rebuild of building score summary
CREATE OR REPLACE FUNCTION recalc_building_scores()
RETURNS void AS $$
DECLARE
  global_max NUMERIC(5,1);
BEGIN
  DELETE FROM building_scores;
  INSERT INTO building_scores (structure_id, total_score, child_count, max_score, ratio)
  SELECT
    parent.id,
    COALESCE(SUM(b.total_score), 0),
    COUNT(child.id) FILTER (WHERE child.id IS NOT NULL),
    0, 0
  FROM structures parent
  LEFT JOIN structures child ON child.parent_structure_id = parent.id
  LEFT JOIN brands b ON child.brand_id = b.id
  WHERE parent.parent_structure_id IS NULL
  GROUP BY parent.id;
  SELECT COALESCE(MAX(total_score), 0) INTO global_max FROM building_scores;
  UPDATE building_scores
  SET max_score = global_max,
      ratio = CASE WHEN global_max > 0 THEN ROUND(total_score / global_max * 100, 1) ELSE 0 END,
      calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- recalc_single_building: incremental per-building score update
CREATE OR REPLACE FUNCTION recalc_single_building(p_structure_id BIGINT)
RETURNS void AS $$
DECLARE
  new_total NUMERIC(5,1);
  new_child_count INT;
  global_max NUMERIC(5,1);
BEGIN
  SELECT COALESCE(SUM(b.total_score), 0),
         COUNT(child.id) FILTER (WHERE child.id IS NOT NULL)
  INTO new_total, new_child_count
  FROM structures child
  LEFT JOIN brands b ON child.brand_id = b.id
  WHERE child.parent_structure_id = p_structure_id;
  INSERT INTO building_scores (structure_id, total_score, child_count, max_score, ratio)
  VALUES (p_structure_id, new_total, new_child_count, 0, 0)
  ON CONFLICT (structure_id) DO UPDATE SET
    total_score = new_total, child_count = new_child_count, calculated_at = NOW();
  SELECT COALESCE(MAX(total_score), 0) INTO global_max FROM building_scores;
  UPDATE building_scores
  SET max_score = global_max,
      ratio = CASE WHEN global_max > 0 THEN ROUND(total_score / global_max * 100, 1) ELSE 0 END,
      calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS: touch_updated_at on all major tables
-- ============================================================

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_projects_touch ON projects;
  CREATE TRIGGER trg_projects_touch BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_features_touch ON features;
  CREATE TRIGGER trg_features_touch BEFORE UPDATE ON features
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_entities_touch ON entities;
  CREATE TRIGGER trg_entities_touch BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_brands_touch ON brands;
  CREATE TRIGGER trg_brands_touch BEFORE UPDATE ON brands
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_structures_touch ON structures;
  CREATE TRIGGER trg_structures_touch BEFORE UPDATE ON structures
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_mall_attrs_touch ON mall_attrs;
  CREATE TRIGGER trg_mall_attrs_touch BEFORE UPDATE ON mall_attrs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_road_attrs_touch ON road_attrs;
  CREATE TRIGGER trg_road_attrs_touch BEFORE UPDATE ON road_attrs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_school_attrs_touch ON school_attrs;
  CREATE TRIGGER trg_school_attrs_touch BEFORE UPDATE ON school_attrs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_park_attrs_touch ON park_attrs;
  CREATE TRIGGER trg_park_attrs_touch BEFORE UPDATE ON park_attrs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_river_attrs_touch ON river_attrs;
  CREATE TRIGGER trg_river_attrs_touch BEFORE UPDATE ON river_attrs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_shop_attrs_touch ON shop_attrs;
  CREATE TRIGGER trg_shop_attrs_touch BEFORE UPDATE ON shop_attrs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  DROP TRIGGER IF EXISTS trg_admin_districts_touch ON admin_districts;
  CREATE TRIGGER trg_admin_districts_touch BEFORE UPDATE ON admin_districts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
END $$;

-- brand total_score auto-calc trigger
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_brand_total_score ON brands;
  CREATE TRIGGER trg_brand_total_score
    BEFORE INSERT OR UPDATE OF influence_score, avg_spend_score, topic_score ON brands
    FOR EACH ROW EXECUTE FUNCTION brand_calc_total_score();
END $$;

-- ============================================================
-- TRIGGERS: building score auto-recalc on brand/structure changes
-- ============================================================

-- Brand score change → recalc parent buildings
CREATE OR REPLACE FUNCTION trg_brand_score_recalc_fn()
RETURNS TRIGGER AS $$
DECLARE
  parent_id BIGINT;
BEGIN
  FOR parent_id IN
    SELECT DISTINCT s.parent_structure_id
    FROM structures s
    WHERE s.brand_id = NEW.id AND s.parent_structure_id IS NOT NULL
  LOOP
    PERFORM recalc_single_building(parent_id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_brand_score_recalc ON brands;
  CREATE TRIGGER trg_brand_score_recalc
    AFTER UPDATE OF influence_score, avg_spend_score, topic_score ON brands
    FOR EACH ROW
    WHEN (OLD.total_score IS DISTINCT FROM (NEW.influence_score + NEW.avg_spend_score + NEW.topic_score))
    EXECUTE FUNCTION trg_brand_score_recalc_fn();
END $$;

-- Child brand change → recalc old + new parent
CREATE OR REPLACE FUNCTION trg_child_brand_recalc_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.parent_structure_id IS NOT NULL THEN
    PERFORM recalc_single_building(OLD.parent_structure_id);
  END IF;
  IF NEW.parent_structure_id IS NOT NULL AND NEW.parent_structure_id IS DISTINCT FROM OLD.parent_structure_id THEN
    PERFORM recalc_single_building(NEW.parent_structure_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_child_brand_recalc ON structures;
  CREATE TRIGGER trg_child_brand_recalc
    AFTER UPDATE OF brand_id ON structures
    FOR EACH ROW
    WHEN (OLD.brand_id IS DISTINCT FROM NEW.brand_id)
    EXECUTE FUNCTION trg_child_brand_recalc_fn();
END $$;

-- Child parent change → recalc old + new parent + global ratio
CREATE OR REPLACE FUNCTION trg_child_parent_recalc_fn()
RETURNS TRIGGER AS $$
DECLARE
  global_max NUMERIC(5,1);
BEGIN
  IF OLD.parent_structure_id IS NOT NULL THEN
    PERFORM recalc_single_building(OLD.parent_structure_id);
  END IF;
  IF NEW.parent_structure_id IS NOT NULL THEN
    PERFORM recalc_single_building(NEW.parent_structure_id);
  END IF;
  SELECT COALESCE(MAX(total_score), 0) INTO global_max FROM building_scores;
  UPDATE building_scores
  SET max_score = global_max,
      ratio = CASE WHEN global_max > 0 THEN ROUND(total_score / global_max * 100, 1) ELSE 0 END,
      calculated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_child_parent_recalc ON structures;
  CREATE TRIGGER trg_child_parent_recalc
    AFTER UPDATE OF parent_structure_id ON structures
    FOR EACH ROW
    WHEN (OLD.parent_structure_id IS DISTINCT FROM NEW.parent_structure_id)
    EXECUTE FUNCTION trg_child_parent_recalc_fn();
END $$;

-- Child insert/delete → recalc parent
CREATE OR REPLACE FUNCTION trg_child_lifecycle_recalc_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.parent_structure_id IS NOT NULL) THEN
    PERFORM recalc_single_building(NEW.parent_structure_id);
  ELSIF (TG_OP = 'DELETE' AND OLD.parent_structure_id IS NOT NULL) THEN
    PERFORM recalc_single_building(OLD.parent_structure_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_child_insert_recalc ON structures;
  CREATE TRIGGER trg_child_insert_recalc
    AFTER INSERT ON structures
    FOR EACH ROW EXECUTE FUNCTION trg_child_lifecycle_recalc_fn();
  DROP TRIGGER IF EXISTS trg_child_delete_recalc ON structures;
  CREATE TRIGGER trg_child_delete_recalc
    AFTER DELETE ON structures
    FOR EACH ROW EXECUTE FUNCTION trg_child_lifecycle_recalc_fn();
END $$;

-- shop_scores auto total_score calc
CREATE OR REPLACE FUNCTION shop_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE structure_scores
  SET total_score = NEW.foot_traffic_score + NEW.rent_efficiency_score + NEW.brand_fit_score
  WHERE id = NEW.structure_score_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_shop_score_total ON shop_scores;
  CREATE TRIGGER trg_shop_score_total
    AFTER INSERT OR UPDATE OF foot_traffic_score, rent_efficiency_score, brand_fit_score ON shop_scores
    FOR EACH ROW EXECUTE FUNCTION shop_calc_total_score();
END $$;

-- 014_project_bounds: 项目空间范围 + OSM 导入支持
-- ============================================================

-- 项目增加空间范围字段（可选，支持行政区/手动框选）
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bounds GEOMETRY(Polygon, 4326);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('manual', 'admin_district', 'bbox', 'osm_import'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS district_code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS osm_imported_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS extra_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 索引
CREATE INDEX IF NOT EXISTS idx_projects_bounds ON projects USING GIST(bounds);

-- 为 features 表添加 OSM 溯源字段
ALTER TABLE features ADD COLUMN IF NOT EXISTS osm_id TEXT;
ALTER TABLE features ADD COLUMN IF NOT EXISTS osm_tags JSONB;

CREATE INDEX IF NOT EXISTS idx_features_osm_id ON features(osm_id);

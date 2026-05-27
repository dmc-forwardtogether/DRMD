-- 015_project_viewport: 项目地图视口保存/恢复
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS center_lng DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS center_lat DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS zoom DOUBLE PRECISION;

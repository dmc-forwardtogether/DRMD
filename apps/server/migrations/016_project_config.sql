-- 016_project_config: 项目级配置 JSON
-- ============================================================
-- 用于存储底图样式、主题、渲染偏好等项目级配置
-- 采用开放式 JSONB 设计，方便后续扩展
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS config_json JSONB NOT NULL DEFAULT '{}'::jsonb;

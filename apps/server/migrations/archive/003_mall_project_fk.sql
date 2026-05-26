-- 003_mall_project_fk: mall_profiles 挂载到 project
-- ==============================================

-- 1. 添加 project_id 列
ALTER TABLE mall_profiles
  ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE;

-- 2. 回填已有数据（通过 feature 找到对应的 project）
UPDATE mall_profiles mp
SET project_id = f.project_id
FROM features f
WHERE mp.feature_id = f.id AND mp.project_id IS NULL;

-- 3. 设为 NOT NULL（回填完成后）
ALTER TABLE mall_profiles
  ALTER COLUMN project_id SET NOT NULL;

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_mall_profiles_project ON mall_profiles(project_id);

-- 5. 插入/更新时自动从 feature 继承 project_id 的触发器
CREATE OR REPLACE FUNCTION mall_profile_set_project_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT project_id INTO NEW.project_id
  FROM features
  WHERE id = NEW.feature_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mall_profile_project ON mall_profiles;
CREATE TRIGGER trg_mall_profile_project
  BEFORE INSERT OR UPDATE OF feature_id ON mall_profiles
  FOR EACH ROW EXECUTE FUNCTION mall_profile_set_project_id();

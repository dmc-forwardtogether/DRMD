-- 012_parcel_structure_mn: 地块↔建筑 多对多关联表 + 四层语义模型
-- 地块 (Feature/Parcel) 与 建筑 (Structure) 的关系是 M:N
--   一个商业地块可能有 A/B/C/D 座多栋建筑
--   一栋建筑可能跨越多个地块（如连体建筑）
-- 用关联表替代 structures.feature_id 的一对一约束
-- ============================================================

-- ============================================
-- PART 1: 地块↔建筑 多对多关联表
-- ============================================
CREATE TABLE IF NOT EXISTS parcel_structures (
  parcel_id    BIGINT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  structure_id BIGINT NOT NULL REFERENCES structures(id) ON DELETE CASCADE,
  relation     TEXT NOT NULL DEFAULT 'located_in'
    CHECK (relation IN ('located_in', 'intersects', 'adjacent', 'part_of')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parcel_id, structure_id)
);

CREATE INDEX IF NOT EXISTS idx_parcel_structures_structure ON parcel_structures(structure_id);

-- ============================================
-- PART 2: 从现有 structures.feature_id 迁移到关联表
-- ============================================
INSERT INTO parcel_structures (parcel_id, structure_id, relation)
SELECT s.feature_id, s.id, 'located_in'
FROM structures s
WHERE s.feature_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM parcel_structures ps
    WHERE ps.parcel_id = s.feature_id AND ps.structure_id = s.id
  );

-- ============================================
-- PART 3: 为 parcel（地块）扩展 features 类型
--   将原有的 residential/commercial 语义精确为地块类型
--   feature_type 新增值: 'parcel_residential', 'parcel_commercial', 'parcel_mixed'
--   保留原有的 'road' 和 'poi' 不变
-- ============================================
-- 注意: 只扩展 CHECK 约束，不回填已有数据（保持向后兼容）
ALTER TABLE features DROP CONSTRAINT IF EXISTS features_feature_type_check;
ALTER TABLE features ADD CONSTRAINT features_feature_type_check
  CHECK (feature_type IN (
    -- 地块类型（新）
    'parcel_residential',
    'parcel_commercial',
    'parcel_mixed',
    -- 兼容旧值
    'residential',
    'commercial',
    -- 网络/点
    'road',
    'poi'
  ));

-- ============================================
-- PART 4: 为 features 添加高度属性（可选 LoD1 支持）
-- ============================================
ALTER TABLE features
  ADD COLUMN IF NOT EXISTS height_m DOUBLE PRECISION DEFAULT NULL;

-- ============================================
-- PART 5: 辅助视图：获取某地块下的所有建筑
-- ============================================
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

-- ============================================
-- PART 6: 触发器：建筑品牌变更时自动重算关联地块评分
-- （地基：building_scores 已有 recalc_single_building）
-- 这里预留一个钩子，未来可根据 parcel 聚合子建筑评分
-- ============================================
CREATE OR REPLACE FUNCTION touch_parcel_on_building_change()
RETURNS TRIGGER AS $$
BEGIN
  -- 未来可在这里触发地块级别的评分重算
  -- 当前仅更新时间戳占位
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

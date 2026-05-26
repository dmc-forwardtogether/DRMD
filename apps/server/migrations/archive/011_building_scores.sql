-- 011_building_scores: 建筑总分（子建筑品牌分汇总）+ 全局最高分追踪
-- ============================================================

-- 建筑总分表：只存顶层建筑（parent_structure_id IS NULL）
-- total_score = 子建筑的品牌 total_score 之和
-- max_score   = 全局所有建筑中的最高 total_score
-- ratio       = total_score / max_score（百分比）
CREATE TABLE IF NOT EXISTS building_scores (
  structure_id  BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
  total_score   NUMERIC(5,1) NOT NULL DEFAULT 0,
  child_count   INT NOT NULL DEFAULT 0,
  max_score     NUMERIC(5,1) NOT NULL DEFAULT 0,
  ratio         NUMERIC(5,2) NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 计算函数：重算所有顶层建筑的分数
-- 规则：总分为子建筑品牌分的加权和（每个子建筑品牌分均值 ÷ 子建筑数 × 子建筑数 = 总和）
-- 实际：SUM(child.brand_total_score)，每个子建筑的 brand.total_score
-- ============================================================
CREATE OR REPLACE FUNCTION recalc_building_scores()
RETURNS void AS $$
DECLARE
  global_max NUMERIC(5,1);
BEGIN
  -- Step 1: 清除旧数据
  DELETE FROM building_scores;

  -- Step 2: 插入/更新各建筑分数
  INSERT INTO building_scores (structure_id, total_score, child_count, max_score, ratio)
  SELECT
    parent.id,
    COALESCE(SUM(b.total_score), 0),
    COUNT(child.id) FILTER (WHERE child.id IS NOT NULL),
    0,  -- 暂填，Step 3 统一更新
    0
  FROM structures parent
  LEFT JOIN structures child ON child.parent_structure_id = parent.id
  LEFT JOIN brands b ON child.brand_id = b.id
  WHERE parent.parent_structure_id IS NULL
  GROUP BY parent.id;

  -- Step 3: 找到全局最高分并更新 ratio
  SELECT COALESCE(MAX(total_score), 0) INTO global_max FROM building_scores;

  UPDATE building_scores
  SET max_score = global_max,
      ratio = CASE WHEN global_max > 0 THEN ROUND(total_score / global_max * 100, 1) ELSE 0 END,
      calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 单建筑重算（创建/更新子建筑时调用，比全量重算更高效）
-- ============================================================
CREATE OR REPLACE FUNCTION recalc_single_building(p_structure_id BIGINT)
RETURNS void AS $$
DECLARE
  new_total NUMERIC(5,1);
  new_child_count INT;
  global_max NUMERIC(5,1);
BEGIN
  -- 计算该建筑的分数
  SELECT COALESCE(SUM(b.total_score), 0),
         COUNT(child.id) FILTER (WHERE child.id IS NOT NULL)
  INTO new_total, new_child_count
  FROM structures child
  LEFT JOIN brands b ON child.brand_id = b.id
  WHERE child.parent_structure_id = p_structure_id;

  -- Upsert 该建筑分数
  INSERT INTO building_scores (structure_id, total_score, child_count, max_score, ratio)
  VALUES (p_structure_id, new_total, new_child_count, 0, 0)
  ON CONFLICT (structure_id) DO UPDATE SET
    total_score = new_total,
    child_count = new_child_count,
    calculated_at = NOW();

  -- 更新全局最高分和所有建筑的 ratio
  SELECT COALESCE(MAX(total_score), 0) INTO global_max FROM building_scores;
  UPDATE building_scores
  SET max_score = global_max,
      ratio = CASE WHEN global_max > 0 THEN ROUND(total_score / global_max * 100, 1) ELSE 0 END,
      calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 初始化：对现有数据执行一次全量计算
-- ============================================================
SELECT recalc_building_scores();

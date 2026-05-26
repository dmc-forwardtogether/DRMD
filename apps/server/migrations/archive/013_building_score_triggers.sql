-- 013_building_score_triggers: 自动重算大楼分数的触发器
-- 解决 building_scores 只在迁移时算一次，后续品牌变化/子建筑变更不自动重算的问题
-- ============================================================

-- ============================================
-- TRIGGER 1: 品牌分数变更 → 重算所有关联的父建筑
-- ============================================
CREATE OR REPLACE FUNCTION trg_brand_score_recalc()
RETURNS TRIGGER AS $$
DECLARE
  parent_id BIGINT;
BEGIN
  -- 找到所有使用该品牌的子建筑，重算它们的父建筑
  FOR parent_id IN
    SELECT DISTINCT s.parent_structure_id
    FROM structures s
    WHERE s.brand_id = NEW.id
      AND s.parent_structure_id IS NOT NULL
  LOOP
    PERFORM recalc_single_building(parent_id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_score_recalc ON brands;
CREATE TRIGGER trg_brand_score_recalc
  AFTER UPDATE OF influence_score, avg_spend_score, topic_score ON brands
  FOR EACH ROW
  WHEN (OLD.total_score IS DISTINCT FROM (NEW.influence_score + NEW.avg_spend_score + NEW.topic_score))
  EXECUTE FUNCTION trg_brand_score_recalc();

-- ============================================
-- TRIGGER 2: 子建筑的 brand_id 变更 → 重算旧父 + 新父
-- ============================================
CREATE OR REPLACE FUNCTION trg_child_brand_recalc()
RETURNS TRIGGER AS $$
BEGIN
  -- 旧父建筑重算
  IF OLD.parent_structure_id IS NOT NULL THEN
    PERFORM recalc_single_building(OLD.parent_structure_id);
  END IF;
  -- 新父建筑重算
  IF NEW.parent_structure_id IS NOT NULL AND NEW.parent_structure_id IS DISTINCT FROM OLD.parent_structure_id THEN
    PERFORM recalc_single_building(NEW.parent_structure_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_child_brand_recalc ON structures;
CREATE TRIGGER trg_child_brand_recalc
  AFTER UPDATE OF brand_id ON structures
  FOR EACH ROW
  WHEN (OLD.brand_id IS DISTINCT FROM NEW.brand_id)
  EXECUTE FUNCTION trg_child_brand_recalc();

-- ============================================
-- TRIGGER 3: 子建筑的 parent_structure_id 变更 → 重算旧父 + 新父 + 全局 ratio
-- ============================================
CREATE OR REPLACE FUNCTION trg_child_parent_recalc()
RETURNS TRIGGER AS $$
DECLARE
  global_max NUMERIC(5,1);
BEGIN
  -- 旧父建筑重算
  IF OLD.parent_structure_id IS NOT NULL THEN
    PERFORM recalc_single_building(OLD.parent_structure_id);
  END IF;
  -- 新父建筑重算
  IF NEW.parent_structure_id IS NOT NULL THEN
    PERFORM recalc_single_building(NEW.parent_structure_id);
  END IF;
  -- 更新全局 ratio（因为可能有父建筑分数变化）
  SELECT COALESCE(MAX(total_score), 0) INTO global_max FROM building_scores;
  UPDATE building_scores
  SET max_score = global_max,
      ratio = CASE WHEN global_max > 0 THEN ROUND(total_score / global_max * 100, 1) ELSE 0 END,
      calculated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_child_parent_recalc ON structures;
CREATE TRIGGER trg_child_parent_recalc
  AFTER UPDATE OF parent_structure_id ON structures
  FOR EACH ROW
  WHEN (OLD.parent_structure_id IS DISTINCT FROM NEW.parent_structure_id)
  EXECUTE FUNCTION trg_child_parent_recalc();

-- ============================================
-- TRIGGER 4: 子建筑删除 / 新建 → 重算父建筑
-- ============================================

-- 新增子建筑时
CREATE OR REPLACE FUNCTION trg_child_insert_recalc()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_structure_id IS NOT NULL THEN
    PERFORM recalc_single_building(NEW.parent_structure_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_child_insert_recalc ON structures;
CREATE TRIGGER trg_child_insert_recalc
  AFTER INSERT ON structures
  FOR EACH ROW
  WHEN (NEW.parent_structure_id IS NOT NULL)
  EXECUTE FUNCTION trg_child_insert_recalc();

-- 删除子建筑时
CREATE OR REPLACE FUNCTION trg_child_delete_recalc()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.parent_structure_id IS NOT NULL THEN
    PERFORM recalc_single_building(OLD.parent_structure_id);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_child_delete_recalc ON structures;
CREATE TRIGGER trg_child_delete_recalc
  AFTER DELETE ON structures
  FOR EACH ROW
  WHEN (OLD.parent_structure_id IS NOT NULL)
  EXECUTE FUNCTION trg_child_delete_recalc();

-- ============================================
-- 最后：用当前数据重新全量算一遍，确保一致
-- ============================================
SELECT recalc_building_scores();

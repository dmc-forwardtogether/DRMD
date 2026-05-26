-- 008_brand_scoring_v2: 品牌打分体系 v2
--   brands 表增加打分字段，品牌分自动继承到旗下店铺
--   商业品牌（非 default 品牌）支持 1-10 三维度打分
-- ============================================================

-- ============================================
-- PART 1: brands 表增加打分列
-- ============================================
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS influence_score SMALLINT NOT NULL DEFAULT 1
    CHECK (influence_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS avg_spend_score SMALLINT NOT NULL DEFAULT 1
    CHECK (avg_spend_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS topic_score SMALLINT NOT NULL DEFAULT 1
    CHECK (topic_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS total_score SMALLINT NOT NULL DEFAULT 3;
-- 注意: total_score 默认值 3 只是兜底，会被触发器覆盖

-- ============================================
-- PART 2: 触发器自动计算 total_score
-- ============================================
CREATE OR REPLACE FUNCTION brand_v2_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_score := NEW.influence_score + NEW.avg_spend_score + NEW.topic_score;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_v2_total_score ON brands;
CREATE TRIGGER trg_brand_v2_total_score
  BEFORE INSERT OR UPDATE OF influence_score, avg_spend_score, topic_score ON brands
  FOR EACH ROW EXECUTE FUNCTION brand_v2_calc_total_score();

-- ============================================
-- PART 3: 种子数据 — 品牌打分示例
--   仅对非 default 品牌设置初始分
-- ============================================
-- 如果已有品牌数据，更新示例分（不覆盖已有数据）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM brands WHERE name = '星巴克' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 8, avg_spend_score = 5, topic_score = 7 WHERE name = '星巴克' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = '海底捞' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 8, avg_spend_score = 7, topic_score = 8 WHERE name = '海底捞' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = '喜茶' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 7, avg_spend_score = 4, topic_score = 8 WHERE name = '喜茶' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = 'Apple' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 10, avg_spend_score = 8, topic_score = 9 WHERE name = 'Apple' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = '优衣库' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 7, avg_spend_score = 5, topic_score = 6 WHERE name = '优衣库' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = '麦当劳' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 9, avg_spend_score = 3, topic_score = 8 WHERE name = '麦当劳' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = '肯德基' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 9, avg_spend_score = 4, topic_score = 8 WHERE name = '肯德基' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = 'ZARA' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 7, avg_spend_score = 6, topic_score = 6 WHERE name = 'ZARA' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = '泡泡玛特' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 6, avg_spend_score = 5, topic_score = 9 WHERE name = '泡泡玛特' AND is_default = FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE name = '奈雪' AND influence_score = 1) THEN
    UPDATE brands SET influence_score = 6, avg_spend_score = 4, topic_score = 7 WHERE name = '奈雪' AND is_default = FALSE;
  END IF;
END $$;

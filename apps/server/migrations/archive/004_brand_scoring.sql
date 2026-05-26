-- 004_brand_scoring: 品牌配置 & 商场打分体系
-- ============================================

-- 1. 商场品牌系列（如：万达广场、万象城、大悦城等）
CREATE TABLE IF NOT EXISTS brand_groups (
  id          SMALLSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,           -- 系列名称，如 '万达广场'
  company     TEXT NOT NULL,           -- 所属公司，如 '万达集团'
  description TEXT,                    -- 简介
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 店铺品牌（如：Apple Store、ZARA、海底捞、星巴克）
CREATE TABLE IF NOT EXISTS brands (
  id                SMALLSERIAL PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,     -- 品牌名称
  category_id       INT REFERENCES poi_categories(id) ON DELETE SET NULL,
  -- 三个打分维度（1-10）
  influence_score   SMALLINT NOT NULL DEFAULT 1 CHECK (influence_score BETWEEN 1 AND 10),
  avg_spend_score   SMALLINT NOT NULL DEFAULT 1 CHECK (avg_spend_score BETWEEN 1 AND 10),
  topic_score       SMALLINT NOT NULL DEFAULT 1 CHECK (topic_score BETWEEN 1 AND 10),
  total_score       SMALLINT NOT NULL DEFAULT 3,  -- 由触发器自动计算 = influence + avg_spend + topic
  description       TEXT,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 商场归属品牌系列（一个商场 feature 属于哪个品牌系列）
CREATE TABLE IF NOT EXISTS mall_brand_groups (
  id              BIGSERIAL PRIMARY KEY,
  feature_id      BIGINT NOT NULL UNIQUE REFERENCES features(id) ON DELETE CASCADE,
  brand_group_id  INT NOT NULL REFERENCES brand_groups(id) ON DELETE CASCADE,
  project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 商场-店铺品牌关联（某商场内有哪些品牌）
CREATE TABLE IF NOT EXISTS mall_brands (
  id          BIGSERIAL PRIMARY KEY,
  feature_id  BIGINT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  brand_id    INT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feature_id, brand_id)
);

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_brands_category ON brands(category_id);
CREATE INDEX IF NOT EXISTS idx_mall_brand_groups_feature ON mall_brand_groups(feature_id);
CREATE INDEX IF NOT EXISTS idx_mall_brand_groups_project ON mall_brand_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_mall_brands_feature ON mall_brands(feature_id);
CREATE INDEX IF NOT EXISTS idx_mall_brands_project ON mall_brands(project_id);

-- 6. 自动计算 total_score 的触发器
CREATE OR REPLACE FUNCTION brand_calc_total_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_score := NEW.influence_score + NEW.avg_spend_score + NEW.topic_score;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_total_score ON brands;
CREATE TRIGGER trg_brand_total_score
  BEFORE INSERT OR UPDATE OF influence_score, avg_spend_score, topic_score ON brands
  FOR EACH ROW EXECUTE FUNCTION brand_calc_total_score();

-- 7. brand_groups 自动更新时间触发器
DROP TRIGGER IF EXISTS trg_brand_groups_touch ON brand_groups;
CREATE TRIGGER trg_brand_groups_touch
  BEFORE UPDATE ON brand_groups
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 8. brands 自动更新时间触发器
DROP TRIGGER IF EXISTS trg_brands_touch ON brands;
CREATE TRIGGER trg_brands_touch
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 9. 种子数据：示例品牌系列
INSERT INTO brand_groups (name, company, sort_order) VALUES
  ('万达广场',   '万达集团',    1),
  ('万象城',     '华润置地',    2),
  ('大悦城',     '中粮集团',    3),
  ('K11',        '新世界发展',  4),
  ('太古里',     '太古地产',    5),
  ('IFC/IFS',    '九龙仓',      6),
  ('来福士',     '凯德集团',    7),
  ('恒隆广场',   '恒隆地产',    8),
  ('龙湖天街',   '龙湖集团',    9),
  ('印象城',     '印力集团',   10)
ON CONFLICT DO NOTHING;

-- 10. 种子数据：示例店铺品牌（含分值）
INSERT INTO brands (name, category_id, influence_score, avg_spend_score, topic_score, sort_order) VALUES
  -- 餐饮 (category 1)
  ('海底捞',     1, 8, 7, 8, 1),
  ('星巴克',     1, 9, 5, 6, 2),
  ('喜茶',       1, 7, 5, 8, 3),
  ('西贝莜面村', 1, 6, 6, 4, 4),
  ('太二酸菜鱼', 1, 6, 5, 7, 5),
  ('鼎泰丰',     1, 7, 8, 5, 6),
  ('Shake Shack', 1, 7, 7, 7, 7),
  -- 零售 (category 2)
  ('Apple Store',     2, 10, 9, 9, 10),
  ('ZARA',            2, 8, 5, 6, 11),
  ('UNIQLO',          2, 9, 4, 7, 12),
  ('H&M',             2, 7, 4, 5, 13),
  ('NIKE',            2, 9, 6, 8, 14),
  ('LEGO',            2, 8, 7, 8, 15),
  ('无印良品',        2, 7, 6, 5, 16),
  ('泡泡玛特',        2, 7, 5, 9, 17),
  -- 娱乐 (category 3)
  ('IMAX影城',   3, 8, 6, 7, 20),
  ('KTV',        3, 5, 5, 3, 21),
  ('汤姆熊欢乐世界', 3, 5, 4, 4, 22),
  -- 服务 (category 4)
  ('顺电',       4, 6, 7, 3, 30),
  ('西西弗书店', 4, 7, 5, 7, 31)
ON CONFLICT (name) DO NOTHING;

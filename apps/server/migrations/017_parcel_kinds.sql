-- ============================================================
-- 017_parcel_kinds: Extend feature_type CHECK for 7 new parcel types
-- Adds: parcel_public, parcel_industrial, parcel_logistics,
--       parcel_transport, parcel_green, parcel_water, parcel_mixed
-- Ref: block-color branch — Chinese urban land-use color standard
-- ============================================================

ALTER TABLE features
  DROP CONSTRAINT IF EXISTS features_feature_type_check;

ALTER TABLE features
  ADD CONSTRAINT features_feature_type_check
  CHECK (feature_type IN (
    -- 地块类型（GB 50137 城市用地分类）
    'parcel_residential',   -- R 居住用地
    'parcel_public',        -- A 公共管理与公共服务用地
    'parcel_commercial',    -- B 商业服务业设施用地
    'parcel_industrial',    -- M 工业用地
    'parcel_logistics',     -- W 物流仓储用地
    'parcel_transport',     -- S 交通枢纽与道路用地
    'parcel_green',         -- G 绿地与广场用地
    'parcel_water',         -- E 水域与特殊用地
    'parcel_mixed',         -- 混合用地
    -- 兼容旧值
    'residential', 'commercial',
    -- 网络 / 点要素
    'road', 'poi'
  ));

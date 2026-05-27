# DRMD 交通中心 (Transportation Hub) 设计路线图

> **版本**: v0.1.0 | **状态**: 设计中 | **日期**: 2026-05-26

---

## 一、核心设计理念

### 1.1 城市骨架模型

```
┌──────────────────────────────────────────────────────┐
│                   城市语义层次                          │
│                                                      │
│  Layer 4: 建筑 (Structures) — 品牌、店铺、业态          │
│     ↑ 坐落在                                          │
│  Layer 3: 地块 (Parcels) — 用地性质、容积率             │
│     ↑ 必须依附于 ← ★本阶段核心★                        │
│  Layer 2: 交通网络 (Transport Network)                 │
│     ↑ 被约束于                                         │
│  Layer 1: 自然地理 (Natural Geography) — 山、水、地形    │
└──────────────────────────────────────────────────────┘
```

**第一性原理**: 没有道路通达性的地块在法律和物理上都不存在。交通网络定义城市骨架，地块是骨架之间的填充内容。

### 1.2 设计原则

- **OSM 为主，手动为辅**: OSM 覆盖完整路网（高速→支路全部导入），手动编辑用于修正和补充
- **多模式网络**: 道路/轨道/水路/航空 四种模式，各自独立建图，通过换乘/转运节点互联
- **可扩展性优先**: 每种新模式只需增加 `transport_mode` + `transport_class`，不改变核心表结构
- **地块依附约束**: 每个地块必须有关联的道路接入点，系统自动检测孤立地块

---

## 二、交通模式体系

### 2.1 四种 Transport Mode

| Mode | 说明 | 网络类型 | 边属性 |
|------|------|----------|--------|
| `road` | 道路 | 网状 | 等级、限速、车道数、单双向 |
| `rail` | 轨道 | 网状 | 等级、速度、电气化、轨距 |
| `water` | 水路 | 网状/阻隔 | 宽度、水深、季节性、可通航 |
| `air` | 航空 | 节点型 | 跑道等级、吞吐量（作为地块处理） |

### 2.2 道路等级 (road)

| 等级 | transport_class | 速度 (km/h) | OSM 标签 | 来源策略 |
|------|-----------------|-------------|----------|----------|
| 高速公路 | `motorway` | 100-120 | `highway=motorway` | OSM 自动导入 |
| 快速路 | `trunk` | 80-100 | `highway=trunk` | OSM 自动导入 |
| 主干道 | `primary` | 60-80 | `highway=primary` | OSM 自动导入 |
| 次干道 | `secondary` | 40-60 | `highway=secondary` | OSM 自动导入 |
| 支路 | `tertiary` | 30-40 | `highway=tertiary` | OSM 自动导入 |
| 街坊路 | `residential` | 20-30 | `highway=residential` | OSM 自动导入 |
| 服务路 | `service` | 10-20 | `highway=service` | OSM 自动导入 |
| 步道 | `pedestrian` | 5 | `highway=pedestrian/footway` | OSM 自动导入 |

**关键决策**: ✅ OSM 支路全部导入。OSM 在中国城市的路网覆盖已经非常全面，支路数据质量足够用于城市级模拟。

### 2.3 轨道等级 (rail)

| 等级 | transport_class | OSM 标签 | 说明 |
|------|-----------------|----------|------|
| 高铁 | `hsr` | `railway=rail` + `highspeed=yes` | 250-350 km/h |
| 普速铁路 | `conventional` | `railway=rail` | 80-160 km/h |
| 地铁 | `metro` | `railway=subway` | 30-80 km/h，通常地下 |
| 轻轨/有轨电车 | `tram` | `railway=tram` / `railway=light_rail` | 20-40 km/h，地面 |

### 2.4 水路类型 (water)

| 类型 | transport_class | OSM 标签 | 作用 |
|------|-----------------|----------|------|
| 海洋 | `sea` | `natural=coastline` | 边界/国际航运 |
| 江河 | `river` | `waterway=river` | 内河航运/阻隔 |
| 运河 | `canal` | `waterway=canal` | 人工水道 |
| 湖泊 | `lake` | `natural=water` + `water=lake` | 景观/阻隔 |

### 2.5 航空 (air) — 地块类型，非交通网络

机场作为**地块**处理（`parcel_airport`），而非交通网络类型。原因：
- 航空是点对点连接，不形成网状网络
- 机场本身是一个用地单元，有面积、有建筑、有品牌
- 机场的"交通"属性通过跑道关联到航线图（未来功能）

---

## 三、数据库 Schema 设计

### 3.1 扩展现有表

```sql
-- features 表 feature_type 枚举扩展
-- 旧值保持向后兼容
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'road_motorway';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'road_trunk';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'road_primary';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'road_secondary';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'road_tertiary';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'road_residential';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'road_service';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'road_pedestrian';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'rail_hsr';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'rail_conventional';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'rail_metro';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'rail_tram';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'waterway_river';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'waterway_canal';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'water_lake';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'water_sea';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'parcel_airport';  -- 航空作为地块
```

### 3.2 新增核心表

```sql
-- transport_attrs: 统一交通属性（替代当前 road_attrs）
-- 可扩展：新增 transport_mode 不影响表结构
CREATE TABLE transport_attrs (
    structure_id     BIGINT PRIMARY KEY REFERENCES structures(id) ON DELETE CASCADE,
    transport_mode   TEXT NOT NULL CHECK (transport_mode IN ('road','rail','water','air')),
    transport_class  TEXT NOT NULL,   -- motorway/trunk/primary/... | hsr/conventional/... | river/canal/...
    speed_kph        DOUBLE PRECISION,
    capacity         DOUBLE PRECISION,
    lane_count       SMALLINT,
    is_one_way       BOOLEAN NOT NULL DEFAULT FALSE,
    is_elevated      BOOLEAN NOT NULL DEFAULT FALSE,   -- 高架
    is_underground   BOOLEAN NOT NULL DEFAULT FALSE,   -- 地下
    electrified      BOOLEAN,                          -- 电气化（轨道）
    gauge_mm         INT,                              -- 轨距（轨道）
    width_m          NUMERIC(8,2),                     -- 宽度（水路）
    extra_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- parcel_access: 地块→交通网络接入 ★核心约束表★
CREATE TABLE parcel_access (
    parcel_id       BIGINT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    transport_id    BIGINT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    access_type     TEXT NOT NULL CHECK (access_type IN (
                      'frontage',       -- 直接临街
                      'service_road',   -- 通过服务路连接
                      'virtual',        -- 虚拟接入（最近道路自动计算）
                      'station',        -- 站点辐射（轨道/公交）
                      'water_front'     -- 滨水
                    )),
    distance_m      DOUBLE PRECISION,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否为主接入点
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parcel_id, transport_id)
);

-- transport_interchange: 多模式换乘节点
CREATE TABLE transport_interchange (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT,
    node_a_id       BIGINT NOT NULL REFERENCES features(id),
    node_b_id       BIGINT NOT NULL REFERENCES features(id),
    transfer_time_s DOUBLE PRECISION,   -- 换乘步行时间
    geom            GEOMETRY(Point, 4326),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.3 路网图表扩展

```sql
-- road_nodes → transport_nodes: 扩展到多模式
ALTER TABLE road_nodes RENAME TO transport_nodes;
ALTER TABLE transport_nodes ADD COLUMN transport_mode TEXT;
-- road_edges → transport_edges
ALTER TABLE road_edges RENAME TO transport_edges;  
ALTER TABLE transport_edges ADD COLUMN transport_mode TEXT;
ALTER TABLE transport_edges ADD COLUMN transport_class TEXT;
```

### 3.4 评分体系扩展

```sql
-- 当前已有机场评分表骨架，扩展为交通评分体系
CREATE TABLE transport_scores (
    structure_score_id  INT PRIMARY KEY REFERENCES structure_scores(id) ON DELETE CASCADE,
    -- 道路维度: 连通性、车流量、道路质量
    connectivity_score    SMALLINT CHECK (connectivity_score BETWEEN 1 AND 10),
    traffic_volume_score  SMALLINT CHECK (traffic_volume_score BETWEEN 1 AND 10),
    road_quality_score    SMALLINT CHECK (road_quality_score BETWEEN 1 AND 10),
    -- 轨道维度: 覆盖范围、频率、换乘便利度
    coverage_score        SMALLINT CHECK (coverage_score BETWEEN 1 AND 10),
    frequency_score       SMALLINT CHECK (frequency_score BETWEEN 1 AND 10),
    transfer_score        SMALLINT CHECK (transfer_score BETWEEN 1 AND 10),
    -- 水运维度: 通航能力、港口设施
    navigability_score    SMALLINT CHECK (navigability_score BETWEEN 1 AND 10),
    port_quality_score    SMALLINT CHECK (port_quality_score BETWEEN 1 AND 10)
);
```

---

## 四、OSM 导入策略

### 4.1 全量导入原则

✅ **所有 OSM 道路全部导入，不分等级筛选。** OSM 的中国城市路网覆盖全面，支路数据可用。

### 4.2 Overpass API 查询模板

```
// 道路: 所有 highway=* (motorway → residential → service → pedestrian)
way[highway](bbox);

// 轨道: 所有 railway=*
way[railway](bbox);
node[railway=station](bbox);   // 站点
node[railway=subway_entrance](bbox);  // 地铁入口

// 水系
way[waterway=river](bbox);
way[waterway=canal](bbox);
rel[natural=water](bbox);      // 湖泊
way[natural=coastline](bbox);  // 海岸线

// 建筑（用于自动生成地块）
way[building](bbox);
rel[building](bbox);

// 土地利用（用于自动生成地块边界）
way[landuse](bbox);
rel[landuse](bbox);
```

### 4.3 OSM → DRMD 映射

| OSM 标签 | DRMD feature_type | 图层 |
|----------|-------------------|------|
| `highway=motorway` | `road_motorway` | 🛣️ 高速公路 |
| `highway=trunk` | `road_trunk` | 🛣️ 快速路 |
| `highway=primary` | `road_primary` | 🛤️ 主干道 |
| `highway=secondary` | `road_secondary` | 🛤️ 次干道 |
| `highway=tertiary` | `road_tertiary` | 🏘️ 支路 |
| `highway=residential` | `road_residential` | 🏘️ 街坊路 |
| `highway=service` | `road_service` | 🏘️ 服务路 |
| `highway=pedestrian/footway` | `road_pedestrian` | 🚶 步道 |
| `railway=rail` + `highspeed=yes` | `rail_hsr` | 🚄 高铁 |
| `railway=rail` | `rail_conventional` | 🚂 普铁 |
| `railway=subway` | `rail_metro` | 🚇 地铁 |
| `railway=tram/light_rail` | `rail_tram` | 🚊 轻轨 |
| `waterway=river` | `waterway_river` | 🌊 江河 |
| `waterway=canal` | `waterway_canal` | 🚢 运河 |
| `natural=water` + `water=lake` | `water_lake` | 🏞️ 湖泊 |
| `natural=coastline` | `water_sea` | 🌊 海洋 |
| `building=*` | `structure` (via structures 表) | 🏢 建筑 |
| `landuse=residential` | `parcel_residential` | 🏠 住宅地块 |
| `landuse=commercial` | `parcel_commercial` | 🏪 商业地块 |
| `landuse=industrial` | `parcel_industrial` (未来) | 🏭 工业地块 |

### 4.4 导入后自动处理

1. **去重**: 相同 geometry 的 feature 不重复插入
2. **拓扑修复**: 断开的路段自动端点吸附（snap tolerance 5m）
3. **地块生成**: 利用 OSM landuse + 道路围合自动推断地块边界
4. **建筑-地块关联**: 建筑自动关联到所在或最近地块

---

## 五、地块-道路依附约束

### 5.1 自动连接算法

```
对每个地块 (parcel):
  1. 计算地块几何中心点 (ST_Centroid)
  2. PostGIS 查找最近的道路边:
     SELECT * FROM features
     WHERE feature_type LIKE 'road_%'
     ORDER BY geom <-> parcel_centroid
     LIMIT 1
  3. 注意: motorway/trunk 若无出入口 (highway=motorway_junction) 不能直接连接
      → 向上查找最近的 primary/secondary 作为接入点
  4. 距离判定:
     d < 5m   → access_type = 'frontage' (直接临街)
     d < 500m → access_type = 'virtual'   (虚拟接入)
     d > 500m → 标记为 ⚠️ "未连通"，前端高亮警告
```

### 5.2 连通性验证 API

```
GET /api/projects/:id/connectivity-check
→ 返回:
  {
    connectedParcels: 45,
    isolatedParcels: 2,      // 未连通地块
    totalParcels: 47,
    warnings: [
      { parcelId: 12, distanceToNearestRoad: 850, suggestion: "添加接入道路" }
    ]
  }
```

---

## 六、实施路线图

### Phase A: 项目层重构 (当前 🔴)
- [ ] 项目创建：支持行政区选择 + 手动框选
- [ ] OSM Overpass API 集成服务
- [ ] 项目创建时自动拉取 OSM 路网
- [ ] OSM 数据按类型分图层入库
- [ ] 首页重新设计：项目列表 + 创建入口

### Phase B: 道路等级化
- [ ] features.feature_type 枚举扩展（road_* 系列）
- [ ] transport_attrs 表创建 + 迁移
- [ ] road_attrs → transport_attrs 数据迁移
- [ ] 前端：道路绘制时选择等级 + 渲染区分

### Phase C: 多模式网络
- [ ] rail_* / waterway_* / parcel_airport 类型支持
- [ ] transport_nodes/edges 扩展（多模式图构建）
- [ ] 多模式网络可视化（不同颜色/线型）
- [ ] 换乘节点 (transport_interchange)

### Phase D: 地块依附约束
- [ ] parcel_access 表 + 自动连接算法
- [ ] 连通性验证 API
- [ ] 前端：未连通地块高亮警告
- [ ] 图论分析：基于交通网络的 accessibility score

### Phase E: OSM 增量更新
- [ ] OSM 数据刷新（不覆盖手动编辑）
- [ ] 变更检测 (diff)
- [ ] 冲突解决 UI

---

## 七、风险与缓解

| 风险 | 缓解 |
|------|------|
| OSM 中国数据质量不均 | 支持手动补充编辑，OSM 数据标记 `poi_source='osm'` 可溯源 |
| Overpass API 限流 | 本地缓存 + 分批请求 + 可选 OSM 离线数据导入 |
| 大规模路网图构建慢 | 按项目 BBox 裁剪，不加载全球数据 |
| feature_type 枚举爆炸 | 保留通用 `road` 类型，等级存 props/transport_attrs 而非 feature_type |

---

## 八、开放问题

1. **地铁站辐射范围**: 地铁站 500m/800m/1000m 覆盖圈如何影响地块价值？
2. **高速路阻隔效应**: 高速路两侧如何计算连通性代价？
3. **水系作为阻隔**: 河流宽度超过多少米视为不可跨越？桥梁如何处理？
4. **公交系统**: 是否作为独立 transport_mode，还是作为道路网络的属性？

---

> **文档状态**: 等待评审 | **下一步**: 评审通过后拆分为可执行 issue

import express from "express"
import { z } from "zod"
import { InvalidIdError } from "@drmd/shared-types"
import { pool } from "../db.js"

const router = express.Router()

// ===== Helpers =====

function toPositiveInt(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidIdError()
  }
  return parsed
}

const VALID_ATTRS_TABLES: Record<string, string> = {
  mall: "mall_attrs",
  road: "road_attrs",
  school: "school_attrs",
  park: "park_attrs",
  river: "river_attrs",
  shop: "shop_attrs",
}

function attrsTable(subtype: string): string {
  return VALID_ATTRS_TABLES[subtype] ?? ""
}

function attrsScoreTable(subtype: string): string {
  const table = VALID_ATTRS_TABLES[subtype]
  if (!table) return ""
  return subtype + "_scores"
}

// ============================================================
// ENTITIES (主体)
// ============================================================

const entityInputSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["企业", "政府", "事业单位", "个人", "其他"]),
  geoScope: z.enum(["国际", "全国", "大区", "省", "市", "区", "本地"]).optional(),
  location: z.string().max(80).optional(),
  adminLevel: z.enum(["省", "市", "区县", "乡镇"]).optional(),
  parentEntityId: z.number().int().positive().optional(),
  districtCode: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
})

// GET /api/config/entities
router.get("/entities", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.name, e.type, e.geo_scope AS "geoScope", e.location,
              e.admin_level AS "adminLevel", e.parent_entity_id AS "parentEntityId",
              e.district_code AS "districtCode", e.description,
              e.created_at AS "createdAt", e.updated_at AS "updatedAt",
              pe.name AS "parentEntityName"
       FROM entities e
       LEFT JOIN entities pe ON e.parent_entity_id = pe.id
       ORDER BY e.type, e.name`
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// GET /api/config/entities/:id
router.get("/entities/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const result = await pool.query(
      `SELECT e.id, e.name, e.type, e.geo_scope AS "geoScope", e.location,
              e.admin_level AS "adminLevel", e.parent_entity_id AS "parentEntityId",
              e.description, e.created_at AS "createdAt", e.updated_at AS "updatedAt",
              pe.name AS "parentEntityName"
       FROM entities e
       LEFT JOIN entities pe ON e.parent_entity_id = pe.id
       WHERE e.id = $1`, [id]
    )
    if (!result.rowCount) { res.status(404).json({ error: "Entity not found" }); return }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// POST /api/config/entities
router.post("/entities", async (req, res, next) => {
  try {
    const data = entityInputSchema.parse(req.body)
    const result = await pool.query(
      `INSERT INTO entities (name, type, geo_scope, location, admin_level, parent_entity_id, district_code, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.name, data.type, data.geoScope ?? null, data.location ?? null,
       data.adminLevel ?? null, data.parentEntityId ?? null, data.districtCode ?? null, data.description ?? null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) { next(err) }
})

// PUT /api/config/entities/:id
router.put("/entities/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const data = entityInputSchema.parse(req.body)
    const result = await pool.query(
      `UPDATE entities
       SET name=$1, type=$2, geo_scope=$3, location=$4, admin_level=$5,
           parent_entity_id=$6, district_code=$7, description=$8
       WHERE id=$9 RETURNING *`,
      [data.name, data.type, data.geoScope ?? null, data.location ?? null,
       data.adminLevel ?? null, data.parentEntityId ?? null, data.districtCode ?? null,
       data.description ?? null, id]
    )
    if (!result.rowCount) { res.status(404).json({ error: "Entity not found" }); return }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// DELETE /api/config/entities/:id
router.delete("/entities/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const result = await pool.query("DELETE FROM entities WHERE id=$1 RETURNING id", [id])
    if (!result.rowCount) { res.status(404).json({ error: "Entity not found" }); return }
    res.json({ deleted: id })
  } catch (err) { next(err) }
})

// ============================================================
// BRANDS (品牌/系列)
// ============================================================

const brandInputSchema = z.object({
  name: z.string().min(1).max(80),
  entityId: z.number().int().positive(),
  brandType: z.enum(['owner', 'customer', 'both']).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
  icon: z.string().max(4).optional(),
  influenceScore: z.number().int().min(1).max(10).optional().default(1),
  avgSpendScore: z.number().int().min(1).max(10).optional().default(1),
  topicScore: z.number().int().min(1).max(10).optional().default(1),
  category: z.string().max(40).optional(),
})

// GET /api/config/brands
router.get("/brands", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.name, b.entity_id AS "entityId", b.brand_type AS "brandType",
              b.description, b.sort_order AS "sortOrder", b.icon,
              b.influence_score AS "influenceScore", b.avg_spend_score AS "avgSpendScore",
              b.topic_score AS "topicScore", b.total_score AS "totalScore",
              b.category, b.created_at AS "createdAt", b.updated_at AS "updatedAt",
              e.name AS "entityName", e.type AS "entityType"
       FROM brands b
       JOIN entities e ON b.entity_id = e.id
       ORDER BY e.name, b.sort_order, b.id`
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// GET /api/config/brands?entityId=1
// (handled by same route, optional filter)

// POST /api/config/brands
router.post("/brands", async (req, res, next) => {
  try {
    const data = brandInputSchema.parse(req.body)
    const result = await pool.query(
      `INSERT INTO brands (name, entity_id, brand_type, description, sort_order, icon,
         influence_score, avg_spend_score, topic_score, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [data.name, data.entityId, data.brandType ?? null, data.description ?? null, data.sortOrder,
       data.icon ?? null, data.influenceScore, data.avgSpendScore, data.topicScore, data.category ?? null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) { next(err) }
})

// PUT /api/config/brands/:id
router.put("/brands/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const data = brandInputSchema.parse(req.body)
    const result = await pool.query(
      `UPDATE brands
       SET name=$1, entity_id=$2, brand_type=$3, description=$4, sort_order=$5, icon=$6,
           influence_score=$7, avg_spend_score=$8, topic_score=$9, category=$10
       WHERE id=$11 RETURNING *`,
      [data.name, data.entityId, data.brandType ?? null, data.description ?? null, data.sortOrder,
       data.icon ?? null, data.influenceScore, data.avgSpendScore, data.topicScore, data.category ?? null, id]
    )
    if (!result.rowCount) { res.status(404).json({ error: "Brand not found" }); return }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// DELETE /api/config/brands/:id
router.delete("/brands/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const result = await pool.query("DELETE FROM brands WHERE id=$1 RETURNING id", [id])
    if (!result.rowCount) { res.status(404).json({ error: "Brand not found" }); return }
    res.json({ deleted: id })
  } catch (err) { next(err) }
})

// ============================================================
// BRAND SCORES (品牌打分 v2)
// ============================================================

const brandScoreSchema = z.object({
  influenceScore: z.number().int().min(1).max(10),
  avgSpendScore: z.number().int().min(1).max(10),
  topicScore: z.number().int().min(1).max(10),
})

// PUT /api/config/brands/:id/scores
router.put("/brands/:id/scores", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const data = brandScoreSchema.parse(req.body)
    const result = await pool.query(
      `UPDATE brands SET influence_score=$1, avg_spend_score=$2, topic_score=$3
       WHERE id=$4 RETURNING *`,
      [data.influenceScore, data.avgSpendScore, data.topicScore, id]
    )
    if (!result.rowCount) { res.status(404).json({ error: "Brand not found" }); return }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// GET /api/config/brands/scores-summary
router.get("/brands/scores-summary", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id AS "brandId", b.name AS "brandName", b.icon,
              b.influence_score AS "influenceScore",
              b.avg_spend_score AS "avgSpendScore",
              b.topic_score AS "topicScore",
              b.total_score AS "totalScore",
              b.brand_type AS "brandType",
              e.name AS "entityName", e.id AS "entityId",
              COUNT(s.id)::int AS "storeCount"
       FROM brands b
       JOIN entities e ON b.entity_id = e.id
       LEFT JOIN structures s ON s.brand_id = b.id
       GROUP BY b.id, e.name, e.id
       ORDER BY b.total_score DESC, b.name`
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// GET /api/config/brands/:id/structures?projectId=1
router.get("/brands/:id/structures", async (req, res, next) => {
  try {
    const brandId = toPositiveInt(req.params.id)
    const projectId = req.query.projectId ? toPositiveInt(String(req.query.projectId)) : 1
    const result = await pool.query(
      `SELECT s.id, s.name, s.structure_subtype AS "structureSubtype",
              s.parent_structure_id AS "parentStructureId",
              ps.name AS "parentStructureName",
              COALESCE(d_prov.name, '未知') AS "province",
              COALESCE(d_city.name, '未知') AS "city",
              COALESCE(d_dist.name, '未知') AS "district",
              d_prov.code AS "provinceCode",
              d_city.code AS "cityCode",
              d_dist.code AS "districtCode"
       FROM structures s
       LEFT JOIN structures ps ON s.parent_structure_id = ps.id
       LEFT JOIN structure_districts sd ON sd.structure_id = s.id
       LEFT JOIN admin_districts d_dist ON d_dist.code = sd.district_code
       LEFT JOIN admin_districts d_city ON d_city.code = LEFT(sd.district_code, 4) || '00'
       LEFT JOIN admin_districts d_prov ON d_prov.code = LEFT(sd.district_code, 2) || '0000'
       WHERE s.brand_id = $1 AND s.project_id = $2
       ORDER BY d_prov.name, d_city.name, d_dist.name, s.name`,
      [brandId, projectId]
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// ============================================================
// STRUCTURES (建筑/构筑物基表)
// ============================================================

const structureInputSchema = z.object({
  projectId: z.number().int().positive(),
  featureId: z.number().int().positive().nullable().optional(),
  structureType: z.enum(["constructed", "natural", "hybrid"]),
  structureSubtype: z.string().min(1).max(40),
  name: z.string().max(120).optional(),
  brandId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  operatorEntityId: z.number().int().positive().nullable().optional(),
  ownerEntityId: z.number().int().positive().nullable().optional(),
  parentStructureId: z.number().int().positive().nullable().optional(),
  extraJson: z.record(z.unknown()).optional().default({}),
})

// GET /api/config/structures?projectId=1&subtype=mall&parentId=5
router.get("/structures", async (req, res, next) => {
  try {
    const { projectId, subtype, parentId } = req.query
    let sql = `
      SELECT s.id, s.project_id AS "projectId", s.feature_id AS "featureId",
             s.structure_type AS "structureType", s.structure_subtype AS "structureSubtype",
             s.name, s.brand_id AS "brandId", s.category_id AS "categoryId",
             s.operator_entity_id AS "operatorEntityId", s.owner_entity_id AS "ownerEntityId",
             s.parent_structure_id AS "parentStructureId",
             s.extra_json AS "extraJson", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
             b.name AS "brandName",
             b.influence_score AS "brandInfluenceScore",
             b.avg_spend_score AS "brandAvgSpendScore",
             b.topic_score AS "brandTopicScore",
             b.total_score AS "brandTotalScore",
             sc.name AS "categoryName", sc.can_be_commercial AS "categoryCanBeCommercial",
             oe.name AS "operatorEntityName", ow.name AS "ownerEntityName",
             ps.name AS "parentStructureName"
      FROM structures s
      LEFT JOIN brands b ON s.brand_id = b.id
      LEFT JOIN structure_categories sc ON s.category_id = sc.id
      LEFT JOIN entities oe ON s.operator_entity_id = oe.id
      LEFT JOIN entities ow ON s.owner_entity_id = ow.id
      LEFT JOIN structures ps ON s.parent_structure_id = ps.id
      WHERE 1=1`
    const params: (string | number)[] = []

    if (projectId) {
      params.push(toPositiveInt(String(projectId)))
      sql += ` AND s.project_id = $${params.length}`
    }
    if (subtype) {
      params.push(String(subtype))
      sql += ` AND s.structure_subtype = $${params.length}`
    }
    if (parentId) {
      const pid = toPositiveInt(String(parentId))
      params.push(pid)
      sql += ` AND s.parent_structure_id = $${params.length}`
    }
    sql += " ORDER BY s.structure_subtype, s.name"

    const result = await pool.query(sql, params)
    res.json(result.rows)
  } catch (err) { next(err) }
})

// GET /api/config/structures/:id
router.get("/structures/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const result = await pool.query(
      `SELECT s.id, s.project_id AS "projectId", s.feature_id AS "featureId",
              s.structure_type AS "structureType", s.structure_subtype AS "structureSubtype",
              s.name, s.brand_id AS "brandId", s.category_id AS "categoryId",
              s.operator_entity_id AS "operatorEntityId", s.owner_entity_id AS "ownerEntityId",
              s.parent_structure_id AS "parentStructureId",
              s.extra_json AS "extraJson", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
              b.name AS "brandName",
              b.influence_score AS "brandInfluenceScore",
              b.avg_spend_score AS "brandAvgSpendScore",
              b.topic_score AS "brandTopicScore",
              b.total_score AS "brandTotalScore",
              sc.name AS "categoryName", sc.can_be_commercial AS "categoryCanBeCommercial",
              oe.name AS "operatorEntityName", ow.name AS "ownerEntityName",
              ps.name AS "parentStructureName"
       FROM structures s
       LEFT JOIN brands b ON s.brand_id = b.id
       LEFT JOIN structure_categories sc ON s.category_id = sc.id
       LEFT JOIN entities oe ON s.operator_entity_id = oe.id
       LEFT JOIN entities ow ON s.owner_entity_id = ow.id
       LEFT JOIN structures ps ON s.parent_structure_id = ps.id
       WHERE s.id = $1`, [id]
    )
    if (!result.rowCount) { res.status(404).json({ error: "Structure not found" }); return }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// POST /api/config/structures
router.post("/structures", async (req, res, next) => {
  try {
    const data = structureInputSchema.parse(req.body)
    // categoryId 未传时根据 structureSubtype 自动推导
    const result = await pool.query(
      `INSERT INTO structures (project_id, feature_id, structure_type, structure_subtype,
         name, brand_id, category_id, operator_entity_id, owner_entity_id, parent_structure_id, extra_json)
       VALUES ($1,$2,$3,$4,$5,$6,
               COALESCE($7, (SELECT id FROM structure_categories WHERE code = $4)),
               $8,$9,$10,$11) RETURNING *`,
      [data.projectId, data.featureId ?? null, data.structureType, data.structureSubtype,
       data.name ?? null, data.brandId ?? null, data.categoryId ?? null,
       data.operatorEntityId ?? null, data.ownerEntityId ?? null, data.parentStructureId ?? null, JSON.stringify(data.extraJson)]
    )
    // 新建子建筑 → 重算父建筑分数
    const created = result.rows[0]
    if (created.parent_structure_id) {
      await pool.query("SELECT recalc_single_building($1)", [created.parent_structure_id])
    }
    res.status(201).json(created)
  } catch (err) { next(err) }
})

// PUT /api/config/structures/:id
router.put("/structures/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const data = structureInputSchema.parse(req.body)
    // 记录旧父建筑，用于后续重算
    const oldParent = await pool.query(
      "SELECT parent_structure_id FROM structures WHERE id = $1", [id]
    )
    const oldParentId = oldParent.rows[0]?.parent_structure_id ?? null
    // categoryId 未传时根据 structureSubtype 自动推导
    const result = await pool.query(
      `UPDATE structures
       SET project_id=$1, feature_id=$2, structure_type=$3, structure_subtype=$4,
           name=$5, brand_id=$6,
           category_id=COALESCE($7, (SELECT id FROM structure_categories WHERE code = $4)),
           operator_entity_id=$8, owner_entity_id=$9,
           parent_structure_id=$10, extra_json=$11
       WHERE id=$12 RETURNING *`,
      [data.projectId, data.featureId ?? null, data.structureType, data.structureSubtype,
       data.name ?? null, data.brandId ?? null, data.categoryId ?? null,
       data.operatorEntityId ?? null, data.ownerEntityId ?? null,
       data.parentStructureId ?? null, JSON.stringify(data.extraJson), id]
    )
    if (!result.rowCount) { res.status(404).json({ error: "Structure not found" }); return }
    // 父建筑变更 → 重算新旧父建筑分数
    const newParentId = data.parentStructureId ?? null
    if (oldParentId && oldParentId !== newParentId) {
      await pool.query("SELECT recalc_single_building($1)", [oldParentId])
    }
    if (newParentId) {
      await pool.query("SELECT recalc_single_building($1)", [newParentId])
    }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// DELETE /api/config/structures/:id
router.delete("/structures/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    // 记录父建筑以便删除后重算
    const old = await pool.query(
      "SELECT parent_structure_id FROM structures WHERE id = $1", [id]
    )
    const parentId = old.rows[0]?.parent_structure_id ?? null
    const result = await pool.query("DELETE FROM structures WHERE id=$1 RETURNING id", [id])
    if (!result.rowCount) { res.status(404).json({ error: "Structure not found" }); return }
    // 删除子建筑 → 重算父建筑分数
    if (parentId) {
      await pool.query("SELECT recalc_single_building($1)", [parentId])
    }
    res.json({ deleted: id })
  } catch (err) { next(err) }
})

// PUT /api/config/structures/:id/brand  (品牌关联分店)
router.put("/structures/:id/brand", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const { brandId } = z.object({ brandId: z.number().int().positive() }).parse(req.body)
    const result = await pool.query(
      `UPDATE structures SET brand_id=$1 WHERE id=$2 RETURNING *`, [brandId, id]
    )
    if (!result.rowCount) { res.status(404).json({ error: "Structure not found" }); return }
    // 品牌变更后重算父建筑分数
    const child = result.rows[0]
    if (child.parent_structure_id) {
      await pool.query("SELECT recalc_single_building($1)", [child.parent_structure_id])
    }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// ============================================================
// BUILDING SCORES (建筑总分 v3 — 子建筑品牌分汇总)
// ============================================================

// GET /api/config/building-scores?projectId=1
router.get("/building-scores", async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? toPositiveInt(String(req.query.projectId)) : 1
    const result = await pool.query(
      `SELECT bs.structure_id AS "structureId", bs.total_score AS "totalScore",
              bs.child_count AS "childCount", bs.max_score AS "maxScore",
              bs.ratio, bs.calculated_at AS "calculatedAt",
              s.name, s.structure_subtype AS "structureSubtype",
              b.name AS "brandName"
       FROM building_scores bs
       JOIN structures s ON bs.structure_id = s.id
       LEFT JOIN brands b ON s.brand_id = b.id
       WHERE s.project_id = $1
       ORDER BY bs.total_score DESC`,
      [projectId]
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// GET /api/config/structures/:id/building-score
router.get("/structures/:id/building-score", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    const result = await pool.query(
      `SELECT bs.structure_id AS "structureId", bs.total_score AS "totalScore",
              bs.child_count AS "childCount", bs.max_score AS "maxScore",
              bs.ratio, bs.calculated_at AS "calculatedAt"
       FROM building_scores bs
       WHERE bs.structure_id = $1`,
      [structureId]
    )
    res.json(result.rows[0] ?? null)
  } catch (err) { next(err) }
})

// POST /api/config/building-scores/recalc — 手动触发全量重算
router.post("/building-scores/recalc", async (_req, res, next) => {
  try {
    await pool.query("SELECT recalc_building_scores()")
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ============================================================
// STRUCTURE ATTRS (CTI 子表: 各类型专用属性)
// ============================================================

// -- mall_attrs --

const mallAttrsSchema = z.object({
  commercialAreaSqm: z.number().positive().optional(),
  rentableAreaSqm: z.number().positive().optional(),
  floorCount: z.number().int().positive().optional(),
  openingDate: z.string().optional(),
})

// GET /api/config/structures/:id/attrs
router.get("/structures/:id/attrs", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    const s = await pool.query("SELECT structure_subtype FROM structures WHERE id=$1", [structureId])
    if (!s.rowCount) { res.status(404).json({ error: "Structure not found" }); return }

    const table = attrsTable(s.rows[0].structure_subtype)
    if (!table) { res.json(null); return }

    const result = await pool.query(`SELECT * FROM ${table} WHERE structure_id=$1`, [structureId])
    res.json(result.rows[0] ?? null)
  } catch (err) { next(err) }
})

// PUT /api/config/structures/:id/attrs
router.put("/structures/:id/attrs", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    const s = await pool.query("SELECT structure_subtype FROM structures WHERE id=$1", [structureId])
    if (!s.rowCount) { res.status(404).json({ error: "Structure not found" }); return }

    const subtype = s.rows[0].structure_subtype as string
    const body = req.body

    if (subtype === "mall") {
      const data = mallAttrsSchema.parse(body)
      await pool.query(
        `INSERT INTO mall_attrs (structure_id, commercial_area_sqm, rentable_area_sqm, floor_count, opening_date)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (structure_id) DO UPDATE SET
           commercial_area_sqm=EXCLUDED.commercial_area_sqm,
           rentable_area_sqm=EXCLUDED.rentable_area_sqm,
           floor_count=EXCLUDED.floor_count,
           opening_date=EXCLUDED.opening_date`,
        [structureId, data.commercialAreaSqm ?? null, data.rentableAreaSqm ?? null,
         data.floorCount ?? null, data.openingDate ?? null]
      )
    } else if (subtype === "road") {
      const { speedKph, capacity, laneCount, oneWay, roadClass } = body
      await pool.query(
        `INSERT INTO road_attrs (structure_id, speed_kph, capacity, lane_count, one_way, road_class)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (structure_id) DO UPDATE SET
           speed_kph=EXCLUDED.speed_kph, capacity=EXCLUDED.capacity,
           lane_count=EXCLUDED.lane_count, one_way=EXCLUDED.one_way, road_class=EXCLUDED.road_class`,
        [structureId, speedKph ?? null, capacity ?? null, laneCount ?? null, oneWay ?? false, roadClass ?? null]
      )
    } else if (subtype === "school") {
      const { eduLevel, studentCount, teacherCount, isPublic } = body
      await pool.query(
        `INSERT INTO school_attrs (structure_id, edu_level, student_count, teacher_count, is_public)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (structure_id) DO UPDATE SET
           edu_level=EXCLUDED.edu_level, student_count=EXCLUDED.student_count,
           teacher_count=EXCLUDED.teacher_count, is_public=EXCLUDED.is_public`,
        [structureId, eduLevel ?? null, studentCount ?? null, teacherCount ?? null, isPublic ?? true]
      )
    } else if (subtype === "park") {
      const { areaSqm, greenCoveragePct, amenityCount } = body
      await pool.query(
        `INSERT INTO park_attrs (structure_id, area_sqm, green_coverage_pct, amenity_count)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (structure_id) DO UPDATE SET
           area_sqm=EXCLUDED.area_sqm, green_coverage_pct=EXCLUDED.green_coverage_pct,
           amenity_count=EXCLUDED.amenity_count`,
        [structureId, areaSqm ?? null, greenCoveragePct ?? null, amenityCount ?? 0]
      )
    } else if (subtype === "river") {
      const { widthM, waterType, floodSeason } = body
      await pool.query(
        `INSERT INTO river_attrs (structure_id, width_m, water_type, flood_season)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (structure_id) DO UPDATE SET
           width_m=EXCLUDED.width_m, water_type=EXCLUDED.water_type,
           flood_season=EXCLUDED.flood_season`,
        [structureId, widthM ?? null, waterType ?? null, floodSeason ?? null]
      )
    } else if (subtype === "shop") {
      const { shopType, floorLocation, areaSqm, hasSeating } = body
      await pool.query(
        `INSERT INTO shop_attrs (structure_id, shop_type, floor_location, area_sqm, has_seating)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (structure_id) DO UPDATE SET
           shop_type=EXCLUDED.shop_type, floor_location=EXCLUDED.floor_location,
           area_sqm=EXCLUDED.area_sqm, has_seating=EXCLUDED.has_seating`,
        [structureId, shopType ?? null, floorLocation ?? null, areaSqm ?? null, hasSeating ?? false]
      )
    } else {
      res.status(400).json({ error: `Unknown structure subtype: ${subtype}` }); return
    }

    // Return updated attrs
    const table = attrsTable(subtype)
    const updated = await pool.query(`SELECT * FROM ${table} WHERE structure_id=$1`, [structureId])
    res.json(updated.rows[0])
  } catch (err) { next(err) }
})

// ============================================================
// STRUCTURE SCORES (打分体系)
// ============================================================

// GET /api/config/structures/:id/scores
router.get("/structures/:id/scores", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    const result = await pool.query(
      `SELECT ss.* FROM structure_scores ss
       WHERE ss.structure_id = $1
       ORDER BY ss.scored_at DESC`, [structureId]
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// GET /api/config/structures/:id/scores/latest
router.get("/structures/:id/scores/latest", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    const s = await pool.query("SELECT structure_subtype FROM structures WHERE id=$1", [structureId])
    if (!s.rowCount) { res.status(404).json({ error: "Structure not found" }); return }

    const subtype = s.rows[0].structure_subtype as string

    // Get latest score
    const scoreResult = await pool.query(
      `SELECT * FROM structure_scores WHERE structure_id=$1 ORDER BY scored_at DESC LIMIT 1`, [structureId]
    )
    if (!scoreResult.rowCount) { res.json(null); return }

    const score = scoreResult.rows[0]
    const scoreTable = attrsScoreTable(subtype)
    if (!scoreTable) { res.json(score); return }
    const detailResult = await pool.query(
      `SELECT * FROM ${scoreTable} WHERE structure_score_id=$1`, [score.id]
    )

    res.json({ ...score, details: detailResult.rows[0] ?? null })
  } catch (err) { next(err) }
})

// POST /api/config/structures/:id/scores
router.post("/structures/:id/scores", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    const s = await pool.query("SELECT structure_subtype FROM structures WHERE id=$1", [structureId])
    if (!s.rowCount) { res.status(404).json({ error: "Structure not found" }); return }

    const subtype = s.rows[0].structure_subtype as string

    // Create base score record
    const scoreResult = await pool.query(
      `INSERT INTO structure_scores (structure_id, notes) VALUES ($1, $2) RETURNING *`,
      [structureId, req.body.notes ?? null]
    )
    const scoreId = scoreResult.rows[0].id

    // Create type-specific score
    if (subtype === "mall") {
      const { influenceScore, avgSpendScore, topicScore } = z.object({
        influenceScore: z.number().int().min(1).max(10),
        avgSpendScore: z.number().int().min(1).max(10),
        topicScore: z.number().int().min(1).max(10),
      }).parse(req.body)
      await pool.query(
        `INSERT INTO mall_scores (structure_score_id, influence_score, avg_spend_score, topic_score)
         VALUES ($1,$2,$3,$4)`,
        [scoreId, influenceScore, avgSpendScore, topicScore]
      )
    } else if (subtype === "road") {
      const { connectivityScore, trafficVolumeScore, roadQualityScore } = z.object({
        connectivityScore: z.number().int().min(1).max(10),
        trafficVolumeScore: z.number().int().min(1).max(10),
        roadQualityScore: z.number().int().min(1).max(10),
      }).parse(req.body)
      await pool.query(
        `INSERT INTO road_scores (structure_score_id, connectivity_score, traffic_volume_score, road_quality_score)
         VALUES ($1,$2,$3,$4)`,
        [scoreId, connectivityScore, trafficVolumeScore, roadQualityScore]
      )
    } else if (subtype === "school") {
      const { academicRepScore, facilitiesScore, teacherRatioScore } = z.object({
        academicRepScore: z.number().int().min(1).max(10),
        facilitiesScore: z.number().int().min(1).max(10),
        teacherRatioScore: z.number().int().min(1).max(10),
      }).parse(req.body)
      await pool.query(
        `INSERT INTO school_scores (structure_score_id, academic_rep_score, facilities_score, teacher_ratio_score)
         VALUES ($1,$2,$3,$4)`,
        [scoreId, academicRepScore, facilitiesScore, teacherRatioScore]
      )
    } else if (subtype === "park") {
      const { accessibilityScore, amenityDensityScore, greenQualityScore } = z.object({
        accessibilityScore: z.number().int().min(1).max(10),
        amenityDensityScore: z.number().int().min(1).max(10),
        greenQualityScore: z.number().int().min(1).max(10),
      }).parse(req.body)
      await pool.query(
        `INSERT INTO park_scores (structure_score_id, accessibility_score, amenity_density_score, green_quality_score)
         VALUES ($1,$2,$3,$4)`,
        [scoreId, accessibilityScore, amenityDensityScore, greenQualityScore]
      )
    } else if (subtype === "shop") {
      const { footTrafficScore, rentEfficiencyScore, brandFitScore } = z.object({
        footTrafficScore: z.number().int().min(1).max(10),
        rentEfficiencyScore: z.number().int().min(1).max(10),
        brandFitScore: z.number().int().min(1).max(10),
      }).parse(req.body)
      await pool.query(
        `INSERT INTO shop_scores (structure_score_id, foot_traffic_score, rent_efficiency_score, brand_fit_score)
         VALUES ($1,$2,$3,$4)`,
        [scoreId, footTrafficScore, rentEfficiencyScore, brandFitScore]
      )
    } else {
      // For types without specific score dimensions yet, just keep the base score
    }

    // Return the complete score with calculated total
    const finalScore = await pool.query("SELECT * FROM structure_scores WHERE id=$1", [scoreId])
    res.status(201).json(finalScore.rows[0])
  } catch (err) { next(err) }
})

// ============================================================
// PROJECT SCORE SUMMARY (项目内所有品牌打分汇总，店铺自动继承)
// ============================================================

// GET /api/config/projects/:projectId/score-summary
router.get("/projects/:projectId/score-summary", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)
    const result = await pool.query(
      `SELECT
         s.id AS "structureId",
         s.name AS "structureName",
         s.structure_subtype AS "structureSubtype",
         b.name AS "brandName",
         b.icon AS "brandIcon",
         b.total_score AS "brandTotalScore",
         b.influence_score AS "brandInfluenceScore",
         b.avg_spend_score AS "brandAvgSpendScore",
         b.topic_score AS "brandTopicScore",
         oe.name AS "operatorName",
         (SELECT COUNT(*) FROM structure_scores WHERE structure_id = s.id)::int AS "scoreCount"
       FROM structures s
       LEFT JOIN brands b ON s.brand_id = b.id
       LEFT JOIN entities oe ON s.operator_entity_id = oe.id
       WHERE s.project_id = $1
       ORDER BY b.total_score DESC NULLS LAST, s.name`, [projectId]
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// ============================================================
// STRUCTURE CATEGORIES (建筑分类持久化)
// ============================================================

// GET /api/config/categories
router.get("/categories", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, code, name, can_be_commercial AS "canBeCommercial", sort_order AS "sortOrder"
       FROM structure_categories ORDER BY sort_order`
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// PUT /api/config/categories/:id
router.put("/categories/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const data = z.object({
      name: z.string().min(1).max(40).optional(),
      canBeCommercial: z.boolean().optional(),
      sortOrder: z.number().int().min(0).optional(),
    }).parse(req.body)
    const result = await pool.query(
      `UPDATE structure_categories SET
         name = COALESCE($1, name),
         can_be_commercial = COALESCE($2, can_be_commercial),
         sort_order = COALESCE($3, sort_order)
       WHERE id=$4 RETURNING *`,
      [data.name ?? null, data.canBeCommercial ?? null, data.sortOrder ?? null, id]
    )
    if (!result.rowCount) { res.status(404).json({ error: "Category not found" }); return }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// ============================================================
// ADMIN DISTRICTS (行政区划)
// ============================================================

// GET /api/config/districts?level=district&parentCode=33&page=1&pageSize=100
router.get("/districts", async (req, res, next) => {
  try {
    const { level, parentCode, search, page, pageSize, limit: queryLimit } = req.query

    let sql = `SELECT * FROM admin_districts WHERE 1=1`
    const params: (string | number)[] = []

    if (level) {
      params.push(String(level))
      sql += ` AND level = $${params.length}`
    }
    if (parentCode) {
      params.push(String(parentCode))
      sql += ` AND parent_code = $${params.length}`
    }
    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (name ILIKE $${params.length} OR full_name ILIKE $${params.length})`
    }
    sql += " ORDER BY code"

    if (page) {
      // 分页模式：返回 { rows, total }
      const limit = Math.min(Math.max(1, Number(pageSize) || 100), 1000)
      const offset = (Math.max(1, Number(page) || 1) - 1) * limit

      const countResult = await pool.query(
        sql.replace("SELECT *", "SELECT COUNT(*)::int AS total"),
        params
      )
      const total = countResult.rows[0]?.total || 0

      params.push(limit, offset)
      sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`
      const result = await pool.query(sql, params)
      res.json({ rows: result.rows, total })
    } else {
      // 兼容模式：直接返回数组
      const limit = Math.min(Math.max(1, Number(queryLimit) || 500), 5000)
      params.push(limit)
      sql += ` LIMIT $${params.length}`
      const result = await pool.query(sql, params)
      res.json(result.rows)
    }
  } catch (err) { next(err) }
})

// POST /api/config/districts
router.post("/districts", async (req, res, next) => {
  try {
    const data = z.object({
      code: z.string().min(1).max(20),
      name: z.string().min(1).max(80),
      level: z.enum(["country", "province", "city", "district"]),
      parentCode: z.string().max(20).optional(),
      fullName: z.string().max(200).optional(),
      centerLng: z.number().optional(),
      centerLat: z.number().optional(),
    }).parse(req.body)
    const result = await pool.query(
      `INSERT INTO admin_districts (code, name, level, parent_code, full_name, center_lng, center_lat)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO UPDATE SET
         name=EXCLUDED.name, level=EXCLUDED.level, parent_code=EXCLUDED.parent_code,
         full_name=EXCLUDED.full_name, center_lng=EXCLUDED.center_lng, center_lat=EXCLUDED.center_lat
       RETURNING *`,
      [data.code, data.name, data.level, data.parentCode ?? null, data.fullName ?? null, data.centerLng ?? null, data.centerLat ?? null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) { next(err) }
})

// DELETE /api/config/districts/:code
router.delete("/districts/:code", async (req, res, next) => {
  try {
    const code = req.params.code
    const result = await pool.query("DELETE FROM admin_districts WHERE code=$1 RETURNING code", [code])
    if (!result.rowCount) { res.status(404).json({ error: "District not found" }); return }
    res.json({ deleted: code })
  } catch (err) { next(err) }
})

// GET /api/config/structures/:id/districts
router.get("/structures/:id/districts", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    const result = await pool.query(
      `SELECT ad.*, sd.relation
       FROM structure_districts sd
       JOIN admin_districts ad ON sd.district_code = ad.code
       WHERE sd.structure_id = $1`, [structureId]
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// POST /api/config/structures/:id/districts
router.post("/structures/:id/districts", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    const { districtCode, relation } = z.object({
      districtCode: z.string().min(1),
      relation: z.enum(["located_in", "serves", "boundary"]).default("located_in"),
    }).parse(req.body)
    await pool.query(
      `INSERT INTO structure_districts (structure_id, district_code, relation)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [structureId, districtCode, relation]
    )
    res.status(201).json({ structureId, districtCode, relation })
  } catch (err) { next(err) }
})

// DELETE /api/config/structures/:id/districts/:districtCode
router.delete("/structures/:id/districts/:districtCode", async (req, res, next) => {
  try {
    const structureId = toPositiveInt(req.params.id)
    await pool.query(
      "DELETE FROM structure_districts WHERE structure_id=$1 AND district_code=$2",
      [structureId, req.params.districtCode]
    )
    res.json({ deleted: true })
  } catch (err) { next(err) }
})

export default router

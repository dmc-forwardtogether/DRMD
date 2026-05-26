import express from "express"
import { z } from "zod"
import { InvalidIdError } from "@drmd/shared-types"
import { pool } from "../db.js"

const router = express.Router()

// ===== Zod schemas =====

const brandGroupInputSchema = z.object({
  name: z.string().min(1).max(80),
  company: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).default(0),
})

const brandInputSchema = z.object({
  name: z.string().min(1).max(80),
  categoryId: z.number().int().positive().optional(),
  influenceScore: z.number().int().min(1).max(10),
  avgSpendScore: z.number().int().min(1).max(10),
  topicScore: z.number().int().min(1).max(10),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).default(0),
})

const mallBrandGroupSchema = z.object({
  featureId: z.number().int().positive(),
  brandGroupId: z.number().int().positive(),
  projectId: z.number().int().positive(),
})

const mallBrandSchema = z.object({
  featureId: z.number().int().positive(),
  brandId: z.number().int().positive(),
  projectId: z.number().int().positive(),
})

function toPositiveInt(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidIdError()
  }
  return parsed
}

// ===== Brand Groups (商场品牌系列) =====

// GET /api/brand-config/brand-groups
router.get("/brand-groups", async (_req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM brand_groups ORDER BY sort_order, id"
    )
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/brand-config/brand-groups
router.post("/brand-groups", async (req, res, next) => {
  try {
    const data = brandGroupInputSchema.parse(req.body)
    const result = await pool.query(
      `INSERT INTO brand_groups (name, company, description, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.name, data.company, data.description ?? null, data.sortOrder]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    next(err)
  }
})

// PUT /api/brand-config/brand-groups/:id
router.put("/brand-groups/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const data = brandGroupInputSchema.parse(req.body)
    const result = await pool.query(
      `UPDATE brand_groups
       SET name = $1, company = $2, description = $3, sort_order = $4
       WHERE id = $5 RETURNING *`,
      [data.name, data.company, data.description ?? null, data.sortOrder, id]
    )
    if (!result.rowCount) {
      res.status(404).json({ error: "Brand group not found" })
      return
    }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
})

// DELETE /api/brand-config/brand-groups/:id
router.delete("/brand-groups/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const result = await pool.query("DELETE FROM brand_groups WHERE id = $1 RETURNING id", [id])
    if (!result.rowCount) {
      res.status(404).json({ error: "Brand group not found" })
      return
    }
    res.json({ deleted: id })
  } catch (err) {
    next(err)
  }
})

// ===== Brands (店铺品牌) =====

// GET /api/brand-config/brands
router.get("/brands", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.*, pc.code AS "categoryCode", pc.name AS "categoryName"
       FROM brands b
       LEFT JOIN poi_categories pc ON b.category_id = pc.id
       ORDER BY b.sort_order, b.id`
    )
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
})

// GET /api/brand-config/brands/:id
router.get("/brands/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const result = await pool.query(
      `SELECT b.*, pc.code AS "categoryCode", pc.name AS "categoryName"
       FROM brands b
       LEFT JOIN poi_categories pc ON b.category_id = pc.id
       WHERE b.id = $1`,
      [id]
    )
    if (!result.rowCount) {
      res.status(404).json({ error: "Brand not found" })
      return
    }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
})

// POST /api/brand-config/brands
router.post("/brands", async (req, res, next) => {
  try {
    const data = brandInputSchema.parse(req.body)
    const result = await pool.query(
      `INSERT INTO brands (name, category_id, influence_score, avg_spend_score, topic_score, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.name, data.categoryId ?? null, data.influenceScore, data.avgSpendScore, data.topicScore, data.description ?? null, data.sortOrder]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    next(err)
  }
})

// PUT /api/brand-config/brands/:id
router.put("/brands/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const data = brandInputSchema.parse(req.body)
    const result = await pool.query(
      `UPDATE brands
       SET name = $1, category_id = $2, influence_score = $3, avg_spend_score = $4,
           topic_score = $5, description = $6, sort_order = $7
       WHERE id = $8 RETURNING *`,
      [data.name, data.categoryId ?? null, data.influenceScore, data.avgSpendScore, data.topicScore, data.description ?? null, data.sortOrder, id]
    )
    if (!result.rowCount) {
      res.status(404).json({ error: "Brand not found" })
      return
    }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
})

// DELETE /api/brand-config/brands/:id
router.delete("/brands/:id", async (req, res, next) => {
  try {
    const id = toPositiveInt(req.params.id)
    const result = await pool.query("DELETE FROM brands WHERE id = $1 RETURNING id", [id])
    if (!result.rowCount) {
      res.status(404).json({ error: "Brand not found" })
      return
    }
    res.json({ deleted: id })
  } catch (err) {
    next(err)
  }
})

// ===== Mall-Brand Group Assignments (商场归属品牌系列) =====

// GET /api/brand-config/malls/:featureId/brand-group
router.get("/malls/:featureId/brand-group", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const result = await pool.query(
      `SELECT mbg.*, bg.name AS "brandGroupName", bg.company AS "brandGroupCompany"
       FROM mall_brand_groups mbg
       JOIN brand_groups bg ON mbg.brand_group_id = bg.id
       WHERE mbg.feature_id = $1`,
      [featureId]
    )
    res.json(result.rows[0] ?? null)
  } catch (err) {
    next(err)
  }
})

// PUT /api/brand-config/malls/:featureId/brand-group
router.put("/malls/:featureId/brand-group", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const { brandGroupId, projectId } = z.object({
      brandGroupId: z.number().int().positive(),
      projectId: z.number().int().positive(),
    }).parse(req.body)

    // upsert: delete existing then insert
    await pool.query("DELETE FROM mall_brand_groups WHERE feature_id = $1", [featureId])
    const result = await pool.query(
      `INSERT INTO mall_brand_groups (feature_id, brand_group_id, project_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [featureId, brandGroupId, projectId]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    next(err)
  }
})

// DELETE /api/brand-config/malls/:featureId/brand-group
router.delete("/malls/:featureId/brand-group", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    await pool.query("DELETE FROM mall_brand_groups WHERE feature_id = $1", [featureId])
    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

// ===== Mall-Brand Assignments (商场内店铺品牌) =====

// GET /api/brand-config/malls/:featureId/brands
router.get("/malls/:featureId/brands", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const result = await pool.query(
      `SELECT mb.id, mb.feature_id AS "featureId", mb.brand_id AS "brandId",
              mb.project_id AS "projectId", mb.created_at AS "createdAt",
              b.name AS "brandName", b.total_score AS "brandTotalScore",
              b.influence_score AS "brandInfluenceScore", b.avg_spend_score AS "brandAvgSpendScore",
              b.topic_score AS "brandTopicScore", pc.name AS "brandCategoryName"
       FROM mall_brands mb
       JOIN brands b ON mb.brand_id = b.id
       LEFT JOIN poi_categories pc ON b.category_id = pc.id
       WHERE mb.feature_id = $1
       ORDER BY b.sort_order, b.id`,
      [featureId]
    )
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/brand-config/malls/:featureId/brands
router.post("/malls/:featureId/brands", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const { brandIds, projectId } = z.object({
      brandIds: z.array(z.number().int().positive()).min(1),
      projectId: z.number().int().positive(),
    }).parse(req.body)

    // batch insert (skip duplicates via ON CONFLICT DO NOTHING)
    const values: string[] = []
    const params: (number | bigint)[] = []
    brandIds.forEach((bid, i) => {
      const base = i * 3
      values.push(`($${base + 1}, $${base + 2}, $${base + 3})`)
      params.push(featureId, bid, projectId)
    })

    const result = await pool.query(
      `INSERT INTO mall_brands (feature_id, brand_id, project_id)
       VALUES ${values.join(", ")}
       ON CONFLICT (feature_id, brand_id) DO NOTHING
       RETURNING *`,
      params
    )
    res.status(201).json(result.rows)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/brand-config/malls/:featureId/brands/:brandId
router.delete("/malls/:featureId/brands/:brandId", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const brandId = toPositiveInt(req.params.brandId)
    await pool.query(
      "DELETE FROM mall_brands WHERE feature_id = $1 AND brand_id = $2",
      [featureId, brandId]
    )
    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

// ===== Mall Score Summary (商场打分汇总) =====

// GET /api/brand-config/malls/:featureId/score
router.get("/malls/:featureId/score", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)

    // Get mall feature name
    const featResult = await pool.query(
      `SELECT id, props->>'name' AS name FROM features WHERE id = $1`,
      [featureId]
    )
    const featureName = featResult.rows[0]?.name || `Feature #${featureId}`

    // Get brand group
    const bgResult = await pool.query(
      `SELECT mbg.*, bg.name AS "brandGroupName", bg.company AS "brandGroupCompany"
       FROM mall_brand_groups mbg
       JOIN brand_groups bg ON mbg.brand_group_id = bg.id
       WHERE mbg.feature_id = $1`,
      [featureId]
    )

    // Get all brands with scores
    const brandsResult = await pool.query(
      `SELECT mb.id, mb.feature_id AS "featureId", mb.brand_id AS "brandId",
              mb.project_id AS "projectId",
              b.name AS "brandName", b.total_score AS "brandTotalScore",
              b.influence_score AS "brandInfluenceScore", b.avg_spend_score AS "brandAvgSpendScore",
              b.topic_score AS "brandTopicScore",
              pc.name AS "brandCategoryName"
       FROM mall_brands mb
       JOIN brands b ON mb.brand_id = b.id
       LEFT JOIN poi_categories pc ON b.category_id = pc.id
       WHERE mb.feature_id = $1
       ORDER BY b.total_score DESC`,
      [featureId]
    )

    const brands = brandsResult.rows
    const totalScore = brands.reduce((sum: number, b: any) => sum + Number(b.brandTotalScore), 0)
    const avgScore = brands.length > 0 ? Math.round((totalScore / brands.length) * 10) / 10 : 0

    res.json({
      featureId,
      featureName,
      brandGroupId: bgResult.rows[0]?.brand_group_id ?? null,
      brandGroupName: bgResult.rows[0]?.brandGroupName ?? null,
      brandGroupCompany: bgResult.rows[0]?.brandGroupCompany ?? null,
      brandCount: brands.length,
      totalScore,
      avgScore,
      brands,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/brand-config/projects/:projectId/scores
router.get("/projects/:projectId/scores", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)

    // Get all commercial features for this project with their scores
    const result = await pool.query(
      `SELECT
         f.id AS "featureId",
         f.props->>'name' AS "featureName",
         bg.id AS "brandGroupId",
         bg.name AS "brandGroupName",
         bg.company AS "brandGroupCompany",
         COUNT(mb.id)::int AS "brandCount",
         COALESCE(SUM(b.total_score), 0)::int AS "totalScore",
         CASE WHEN COUNT(mb.id) > 0
           THEN ROUND(SUM(b.total_score)::numeric / COUNT(mb.id), 1)
           ELSE 0
         END AS "avgScore"
       FROM features f
       LEFT JOIN mall_brand_groups mbg ON f.id = mbg.feature_id
       LEFT JOIN brand_groups bg ON mbg.brand_group_id = bg.id
       LEFT JOIN mall_brands mb ON f.id = mb.feature_id
       LEFT JOIN brands b ON mb.brand_id = b.id
       WHERE f.project_id = $1 AND f.feature_type = 'commercial'
       GROUP BY f.id, bg.id, bg.name, bg.company
       ORDER BY COALESCE(SUM(b.total_score), 0) DESC`,
      [projectId]
    )

    res.json(result.rows)
  } catch (err) {
    next(err)
  }
})

export default router

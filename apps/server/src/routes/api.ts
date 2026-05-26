import express from "express"
import type { FeatureCollection, Geometry } from "geojson"
import { z } from "zod"
import { inferFeatureKind, InvalidIdError } from "@drmd/shared-types"
import { pool } from "../db.js"
import { getGraphSummary, rebuildRoadGraph } from "../services/graphBuilder.js"
import { AMAP_CATEGORY_MAP, AMAP_SEARCH_TYPES, buildAmapUrl } from "../services/amapService.js"

const router = express.Router()

const projectCreateSchema = z.object({
  name: z.string().min(1).max(120),
  srid: z.number().int().positive().default(4326)
})

const geoJsonGeometrySchema = z.object({
  type: z.string(),
  coordinates: z.any()
})

const featureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      geometry: geoJsonGeometrySchema,
      properties: z.record(z.any()).optional()
    })
  )
})

const patchFeatureSchema = z
  .object({
    geometry: geoJsonGeometrySchema.optional(),
    properties: z.record(z.any()).optional()
  })
  .refine((value) => value.geometry || value.properties, {
    message: "At least one of geometry or properties must be provided"
  })

function toPositiveInt(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidIdError()
  }
  return parsed
}

router.get("/projects", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT id, name, srid, created_at, updated_at
        FROM projects
        ORDER BY id DESC
      `
    )
    res.json({ projects: result.rows })
  } catch (error) {
    next(error)
  }
})

router.post("/projects", async (req, res, next) => {
  try {
    const payload = projectCreateSchema.parse(req.body)
    const result = await pool.query(
      `
        INSERT INTO projects(name, srid)
        VALUES ($1, $2)
        RETURNING id, name, srid, created_at, updated_at
      `,
      [payload.name, payload.srid]
    )
    res.status(201).json({ project: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

router.get("/projects/:projectId", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)
    const result = await pool.query(
      `
        SELECT id, name, srid, created_at, updated_at
        FROM projects
        WHERE id = $1
      `,
      [projectId]
    )
    if (!result.rowCount) {
      res.status(404).json({ error: "Project not found" })
      return
    }
    res.json({ project: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

router.get("/projects/:projectId/features", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)
    const result = await pool.query<{
      id: number
      feature_type: "residential" | "commercial" | "road" | "poi"
      geometry: Geometry
      props: Record<string, unknown> | null
      parent_feature_id: number | null
      poi_source: string | null
      poi_category_id: number | null
      poi_category_code: string | null
      poi_category_name: string | null
    }>(
      `
        SELECT
          f.id,
          f.feature_type,
          ST_AsGeoJSON(f.geom)::json AS geometry,
          f.props,
          f.parent_feature_id,
          f.poi_source,
          f.poi_category_id,
          pc.code AS poi_category_code,
          pc.name AS poi_category_name
        FROM features f
        LEFT JOIN poi_categories pc ON pc.id = f.poi_category_id
        WHERE f.project_id = $1
        ORDER BY f.id
      `,
      [projectId]
    )

    const featureCollection: FeatureCollection = {
      type: "FeatureCollection",
      features: result.rows.map((row) => ({
        type: "Feature",
        id: String(row.id),
        geometry: row.geometry,
        properties: {
          ...(row.props || {}),
          kind: row.feature_type,
          parentFeatureId: row.parent_feature_id,
          poiSource: row.poi_source,
          poiCategoryId: row.poi_category_id,
          poiCategoryCode: row.poi_category_code,
          poiCategoryName: row.poi_category_name,
          mallProfile: undefined
        }
      }))
    }

    res.json({ featureCollection })
  } catch (error) {
    next(error)
  }
})

router.post("/projects/:projectId/features/bulk", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)
    const payload = featureCollectionSchema.parse(req.body)

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query("DELETE FROM features WHERE project_id = $1", [projectId])

      const insertedIds: number[] = []
      for (const feature of payload.features) {
        const kind = inferFeatureKind(feature.geometry.type, feature.properties?.kind as string | undefined)
        const props = {
          ...(feature.properties || {}),
          kind
        }

        const result = await client.query<{ id: number }>(
          `
            INSERT INTO features(project_id, feature_type, geom, props)
            VALUES (
              $1,
              $2,
              ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
              $4::jsonb
            )
            RETURNING id
          `,
          [projectId, kind, JSON.stringify(feature.geometry), JSON.stringify(props)]
        )
        insertedIds.push(result.rows[0].id)
      }

      await client.query("COMMIT")
      res.status(201).json({ inserted: payload.features.length, insertedIds })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    next(error)
  }
})

// 单条 Feature 创建（用于先保存再到 DB 后操作如 POI fetch）
const singleFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: geoJsonGeometrySchema,
  properties: z.record(z.any()).optional()
})

router.post("/projects/:projectId/features", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)
    const feature = singleFeatureSchema.parse(req.body)

    const kind = inferFeatureKind(feature.geometry.type, feature.properties?.kind as string | undefined)
    const props = { ...(feature.properties || {}), kind }

    const result = await pool.query(
      `INSERT INTO features(project_id, feature_type, geom, props)
       VALUES ($1, $2,
               ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
               $4::jsonb)
       RETURNING id`,
      [projectId, kind, JSON.stringify(feature.geometry), JSON.stringify(props)]
    )

    res.status(201).json({ featureId: result.rows[0].id })
  } catch (error) {
    next(error)
  }
})

router.patch("/features/:featureId", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const payload = patchFeatureSchema.parse(req.body)

    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      if (payload.properties) {
        const maybeKind = payload.properties.kind
        const nextFeatureType =
            maybeKind === "residential" || maybeKind === "commercial" || maybeKind === "road" || maybeKind === "poi"
              ? maybeKind
              : null

        if (nextFeatureType) {
          await client.query(
            `
              UPDATE features
              SET props = props || $1::jsonb,
                  feature_type = $2
              WHERE id = $3
            `,
            [JSON.stringify(payload.properties), nextFeatureType, featureId]
          )
        } else {
          await client.query(
            `
              UPDATE features
              SET props = props || $1::jsonb
              WHERE id = $2
            `,
            [JSON.stringify(payload.properties), featureId]
          )
        }
      }

      if (payload.geometry) {
        await client.query(
          `
            UPDATE features
            SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
            WHERE id = $2
          `,
          [JSON.stringify(payload.geometry), featureId]
        )
      }

      const updated = await client.query(
        `
          SELECT
            id,
            feature_type,
            ST_AsGeoJSON(geom)::json AS geometry,
            props
          FROM features
          WHERE id = $1
        `,
        [featureId]
      )

      await client.query("COMMIT")

      if (!updated.rowCount) {
        res.status(404).json({ error: "Feature not found" })
        return
      }

      const row = updated.rows[0]
      res.json({
        feature: {
          type: "Feature",
          id: String(row.id),
          geometry: row.geometry,
          properties: {
            ...(row.props || {}),
            kind: row.feature_type
          }
        }
      })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    next(error)
  }
})

router.delete("/features/:featureId", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const deleted = await pool.query("DELETE FROM features WHERE id = $1", [featureId])
    if (!deleted.rowCount) {
      res.status(404).json({ error: "Feature not found" })
      return
    }
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

// ===== POI 分类 =====

router.get("/poi-categories", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, code, name, icon, sort_order FROM poi_categories ORDER BY sort_order`
    )
    res.json({ categories: result.rows })
  } catch (error) {
    next(error)
  }
})

// ===== 商场精细化属性（通过 structure → mall_attrs 桥接） =====

router.get("/features/:featureId/mall-profile", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    // 通过 structure 找到 mall_attrs
    const result = await pool.query(
      `SELECT ma.structure_id AS "structureId", ma.commercial_area_sqm AS "commercialAreaSqm",
              ma.floor_count AS "floorCount", ma.opening_date AS "openingDate",
              ma.rentable_area_sqm AS "rentableAreaSqm", ma.extra_json AS "extraJson"
       FROM structures s
       JOIN mall_attrs ma ON ma.structure_id = s.id
       WHERE s.feature_id = $1`, [featureId]
    )
    if (!result.rowCount) {
      res.status(404).json({ error: "Mall profile not found" })
      return
    }
    res.json({ profile: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

const mallProfileSchema = z.object({
  name: z.string().max(120).optional(),
  commercialAreaSqm: z.number().positive().optional(),
  floorCount: z.number().int().positive().optional(),
  openingDate: z.string().optional(),
  extraJson: z.record(z.any()).optional()
})

router.put("/features/:featureId/mall-profile", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const payload = mallProfileSchema.parse(req.body)

    // 找到或创建 structure + mall_attrs
    const feature = await pool.query("SELECT id, feature_type, project_id FROM features WHERE id = $1", [featureId])
    if (!feature.rowCount) { res.status(404).json({ error: "Feature not found" }); return }

    const f = feature.rows[0]

    // 确保 structure 存在
    let structId: number
    const existingStruct = await pool.query("SELECT id FROM structures WHERE feature_id = $1", [featureId])
    if (existingStruct.rowCount) {
      structId = existingStruct.rows[0].id
    } else {
      const structName = payload.name || (payload.commercialAreaSqm ? `Mall #${featureId}` : null)
      const newStruct = await pool.query(
        `INSERT INTO structures (project_id, feature_id, structure_type, structure_subtype, name)
         VALUES ($1,$2,'constructed','mall',$3) RETURNING id`,
        [f.project_id, featureId, structName]
      )
      structId = newStruct.rows[0].id
    }

    // upsert mall_attrs
    const result = await pool.query(
      `INSERT INTO mall_attrs (structure_id, commercial_area_sqm, floor_count, opening_date, extra_json)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (structure_id)
       DO UPDATE SET
         commercial_area_sqm = EXCLUDED.commercial_area_sqm,
         floor_count         = EXCLUDED.floor_count,
         opening_date        = EXCLUDED.opening_date,
         extra_json          = EXCLUDED.extra_json
       RETURNING structure_id AS "structureId", commercial_area_sqm AS "commercialAreaSqm",
                 floor_count AS "floorCount", opening_date AS "openingDate", extra_json AS "extraJson"`,
      [structId, payload.commercialAreaSqm ?? null, payload.floorCount ?? null,
       payload.openingDate ?? null, JSON.stringify(payload.extraJson ?? {})]
    )

    res.json({ profile: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

// ===== POI 父子挂载 =====

const setParentSchema = z.object({
  parentFeatureId: z.number().int().positive().nullable()
})

router.patch("/features/:featureId/parent", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const payload = setParentSchema.parse(req.body)

    if (payload.parentFeatureId !== null) {
      const parent = await pool.query(
        `SELECT id, feature_type FROM features WHERE id = $1`,
        [payload.parentFeatureId]
      )
      if (!parent.rowCount) {
        res.status(404).json({ error: "Parent feature not found" })
        return
      }
      if (parent.rows[0].feature_type !== "commercial") {
        res.status(400).json({ error: "Parent must be a commercial feature (mall)" })
        return
      }
    }

    await pool.query(
      `UPDATE features SET parent_feature_id = $1 WHERE id = $2`,
      [payload.parentFeatureId, featureId]
    )

    res.json({ featureId, parentFeatureId: payload.parentFeatureId })
  } catch (error) {
    next(error)
  }
})

// ===== POI 自动获取（高德地图） =====

interface AmapPoiItem {
  id: string
  name: string
  type: string
  typecode: string
  biz_type: string[]
  address: string
  location: string
  tel: string
  distance: string
  biz_ext: string
  pname: string
  cityname: string
  adname: string
}

const poiFetchSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMeters: z.number().int().positive().max(3000).default(500),
  source: z.enum(["amap", "osm"]).default("amap"),
  categories: z.array(z.string()).optional()
})

router.post("/projects/:projectId/poi/fetch", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)
    const payload = poiFetchSchema.parse(req.body)

    if (payload.source === "amap") {
      const key = process.env.AMAP_API_KEY
      if (!key) {
        res.status(500).json({ error: "AMAP_API_KEY not configured in server environment" })
        return
      }

      const radius = Math.min(payload.radiusMeters, 3000)
      const types = payload.categories?.join("|") || AMAP_SEARCH_TYPES.all

      const url = buildAmapUrl("https://restapi.amap.com/v3/place/around", {
        location: `${payload.lng},${payload.lat}`,
        radius,
        types,
        offset: 25,
        page: 1,
        extensions: "all"
      })

      const response = await fetch(url)
      const data = (await response.json()) as {
        status: string
        pois: AmapPoiItem[]
        count: string
        info: string
      }

      if (data.status !== "1") {
        res.status(502).json({
          error: "Amap API returned error",
          details: { info: data.info, status: data.status }
        })
        return
      }

      const pois: AmapPoiItem[] = data.pois || []

      // Get our category IDs
      const catResult = await pool.query<{ id: number; code: string }>(
        `SELECT id, code FROM poi_categories`
      )
      const catByCode = new Map(catResult.rows.map((r) => [r.code, r.id]))

      const inserted: number[] = []
      for (const poi of pois) {
        const [lngStr, latStr] = poi.location.split(",")
        const poiLng = parseFloat(lngStr)
        const poiLat = parseFloat(latStr)

        const typecodePrefix = poi.typecode.slice(0, 2)
        const categoryCode = AMAP_CATEGORY_MAP[typecodePrefix] || "service"
        const categoryId = catByCode.get(categoryCode) || null

        const result = await pool.query(
          `INSERT INTO features (project_id, feature_type, geom, props, poi_source, poi_category_id)
           VALUES ($1, 'poi',
                   ST_SetSRID(ST_MakePoint($2, $3), 4326),
                   $4::jsonb, 'amap', $5)
           RETURNING id`,
          [
            projectId,
            poiLng,
            poiLat,
            JSON.stringify({
              name: poi.name,
              kind: "poi",
              address: poi.address,
              phone: poi.tel || undefined,
              amapType: poi.type,
              amapTypeCode: poi.typecode,
              amapBizType: poi.biz_type,
              distance: parseFloat(poi.distance)
            }),
            categoryId
          ]
        )
        inserted.push(result.rows[0].id)
      }

      res.json({
        source: "amap" as const,
        fetched: inserted.length,
        insertedIds: inserted
      })
    } else {
      // OSM stub - future implementation
      res.status(501).json({ error: "OSM POI fetch not yet implemented" })
    }
  } catch (error) {
    next(error)
  }
})

router.post("/projects/:projectId/graph/rebuild", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)
    const result = await rebuildRoadGraph(projectId)
    res.json({ result })
  } catch (error) {
    next(error)
  }
})

router.get("/projects/:projectId/graph/summary", async (req, res, next) => {
  try {
    const projectId = toPositiveInt(req.params.projectId)
    const summary = await getGraphSummary(projectId)
    res.json({ summary })
  } catch (error) {
    next(error)
  }
})

// ===== Feature ↔ Structure 桥接：地图建筑直连配置 =====

const structureLinkSchema = z.object({
  projectId: z.number().int().positive(),
  structureType: z.enum(["constructed", "natural", "hybrid"]),
  structureSubtype: z.string().min(1).max(40),
  name: z.string().max(120).optional(),
  brandId: z.number().int().positive().nullable().optional(),
  operatorEntityId: z.number().int().positive().nullable().optional(),
  ownerEntityId: z.number().int().positive().nullable().optional(),
  parentStructureId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  extraJson: z.record(z.any()).optional(),
})

// GET /api/features/:featureId/structure — 获取地图要素关联的 Structure
router.get("/features/:featureId/structure", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const result = await pool.query(
      `SELECT s.id, s.project_id AS "projectId", s.feature_id AS "featureId",
              s.structure_type AS "structureType", s.structure_subtype AS "structureSubtype",
              s.name, s.brand_id AS "brandId", s.operator_entity_id AS "operatorEntityId",
              s.owner_entity_id AS "ownerEntityId", s.parent_structure_id AS "parentStructureId",
              s.extra_json AS "extraJson", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
              b.name AS "brandName",
              oe.name AS "operatorEntityName",
              owe.name AS "ownerEntityName",
              ps.name AS "parentStructureName"
       FROM structures s
       LEFT JOIN brands b ON s.brand_id = b.id
       LEFT JOIN entities oe ON s.operator_entity_id = oe.id
       LEFT JOIN entities owe ON s.owner_entity_id = owe.id
       LEFT JOIN structures ps ON s.parent_structure_id = ps.id
       WHERE s.feature_id = $1`, [featureId]
    )
    if (!result.rowCount) { res.json(null); return }
    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// PUT /api/features/:featureId/structure — 创建或更新地图要素关联的 Structure
router.put("/features/:featureId/structure", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const data = structureLinkSchema.parse(req.body)

    // Check if structure already exists for this feature
    const existing = await pool.query(
      "SELECT id FROM structures WHERE feature_id = $1", [featureId]
    )

    let result
    if (existing.rowCount && existing.rows[0].id) {
      // Update — categoryId 未传时根据 structureSubtype 自动推导
      result = await pool.query(
        `UPDATE structures
         SET project_id=$1, structure_type=$2, structure_subtype=$3,
             name=$4, brand_id=$5, operator_entity_id=$6, owner_entity_id=$7,
             parent_structure_id=$8,
             category_id=COALESCE($9, (SELECT id FROM structure_categories WHERE code = $3)),
             extra_json=$10
         WHERE id=$11 RETURNING *`,
        [data.projectId, data.structureType, data.structureSubtype,
         data.name ?? null, data.brandId ?? null, data.operatorEntityId ?? null,
         data.ownerEntityId ?? null, data.parentStructureId ?? null,
         data.categoryId ?? null,
         JSON.stringify(data.extraJson ?? {}), existing.rows[0].id]
      )
    } else {
      // Create — categoryId 未传时根据 structureSubtype 自动推导
      result = await pool.query(
        `INSERT INTO structures (project_id, feature_id, structure_type, structure_subtype,
                                 name, brand_id, operator_entity_id, owner_entity_id,
                                 parent_structure_id, category_id, extra_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                 COALESCE($10, (SELECT id FROM structure_categories WHERE code = $4)),
                 $11) RETURNING *`,
        [data.projectId, featureId, data.structureType, data.structureSubtype,
         data.name ?? null, data.brandId ?? null, data.operatorEntityId ?? null,
         data.ownerEntityId ?? null, data.parentStructureId ?? null,
         data.categoryId ?? null,
         JSON.stringify(data.extraJson ?? {})]
      )
    }

    res.json(result.rows[0])
  } catch (err) { next(err) }
})

// GET /api/features/:featureId/structure/children — 获取子建筑/店铺
router.get("/features/:featureId/structure/children", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    // First find the structure
    const parent = await pool.query(
      "SELECT id FROM structures WHERE feature_id = $1", [featureId]
    )
    if (!parent.rowCount) { res.json([]); return }

    const children = await pool.query(
      `SELECT s.id, s.name, s.structure_subtype AS "structureSubtype",
              b.name AS "brandName",
              sa.shop_type AS "shopType", sa.floor_location AS "floorLocation",
              sa.area_sqm AS "areaSqm"
       FROM structures s
       LEFT JOIN brands b ON s.brand_id = b.id
       LEFT JOIN shop_attrs sa ON sa.structure_id = s.id
       WHERE s.parent_structure_id = $1
       ORDER BY s.name`, [parent.rows[0].id]
    )
    res.json(children.rows)
  } catch (err) { next(err) }
})

// ============================================================
// 地块↔建筑 M:N 关联 (parcel_structures)
// ============================================================

const parcelStructureSchema = z.object({
  structureId: z.number().int().positive(),
  relation: z.enum(["located_in", "intersects", "adjacent", "part_of"]).default("located_in")
})

// GET /api/features/:featureId/structures — 获取地块关联的所有建筑
router.get("/features/:featureId/structures", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const result = await pool.query(
      `SELECT ps.parcel_id AS "parcelId", ps.structure_id AS "structureId",
              ps.relation, ps.created_at AS "createdAt",
              s.name AS "structureName", s.structure_subtype AS "structureSubtype",
              s.structure_type AS "structureType",
              b.name AS "brandName",
              oe.name AS "operatorEntityName"
       FROM parcel_structures ps
       JOIN structures s ON s.id = ps.structure_id
       LEFT JOIN brands b ON s.brand_id = b.id
       LEFT JOIN entities oe ON s.operator_entity_id = oe.id
       WHERE ps.parcel_id = $1
       ORDER BY s.name`,
      [featureId]
    )
    res.json(result.rows)
  } catch (err) { next(err) }
})

// POST /api/features/:featureId/structures — 添加地块-建筑关联
router.post("/features/:featureId/structures", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const data = parcelStructureSchema.parse(req.body)

    // 验证地块存在
    const parcel = await pool.query("SELECT id FROM features WHERE id = $1", [featureId])
    if (!parcel.rowCount) { res.status(404).json({ error: "Parcel not found" }); return }

    // 验证建筑存在
    const structure = await pool.query("SELECT id FROM structures WHERE id = $1", [data.structureId])
    if (!structure.rowCount) { res.status(404).json({ error: "Structure not found" }); return }

    const result = await pool.query(
      `INSERT INTO parcel_structures (parcel_id, structure_id, relation)
       VALUES ($1, $2, $3)
       ON CONFLICT (parcel_id, structure_id)
       DO UPDATE SET relation = EXCLUDED.relation, created_at = NOW()
       RETURNING *`,
      [featureId, data.structureId, data.relation]
    )
    res.status(201).json(result.rows[0])
  } catch (err) { next(err) }
})

// DELETE /api/features/:featureId/structures/:structureId — 移除地块-建筑关联
router.delete("/features/:featureId/structures/:structureId", async (req, res, next) => {
  try {
    const featureId = toPositiveInt(req.params.featureId)
    const structureId = toPositiveInt(req.params.structureId)
    const result = await pool.query(
      "DELETE FROM parcel_structures WHERE parcel_id = $1 AND structure_id = $2 RETURNING *",
      [featureId, structureId]
    )
    if (!result.rowCount) {
      res.status(404).json({ error: "Parcel-structure link not found" })
      return
    }
    res.status(204).send()
  } catch (err) { next(err) }
})

export default router

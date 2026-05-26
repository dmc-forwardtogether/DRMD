import { pool } from "../db.js"

type Coord = [number, number]

type GeoLineString = {
  type: "LineString"
  coordinates: Coord[]
}

type GeoMultiLineString = {
  type: "MultiLineString"
  coordinates: Coord[][]
}

interface RoadFeatureRow {
  id: number
  geometry: GeoLineString | GeoMultiLineString
  props: Record<string, unknown> | null
}

interface EdgeDraft {
  sourceKey: string
  targetKey: string
  sourceFeatureId: number
  lengthM: number
  speedKph: number
  capacity: number
  travelTimeS: number
  geometry: GeoLineString
}

export interface GraphRebuildResult {
  projectId: number
  roadFeatureCount: number
  nodeCount: number
  edgeCount: number
  invalidGeometryCount: number
  componentCount: number
  largestComponentNodeCount: number
  warnings: string[]
}

function toNodeKey(coord: Coord): string {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`
}

function haversineMeters(from: Coord, to: Coord): number {
  const earthRadius = 6371000
  const lat1 = (from[1] * Math.PI) / 180
  const lat2 = (to[1] * Math.PI) / 180
  const dLat = ((to[1] - from[1]) * Math.PI) / 180
  const dLng = ((to[0] - from[0]) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function collectLineStrings(geometry: GeoLineString | GeoMultiLineString): Coord[][] {
  if (geometry.type === "LineString") {
    return [geometry.coordinates]
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates
  }
  return []
}

function calcConnectedComponents(nodeIds: number[], edgePairs: Array<[number, number]>): {
  componentCount: number
  largestComponentNodeCount: number
} {
  if (nodeIds.length === 0) {
    return { componentCount: 0, largestComponentNodeCount: 0 }
  }

  const adjacency = new Map<number, Set<number>>()
  nodeIds.forEach((id) => {
    adjacency.set(id, new Set())
  })

  edgePairs.forEach(([from, to]) => {
    adjacency.get(from)?.add(to)
    adjacency.get(to)?.add(from)
  })

  const visited = new Set<number>()
  let componentCount = 0
  let largestComponentNodeCount = 0

  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) continue
    componentCount += 1

    const queue: number[] = [nodeId]
    visited.add(nodeId)
    let head = 0
    let size = 0

    while (head < queue.length) {
      const current = queue[head]
      head += 1
      size += 1
      const neighbors = adjacency.get(current)
      if (!neighbors) continue
      neighbors.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      })
    }

    if (size > largestComponentNodeCount) {
      largestComponentNodeCount = size
    }
  }

  return { componentCount, largestComponentNodeCount }
}

export async function rebuildRoadGraph(projectId: number): Promise<GraphRebuildResult> {
  const roadsResult = await pool.query<RoadFeatureRow>(
    `
      SELECT
        id,
        ST_AsGeoJSON(geom)::json AS geometry,
        props
      FROM features
      WHERE project_id = $1
        AND feature_type = 'road'
    `,
    [projectId]
  )

  const nodeCoordMap = new Map<string, Coord>()
  const nodeDegreeMap = new Map<string, number>()
  const edges: EdgeDraft[] = []
  let invalidGeometryCount = 0

  for (const row of roadsResult.rows) {
    const lines = collectLineStrings(row.geometry)
    const speedKph = Math.max(1, Number(row.props?.speedKph ?? 30))
    const capacity = Math.max(1, Number(row.props?.capacity ?? 1000))
    const oneWay = Boolean(row.props?.oneWay ?? false)

    for (const line of lines) {
      if (!Array.isArray(line) || line.length < 2) {
        invalidGeometryCount += 1
        continue
      }

      for (let index = 0; index < line.length - 1; index += 1) {
        const from = line[index]
        const to = line[index + 1]

        if (!Array.isArray(from) || !Array.isArray(to) || from.length < 2 || to.length < 2) {
          invalidGeometryCount += 1
          continue
        }

        if (from[0] === to[0] && from[1] === to[1]) {
          invalidGeometryCount += 1
          continue
        }

        const fromCoord: Coord = [from[0], from[1]]
        const toCoord: Coord = [to[0], to[1]]

        const fromKey = toNodeKey(fromCoord)
        const toKey = toNodeKey(toCoord)

        nodeCoordMap.set(fromKey, fromCoord)
        nodeCoordMap.set(toKey, toCoord)
        nodeDegreeMap.set(fromKey, (nodeDegreeMap.get(fromKey) || 0) + 1)
        nodeDegreeMap.set(toKey, (nodeDegreeMap.get(toKey) || 0) + 1)

        const lengthM = haversineMeters(fromCoord, toCoord)
        const travelTimeS = lengthM / ((speedKph * 1000) / 3600)

        edges.push({
          sourceKey: fromKey,
          targetKey: toKey,
          sourceFeatureId: row.id,
          lengthM,
          speedKph,
          capacity,
          travelTimeS,
          geometry: {
            type: "LineString",
            coordinates: [fromCoord, toCoord]
          }
        })

        if (!oneWay) {
          edges.push({
            sourceKey: toKey,
            targetKey: fromKey,
            sourceFeatureId: row.id,
            lengthM,
            speedKph,
            capacity,
            travelTimeS,
            geometry: {
              type: "LineString",
              coordinates: [toCoord, fromCoord]
            }
          })
        }
      }
    }
  }

  const client = await pool.connect()
  const nodeIdByKey = new Map<string, number>()

  try {
    await client.query("BEGIN")
    await client.query("DELETE FROM road_edges WHERE project_id = $1", [projectId])
    await client.query("DELETE FROM road_nodes WHERE project_id = $1", [projectId])

    for (const [key, coord] of nodeCoordMap.entries()) {
      const degree = nodeDegreeMap.get(key) || 0
      const inserted = await client.query<{ id: number }>(
        `
          INSERT INTO road_nodes(project_id, node_key, geom, degree)
          VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5)
          RETURNING id
        `,
        [projectId, key, coord[0], coord[1], degree]
      )
      nodeIdByKey.set(key, inserted.rows[0].id)
    }

    for (const edge of edges) {
      const sourceNodeId = nodeIdByKey.get(edge.sourceKey)
      const targetNodeId = nodeIdByKey.get(edge.targetKey)
      if (!sourceNodeId || !targetNodeId) continue

      await client.query(
        `
          INSERT INTO road_edges(
            project_id,
            source_node_id,
            target_node_id,
            source_feature_id,
            length_m,
            speed_kph,
            capacity,
            travel_time_s,
            geom
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            ST_SetSRID(ST_GeomFromGeoJSON($9), 4326)
          )
        `,
        [
          projectId,
          sourceNodeId,
          targetNodeId,
          edge.sourceFeatureId,
          edge.lengthM,
          edge.speedKph,
          edge.capacity,
          edge.travelTimeS,
          JSON.stringify(edge.geometry)
        ]
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  const edgePairs: Array<[number, number]> = edges
    .map((edge) => {
      const from = nodeIdByKey.get(edge.sourceKey)
      const to = nodeIdByKey.get(edge.targetKey)
      if (!from || !to) return null
      return [from, to] as [number, number]
    })
    .filter((pair): pair is [number, number] => pair !== null)

  const nodeIds = [...nodeIdByKey.values()]
  const { componentCount, largestComponentNodeCount } = calcConnectedComponents(nodeIds, edgePairs)

  const warnings: string[] = []
  if (invalidGeometryCount > 0) {
    warnings.push(`Skipped ${invalidGeometryCount} invalid road segments while building graph.`)
  }
  if (componentCount > 1) {
    warnings.push(`Road graph has ${componentCount} disconnected components.`)
  }

  return {
    projectId,
    roadFeatureCount: roadsResult.rowCount || 0,
    nodeCount: nodeIds.length,
    edgeCount: edges.length,
    invalidGeometryCount,
    componentCount,
    largestComponentNodeCount,
    warnings
  }
}

export async function getGraphSummary(projectId: number): Promise<{
  projectId: number
  nodeCount: number
  edgeCount: number
  avgTravelTimeS: number
  avgLengthM: number
}> {
  const [nodesResult, edgesResult] = await Promise.all([
    pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM road_nodes WHERE project_id = $1", [projectId]),
    pool.query<{ count: string; avg_time: string | null; avg_length: string | null }>(
      `
        SELECT
          COUNT(*)::text AS count,
          AVG(travel_time_s)::text AS avg_time,
          AVG(length_m)::text AS avg_length
        FROM road_edges
        WHERE project_id = $1
      `,
      [projectId]
    )
  ])

  return {
    projectId,
    nodeCount: Number(nodesResult.rows[0]?.count || 0),
    edgeCount: Number(edgesResult.rows[0]?.count || 0),
    avgTravelTimeS: Number(edgesResult.rows[0]?.avg_time || 0),
    avgLengthM: Number(edgesResult.rows[0]?.avg_length || 0)
  }
}

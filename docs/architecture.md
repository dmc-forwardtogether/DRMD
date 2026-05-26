# DRMD Architecture

## 1. High-level modules

- web-app (Nuxt + MapLibre)
  - Edit residential areas, roads, and POIs.
  - Manage layers, attributes, and validation.
  - Preview simulation density overlays.
- api-server (Express + TypeScript)
  - CRUD for projects, layers, and features.
  - Feature validation and topology checks.
  - Simulation orchestration endpoints.
  - WebSocket channels for simulation ticks.
- simulation-engine (worker process)
  - Build graph from road features.
  - Spawn and move agents with step-based updates.
  - Emit per-tick metrics and heatmap tiles.
- postgres (PostGIS)
  - Store source geometries and simulation snapshots.

## 2. Data flow

1. Editor creates or updates GeoJSON features.
2. API persists geometry in PostGIS and marks graph index stale.
3. Graph builder regenerates road graph (nodes/edges, costs, capacities).
4. Scenario service starts a simulation run using a fixed seed.
5. Engine publishes ticks over WebSocket and persists snapshots.
6. UI renders crowd flow layers from stream + persisted checkpoints.

## 3. Proposed bounded contexts

- map-editing
  - Entities: project, layer, feature, style-rule.
- network-index
  - Entities: node, edge, turn-cost, capacity-profile.
- simulation
  - Entities: scenario, agent-template, run, tick, aggregate-metric.

## 4. Initial API sketch

- POST /api/projects
- GET /api/projects/:projectId
- GET /api/projects/:projectId/features
- POST /api/projects/:projectId/features
- PATCH /api/features/:featureId
- DELETE /api/features/:featureId

- POST /api/projects/:projectId/simulations
- POST /api/simulations/:runId/start
- POST /api/simulations/:runId/pause
- POST /api/simulations/:runId/stop
- GET /api/simulations/:runId/metrics

- WS /ws/simulations/:runId
  - events: tick, metric, state-change, error

## 5. Core schema direction (PostGIS)

- projects
  - id, name, srid, created_at, updated_at
- layers
  - id, project_id, type (road|residential|poi|boundary), style_json
- features
  - id, project_id, layer_id, geom geometry, props jsonb, version
- road_nodes
  - id, project_id, geom point, degree
- road_edges
  - id, project_id, from_node, to_node, geom linestring, length_m, speed_kph, capacity
- sim_scenarios
  - id, project_id, name, seed, config_json
- sim_runs
  - id, scenario_id, status, started_at, ended_at
- sim_ticks
  - id, run_id, tick_no, agents_json, metrics_json, created_at

## 6. Why Vue-first instead of React-first

- The editing workflow already exists in gis-editor with Mapbox Draw integration.
- TREK map modules are optimized for itinerary display, not feature authoring.
- Reusing gis-editor patterns reduces phase-1 delivery risk.

## 7. What to reuse immediately

- gis-editor map component structure and draw mode handling.
- gis-editor tile proxy pattern (migrate cache storage to PostGIS-ready schema).
- TREK route/service split and WebSocket room broadcasting model.
- TREK-like typed store slices for future simulation panels.

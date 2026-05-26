# DRMD Roadmap

## Milestone 0: Foundation (1 week)

- Initialize repository layout:
  - apps/web
  - apps/server
  - packages/shared-types
- Define shared GeoJSON-based domain types.
- Add local docker stack (postgres + postgis).

Exit criteria:
- Web and server boot locally.
- Health checks and DB migrations pass.

## Milestone 1: OSM-like editing MVP (2-3 weeks)

- Draw and edit:
  - residential polygons
  - road lines
  - POI points
- Feature attributes panel.
- Save/load project features.
- Layer visibility and style rules.

Exit criteria:
- A user can create a small district map and reload it losslessly.

## Milestone 2: Topology and graph build (1-2 weeks)

- Convert road features into directed graph.
- Build node-edge tables with capacity and travel cost.
- Validate disconnected components and broken geometry.

Exit criteria:
- Graph rebuild is deterministic and queryable via API.

## Milestone 3: Crowd simulation alpha (2-3 weeks)

- Agent spawner by zone/time profile.
- Route choice over road graph.
- Tick-based movement and congestion updates.
- Real-time heatmap rendering in UI.

Exit criteria:
- User can run, pause, and reset a simulation with repeatable seed results.

## Milestone 4: Analysis and scenario compare (2 weeks)

- KPI dashboard: density, throughput, average travel time, bottlenecks.
- Side-by-side scenario compare.
- Export run report (JSON/CSV).

Exit criteria:
- User can compare at least two scenarios and export metrics.

## Risks and mitigations

- Risk: Geometry quality is inconsistent.
  - Mitigation: enforce topology checks before simulation run.
- Risk: Simulation frame time becomes unstable with many agents.
  - Mitigation: move engine to worker threads and aggregate tick payload.
- Risk: Scope creep in phase 1 UI.
  - Mitigation: freeze editing primitives to road/residential/poi only.

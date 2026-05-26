import cors from "cors"
import express from "express"
import { ZodError } from "zod"
import { AppError } from "@drmd/shared-types"
import { pool, runMigrations } from "./db.js"
import apiRouter from "./routes/api.js"
import configRouter from "./routes/configRoutes.js"

const app = express()
const port = Number(process.env.PORT || 8899)
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000"

app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: "5mb" }))

app.get("/healthz", (_req, res) => {
  res.json({ ok: true })
})

app.use("/api", apiRouter)
app.use("/api/config", configRouter)

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: error.issues
    })
    return
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message })
    return
  }

  console.error(error)
  res.status(500).json({ error: "Internal server error" })
})

async function bootstrap(): Promise<void> {
  await runMigrations()

  // Ensure a default project exists
  const existing = await pool.query("SELECT id FROM projects LIMIT 1")
  if (!existing.rowCount) {
    await pool.query(
      `INSERT INTO projects(name, srid) VALUES ('Default Project', 4326)`
    )
    console.log("Created default project (id=1)")
  }

  app.listen(port, () => {
    console.log(`DRMD server listening on http://localhost:${port}`)
  })
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error)
  process.exit(1)
})

async function shutdown(): Promise<void> {
  await pool.end()
  process.exit(0)
}

process.on("SIGINT", () => {
  shutdown().catch((error) => {
    console.error("Shutdown error", error)
    process.exit(1)
  })
})

process.on("SIGTERM", () => {
  shutdown().catch((error) => {
    console.error("Shutdown error", error)
    process.exit(1)
  })
})

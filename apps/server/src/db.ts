import "dotenv/config"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Pool, types } from "pg"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL is required. Create apps/server/.env or set DATABASE_URL in shell.")
}

// Parse PostgreSQL BIGINT (int8, OID=20) as JavaScript number
// Safe for our use case: all IDs are well within Number.MAX_SAFE_INTEGER
types.setTypeParser(20, (val: string) => parseInt(val, 10))

export const pool = new Pool({
  connectionString,
  max: 15
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(__dirname, "../migrations")

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const entries = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()

  for (const fileName of entries) {
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [fileName])
    if (existing.rowCount && existing.rowCount > 0) {
      continue
    }

    const sqlPath = path.join(migrationsDir, fileName)
    const sql = await readFile(sqlPath, "utf8")

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(sql)
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [fileName])
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
}

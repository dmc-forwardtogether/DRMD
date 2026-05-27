# DRMD Project Instructions

## Language Policy

- **All UI-facing text must be in English.** This includes labels, buttons, placeholders, status messages, tooltips, error messages, and dialog titles.
- **Hard-coded user-facing strings are discouraged.** Extract them into constants or a lightweight i18n layer so that future Chinese (中文) localization can be added without refactoring UI code.
- When introducing a new user-visible string, prefer a pattern like:
  ```ts
  // Option A: inline with a comment marker for extraction later
  const label = "Base Map Style" // i18n

  // Option B: centralized message map (preferred for repeated strings)
  const MSG = {
    createProject: "New Project",
    cancel: "Cancel",
    loading: "Loading...",
  } as const
  ```
- **Layout must tolerate longer text.** Chinese translations are typically shorter than English, but some terms may be longer. Use `min-width`, `truncate`, or `flex-shrink` to avoid layout breakage when switching languages later.
- **Do not use emojis as the sole identifier for a UI element.** Always pair icons/emojis with a text label so the meaning survives translation.
- Database seed data (e.g. structure categories, POI categories) that is user-visible should store a `code` (machine key) alongside the display `name`, so `name` can be swapped to Chinese later without breaking queries.
- API error messages returned to the frontend should be in English. Server-side log messages can be in Chinese if preferred.

## Code Style

- TypeScript strict mode.
- Vue 3 Composition API with `<script setup>`.
- Tailwind CSS for styling; avoid inline `style` attributes.
- Prefer `replace_string_in_file` over `insert_edit_into_file` for edits.

## Architecture

- Monorepo: `apps/web` (Nuxt 3), `apps/server` (Express), `packages/shared-types`.
- PostGIS for all spatial data. Migrations in `apps/server/migrations/`.
- Project-level config stored in `projects.config_json` (JSONB). Each feature module owns a section key (e.g. `mapStyle`, `render`, `simulation`).
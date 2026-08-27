# SA Content Hub

## Overview

A content automation dashboard for finding South African businesses, generating website page content via AI, and pushing approved content to a Lovable/Supabase site. One new business is featured per day.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec`)
- **Frontend**: React + Vite (at path `/`)
- **AI**: Anthropic Claude (`claude-haiku-4-5`) via Replit AI integration
- **Design**: Warm ochre/earth SA palette (Inter + Playfair Display fonts)

## Architecture

```
artifacts/
  sa-content-hub/     — React+Vite frontend (path: /)
  api-server/         — Express API server (path: /api)
lib/
  db/                 — Drizzle ORM schema + migrations
  api-spec/           — OpenAPI spec (source of truth)
  api-client-react/   — Orval-generated React Query hooks
  api-zod/            — Orval-generated Zod schemas
  integrations-anthropic-ai/ — Anthropic AI client
```

## Database Tables

- `businesses` — SA business seed list (name, website, province, industry, status)
- `content_entries` — AI-generated content per business (founder, product, location, etc.)
- `notifications` — In-app notifications for content ready/approved/rejected
- `app_settings` — Supabase connection config, notification email, schedule time
- `activity_log` — Timeline of all system events

## Key Features

1. **Dashboard** — Stats, activity feed, one-click content generation
2. **Business List** — Add/edit/delete SA businesses for the pipeline
3. **Content Queue** — Filter and review AI-generated content
4. **Content Detail** — Edit AI content, approve into the publication queue, push approved content live, or reject
5. **Notifications** — In-app alerts when content is ready for review
6. **Settings** — Supabase URL/key/table, notification email, daily schedule time

## Content Flow

1. Click "Generate Today's Content" → searches online for a new South African business that has not been processed before → calls Claude AI → saves as `pending_review` → creates notification
2. Review content in Content Queue → click into detail page
3. Edit any fields, then Approve → status becomes `approved` and waits in the publication queue
4. Push approved content to Supabase → status becomes `published` only after the live-site push succeeds
5. If the live-site push is unavailable, content remains `approved` so it can be retried later
6. Or Reject with a note → status becomes `rejected` and that business is skipped permanently
7. Deleting a queue entry also permanently skips its business so it cannot be generated again

## Supabase Push

On publication, content is POSTed to `{supabaseUrl}/rest/v1/{supabaseTableName}` with columns:
`business_name`, `founder_name`, `founder_bio`, `standout_product`, `product_description`,
`business_description`, `location`, `made_in_sa`, `call_to_action`, `website_url`, `scheduled_date`, `published_at`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (run before artifact typechecks)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## AI Model

Uses `claude-haiku-4-5` via `@workspace/integrations-anthropic-ai`. Falls back to placeholder content if AI call fails.

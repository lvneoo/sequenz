# Sequenz

Sequenz turns an infopreneur's brand assets and offer into scheduled Instagram Story slideshows. It generates a concise multi-slide narrative, pairs each slide with a relevant image, renders the text overlay, and publishes the finished sequence to a connected Instagram account.

## What it does

- Authenticates creators with Kinde.
- Connects Instagram professional accounts through OAuth.
- Maintains a separate brand profile and media library for each account.
- Configures recurring “Client wins” and “Selling Story” sequences.
- Generates five- to six-slide copy with an AI model.
- Ranks uploaded images against each generated slide and reuses them when necessary.
- Renders branded text overlays and stores publishable JPEGs in Vercel Blob.
- Publishes Stories through the Instagram Graph API.
- Enforces plan features, connected-account limits, and monthly Story quotas.
- Runs recurring generation and publishing as durable Vercel Workflows.

## How a sequence is produced

```text
Schedule becomes due
       ↓
Load profile, offer, CTA, and brand guidelines
       ↓
Generate a 5–6 slide Story narrative
       ↓
Select library images and render text overlays
       ↓
Store the generated sequence and slide records
       ↓
Create and publish Instagram media containers
       ↓
Calculate the next scheduled run
```

The workflow is durable: after publishing a sequence it sleeps until the next configured run instead of relying on an in-process timer.

## Tech stack

- Next.js 16 and React 19
- TypeScript and Tailwind CSS 4
- Vercel Workflow DevKit for durable scheduling
- Vercel AI SDK and AI Gateway for structured copy generation
- Vercel Blob and Sharp for slide rendering
- Instagram Graph API for Story publishing
- Kinde for authentication, billing plans, and entitlements
- PostgreSQL (Neon-compatible) with Drizzle ORM
- Tiptap for rich-text editing
- Base UI and shadcn components

## Local development

### Prerequisites

- [Bun](https://bun.sh/)
- A PostgreSQL database
- A Kinde application with the required plans and entitlements
- A Meta app configured for Instagram API access
- A Vercel Blob store
- Vercel AI Gateway credentials

The Instagram account used for end-to-end testing must be eligible for the `instagram_business_*` permissions requested by the application.

### 1. Install dependencies

```bash
bun install
```

### 2. Configure the environment

Create `.env.local` in the project root. The application directly uses the following values:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE

# Public application configuration
NEXT_PUBLIC_API_VERSION=v1
NEXT_PUBLIC_KINDE_AUTH_API_PATH=/api/auth
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3000/dashboard

# Kinde Next.js SDK
KINDE_CLIENT_ID=your_kinde_client_id
KINDE_CLIENT_SECRET=your_kinde_client_secret
KINDE_ISSUER_URL=https://your-subdomain.kinde.com
KINDE_SITE_URL=http://localhost:3000
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000/dashboard
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000

# Instagram OAuth
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
CALLBACK_URL=http://localhost:3000/api/v1/oauth/redirect
OAUTH_STATE_SECRET=replace_with_a_long_random_secret

# Media and generation
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
AI_GATEWAY_API_KEY=your_ai_gateway_api_key
```

Register the exact `CALLBACK_URL` with the Meta app. Kinde's allowed callback and logout URLs must also match the local URLs above. Keep all non-`NEXT_PUBLIC_` values server-only and never commit `.env.local`.

### 3. Create the database schema

Confirm that `DATABASE_URL` points to a disposable local or development database, then run:

```bash
bunx drizzle-kit push
```

Do not push schema changes to a shared or production database without reviewing the target and migration first.

### 4. Start the app

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/dashboard`.

## Kinde configuration

Sequenz resolves access from Kinde plan and feature entitlements. The current application recognizes these plan keys:

- `starter`
- `growth`
- `pro`

Relevant feature codes include `story_scheduling`, `ai_generation`, connected-account limits, and monthly Story limits. A user without a matching active entitlement cannot connect an account or start the publishing workflow.

## Instagram configuration

The OAuth flow requests these permissions:

- `instagram_business_basic`
- `instagram_business_content_publish`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

The callback exchanges the authorization code for a long-lived token and stores it with the connected profile. Publishing refreshes an expired token when Instagram returns the recognized expiration response. Generated assets must remain publicly reachable JPEGs while Instagram creates its media containers.

## Useful commands

```bash
bun run dev      # Start the development server
bun run lint     # Run ESLint
bun run build    # Create a production build
bun run start    # Serve the production build
```

## Project structure

```text
app/                         Pages and API routes
components/                  Product, editor, and UI components
workflows/sequences/         Durable generation and publishing workflow
utils/db/                    Drizzle schema and data access
utils/billing/               Kinde entitlement and quota rules
utils/sequences/             Sequence creation and scheduling logic
lib/                         Instagram OAuth and shared utilities
```

The workflow steps are intentionally separated into context loading, content generation, asset processing, persistence, publishing, and rescheduling. Start with `workflows/sequences/workflow.ts` when tracing an automated run.

## Deployment

Sequenz is designed around Vercel services. For a hosted deployment:

1. Provision PostgreSQL and Vercel Blob.
2. Configure all environment variables for the deployment environment.
3. Add the production Kinde and Instagram callback URLs to their provider dashboards.
4. Configure Kinde plan keys and feature entitlements to match the application.
5. Deploy the Next.js application with Workflow support enabled.
6. Test one connected account and a single Story sequence before enabling recurring schedules.

## Status

Sequenz is under active development. Use a test Instagram account and non-production database while configuring OAuth, billing, generation, and publishing. Review `launch-reports/main.md` before treating the current build as launch-ready.

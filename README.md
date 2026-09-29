# Aero Diary

Aero Diary is a private mood journal with a bright **Frutiger Aero** visual style.

Capture your days through notes, moods, activities, and photos, then revisit your memories on a timeline or through a conversation with Aero AI.

![Aero Diary showcase](docs/images/aero-diary-showcase.png)

## Highlights

- ✨ **Automatic activity inference** — an LLM analyzes journal entries and attaches matching activities automatically.
- 📝 **Mood journaling** — record notes, moods, activities, and photos.
- 💬 **Aero AI** — have natural conversations about your journal history, with semantic memory and saved chats to return to.
- 📅 **Timeline & calendar** — browse memories chronologically or by date.
- 📊 **Insights** — explore patterns across moods and activities.
- 🪄 **AI-assisted polishing** — optionally improve journal entries through an OpenAI-compatible LLM.
- 📷 **Photo support** — attach photos to journal entries.
- 🔐 **Private by design** — journal data is protected behind authentication, with an optional PIN app lock for shared devices.
- 🌤️ **Frutiger Aero UI** — glass panels, gradients, glossy controls, bubbles, and mood-driven visuals.

## Tech Stack

**Next.js 16 · React 19 · TypeScript · Prisma · PostgreSQL · pgvector · Tailwind CSS · Vitest · Playwright**

LLM features support OpenAI-compatible APIs.

## Local Development

Requires Node.js 22+ and pnpm.
```bash
cp .env.example .env.local
docker compose up -d
pnpm install
pnpm db:setup
pnpm create-user you@example.com your-password
pnpm dev
```

Then open [localhost:3000](http://localhost:3000).

See `.env.example` for LLM, journal-memory, and Google Drive configuration.

External clients on the private Tailscale network can use Aero AI's shared chat
API. See the [Aero AI API guide](docs/aero-ai-api.md) for token setup and HTTP examples.

## Tests

Configure `TEST_DATABASE_URL` for an isolated PostgreSQL test database, then run:

```bash
pnpm test
```

Tests clear application tables; never use a personal or production database.

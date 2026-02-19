# AI Dev Hub

## Overview
AI Dev Hub is a standalone application designed as a central command center for managing multiple software projects, tasks, and AI-assisted code review. It organizes work using a hierarchical model: Businesses contain Projects and Repositories, while Tasks belong to Projects. The core purpose is to streamline software development workflows, enhance collaboration through AI, and provide robust project oversight. It leverages AI for various functions including code review, task generation, and an intelligent business manager, aiming to improve development efficiency and product quality.

## User Preferences
I want iterative development. I want detailed explanations. I prefer clear and concise communication. Do not make changes to the `client/src/pages/changelog-view.tsx` file. Do not make changes to the `data/store.json` file without explicit confirmation. Ask before making major architectural changes.

## System Architecture
The application follows a client-server architecture. The frontend is built with React, Vite, TailwindCSS, and Shadcn UI, providing a modern and responsive user interface. Key UI/UX decisions include a dark mode by default, an intuitive sidebar navigation with a business switcher, and consistent design components. The backend uses Node.js with Express, handling API requests and business logic. Data persistence is managed through PostgreSQL (Neon-backed) using Drizzle ORM, ensuring data syncs between development preview and published app. The database schema is defined in `shared/schema.ts` with Drizzle table definitions alongside Zod validation schemas. The storage layer (`server/storage.ts`) defines an async `IStorage` interface, implemented by `DatabaseStorage` in `server/dbStorage.ts`. Historical data was migrated from the original JSON file (`data/store.json`) to PostgreSQL.

**Key Architectural Decisions & Features:**
- **Business Isolation:** Each "Business" entity is fully isolated, managing its own projects, repositories, tasks, and AI agent configurations.
- **Hierarchical Data Model:** A clear structure of Business → Projects/Repositories → Tasks, enabling organized management.
- **AI Integration:** Deep integration of AI agents (e.g., Claude, ChatGPT) for code review, task discussion, prompt generation, and intelligent business management.
- **GitHub Integration:** Securely proxies GitHub API calls through the backend, allowing file viewing and AI to access repository content without exposing tokens client-side.
- **Task Management:** Comprehensive task tracking with status flows, priority, and optional linking to specific repositories and files. Includes features like bulk import and automatic repository linking for tasks.
- **AI Business Manager:** An intelligent assistant providing business insights, alerts, and the ability to propose and execute actions (e.g., create tasks, update statuses) with user approval.
- **Code Review & Analysis:** AI-powered code review and automatic task analysis that provides structured reports and facilitates generating actionable fix prompts.
- **PWA Support:** Progressive Web App capabilities for installability and offline access.

## External Dependencies
- **GitHub API:** For repository management, file browsing, and fetching code content.
- **Anthropic Claude API:** Primary AI agent for code review, task discussion, prompt generation, and business management.
- **OpenAI ChatGPT API (Optional):** Alternative AI agent for various functions.
- **Web Speech API:** For voice input functionality in the AI Business Manager chat.
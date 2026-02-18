import type { StoreData } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const STORE_PATH = path.join(process.cwd(), "data", "store.json");

export function seedData() {
  if (fs.existsSync(STORE_PATH)) {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const data = JSON.parse(raw);
    if ((data.businesses && data.businesses.length > 0) || (data.repositories && data.repositories.length > 0)) {
      return;
    }
  }

  const seedStore: StoreData = {
    businesses: [
      {
        id: "B1",
        name: "Cool Dispatch",
        description: "Fleet logistics app",
        color: "#58a6ff",
      },
    ],
    repositories: [
      {
        id: "R1",
        businessId: "B1",
        name: "cooldispatch",
        description: "Main application repository",
        repoUrl: "https://github.com/freshlife78/cooldispatch",
        owner: "freshlife78",
        repo: "cooldispatch",
        token: "",
        type: "fullstack",
      },
    ],
    projects: [
      {
        id: "P1",
        businessId: "B1",
        name: "Samsara Integration",
        description: "Routes, driver sync & API connectivity",
        color: "#58a6ff",
        relatedRepositories: ["R1"],
      },
      {
        id: "P2",
        businessId: "B1",
        name: "Account Migration",
        description: "User-centric to company-centric fixes",
        color: "#f78166",
        relatedRepositories: ["R1"],
      },
    ],
    tasks: {
      P1: [
        {
          id: "BUG-001",
          projectId: "P1",
          repositoryId: "R1",
          type: "Bug",
          status: "Open",
          priority: "High",
          title: "Samsara API: Driver assignment not syncing",
          description: "Route #10 shows driver Jatinder correctly assigned in the app and saved to the database, but the assignment was never pushed to Samsara. No error was shown — it failed silently.",
          reasoning: "The app has two systems that need to stay in sync: the internal database and Samsara. Since the database is correct but Samsara is not, the save step worked and the API sync either did not run or ran and failed without being caught.",
          fixSteps: "1. Find where driver assignment is handled and confirm the Samsara API call is triggered after the save\n2. Make sure the API call is properly awaited\n3. Add error logging on the Samsara API response so any failure is visible\n4. Add a retry or alert mechanism if the sync to Samsara fails",
          replitPrompt: "Route #10 had driver Jatinder assigned in the app and saved correctly to the database, but the assignment was never pushed to Samsara. No error was shown — it failed silently. Most likely causes: 1. The Samsara API call is not being triggered after the database save 2. The API call is firing but not being awaited 3. No error handling on the Samsara API response. What I need you to do: 1. Find where driver assignment is handled and confirm the Samsara API call is triggered after the save 2. Make sure the API call is properly awaited 3. Add error logging on the Samsara API response so failures are visible 4. Add a retry or alert mechanism if the sync to Samsara fails",
          filePath: "",
        },
        {
          id: "ARCH-001",
          projectId: "P1",
          repositoryId: "R1",
          type: "Bug",
          status: "Open",
          priority: "High",
          title: "Samsara sync failure warning not shown to admin",
          description: "When a driver is assigned to a route and the Samsara sync fails, the API returns a warning field in the response JSON but the admin UI is not displaying it. The dispatcher sees a success and has no idea the Samsara sync failed silently.",
          reasoning: "The backend correctly detects the sync failure and sets a samsaraSyncError variable, then returns it as a warning field in the JSON response. However the frontend is not reading or displaying this field.",
          fixSteps: "1. Find where PATCH /api/admin/routes/:id response is handled on the frontend in client/src\n2. Check if the warning field from the response is being read\n3. Add a visible yellow warning banner or toast that says \"Route saved but Samsara sync failed — driver may not be assigned in Samsara\"\n4. Make sure the warning stays visible long enough for the dispatcher to notice",
          replitPrompt: "In server/routes.ts, the PATCH /api/admin/routes/:id endpoint returns a warning field in the JSON response when the Samsara driver/vehicle sync fails. The admin UI is not displaying this warning — the dispatcher sees a success and has no idea the sync failed. What I need you to do: 1. Find where PATCH /api/admin/routes/:id response is handled on the frontend in client/src 2. Check if the warning field from the response is being read and displayed 3. If not shown, add a visible warning notification — a yellow banner or toast saying \"Route saved but Samsara sync failed — driver may not be assigned in Samsara\" 4. Make sure this warning stays visible long enough for the dispatcher to notice, not just a brief flash",
          filePath: "",
        },
        {
          id: "ARCH-003",
          projectId: "P1",
          repositoryId: "R1",
          type: "Task",
          status: "Open",
          priority: "Medium",
          title: "routes.ts too large, needs to be split by domain",
          description: "server/routes.ts is nearly 2000 lines and contains every API endpoint in one file. Every feature, integration, and auth check is in one place making bugs hard to find and changes risky.",
          reasoning: "A single 2000-line file means any change to one domain (e.g. Samsara) risks breaking another (e.g. customer auth). It also makes code review extremely difficult. Splitting by domain isolates risk and makes each area independently maintainable.",
          fixSteps: "1. Create server/routes/admin.ts for all /api/admin/* routes\n2. Create server/routes/customer.ts for all /api/customer/* and /api/user/* routes\n3. Create server/routes/driver.ts for all /api/driver/* routes\n4. Create server/routes/samsara.ts for all /api/admin/samsara/* routes\n5. Create server/routes/public.ts for contact, jobs, public route-request endpoints\n6. Keep main routes.ts as an index that imports and registers all of these",
          replitPrompt: "server/routes.ts is nearly 2000 lines in a single file. Please split it into separate route files by domain: server/routes/admin.ts (all /api/admin/* routes), server/routes/customer.ts (all /api/customer/* and /api/user/* routes), server/routes/driver.ts (all /api/driver/* routes), server/routes/samsara.ts (all /api/admin/samsara/* routes), server/routes/public.ts (contact, jobs, route-request public endpoints). Keep the main routes.ts as an index that imports and registers all of these. Do not change any endpoint behavior — this is purely structural.",
          filePath: "",
        },
        {
          id: "ARCH-004",
          projectId: "P1",
          repositoryId: "R1",
          type: "Task",
          status: "Open",
          priority: "Medium",
          title: "Samsara polling will hit rate limits at scale",
          description: "The Samsara polling loop runs every 2 minutes and calls getSamsaraRouteStops() for every active route. With many active routes this will hit Samsara API rate limits.",
          reasoning: "If there are 20 active routes, that is 20 API calls every 2 minutes — 600 calls per hour just for status polling. Samsara rate limits will kick in as the fleet grows, causing the polling to fail silently and stop auto-updating route statuses.",
          fixSteps: "1. Add a max of 5 routes processed per polling cycle\n2. Add an in-memory pointer to track which routes were last checked\n3. Rotate through active routes so each route gets checked roughly every 10 minutes\n4. Log when routes are skipped due to the queue limit",
          replitPrompt: "In routes.ts, there is a setInterval that runs every 2 minutes and calls getSamsaraRouteStops() for every active route. If there are many active routes this will hit Samsara rate limits. Please refactor the polling to use a queue approach: process a maximum of 5 routes per polling cycle, rotating through active routes so each route gets checked roughly every 10 minutes instead of every 2. Add a simple in-memory pointer to track which routes were last checked.",
          filePath: "",
        },
      ],
      P2: [
        {
          id: "ARCH-002",
          projectId: "P2",
          repositoryId: "R1",
          type: "Task",
          status: "Open",
          priority: "High",
          title: "Route ownership split across userId, accountId, companyId",
          description: "Route requests use a three-way ownership check: companyId first, then accountId, then userId directly. This is fragile and inconsistent — some routes are owned by a company, some by an account, and some by a raw user ID.",
          reasoning: "This is a direct result of the user-to-company migration being incomplete. The old userId field is still the primary ownership on the routeRequests table, and the code works around it with a three-way check instead of standardizing. This causes inconsistent behavior depending on how old the account is and which migration path it went through.",
          fixSteps: "1. Audit all route request endpoints in routes.ts for ownership checks\n2. Standardize ownership to always go through companyId\n3. Any route that only has a userId should be associated with that user's companyId at query time\n4. Remove the accountId fallback once companyId is consistent",
          replitPrompt: "In routes.ts, the GET /api/user/route-requests endpoint fetches routes using three different ownership checks in sequence: companyId first, then accountId, then userId directly. This inconsistency means some routes are owned by a company, some by an account, and some by a raw user ID. Please audit all route request endpoints and standardize ownership to always go through companyId. Any route that only has a userId should be associated with that user's companyId at query time. The goal is a single consistent ownership model so every route belongs to a company, not a mix of users/accounts/companies.",
          filePath: "",
        },
      ],
    },
    inbox: {
      B1: [
        {
          id: randomUUID(),
          title: "Payment processing fails for international cards",
          type: "Bug",
          source: "Customer",
          description: "Customer reports that international credit cards are being declined during checkout even though the cards are valid and have sufficient funds.",
          priority: "High",
          status: "New",
          dateReceived: new Date().toISOString(),
          linkedProjectId: null,
          linkedTaskId: null,
          notes: "",
        },
        {
          id: randomUUID(),
          title: "Drivers want to see their weekly earnings summary",
          type: "Feature",
          source: "Customer",
          description: "Multiple drivers have requested a weekly earnings summary view in their dashboard showing total earnings, number of routes completed, and average earnings per route.",
          priority: "Medium",
          status: "New",
          dateReceived: new Date().toISOString(),
          linkedProjectId: null,
          linkedTaskId: null,
          notes: "",
        },
      ],
    },
    changelog: {
      B1: [],
    },
    agents: {
      B1: [],
    },
  };

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(seedStore, null, 2));
}

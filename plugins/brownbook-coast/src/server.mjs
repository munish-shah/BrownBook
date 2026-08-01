import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  buildTaskSnapshot,
  buildTodaySummary,
  buildWeekSummary,
  decodeFirestoreDocument,
  searchTasks
} from "./brownbook-data.mjs";

const execFileAsync = promisify(execFile);
const FIREBASE_PROJECT_ID = "brownbook-a3b2a";
const FIREBASE_API_KEY = "AIzaSyBM0DZHR1EimSQ7ryKuteskO7-jSqw2BKk";
const KEYCHAIN_SERVICE = "brownbook-codex-read-key";

export async function readBrownBookAccountKey(environment = process.env) {
  if (environment.BROWNBOOK_ACCOUNT_KEY?.trim()) {
    return environment.BROWNBOOK_ACCOUNT_KEY.trim();
  }

  try {
    const { stdout } = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-w"
    ]);
    const key = stdout.trim();
    if (key) return key;
  } catch {
    // Do not expose Keychain output or account-key details to the model.
  }

  throw new Error(
    "BrownBook is not configured. Add its save key to macOS Keychain using the plugin setup instructions."
  );
}

export async function loadBrownBookData({ environment = process.env, fetchImpl = fetch } = {}) {
  const accountKey = await readBrownBookAccountKey(environment);
  const projectId = environment.BROWNBOOK_FIREBASE_PROJECT_ID ?? FIREBASE_PROJECT_ID;
  const apiKey = environment.BROWNBOOK_FIREBASE_API_KEY ?? FIREBASE_API_KEY;
  const endpoint = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(accountKey)}`
  );
  endpoint.searchParams.set("key", apiKey);

  const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`BrownBook data could not be read (Firestore returned ${response.status}).`);
  }

  return decodeFirestoreDocument(await response.json());
}

function toolResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};

export function createBrownBookServer({ loadData = loadBrownBookData } = {}) {
  const server = new McpServer(
    { name: "brownbook", version: "0.1.0" },
    {
      instructions:
        "BrownBook tools always fetch live task data and are read-only. Use Coast separately as screen evidence; never infer task completion from Coast alone."
    }
  );

  server.registerTool(
    "get_brownbook_today",
    {
      title: "Get today's BrownBook tasks",
      description: "Fetch current open tasks, active recurring tasks, and completions for BrownBook's current 6 AM-reset task day.",
      inputSchema: {
        includeNotes: z.boolean().optional().default(true)
      },
      annotations: readOnlyAnnotations
    },
    async ({ includeNotes }) => {
      const today = buildTodaySummary(await loadData(), { includeNotes });
      return toolResult(
        `BrownBook has ${today.summary.openTaskCount} open task(s) and ${today.summary.remainingRecurringCount} recurring task(s) remaining for ${today.taskDate}.`,
        today
      );
    }
  );

  server.registerTool(
    "get_brownbook_week",
    {
      title: "Get a BrownBook weekly summary",
      description: "Fetch BrownBook completions, scheduled recurring tasks, and missed recurring tasks across the most recent task days.",
      inputSchema: {
        days: z.number().int().min(1).max(31).optional().default(7),
        includeNotes: z.boolean().optional().default(false)
      },
      annotations: readOnlyAnnotations
    },
    async ({ days, includeNotes }) => {
      const week = buildWeekSummary(await loadData(), { days, includeNotes });
      return toolResult(
        `BrownBook recorded ${week.summary.completedCount} completion(s) across the last ${days} task day(s), with ${week.summary.missedRecurringCount} missed recurring task(s).`,
        week
      );
    }
  );

  server.registerTool(
    "search_brownbook_tasks",
    {
      title: "Search BrownBook tasks",
      description: "Find current or completed BrownBook tasks by title or notes.",
      inputSchema: {
        query: z.string().trim().min(1).max(200),
        includeCompleted: z.boolean().optional().default(true),
        includeNotes: z.boolean().optional().default(true)
      },
      annotations: readOnlyAnnotations
    },
    async ({ query, includeCompleted, includeNotes }) => {
      const result = searchTasks(await loadData(), query, { includeCompleted, includeNotes });
      return toolResult(`BrownBook found ${result.matchCount} task match(es) for "${query}".`, result);
    }
  );

  server.registerTool(
    "get_brownbook_task_snapshot",
    {
      title: "Get a BrownBook task snapshot",
      description: "Fetch all current BrownBook tasks and a bounded completion-history snapshot for detailed planning or analysis.",
      inputSchema: {
        historyLimit: z.number().int().min(0).max(500).optional().default(100),
        includeNotes: z.boolean().optional().default(true)
      },
      annotations: readOnlyAnnotations
    },
    async ({ historyLimit, includeNotes }) => {
      const snapshot = buildTaskSnapshot(await loadData(), { historyLimit, includeNotes });
      return toolResult(
        `BrownBook snapshot contains ${snapshot.tasks.length} task(s), ${snapshot.recurringTasks.length} recurring task(s), and ${snapshot.completedHistory.length} history entry(ies).`,
        snapshot
      );
    }
  );

  return server;
}

async function main() {
  const server = createBrownBookServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

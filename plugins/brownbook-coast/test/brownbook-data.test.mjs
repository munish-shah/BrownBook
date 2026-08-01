import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskSnapshot,
  buildTodaySummary,
  buildWeekSummary,
  decodeFirestoreDocument,
  isRecurringTaskActiveOnDate,
  searchTasks
} from "../src/brownbook-data.mjs";
import { loadBrownBookData } from "../src/server.mjs";

const now = new Date(2026, 6, 31, 8, 0, 0);

const fixture = {
  tasks: [
    {
      id: "task-1",
      title: "Write report",
      notes: "BrownBook integration",
      difficulty: "hard",
      createdAt: "2026-07-31T12:00:00.000Z",
      subtasks: [{ id: "sub-1", title: "Draft", completed: false }]
    }
  ],
  recurringTasks: [
    {
      id: "daily-1",
      title: "Plan day",
      notes: "Review priorities",
      difficulty: "easy",
      type: "daily",
      createdAt: "2026-07-01T12:00:00.000Z"
    },
    {
      id: "interval-1",
      title: "Gym",
      difficulty: "medium",
      type: "interval",
      activeDays: 2,
      breakDays: 1,
      cycleStartDate: "2026-07-30T06:00:00.000Z",
      createdAt: "2026-07-30T06:00:00.000Z"
    }
  ],
  recurringCompletions: { "daily-1": "2026-07-31" },
  completedHistory: [
    {
      id: "history-1",
      title: "Plan day",
      difficulty: "easy",
      isRecurring: true,
      recurringId: "daily-1",
      completedAt: "2026-07-31T12:30:00.000Z"
    },
    {
      id: "history-2",
      title: "Read attention article",
      notes: "Research",
      difficulty: "quick",
      completedAt: "2026-07-30T16:00:00.000Z"
    }
  ],
  focusPinnedIds: ["task-1"],
  vacationDays: []
};

test("decodes Firestore document fields recursively", () => {
  const decoded = decodeFirestoreDocument({
    fields: {
      title: { stringValue: "Example" },
      count: { integerValue: "3" },
      done: { booleanValue: true },
      tags: { arrayValue: { values: [{ stringValue: "task" }] } },
      nested: { mapValue: { fields: { value: { doubleValue: 2.5 } } } }
    }
  });

  assert.deepEqual(decoded, {
    title: "Example",
    count: 3,
    done: true,
    tags: ["task"],
    nested: { value: 2.5 }
  });
});

test("matches BrownBook's daily and interval recurrence behavior", () => {
  assert.equal(isRecurringTaskActiveOnDate(fixture.recurringTasks[0], now), true);
  assert.equal(isRecurringTaskActiveOnDate(fixture.recurringTasks[1], now), true);
  assert.equal(isRecurringTaskActiveOnDate(fixture.recurringTasks[1], new Date(2026, 7, 1)), false);
});

test("summarizes current task-day work without exposing notes when disabled", () => {
  const summary = buildTodaySummary(fixture, { now, includeNotes: false });

  assert.equal(summary.taskDate, "2026-07-31");
  assert.equal(summary.summary.openTaskCount, 1);
  assert.equal(summary.summary.scheduledRecurringCount, 2);
  assert.equal(summary.summary.completedRecurringCount, 1);
  assert.equal(summary.summary.remainingRecurringCount, 1);
  assert.equal(summary.openTasks[0].focusPinned, true);
  assert.equal("notes" in summary.openTasks[0], false);
});

test("builds weekly missed-recurring and completion data", () => {
  const summary = buildWeekSummary(fixture, { now, days: 2 });

  assert.equal(summary.days.length, 2);
  assert.equal(summary.summary.completedCount, 2);
  assert.equal(summary.summary.missedRecurringCount, 2);
  assert.equal(summary.summary.remainingRecurringCount, 1);
});

test("searches current and historical task titles and returns a bounded snapshot", () => {
  const results = searchTasks(fixture, "attention", { now, includeNotes: false });
  const snapshot = buildTaskSnapshot(fixture, { now, historyLimit: 1, includeNotes: false });

  assert.equal(results.matchCount, 1);
  assert.equal(results.matches[0].title, "Read attention article");
  assert.equal(snapshot.completedHistory.length, 1);
  assert.equal("notes" in snapshot.tasks[0], false);
});

test("reads BrownBook data with a plain Firestore GET request", async () => {
  let request;
  const data = await loadBrownBookData({
    environment: { BROWNBOOK_ACCOUNT_KEY: "test-account" },
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return {
        ok: true,
        json: async () => ({ fields: { tasks: { arrayValue: {} } } })
      };
    }
  });

  assert.deepEqual(data, { tasks: [] });
  assert.equal(request.options.method, undefined);
  assert.match(request.url, /\/documents\/users\/test-account/);
});

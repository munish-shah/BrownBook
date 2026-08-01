export const DEFAULT_RESET_HOUR = 6;

export function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;

  if (Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "stringValue")) return value.stringValue;
  if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return value.doubleValue;
  if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
  if (Object.hasOwn(value, "referenceValue")) return value.referenceValue;
  if (Object.hasOwn(value, "bytesValue")) return value.bytesValue;
  if (Object.hasOwn(value, "geoPointValue")) return value.geoPointValue;

  if (Object.hasOwn(value, "arrayValue")) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  }

  if (Object.hasOwn(value, "mapValue")) {
    return decodeFirestoreFields(value.mapValue.fields ?? {});
  }

  return null;
}

export function decodeFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

export function decodeFirestoreDocument(document) {
  return decodeFirestoreFields(document?.fields ?? {});
}

function isValidDate(date) {
  return !Number.isNaN(date.getTime());
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function taskDateForTimestamp(value, resetHour = DEFAULT_RESET_HOUR) {
  const date = new Date(value);
  if (!isValidDate(date)) return null;
  if (date.getHours() < resetHour) date.setDate(date.getDate() - 1);
  return formatLocalDate(date);
}

export function currentTaskDate(now = new Date(), resetHour = DEFAULT_RESET_HOUR) {
  return taskDateForTimestamp(now, resetHour);
}

function localDateForTaskDate(taskDate) {
  const [year, month, day] = taskDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetweenDates(startDate, endDate) {
  const utcStart = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const utcEnd = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.floor((utcEnd - utcStart) / 86_400_000);
}

function isTaskSuspendedOnDate(task, date) {
  if (!Array.isArray(task.suspensions) || task.suspensions.length === 0) return false;

  const checkDate = startOfLocalDay(date);
  return task.suspensions.some((suspension) => {
    const start = new Date(suspension.start);
    if (!isValidDate(start)) return false;
    start.setHours(0, 0, 0, 0);

    if (checkDate < start) return false;
    if (!suspension.end) return true;

    const end = new Date(suspension.end);
    if (!isValidDate(end)) return false;
    end.setHours(23, 59, 59, 999);
    return checkDate <= end;
  });
}

export function isRecurringTaskActiveOnDate(task, date, resetHour = DEFAULT_RESET_HOUR) {
  const checkDate = startOfLocalDay(date);

  if (task.createdAt) {
    const createdDate = new Date(task.createdAt);
    if (isValidDate(createdDate)) {
      if (createdDate.getHours() < resetHour) createdDate.setDate(createdDate.getDate() - 1);
      if (checkDate < startOfLocalDay(createdDate)) return false;
    }
  }

  if (task.deletedAt) {
    const deletedDate = new Date(task.deletedAt);
    if (isValidDate(deletedDate)) {
      if (deletedDate.getHours() < resetHour) deletedDate.setDate(deletedDate.getDate() - 1);
      if (checkDate >= startOfLocalDay(deletedDate)) return false;
    }
  }

  if (isTaskSuspendedOnDate(task, checkDate)) return false;
  if (!task.type || task.type === "daily") return true;
  if (task.type !== "interval" || !task.cycleStartDate) return true;

  const cycleStart = new Date(task.cycleStartDate);
  if (!isValidDate(cycleStart)) return false;

  const daysDiff = daysBetweenDates(cycleStart, checkDate);
  const activeDays = Number(task.activeDays);
  const breakDays = Number(task.breakDays);
  const cycleLength = activeDays + breakDays;
  if (daysDiff < 0 || !Number.isFinite(cycleLength) || cycleLength <= 0) return false;

  return daysDiff % cycleLength < activeDays;
}

function subtaskSummary(subtasks = []) {
  return subtasks.map((subtask) => ({
    id: subtask.id,
    title: subtask.title,
    completed: Boolean(subtask.completed)
  }));
}

function taskSummary(task, { includeNotes = true, status, focusPinned = false } = {}) {
  const summary = {
    id: task.id,
    title: task.title,
    difficulty: task.difficulty,
    status,
    createdAt: task.createdAt,
    expiresAt: task.expiresAt,
    focusPinned,
    subtasks: subtaskSummary(task.subtasks)
  };

  if (task.type) summary.recurrence = task.type;
  if (task.type === "interval") {
    summary.activeDays = task.activeDays;
    summary.breakDays = task.breakDays;
    summary.cycleStartDate = task.cycleStartDate;
  }
  if (includeNotes && task.notes) summary.notes = task.notes;
  return summary;
}

function completedTaskSummary(task, includeNotes) {
  return {
    ...taskSummary(task, { includeNotes, status: "completed" }),
    completedAt: task.completedAt,
    isRecurring: Boolean(task.isRecurring),
    recurringId: task.recurringId
  };
}

function taskData(data) {
  return {
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    recurringTasks: Array.isArray(data.recurringTasks) ? data.recurringTasks : [],
    recurringCompletions: data.recurringCompletions ?? {},
    completedHistory: Array.isArray(data.completedHistory) ? data.completedHistory : [],
    focusPinnedIds: Array.isArray(data.focusPinnedIds) ? data.focusPinnedIds : [],
    vacationDays: Array.isArray(data.vacationDays) ? data.vacationDays : []
  };
}

export function buildTodaySummary(data, { now = new Date(), includeNotes = true, resetHour = DEFAULT_RESET_HOUR } = {}) {
  const state = taskData(data);
  const taskDate = currentTaskDate(now, resetHour);
  const activeDate = localDateForTaskDate(taskDate);
  const focusIds = new Set(state.focusPinnedIds);

  const openTasks = state.tasks
    .filter((task) => !task.completed)
    .map((task) => taskSummary(task, {
      includeNotes,
      status: "open",
      focusPinned: focusIds.has(task.id)
    }));

  const recurringTasks = state.recurringTasks
    .filter((task) => !task.deleted && isRecurringTaskActiveOnDate(task, activeDate, resetHour))
    .map((task) => taskSummary(task, {
      includeNotes,
      status: state.recurringCompletions[task.id] === taskDate ? "completed" : "open",
      focusPinned: focusIds.has(task.id)
    }));

  const completedToday = state.completedHistory
    .filter((task) => taskDateForTimestamp(task.completedAt, resetHour) === taskDate)
    .map((task) => completedTaskSummary(task, includeNotes));

  const unfinishedRecurring = recurringTasks.filter((task) => task.status === "open").length;
  const completedRecurring = recurringTasks.length - unfinishedRecurring;

  return {
    generatedAt: now.toISOString(),
    taskDate,
    resetHour,
    openTasks,
    recurringTasks,
    completedToday,
    summary: {
      openTaskCount: openTasks.length,
      scheduledRecurringCount: recurringTasks.length,
      completedRecurringCount: completedRecurring,
      remainingRecurringCount: unfinishedRecurring,
      completedTodayCount: completedToday.length
    }
  };
}

export function buildWeekSummary(data, { days = 7, now = new Date(), includeNotes = false, resetHour = DEFAULT_RESET_HOUR } = {}) {
  const state = taskData(data);
  const taskDate = currentTaskDate(now, resetHour);
  const dateEntries = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = localDateForTaskDate(taskDate);
    date.setDate(date.getDate() - offset);
    const dateString = formatLocalDate(date);
    const isToday = dateString === taskDate;
    const vacation = state.vacationDays.includes(dateString);
    const scheduled = state.recurringTasks.filter(
      (task) => !task.deleted && isRecurringTaskActiveOnDate(task, date, resetHour)
    );
    const completed = state.completedHistory.filter(
      (task) => taskDateForTimestamp(task.completedAt, resetHour) === dateString
    );
    const completedRecurringIds = new Set(
      completed.filter((task) => task.isRecurring && task.recurringId).map((task) => task.recurringId)
    );
    const uncompletedRecurring = scheduled.filter((task) => !completedRecurringIds.has(task.id));

    dateEntries.push({
      date: dateString,
      vacation,
      completed: completed.map((task) => completedTaskSummary(task, includeNotes)),
      scheduledRecurring: scheduled.map((task) => taskSummary(task, { includeNotes, status: "scheduled" })),
      missedRecurring: !isToday && !vacation
        ? uncompletedRecurring.map((task) => taskSummary(task, { includeNotes, status: "missed" }))
        : [],
      remainingRecurring: isToday && !vacation
        ? uncompletedRecurring.map((task) => taskSummary(task, { includeNotes, status: "open" }))
        : []
    });
  }

  return {
    generatedAt: now.toISOString(),
    taskDate,
    resetHour,
    days: dateEntries,
    summary: {
      completedCount: dateEntries.reduce((total, entry) => total + entry.completed.length, 0),
      scheduledRecurringCount: dateEntries.reduce((total, entry) => total + entry.scheduledRecurring.length, 0),
      missedRecurringCount: dateEntries.reduce((total, entry) => total + entry.missedRecurring.length, 0),
      remainingRecurringCount: dateEntries.at(-1)?.remainingRecurring.length ?? 0
    }
  };
}

export function searchTasks(data, query, { includeCompleted = true, includeNotes = true, now = new Date(), resetHour = DEFAULT_RESET_HOUR } = {}) {
  const state = taskData(data);
  const taskDate = currentTaskDate(now, resetHour);
  const activeDate = localDateForTaskDate(taskDate);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const matchesTask = (task) => [task.title, includeNotes ? task.notes : ""]
    .filter(Boolean)
    .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));

  const results = [];
  for (const task of state.tasks.filter(matchesTask)) {
    results.push(taskSummary(task, { includeNotes, status: task.completed ? "completed" : "open" }));
  }
  for (const task of state.recurringTasks.filter(matchesTask)) {
    const active = !task.deleted && isRecurringTaskActiveOnDate(task, activeDate, resetHour);
    const complete = state.recurringCompletions[task.id] === taskDate;
    results.push(taskSummary(task, {
      includeNotes,
      status: task.deleted ? "deleted" : complete ? "completed_today" : active ? "open_today" : "not_scheduled_today"
    }));
  }
  if (includeCompleted) {
    for (const task of state.completedHistory.filter(matchesTask)) {
      results.push(completedTaskSummary(task, includeNotes));
    }
  }

  return {
    generatedAt: now.toISOString(),
    taskDate,
    query,
    matches: results.slice(0, 100),
    matchCount: results.length,
    truncated: results.length > 100
  };
}

export function buildTaskSnapshot(data, { historyLimit = 100, includeNotes = true, now = new Date(), resetHour = DEFAULT_RESET_HOUR } = {}) {
  const state = taskData(data);
  const taskDate = currentTaskDate(now, resetHour);
  const activeDate = localDateForTaskDate(taskDate);

  return {
    generatedAt: now.toISOString(),
    taskDate,
    resetHour,
    tasks: state.tasks.map((task) => taskSummary(task, {
      includeNotes,
      status: task.completed ? "completed" : "open",
      focusPinned: state.focusPinnedIds.includes(task.id)
    })),
    recurringTasks: state.recurringTasks.map((task) => taskSummary(task, {
      includeNotes,
      status: task.deleted
        ? "deleted"
        : isRecurringTaskActiveOnDate(task, activeDate, resetHour)
          ? state.recurringCompletions[task.id] === taskDate ? "completed_today" : "open_today"
          : "not_scheduled_today",
      focusPinned: state.focusPinnedIds.includes(task.id)
    })),
    completedHistory: state.completedHistory
      .slice(0, Math.min(historyLimit, 500))
      .map((task) => completedTaskSummary(task, includeNotes)),
    stats: data.stats ?? {}
  };
}

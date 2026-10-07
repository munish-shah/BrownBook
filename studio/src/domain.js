import {
    getCompletionCoinDelta,
    getRecordedCompletionCoins,
    getTaskRewardCoins
} from '../../data-model.js';

export const RESET_HOUR = 6;

export const DIFFICULTIES = {
    quick: { label: 'Quick', coins: 5, time: '< 5 min', hue: 145 },
    easy: { label: 'Easy', coins: 15, time: '5–15 min', hue: 205 },
    medium: { label: 'Medium', coins: 25, time: '15–45 min', hue: 48 },
    hard: { label: 'Hard', coins: 50, time: '45–90 min', hue: 25 },
    epic: { label: 'Epic', coins: 75, time: '2+ hours', hue: 355 },
    placeholder: { label: 'Placeholder', coins: 0, time: 'No reward', hue: 0 }
};

export const DIFFICULTY_COINS = Object.fromEntries(
    Object.entries(DIFFICULTIES).map(([key, value]) => [key, value.coins])
);

export const CATEGORIES = ['food', 'entertainment', 'purchase', 'experience', 'selfcare', 'other'];

const HOLIDAYS = ['2026-01-19', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'];

export function createId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
}

export function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function taskDay(now = new Date()) {
    const date = new Date(now);
    if (date.getHours() < RESET_HOUR) date.setDate(date.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    return date;
}

export function todayKey(now = new Date()) {
    return dateKey(taskDay(now));
}

export function taskDateFromTimestamp(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return dateKey(taskDay(date));
}

function daysBetween(start, end) {
    const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.floor((utcEnd - utcStart) / 86_400_000);
}

export function isSuspendedOn(task, date) {
    if (!task.suspensions?.length) return false;
    const check = new Date(date);
    check.setHours(0, 0, 0, 0);
    return task.suspensions.some(suspension => {
        const start = new Date(suspension.start);
        start.setHours(0, 0, 0, 0);
        if (check < start) return false;
        if (!suspension.end) return true;
        const end = new Date(suspension.end);
        end.setHours(23, 59, 59, 999);
        return check <= end;
    });
}

export function isActiveOn(task, date) {
    const check = new Date(date);
    check.setHours(0, 0, 0, 0);
    if (task.createdAt && check < taskDay(new Date(task.createdAt))) return false;
    if (task.deletedAt && check >= taskDay(new Date(task.deletedAt))) return false;
    if (isSuspendedOn(task, check)) return false;
    if (!task.type || task.type === 'daily') return true;
    if (task.type === 'interval' && task.cycleStartDate) {
        const diff = daysBetween(new Date(task.cycleStartDate), check);
        const cycle = Number(task.activeDays) + Number(task.breakDays);
        if (diff < 0 || !(cycle > 0)) return false;
        return diff % cycle < Number(task.activeDays);
    }
    return true;
}

export function toggleVacation(data, key) {
    const days = new Set(data.vacationDays || []);
    const added = !days.has(key);
    if (added) days.add(key); else days.delete(key);
    data.vacationDays = [...days].sort();
    return added;
}

export function isVacation(data, key) {
    return (data.vacationDays || []).includes(key);
}

function statKey(difficulty) {
    return `tasksCompleted${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}`;
}

function adjustCount(data, difficulty, delta) {
    const key = statKey(difficulty);
    data.stats[key] = Math.max(0, (Number(data.stats[key]) || 0) + delta);
}

function addCoins(data, amount) {
    data.stats.totalCoinsEarned += amount;
    data.stats.currentBalance += amount;
}

const indexCache = new WeakMap();

/** date key -> Set of ritual ids completed that task-day. Cached per history array. */
export function completionIndex(data) {
    const cached = indexCache.get(data.completedHistory);
    if (cached) return cached;
    const index = new Map();
    data.completedHistory.forEach(entry => {
        if (!entry.isRecurring || !entry.recurringId || !entry.completedAt) return;
        const key = taskDateFromTimestamp(entry.completedAt);
        if (!key) return;
        if (!index.has(key)) index.set(key, new Set());
        index.get(key).add(entry.recurringId);
    });
    indexCache.set(data.completedHistory, index);
    return index;
}

export function deriveToday(data, now = new Date()) {
    const today = todayKey(now);
    const day = taskDay(now);
    const live = data.recurringTasks.filter(task => !task.deleted);
    const suspended = live.filter(task => isSuspendedOn(task, day));
    const scheduled = live.filter(task => !isSuspendedOn(task, day) && isActiveOn(task, day));
    const routinesDone = scheduled.filter(task => data.recurringCompletions[task.id] === today);
    const routinesOpen = scheduled.filter(task => data.recurringCompletions[task.id] !== today);
    const open = data.tasks.filter(task => !task.completed);
    const completedToday = data.completedHistory.filter(task => !task.isRecurring && task.completedAt && taskDateFromTimestamp(task.completedAt) === today);
    const pinned = new Set(data.focusPinnedIds);
    const focus = data.focusPinnedIds
        .map(id => open.find(task => task.id === id) || routinesOpen.find(task => task.id === id))
        .filter(Boolean);
    const planned = scheduled.length + open.filter(task => task.difficulty !== 'placeholder').length + completedToday.length;
    const done = routinesDone.length + completedToday.length;

    return {
        today,
        focus,
        routinesOpen: routinesOpen.filter(task => !pinned.has(task.id)),
        routinesDone,
        open: open.filter(task => !pinned.has(task.id)),
        completedToday,
        suspended,
        // A vacation day needs nothing done, so the ring reads full.
        percent: isVacation(data, today) ? 100 : planned ? Math.min(100, Math.round((done / planned) * 100)) : 0,
        remaining: routinesOpen.length + open.length,
        vacation: isVacation(data, today)
    };
}

export function streak(data, now = new Date()) {
    const live = data.recurringTasks;
    if (!live.length) return 0;
    const index = completionIndex(data);
    const day = taskDay(now);
    const today = dateKey(day);
    let count = 0;

    if (!isVacation(data, today)) {
        const active = live.filter(task => !task.deleted && isActiveOn(task, day));
        if (active.length && active.every(task => data.recurringCompletions[task.id] === today)) count = 1;
    }

    for (let offset = 1; offset <= 365; offset += 1) {
        const date = new Date(day);
        date.setDate(date.getDate() - offset);
        const key = dateKey(date);
        const active = live.filter(task => isActiveOn(task, date));
        if (!active.length || isVacation(data, key)) continue;
        const done = index.get(key) || new Set();
        if (active.every(task => done.has(task.id))) count += 1;
        else break;
    }

    return count;
}

export function consistency(data, days = 35, now = new Date()) {
    const index = completionIndex(data);
    const end = taskDay(now);
    const cells = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date(end);
        date.setDate(date.getDate() - offset);
        cells.push(dayRecord(data, date, index));
    }
    return cells;
}

export function firstUseDate(data, now = new Date()) {
    let earliest = null;
    const consider = value => {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime()) && (!earliest || date < earliest)) earliest = date;
    };
    data.completedHistory.forEach(entry => entry.completedAt && consider(entry.completedAt));
    data.recurringTasks.forEach(task => task.createdAt && consider(task.createdAt));
    return taskDay(earliest || now);
}

function dayRecord(data, date, index) {
    const key = dateKey(date);
    const active = data.recurringTasks.filter(task => isActiveOn(task, date));
    const done = index.get(key) || new Set();
    const completed = active.filter(task => done.has(task.id));
    return {
        key,
        date,
        vacation: isVacation(data, key),
        expected: active.length,
        completed: completed.length,
        rate: active.length ? completed.length / active.length : null,
        tasks: active.map(task => ({ id: task.id, title: task.title, done: done.has(task.id) }))
    };
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Average consistency over a date range. Vacation days are left out entirely (they neither help nor hurt).
 * A range made only of vacation days counts as 100%, flagged `vacation`, since nothing was expected.
 */
function averageOver(data, index, from, to, floor) {
    const rates = [];
    let vacationDays = 0;
    for (let date = new Date(from); date <= to; date.setDate(date.getDate() + 1)) {
        if (date < floor) continue;
        const record = dayRecord(data, new Date(date), index);
        if (record.vacation) vacationDays += 1;
        else if (record.rate !== null) rates.push(record.rate);
    }
    if (rates.length) return { rate: (rates.reduce((sum, value) => sum + value, 0) / rates.length) * 100, days: rates.length, vacationDays };
    if (vacationDays) return { rate: 100, days: 0, vacationDays, vacation: true };
    return null;
}

/** Consistency per day/week/month/year, mirroring the original Progress view. */
export function periodSeries(data, range, now = new Date()) {
    if (!data.recurringTasks.length) return [];
    const index = completionIndex(data);
    const today = taskDay(now);
    const first = firstUseDate(data, now);
    const series = [];

    if (range === 'daily') {
        for (let offset = 6; offset >= 0; offset -= 1) {
            const date = new Date(today);
            date.setDate(date.getDate() - offset);
            if (date < first) continue;
            const record = dayRecord(data, date, index);
            if (!record.expected) continue;
            series.push({
                label: offset === 0 ? 'Today' : offset === 1 ? 'Yest' : SHORT_DAYS[date.getDay()],
                title: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
                rate: record.vacation ? 100 : record.rate * 100,
                vacation: record.vacation,
                expected: record.expected,
                completed: record.completed,
                tasks: record.tasks
            });
        }
    } else if (range === 'weekly') {
        for (let back = 3; back >= 0; back -= 1) {
            const start = new Date(today);
            start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - back * 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            const result = averageOver(data, index, start, end < today ? end : today, first);
            if (!result) continue;
            series.push({
                label: back === 0 ? 'This week' : start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                title: `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
                rate: result.rate,
                days: result.days,
                vacation: Boolean(result.vacation),
                vacationDays: result.vacationDays
            });
        }
    } else if (range === 'monthly') {
        for (let back = 5; back >= 0; back -= 1) {
            const start = new Date(today.getFullYear(), today.getMonth() - back, 1);
            const end = new Date(today.getFullYear(), today.getMonth() - back + 1, 0);
            const result = averageOver(data, index, start, end < today ? end : today, first);
            if (!result) continue;
            series.push({
                label: start.toLocaleDateString(undefined, { month: 'short' }),
                title: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
                rate: result.rate,
                days: result.days,
                vacation: Boolean(result.vacation),
                vacationDays: result.vacationDays
            });
        }
    } else {
        for (let year = Math.max(first.getFullYear(), today.getFullYear() - 2); year <= today.getFullYear(); year += 1) {
            const result = averageOver(data, index, new Date(year, 0, 1), new Date(year, 11, 31) < today ? new Date(year, 11, 31) : today, first);
            if (!result) continue;
            series.push({ label: String(year), title: String(year), rate: result.rate, days: result.days, vacation: Boolean(result.vacation), vacationDays: result.vacationDays });
        }
    }
    return series;
}

/** Every streak since first use, newest last. Vacation and unscheduled days neither count nor break. */
export function allStreaks(data, now = new Date()) {
    if (!data.recurringTasks.length) return [];
    const index = completionIndex(data);
    const today = taskDay(now);
    const streaks = [];
    let run = null;

    for (let date = new Date(firstUseDate(data, now)); date <= today; date.setDate(date.getDate() + 1)) {
        const record = dayRecord(data, new Date(date), index);
        if (!record.expected || record.vacation) continue;
        const isToday = record.key === dateKey(today);
        if (record.completed === record.expected) {
            if (!run) run = { length: 0, start: new Date(date), end: new Date(date) };
            run.length += 1;
            run.end = new Date(date);
        } else if (isToday) {
            continue; // today is still in progress, so it cannot break a streak yet
        } else if (run) {
            streaks.push({ ...run, isCurrent: false });
            run = null;
        }
    }
    if (run) streaks.push({ ...run, isCurrent: true });
    return streaks;
}

export function completeTask(data, id) {
    const index = data.tasks.findIndex(task => task.id === id);
    if (index === -1) return 0;
    const task = data.tasks[index];
    data.tasks.splice(index, 1);
    data.focusPinnedIds = data.focusPinnedIds.filter(pid => pid !== id);
    if (task.difficulty === 'placeholder') return 0;

    const awarded = getCompletionCoinDelta(task, DIFFICULTY_COINS);
    task.coins = getTaskRewardCoins(task, DIFFICULTY_COINS);
    task.subtasks.forEach(subtask => { subtask.completed = true; });
    task.completed = true;
    task.completedAt = new Date().toISOString();
    addCoins(data, awarded);
    adjustCount(data, task.difficulty, 1);
    data.completedHistory.unshift(task);
    return awarded;
}

export function reopenTask(data, id) {
    const index = data.completedHistory.findIndex(task => task.id === id && !task.isRecurring);
    if (index === -1) return;
    const task = data.completedHistory[index];
    addCoins(data, -getRecordedCompletionCoins(task, DIFFICULTY_COINS));
    adjustCount(data, task.difficulty, -1);
    task.subtasks.forEach(subtask => { subtask.completed = false; });
    task.completed = false;
    delete task.completedAt;
    delete task.coins;
    data.completedHistory.splice(index, 1);
    data.tasks.unshift(task);
}

function earlyBirdBonus(data, today, now) {
    if (data.stats.lastEarlyBirdBonusDate === today) return 0;
    const active = data.recurringTasks.filter(task => !task.deleted && isActiveOn(task, taskDay(now)));
    if (!active.length || !active.every(task => data.recurringCompletions[task.id] === today)) return 0;
    const hour = now.getHours();
    const multiplier = hour >= RESET_HOUR && hour < 21 ? 0.5 : hour === 21 ? 0.25 : 0;
    if (!multiplier) return 0;
    const base = active.reduce((sum, task) => sum + DIFFICULTIES[task.difficulty].coins, 0);
    const bonus = Math.ceil(base * multiplier);
    addCoins(data, bonus);
    data.stats.lastEarlyBirdBonusDate = today;
    data.stats.lastEarlyBirdBonusCoins = bonus;
    return bonus;
}

export function toggleRoutine(data, id, now = new Date()) {
    const task = data.recurringTasks.find(candidate => candidate.id === id);
    if (!task) return { awarded: 0, bonus: 0 };
    const today = todayKey(now);

    if (data.recurringCompletions[id] === today) {
        const index = data.completedHistory.findIndex(entry => entry.recurringId === id && taskDateFromTimestamp(entry.completedAt) === today);
        const entry = index === -1 ? null : data.completedHistory[index];
        addCoins(data, -(entry ? getRecordedCompletionCoins(entry, DIFFICULTY_COINS) : getTaskRewardCoins(task, DIFFICULTY_COINS)));
        adjustCount(data, task.difficulty, -1);
        delete data.recurringCompletions[id];
        task.subtasks.forEach(subtask => { subtask.completed = false; });
        if (data.stats.lastEarlyBirdBonusDate === today) {
            addCoins(data, -(Number(data.stats.lastEarlyBirdBonusCoins) || 0));
            data.stats.lastEarlyBirdBonusDate = null;
            data.stats.lastEarlyBirdBonusCoins = 0;
        }
        if (index !== -1) data.completedHistory.splice(index, 1);
        return { awarded: 0, bonus: 0 };
    }

    const awarded = getCompletionCoinDelta(task, DIFFICULTY_COINS);
    task.subtasks.forEach(subtask => { subtask.completed = true; });
    addCoins(data, awarded);
    adjustCount(data, task.difficulty, 1);
    data.recurringCompletions[id] = today;
    data.completedHistory.unshift({
        id: createId(`recurring_${id}`),
        recurringId: id,
        title: task.title,
        notes: task.notes,
        difficulty: task.difficulty,
        coins: getTaskRewardCoins(task, DIFFICULTY_COINS),
        isRecurring: true,
        completed: true,
        completedAt: now.toISOString()
    });
    return { awarded, bonus: earlyBirdBonus(data, today, now) };
}

export function toggleSubtask(data, parentId, subtaskId, kind, now = new Date()) {
    const list = kind === 'routine' ? data.recurringTasks : data.tasks;
    const task = list.find(candidate => candidate.id === parentId);
    const subtask = task?.subtasks.find(candidate => candidate.id === subtaskId);
    if (!subtask) return { completedParent: false };

    subtask.completed = !subtask.completed;
    // A ritual that is already done today has banked its full reward; editing its steps
    // must not move coins again or undoing the ritual later would double-refund them.
    const parentDone = kind === 'routine' && data.recurringCompletions[parentId] === todayKey(now);
    if (task.distributeCoins && subtask.coins > 0 && !parentDone) addCoins(data, subtask.completed ? subtask.coins : -subtask.coins);

    if (task.subtasks.every(candidate => candidate.completed)) {
        if (kind === 'routine') {
            // toggleRoutine is a toggle: re-checking the last step of a ritual that is
            // already done today must not undo it and refund its coins.
            if (data.recurringCompletions[parentId] === todayKey(now)) return { completedParent: false };
            const { awarded, bonus } = toggleRoutine(data, parentId, now);
            return { completedParent: true, awarded: awarded + bonus };
        }
        return { completedParent: true, awarded: completeTask(data, parentId) };
    }
    return { completedParent: false };
}

export function addSubtask(data, parentId, kind, title) {
    const list = kind === 'routine' ? data.recurringTasks : data.tasks;
    const task = list.find(candidate => candidate.id === parentId);
    if (!task || !title.trim()) return;
    task.subtasks.push({ id: createId('subtask'), title: title.trim(), completed: false, coins: 0 });
}

export function removeSubtask(data, parentId, subtaskId, kind, now = new Date()) {
    const list = kind === 'routine' ? data.recurringTasks : data.tasks;
    const task = list.find(candidate => candidate.id === parentId);
    const index = task?.subtasks.findIndex(candidate => candidate.id === subtaskId) ?? -1;
    if (index === -1) return;
    const [subtask] = task.subtasks.splice(index, 1);
    const parentDone = kind === 'routine' && data.recurringCompletions[parentId] === todayKey(now);
    if (task.distributeCoins && subtask.completed && subtask.coins > 0 && !parentDone) addCoins(data, -subtask.coins);
}

export function updateTask(data, id, kind, patch) {
    const list = kind === 'routine' ? data.recurringTasks : data.tasks;
    const task = list.find(candidate => candidate.id === id);
    if (!task) return;
    const title = String(patch.title ?? task.title).trim();
    if (!title) throw new Error('A task needs a title.');
    task.title = title;
    if (patch.notes !== undefined) task.notes = String(patch.notes).trim();
    if (patch.difficulty && DIFFICULTIES[patch.difficulty] && !(kind === 'routine' && patch.difficulty === 'placeholder')) {
        task.difficulty = patch.difficulty;
    }
    if (kind === 'task' && 'expiresAt' in patch) {
        if (patch.expiresAt) task.expiresAt = patch.expiresAt;
        else delete task.expiresAt;
    }
}

export function nextResetAfter(now = new Date(), extraDays = 0) {
    const reset = new Date(now);
    reset.setHours(RESET_HOUR, 0, 0, 0);
    if (now.getHours() >= RESET_HOUR) reset.setDate(reset.getDate() + 1);
    reset.setDate(reset.getDate() + extraDays);
    return reset;
}

export function createTask(data, draft, now = new Date()) {
    const subtasks = draft.subtasks
        .filter(subtask => subtask.title.trim())
        .map(subtask => ({ id: createId('subtask'), title: subtask.title.trim(), completed: false, coins: draft.distributeCoins ? Number(subtask.coins) || 0 : 0 }));
    if (draft.distributeCoins && subtasks.length) {
        const total = subtasks.reduce((sum, subtask) => sum + subtask.coins, 0);
        if (total !== DIFFICULTIES[draft.difficulty].coins) {
            throw new Error(`Subtask coins total ${total}, but ${DIFFICULTIES[draft.difficulty].label} pays ${DIFFICULTIES[draft.difficulty].coins}.`);
        }
    }

    const base = {
        title: draft.title.trim(),
        notes: draft.notes.trim(),
        difficulty: draft.difficulty,
        subtasks,
        distributeCoins: Boolean(draft.distributeCoins && subtasks.length),
        createdAt: now.toISOString()
    };

    if (draft.recurring) {
        const routine = { ...base, id: createId('recurring'), type: draft.recurrence };
        if (draft.recurrence === 'interval') {
            // Anchor on the current task-day, not the calendar day: before 6 AM "today" is still yesterday.
            const start = taskDay(now);
            start.setDate(start.getDate() - (Number(draft.cycleOffset) || 0));
            start.setHours(RESET_HOUR, 0, 0, 0);
            routine.activeDays = Math.max(1, Number(draft.activeDays) || 3);
            routine.breakDays = Math.max(1, Number(draft.breakDays) || 1);
            routine.cycleStartDate = start.toISOString();
        }
        data.recurringTasks.push(routine);
        return routine;
    }

    const task = { ...base, id: createId('task'), completed: false };
    if (draft.expiration === 'custom' && draft.customExpiration) task.expiresAt = new Date(draft.customExpiration).toISOString();
    else if (draft.expiration !== '') task.expiresAt = nextResetAfter(now, Number(draft.expiration)).toISOString();
    data.tasks.unshift(task);
    return task;
}

export function deleteTask(data, id) {
    data.tasks = data.tasks.filter(task => task.id !== id);
    data.focusPinnedIds = data.focusPinnedIds.filter(pid => pid !== id);
}

export function deleteRoutine(data, id) {
    const task = data.recurringTasks.find(candidate => candidate.id === id);
    if (task) {
        task.deleted = true;
        task.deletedAt = new Date().toISOString();
    }
    delete data.recurringCompletions[id];
    data.focusPinnedIds = data.focusPinnedIds.filter(pid => pid !== id);
}

export function togglePin(data, id) {
    data.focusPinnedIds = data.focusPinnedIds.includes(id)
        ? data.focusPinnedIds.filter(pid => pid !== id)
        : [...data.focusPinnedIds, id];
}

export function suspendRoutine(data, id, endDate, now = new Date()) {
    const task = data.recurringTasks.find(candidate => candidate.id === id);
    if (!task) return;
    // Anchored to the task-day: before the 6 AM reset "today" is still yesterday.
    task.suspensions = [...(task.suspensions || []), { start: taskDay(now).toISOString(), end: endDate }];
}

export function resumeRoutine(data, id, now = new Date()) {
    const task = data.recurringTasks.find(candidate => candidate.id === id);
    const last = task?.suspensions?.at(-1);
    if (!last || (last.end && taskDay(new Date(last.end)) < taskDay(now))) return;
    const today = taskDay(now);
    if (taskDay(new Date(last.start)) >= today) {
        task.suspensions.pop(); // paused and resumed within the same day: nothing to remember
    } else {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(12, 0, 0, 0);
        last.end = yesterday.toISOString();
    }
}

export function isSaleActive(data, now = new Date()) {
    if (now < new Date('2026-07-01T00:00:00')) return true;
    const day = now.getDay();
    const hour = now.getHours();
    if ((day === 6 && hour >= RESET_HOUR) || day === 0 || (day === 1 && hour < RESET_HOUR)) return true;
    const special = key => HOLIDAYS.includes(key) || isVacation(data, key);
    if (special(dateKey(now)) && hour >= RESET_HOUR) return true;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return special(dateKey(yesterday)) && hour < RESET_HOUR;
}

export function shopPrice(data, item, applySale = true, now = new Date()) {
    const purchase = data.shopPurchases[item.id];
    const count = purchase?.lastResetDate === todayKey(now) ? purchase.count : 0;
    const sale = applySale && isSaleActive(data, now);
    const scaling = Number(item.scaling) || 0;
    const type = item.scalingType || 'add';
    const scales = (type === 'multiply' && scaling > 1) || (type === 'add' && scaling > 0);
    if (!scales) return sale ? Math.ceil(item.baseCost * 0.5) : item.baseCost;
    if (type === 'multiply') {
        return sale
            ? Math.ceil(Math.ceil(item.baseCost * 0.5) * Math.pow(Math.sqrt(scaling), count))
            : Math.round(item.baseCost * Math.pow(scaling, count));
    }
    return sale
        ? Math.ceil(item.baseCost * 0.5) + Math.floor(count / 2) * scaling
        : item.baseCost + count * scaling;
}

export function claimShopItem(data, item, now = new Date()) {
    const price = shopPrice(data, item, true, now);
    if (data.stats.currentBalance < price) throw new Error('Not enough coins.');
    data.stats.currentBalance -= price;
    data.stats.rewardsClaimed += 1;
    const today = todayKey(now);
    const purchase = data.shopPurchases[item.id];
    data.shopPurchases[item.id] = purchase?.lastResetDate === today
        ? { ...purchase, count: purchase.count + 1 }
        : { count: 1, lastResetDate: today };
    return price;
}

export function claimReward(data, reward) {
    if (data.stats.currentBalance < reward.cost) throw new Error('Not enough coins.');
    data.stats.currentBalance -= reward.cost;
    data.stats.rewardsClaimed += 1;
    reward.timesClaimed = (Number(reward.timesClaimed) || 0) + 1;
    reward.lastClaimedAt = new Date().toISOString();
    return reward.cost;
}

export function createReward(data, draft) {
    if (draft.shop) {
        data.customShopItems.push({
            id: createId('shop'),
            name: draft.name.trim(),
            category: draft.category,
            baseCost: Number(draft.cost),
            scaling: Number(draft.scaling),
            scalingType: draft.scalingType,
            isCustom: true,
            createdAt: new Date().toISOString()
        });
        return;
    }
    data.rewards.push({
        id: createId('reward'),
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category,
        cost: Number(draft.cost),
        timesClaimed: 0,
        createdAt: new Date().toISOString()
    });
}

export function parseDuration(title = '') {
    const match = title.match(/(\d+)\s*(min|minute|m|hour|hr|h)s?\b/i);
    if (!match) return 0;
    const value = Number(match[1]);
    return match[2].toLowerCase().startsWith('h') ? value * 3_600_000 : value * 60_000;
}

export function historyByDay(data, limit) {
    const groups = new Map();
    data.completedHistory.slice(0, limit).forEach(entry => {
        const key = entry.completedAt ? taskDateFromTimestamp(entry.completedAt) : 'unknown';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
    });
    return [...groups.entries()].map(([key, entries]) => ({
        key,
        entries,
        coins: entries.reduce((sum, entry) => sum + getRecordedCompletionCoins(entry, DIFFICULTY_COINS), 0)
    }));
}

export { getRecordedCompletionCoins };

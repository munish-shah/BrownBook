import { RESET_HOUR, createId, dateKey, deleteRoutine, isActiveOn, isVacation, resumeRoutine, suspendRoutine, taskDay, todayKey, toggleRoutine } from './domain.js';

export const MAX_ACTIVE_GOALS = 3;

export const GOAL_PRESETS = [
    { id: 'weight', label: 'Reach a weight', type: 'target', title: 'Reach my goal weight', unit: 'lb', frequency: 'weekly' },
    { id: 'protein', label: 'Hit protein', type: 'habit', title: 'Hit my protein', mode: 'amount', unit: 'g', dailyTarget: 150, daysGoal: 90, weeklyMin: 6 },
    { id: 'sleep', label: 'Sleep 8 hours', type: 'habit', title: 'Sleep 8 hours', mode: 'amount', unit: 'hrs', dailyTarget: 8, daysGoal: 60, weeklyMin: 6 },
    { id: 'workout', label: 'Work out', type: 'habit', title: 'Work out', mode: 'check', daysGoal: 100, weeklyMin: 4 },
    { id: 'water', label: 'Drink water', type: 'habit', title: 'Drink enough water', mode: 'amount', unit: 'L', dailyTarget: 3, daysGoal: 60, weeklyMin: 6 }
];

const DAY_MS = 86_400_000;

export function keyToDate(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function daysBetweenKeys(from, to) {
    const a = keyToDate(from);
    const b = keyToDate(to);
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
}

export function addDaysKey(key, amount) {
    const date = keyToDate(key);
    date.setDate(date.getDate() + amount);
    return dateKey(date);
}

const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));

export function linkedRoutine(data, goal) {
    return data.recurringTasks.find(task => task.id === goal.routineId && !task.deleted) || null;
}

export function activeGoals(data) {
    return data.goals.filter(goal => !goal.archived && !goal.paused);
}

function buildRoutine(goal, now, frequency) {
    const routine = {
        id: createId('recurring'),
        title: goal.type === 'target' ? `Log: ${goal.title}` : goal.title,
        notes: goal.type === 'target'
            ? `Toward ${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ''}`
            : goal.mode === 'amount' ? `${goal.dailyTarget}${goal.unit ? ` ${goal.unit}` : ''} a day` : '',
        difficulty: 'quick',
        subtasks: [],
        distributeCoins: false,
        createdAt: now.toISOString(),
        goalId: goal.id,
        type: 'daily'
    };
    if (frequency === 'weekly') {
        // One active day every seven, starting today.
        const start = taskDay(now);
        start.setHours(RESET_HOUR, 0, 0, 0);
        Object.assign(routine, { type: 'interval', activeDays: 1, breakDays: 6, cycleStartDate: start.toISOString() });
    }
    return routine;
}

export function createGoal(data, draft, now = new Date()) {
    const title = String(draft.title || '').trim();
    if (!title) throw new Error('Give the goal a name.');
    const today = todayKey(now);
    const goal = {
        id: createId('goal'),
        title,
        type: draft.type,
        unit: String(draft.unit || '').trim(),
        createdAt: now.toISOString(),
        startDate: today,
        paused: false,
        archived: false,
        countInPulse: Boolean(draft.countInPulse),
        weeklyMin: clamp(Math.round(Number(draft.weeklyMin) || 6), 1, 7),
        logs: {}
    };

    let frequency = 'none';
    if (draft.type === 'target') {
        if (!finite(draft.startValue) || !finite(draft.targetValue)) throw new Error('Enter a starting value and a target.');
        if (Number(draft.startValue) === Number(draft.targetValue)) throw new Error('The target should differ from where you start.');
        if (!draft.deadline) throw new Error('Pick a date to reach it by.');
        if (draft.deadline <= today) throw new Error('Pick a date in the future.');
        Object.assign(goal, { startValue: Number(draft.startValue), targetValue: Number(draft.targetValue), deadline: draft.deadline });
        frequency = draft.frequency || 'weekly';
    } else {
        goal.mode = draft.mode === 'amount' ? 'amount' : 'check';
        if (goal.mode === 'amount') {
            if (!(Number(draft.dailyTarget) > 0)) throw new Error('Enter the daily amount to hit.');
            goal.dailyTarget = Number(draft.dailyTarget);
        }
        if (!(Number(draft.daysGoal) >= 1)) throw new Error('How many days should you hit it?');
        goal.daysGoal = Math.round(Number(draft.daysGoal));
        if (draft.deadline) {
            if (draft.deadline <= today) throw new Error('Pick a date in the future.');
            goal.deadline = draft.deadline;
        }
        frequency = draft.link === false ? 'none' : 'daily';
    }

    if (frequency !== 'none') {
        const routine = buildRoutine(goal, now, frequency);
        data.recurringTasks.push(routine);
        goal.routineId = routine.id;
    }
    data.goals.push(goal);
    return goal;
}

function findGoal(data, id) {
    const goal = data.goals.find(candidate => candidate.id === id);
    if (!goal) throw new Error('That goal no longer exists.');
    return goal;
}

export function updateGoal(data, id, patch) {
    const goal = findGoal(data, id);
    if ('title' in patch) {
        const title = String(patch.title).trim();
        if (!title) throw new Error('A goal needs a name.');
        goal.title = title;
    }
    if ('unit' in patch) goal.unit = String(patch.unit).trim();
    if ('weeklyMin' in patch) goal.weeklyMin = clamp(Math.round(Number(patch.weeklyMin) || goal.weeklyMin), 1, 7);
    if ('countInPulse' in patch) goal.countInPulse = Boolean(patch.countInPulse);
    if ('deadline' in patch) {
        if (patch.deadline) goal.deadline = patch.deadline;
        else if (goal.type === 'habit') delete goal.deadline;
        else throw new Error('A target needs a date.');
    }
    if (goal.type === 'target') {
        if ('targetValue' in patch) {
            if (!finite(patch.targetValue) || Number(patch.targetValue) === goal.startValue) throw new Error('Enter a different target.');
            goal.targetValue = Number(patch.targetValue);
        }
    } else {
        if ('daysGoal' in patch) {
            if (!(Number(patch.daysGoal) >= 1)) throw new Error('Enter at least one day.');
            goal.daysGoal = Math.round(Number(patch.daysGoal));
        }
        if ('dailyTarget' in patch && goal.mode === 'amount') {
            if (!(Number(patch.dailyTarget) > 0)) throw new Error('Enter the daily amount to hit.');
            goal.dailyTarget = Number(patch.dailyTarget);
        }
    }
    const routine = linkedRoutine(data, goal);
    if (routine) {
        routine.title = goal.type === 'target' ? `Log: ${goal.title}` : goal.title;
        routine.notes = goal.type === 'target'
            ? `Toward ${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ''}`
            : goal.mode === 'amount' ? `${goal.dailyTarget}${goal.unit ? ` ${goal.unit}` : ''} a day` : routine.notes;
    }
}

/** Turn the Today check-in on or off. */
export function setGoalLink(data, id, enabled, frequency = 'daily', now = new Date()) {
    const goal = findGoal(data, id);
    const routine = linkedRoutine(data, goal);
    if (enabled && !routine) {
        const created = buildRoutine(goal, now, goal.type === 'target' ? frequency : 'daily');
        data.recurringTasks.push(created);
        goal.routineId = created.id;
    } else if (!enabled && routine) {
        deleteRoutine(data, routine.id);
        delete goal.routineId;
    }
}

export function pauseGoal(data, id, now = new Date()) {
    const goal = findGoal(data, id);
    goal.paused = true;
    const routine = linkedRoutine(data, goal);
    if (routine) suspendRoutine(data, routine.id, null, now);
}

export function resumeGoal(data, id, now = new Date()) {
    const goal = findGoal(data, id);
    goal.paused = false;
    const routine = linkedRoutine(data, goal);
    if (routine) resumeRoutine(data, routine.id, now);
}

export function archiveGoal(data, id) {
    const goal = findGoal(data, id);
    goal.archived = true;
    const routine = linkedRoutine(data, goal);
    if (routine) deleteRoutine(data, routine.id);
    delete goal.routineId;
}

export function restoreGoal(data, id, now = new Date()) {
    const goal = findGoal(data, id);
    goal.archived = false;
    goal.paused = false;
    if (goal.type === 'habit' || goal.type === 'target') setGoalLink(data, id, true, goal.type === 'target' ? 'weekly' : 'daily', now);
}

export function deleteGoal(data, id) {
    const goal = findGoal(data, id);
    const routine = linkedRoutine(data, goal);
    if (routine) deleteRoutine(data, routine.id);
    data.goals = data.goals.filter(candidate => candidate.id !== id);
}

/** Record a value for any day (back-filling, or a goal with no Today check-in). */
export function logGoal(data, id, key, value) {
    const goal = findGoal(data, id);
    if (!finite(value) || Number(value) < 0) throw new Error('Enter a number.');
    goal.logs[key] = Number(value);
}

export function removeGoalLog(data, id, key, now = new Date()) {
    const goal = findGoal(data, id);
    const routine = linkedRoutine(data, goal);
    if (routine && key === todayKey(now) && data.recurringCompletions[routine.id] === key) toggleRoutine(data, routine.id, now);
    else delete goal.logs[key];
}

/** Log today's value. Completes the Today check-in when there is one that is due, so the two never disagree. */
export function logToday(data, id, value, now = new Date()) {
    const goal = findGoal(data, id);
    const key = todayKey(now);
    const routine = linkedRoutine(data, goal);
    const doneToday = routine && data.recurringCompletions[routine.id] === key;
    if (routine && !doneToday && isActiveOn(routine, taskDay(now))) return toggleRoutine(data, routine.id, now, value);
    logGoal(data, id, key, value);
    return { awarded: 0, bonus: 0 };
}

export function isHit(goal, value) {
    if (value === undefined || value === null) return false;
    return goal.mode === 'amount' ? value >= goal.dailyTarget : value >= 1;
}

function weekDots(data, goal, today) {
    const dots = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
        const key = addDaysKey(today, -offset);
        const value = goal.logs[key];
        let state;
        if (key < goal.startDate) state = 'na';
        else if (isVacation(data, key)) state = 'vacation';
        else if (value !== undefined) state = isHit(goal, value) ? 'hit' : (goal.mode === 'amount' && value > 0 ? 'partial' : 'miss');
        else state = key === today ? 'pending' : 'miss';
        dots.push({ key, state, value });
    }
    return dots;
}

/**
 * Everything a goal card needs: progress, pace and the numbers to show.
 * pace is one of: new, ahead, on-track, behind, done, paused.
 */
export function goalStatus(data, goal, now = new Date()) {
    const today = todayKey(now);
    const paused = goal.paused;
    const elapsed = Math.max(1, daysBetweenKeys(goal.startDate, today) + 1);
    const span = goal.deadline ? Math.max(1, daysBetweenKeys(goal.startDate, goal.deadline)) : null;
    const daysLeft = goal.deadline ? daysBetweenKeys(today, goal.deadline) : null;

    if (goal.type === 'target') {
        const entries = Object.entries(goal.logs).filter(([key]) => key <= today).sort(([a], [b]) => (a < b ? -1 : 1));
        const current = entries.length ? entries.at(-1)[1] : goal.startValue;
        const total = goal.targetValue - goal.startValue;
        const progress = clamp((current - goal.startValue) / total);
        const done = total > 0 ? current >= goal.targetValue : current <= goal.targetValue;
        const expected = clamp(daysBetweenKeys(goal.startDate, today) / span);
        const diff = progress - expected;
        let pace;
        if (paused) pace = 'paused';
        else if (done) pace = 'done';
        else if (entries.length === 0 || daysBetweenKeys(goal.startDate, today) < 7) pace = 'new';
        else if (diff >= 0.05) pace = 'ahead';
        else if (diff >= -0.07) pace = 'on-track';
        else pace = 'behind';

        const remaining = goal.targetValue - current;
        const needPerWeek = daysLeft > 0 ? remaining / (daysLeft / 7) : null;
        const recent = entries.filter(([key]) => daysBetweenKeys(key, today) <= 28);
        let perWeek = null;
        if (recent.length >= 2) {
            const span28 = daysBetweenKeys(recent[0][0], recent.at(-1)[0]);
            if (span28 >= 3) perWeek = ((recent.at(-1)[1] - recent[0][1]) / span28) * 7;
        }
        return { type: 'target', pace, progress, expected, done, current, remaining, needPerWeek, perWeek, daysLeft, entries, dots: null };
    }

    const hitDays = Object.entries(goal.logs).filter(([key, value]) => key <= today && isHit(goal, value));
    const daysHit = hitDays.length;
    const progress = clamp(daysHit / goal.daysGoal);
    const dots = weekDots(data, goal, today);
    const hits = dots.filter(dot => dot.state === 'hit').length;
    const eligible = dots.filter(dot => ['hit', 'miss', 'partial', 'pending'].includes(dot.state)).length;
    const need = Math.min(goal.weeklyMin, eligible);
    const pending = dots.some(dot => dot.state === 'pending') ? 1 : 0;
    const expectedHits = span ? goal.daysGoal * clamp(daysBetweenKeys(goal.startDate, today) / span) : null;

    let pace;
    if (paused) pace = 'paused';
    else if (daysHit >= goal.daysGoal) pace = 'done';
    else if (elapsed < 3 && daysHit === 0) pace = 'new';
    else if (span) {
        if (daysHit >= expectedHits + 2) pace = 'ahead';
        else if (daysHit < expectedHits - Math.max(2, goal.daysGoal * 0.08)) pace = 'behind';
        else pace = 'on-track';
    } else if (hits >= need) pace = hits === eligible && eligible >= 4 ? 'ahead' : 'on-track';
    else if (hits + pending >= need) pace = 'on-track';
    else pace = 'behind';

    const window14 = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
        const key = addDaysKey(today, -offset);
        if (key >= goal.startDate && !isVacation(data, key)) window14.push(key);
    }
    const rate = window14.length ? window14.filter(key => isHit(goal, goal.logs[key])).length / window14.length : 0;
    const eta = rate > 0.05 && daysHit < goal.daysGoal ? addDaysKey(today, Math.ceil((goal.daysGoal - daysHit) / rate)) : null;
    return { type: 'habit', pace, progress, elapsed, daysHit, hits, need, eligible, dots, expected: span ? clamp(daysBetweenKeys(goal.startDate, today) / span) : null, eta, daysLeft, loggedToday: goal.logs[today], hitToday: isHit(goal, goal.logs[today]) };
}

/** Hits per Monday-start week for the last `weeks` weeks, oldest first. */
export function weeklyHits(goal, weeks = 12, now = new Date()) {
    const today = todayKey(now);
    const date = keyToDate(today);
    const mondayOffset = (date.getDay() + 6) % 7;
    const thisMonday = addDaysKey(today, -mondayOffset);
    const out = [];
    for (let back = weeks - 1; back >= 0; back -= 1) {
        const start = addDaysKey(thisMonday, -7 * back);
        let hits = 0;
        for (let day = 0; day < 7; day += 1) {
            const key = addDaysKey(start, day);
            if (key <= today && isHit(goal, goal.logs[key])) hits += 1;
        }
        out.push({ start, hits });
    }
    return out;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppData } from '../data-model.js';
import { createPreviewData } from '../preview-data.js';
import {
    addSubtask,
    claimShopItem,
    completeTask,
    createTask,
    deriveToday,
    reopenTask,
    shopPrice,
    toggleRoutine,
    toggleSubtask
} from '../studio/src/domain.js';

const morning = new Date(2026, 9, 6, 10, 0, 0);

test('distributed subtasks pay exactly the task reward', () => {
    const data = normalizeAppData(createPreviewData());
    const start = data.stats.currentBalance;
    const task = createTask(data, {
        title: 'Split', notes: '', difficulty: 'hard', recurring: false, expiration: '',
        distributeCoins: true, subtasks: [{ title: 'A', coins: 25 }, { title: 'B', coins: 25 }]
    }, morning);

    toggleSubtask(data, task.id, task.subtasks[0].id, 'task');
    toggleSubtask(data, task.id, task.subtasks[1].id, 'task');
    assert.equal(data.stats.currentBalance, start + 50);

    reopenTask(data, task.id);
    assert.equal(data.stats.currentBalance, start);
    assert.equal(data.tasks[0].subtasks.every(subtask => !subtask.completed), true);
});

test('routine toggle round-trips coins and history', () => {
    const data = normalizeAppData(createPreviewData());
    const routine = data.recurringTasks.find(task => task.id === 'preview-read');
    const start = data.stats.currentBalance;
    const historyLength = data.completedHistory.length;

    toggleRoutine(data, routine.id, morning);
    assert.ok(data.stats.currentBalance > start);
    toggleRoutine(data, routine.id, morning);
    assert.equal(data.stats.currentBalance, start);
    assert.equal(data.completedHistory.length, historyLength);
});

test('shop pricing scales after purchases and claims deduct', () => {
    const data = normalizeAppData(createPreviewData());
    const item = data.customShopItems.find(candidate => candidate.id === 'preview-shop-1');
    const weekday = new Date(2026, 9, 7, 12);
    assert.equal(shopPrice(data, item, true, weekday), 70);
    claimShopItem(data, item, weekday);
    assert.equal(shopPrice(data, item, true, weekday), 90);
});

test('today derivation separates focus, routines, and tasks', () => {
    const data = normalizeAppData(createPreviewData());
    const today = deriveToday(data, morning);
    assert.ok(today.focus.some(task => task.id === 'preview-task-1'));
    assert.equal(today.open.some(task => task.id === 'preview-task-1'), false);
    completeTask(data, 'preview-task-2');
    assert.equal(deriveToday(data, morning).completedToday.length >= 1, true);
});

test('re-checking the last step of a finished ritual keeps it done', () => {
    const data = normalizeAppData(createPreviewData());
    const routine = data.recurringTasks.find(task => task.id === 'preview-read');
    addSubtask(data, routine.id, 'routine', 'Step one');
    const subtaskId = routine.subtasks.at(-1).id;
    const start = data.stats.currentBalance;

    toggleRoutine(data, routine.id, morning);
    const afterComplete = data.stats.currentBalance;
    assert.ok(afterComplete > start);

    toggleSubtask(data, routine.id, subtaskId, 'routine', morning); // uncheck
    toggleSubtask(data, routine.id, subtaskId, 'routine', morning); // re-check
    assert.equal(data.stats.currentBalance, afterComplete);
    assert.equal(data.recurringCompletions[routine.id], '2026-10-06');
});

test('period series and streak history cover every range', async () => {
    const { periodSeries, allStreaks } = await import('../studio/src/domain.js');
    const data = normalizeAppData(createPreviewData());
    const now = new Date(2026, 9, 7, 12);
    for (const range of ['daily', 'weekly', 'monthly', 'yearly']) {
        const series = periodSeries(data, range, now);
        assert.ok(series.length > 0, `${range} has data`);
        series.forEach(point => assert.ok(point.rate >= 0 && point.rate <= 100, `${range} rate in range`));
    }
    allStreaks(data, now).forEach(streak => assert.ok(streak.length > 0 && streak.end >= streak.start));
});

test('editing steps of a finished ritual never moves coins', () => {
    const data = normalizeAppData(createPreviewData());
    const routine = data.recurringTasks.find(task => task.id === 'preview-read');
    routine.distributeCoins = true;
    routine.subtasks = [{ id: 's1', title: 'a', completed: false, coins: 2 }, { id: 's2', title: 'b', completed: false, coins: 3 }];
    toggleRoutine(data, routine.id, morning);
    const done = data.stats.currentBalance;
    toggleSubtask(data, routine.id, 's1', 'routine', morning);
    assert.equal(data.stats.currentBalance, done);
});

test('an interval ritual created before the 6 AM reset is active today', async () => {
    const { isActiveOn, taskDay } = await import('../studio/src/domain.js');
    const data = normalizeAppData(createPreviewData());
    const lateNight = new Date(2026, 9, 7, 1, 30);
    const routine = createTask(data, { title: 'Cycle', notes: '', difficulty: 'easy', recurring: true, recurrence: 'interval', activeDays: 3, breakDays: 1, cycleOffset: 0, subtasks: [] }, lateNight);
    assert.equal(isActiveOn(routine, taskDay(lateNight)), true);
});

test('pausing and resuming a ritual works, including before the 6 AM reset', async () => {
    const { suspendRoutine, resumeRoutine, isSuspendedOn, taskDay } = await import('../studio/src/domain.js');
    const data = normalizeAppData(createPreviewData());
    const routine = data.recurringTasks.find(task => task.id === 'preview-read');
    const lateNight = new Date(2026, 9, 7, 1, 30);

    suspendRoutine(data, routine.id, null, lateNight);
    assert.equal(isSuspendedOn(routine, taskDay(lateNight)), true);
    resumeRoutine(data, routine.id, lateNight);
    assert.equal(isSuspendedOn(routine, taskDay(lateNight)), false);

    const monday = new Date(2026, 9, 5, 10);
    suspendRoutine(data, routine.id, null, monday);
    const wednesday = new Date(2026, 9, 7, 10);
    assert.equal(isSuspendedOn(routine, taskDay(wednesday)), true);
    resumeRoutine(data, routine.id, wednesday);
    assert.equal(isSuspendedOn(routine, taskDay(wednesday)), false);
    assert.equal(isSuspendedOn(routine, taskDay(new Date(2026, 9, 6, 10))), true);
});

test('vacation days never add zeros, and an all-vacation period counts as 100%', async () => {
    const { periodSeries } = await import('../studio/src/domain.js');
    const data = normalizeAppData(createPreviewData());
    const now = new Date(2026, 9, 7, 12);
    // Mark the whole of last week (Mon Sep 28 - Sun Oct 4) as vacation.
    data.vacationDays = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
    const weekly = periodSeries(data, 'weekly', now);
    const vacationWeek = weekly.find(point => point.title === 'Week of Sep 28');
    assert.ok(vacationWeek, 'the vacation week is still listed');
    assert.equal(vacationWeek.vacation, true);
    assert.equal(vacationWeek.rate, 100);

    // A week with some vacation days averages only the non-vacation days.
    data.vacationDays = ['2026-10-05'];
    const mixed = periodSeries(data, 'weekly', now).find(point => point.title === 'Week of Oct 5');
    assert.equal(mixed.vacation, false);
    assert.equal(mixed.vacationDays, 1);
    assert.ok(mixed.rate >= 0 && mixed.rate <= 100);
});

test('vacation days can be added and removed', async () => {
    const { toggleVacation, isVacation } = await import('../studio/src/domain.js');
    const data = normalizeAppData(createPreviewData());
    assert.equal(toggleVacation(data, '2026-09-27'), true);
    assert.equal(isVacation(data, '2026-09-27'), true);
    assert.equal(toggleVacation(data, '2026-09-27'), false);
    assert.equal(isVacation(data, '2026-09-27'), false);
});

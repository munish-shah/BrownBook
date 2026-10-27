import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData, normalizeAppData } from '../data-model.js';
import { deriveToday, streak, toggleRoutine, todayKey } from '../studio/src/domain.js';
import { addDaysKey, createGoal, deleteGoal, goalStatus, logGoal, logToday, pauseGoal, resumeGoal, setGoalLink, updateGoal } from '../studio/src/goals.js';

const now = new Date(2026, 9, 26, 12);
const today = todayKey(now);
const fresh = () => normalizeAppData(createDefaultAppData());

test('a hit/miss habit adds a daily ritual and logs when it is checked off', () => {
    const data = fresh();
    const goal = createGoal(data, { type: 'habit', title: 'Work out', mode: 'check', daysGoal: 30, weeklyMin: 4 }, now);
    const routine = data.recurringTasks.find(task => task.goalId === goal.id);
    assert.ok(routine);
    assert.equal(goal.routineId, routine.id);
    toggleRoutine(data, routine.id, now);
    assert.equal(data.goals[0].logs[today], 1);
    toggleRoutine(data, routine.id, now);
    assert.equal(data.goals[0].logs[today], undefined);
});

test('an amount habit needs a number and counts a day only when the target is met', () => {
    const data = fresh();
    const goal = createGoal(data, { type: 'habit', title: 'Sleep 8 hours', mode: 'amount', unit: 'hrs', dailyTarget: 8, daysGoal: 10, weeklyMin: 6 }, now);
    const routine = data.recurringTasks.find(task => task.goalId === goal.id);
    assert.throws(() => toggleRoutine(data, routine.id, now), /number/);
    logToday(data, goal.id, 6.5, now);
    let status = goalStatus(data, data.goals[0], now);
    assert.equal(status.daysHit, 0, '6.5 of 8 is a miss');
    assert.equal(data.recurringCompletions[routine.id], today, 'but the check-in is still done');
    logToday(data, goal.id, 8, now);
    status = goalStatus(data, data.goals[0], now);
    assert.equal(status.daysHit, 1);
    assert.equal(status.hitToday, true);
});

test('a target goal reports pace against the straight line to the deadline', () => {
    const data = fresh();
    const goal = createGoal(data, { type: 'target', title: 'Reach 175', unit: 'lb', startValue: 185, targetValue: 175, deadline: '2026-12-25', frequency: 'weekly' }, now);
    goal.startDate = addDaysKey(today, -30);
    const total = 60;
    // 30 of ~60 days in: halfway would be 180. Log 176 (well ahead) then 183 (behind).
    logGoal(data, goal.id, addDaysKey(today, -2), 176);
    assert.equal(goalStatus(data, data.goals[0], now).pace, 'ahead');
    logGoal(data, goal.id, today, 183);
    assert.equal(goalStatus(data, data.goals[0], now).pace, 'behind');
    logGoal(data, goal.id, today, 174.5);
    const done = goalStatus(data, data.goals[0], now);
    assert.equal(done.pace, 'done');
    assert.ok(total > 0);
});

test('a weekly check-in is only due once a week', () => {
    const data = fresh();
    createGoal(data, { type: 'target', title: 'Reach 175', unit: 'lb', startValue: 185, targetValue: 175, deadline: '2026-12-25', frequency: 'weekly' }, now);
    const due = day => deriveToday(data, new Date(2026, 9, 26 + day, 12)).routinesOpen.length;
    assert.equal(due(0), 1);
    assert.equal(due(1), 0);
    assert.equal(due(7), 1);
});

test('goal check-ins stay out of the Pulse streak and ring unless the goal opts in', () => {
    const data = fresh();
    const goal = createGoal(data, { type: 'habit', title: 'Work out', mode: 'check', daysGoal: 30, weeklyMin: 4 }, now);
    const routine = data.recurringTasks[0];
    assert.equal(streak(data, now), 0);
    toggleRoutine(data, routine.id, now);
    assert.equal(streak(data, now), 0, 'a goal-only day is not a Pulse streak day');
    assert.equal(deriveToday(data, now).percent, 0);
    updateGoal(data, goal.id, { countInPulse: true });
    assert.equal(streak(data, now), 1);
});

test('pausing hides the check-in and deleting a goal removes it', () => {
    const data = fresh();
    const goal = createGoal(data, { type: 'habit', title: 'Work out', mode: 'check', daysGoal: 30, weeklyMin: 4 }, now);
    pauseGoal(data, goal.id, now);
    assert.equal(deriveToday(data, now).routinesOpen.length, 0);
    assert.equal(goalStatus(data, data.goals[0], now).pace, 'paused');
    resumeGoal(data, goal.id, now);
    assert.equal(deriveToday(data, now).routinesOpen.length, 1);
    setGoalLink(data, goal.id, false);
    assert.equal(deriveToday(data, now).routinesOpen.length, 0);
    deleteGoal(data, goal.id);
    assert.equal(data.goals.length, 0);
});

test('goal creation validates its inputs', () => {
    const data = fresh();
    assert.throws(() => createGoal(data, { type: 'habit', title: '', mode: 'check', daysGoal: 5 }, now), /name/);
    assert.throws(() => createGoal(data, { type: 'target', title: 'x', startValue: 5, targetValue: 5, deadline: '2026-12-01' }, now), /differ/);
    assert.throws(() => createGoal(data, { type: 'target', title: 'x', startValue: 5, targetValue: 9, deadline: '2026-01-01' }, now), /future/);
    assert.equal(data.goals.length, 0);
});

test('a habit with a weekly minimum treats vacation days as neutral', () => {
    const data = fresh();
    const goal = createGoal(data, { type: 'habit', title: 'Work out', mode: 'check', daysGoal: 30, weeklyMin: 6 }, now);
    goal.startDate = addDaysKey(today, -6);
    for (let i = 0; i < 4; i += 1) logGoal(data, goal.id, addDaysKey(today, -i - 1), 1);
    data.vacationDays = [addDaysKey(today, -5), addDaysKey(today, -6)];
    const status = goalStatus(data, data.goals[0], now);
    assert.equal(status.hits, 4);
    assert.equal(status.eligible, 5, 'five non-vacation days are in play');
    assert.equal(status.need, 5, 'the weekly minimum shrinks to the days available');
});

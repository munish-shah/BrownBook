import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getCompletionCoinDelta,
    getDocumentSizeBytes,
    getRecordedCompletionCoins,
    getTaskRewardCoins,
    normalizeAppData
} from '../data-model.js';

const difficultyCoins = { quick: 5, easy: 15, medium: 25, hard: 50, epic: 75 };

test('deeply normalizes partial Firestore data', () => {
    const data = normalizeAppData({
        stats: { currentBalance: '40' },
        tasks: [{ id: 1, title: '  Example  ', subtasks: null }],
        rewards: [{ id: 2, name: 'Coffee', cost: '25' }]
    });

    assert.equal(data.stats.currentBalance, 40);
    assert.equal(data.stats.totalCoinsEarned, 0);
    assert.equal(data.tasks[0].title, 'Example');
    assert.deepEqual(data.tasks[0].subtasks, []);
    assert.equal(data.rewards[0].timesClaimed, 0);
});

test('distributed subtasks never double-award the parent reward', () => {
    const task = {
        difficulty: 'hard',
        distributeCoins: true,
        subtasks: [
            { completed: true, coins: 15 },
            { completed: true, coins: 20 },
            { completed: false, coins: 15 }
        ]
    };

    assert.equal(getTaskRewardCoins(task, difficultyCoins), 50);
    assert.equal(getCompletionCoinDelta(task, difficultyCoins), 15);

    task.subtasks[2].completed = true;
    assert.equal(getCompletionCoinDelta(task, difficultyCoins), 0);
});

test('legacy history entries fall back to their difficulty reward', () => {
    assert.equal(getRecordedCompletionCoins({ difficulty: 'medium' }, difficultyCoins), 25);
    assert.equal(getRecordedCompletionCoins({ difficulty: 'medium', coins: 18 }, difficultyCoins), 18);
});

test('estimates the serialized Firestore document size', () => {
    assert.ok(getDocumentSizeBytes({ title: 'BrownBook' }) > 10);
});

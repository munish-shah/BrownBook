export const DEFAULT_STATS = Object.freeze({
    totalCoinsEarned: 0,
    currentBalance: 0,
    tasksCompletedQuick: 0,
    tasksCompletedEasy: 0,
    tasksCompletedMedium: 0,
    tasksCompletedHard: 0,
    tasksCompletedEpic: 0,
    tasksCompletedPlaceholder: 0,
    rewardsClaimed: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastActiveDate: null,
    lastEarlyBirdBonusDate: null,
    lastEarlyBirdBonusCoins: 0
});

const DEFAULT_VACATION_DAYS = Object.freeze([
    '2026-05-15',
    '2026-05-16',
    '2026-05-17',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07',
    '2026-08-08',
    '2026-08-09',
    '2026-08-10'
]);
const VALID_DIFFICULTIES = new Set(['quick', 'easy', 'medium', 'hard', 'epic', 'placeholder']);

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asFiniteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeSubtask(subtask) {
    return {
        ...asObject(subtask),
        id: String(subtask?.id || crypto.randomUUID()),
        title: String(subtask?.title || '').trim(),
        completed: Boolean(subtask?.completed),
        coins: Math.max(0, asFiniteNumber(subtask?.coins))
    };
}

function normalizeTask(task) {
    const difficulty = String(task?.difficulty || 'medium');
    const normalized = {
        ...asObject(task),
        id: String(task?.id || crypto.randomUUID()),
        title: String(task?.title || '').trim(),
        notes: String(task?.notes || ''),
        difficulty: VALID_DIFFICULTIES.has(difficulty) ? difficulty : 'medium',
        subtasks: asArray(task?.subtasks).map(normalizeSubtask),
        distributeCoins: Boolean(task?.distributeCoins)
    };

    if (Object.hasOwn(normalized, 'completed')) {
        normalized.completed = Boolean(normalized.completed);
    }

    return normalized;
}

function normalizeReward(reward) {
    return {
        ...asObject(reward),
        id: String(reward?.id || crypto.randomUUID()),
        name: String(reward?.name || '').trim(),
        description: String(reward?.description || ''),
        category: String(reward?.category || 'other'),
        cost: Math.max(0, asFiniteNumber(reward?.cost)),
        timesClaimed: Math.max(0, asFiniteNumber(reward?.timesClaimed))
    };
}

function normalizeShopItem(item) {
    return {
        ...asObject(item),
        id: String(item?.id || crypto.randomUUID()),
        name: String(item?.name || '').trim(),
        baseCost: Math.max(0, asFiniteNumber(item?.baseCost)),
        scaling: Math.max(0, asFiniteNumber(item?.scaling ?? item?.scalingAmount)),
        scalingType: item?.scalingType === 'multiply' ? 'multiply' : 'add'
    };
}

export function createDefaultAppData() {
    return {
        schemaVersion: 2,
        tasks: [],
        recurringTasks: [],
        recurringCompletions: {},
        completedHistory: [],
        rewards: [],
        customShopItems: [],
        focusPinnedIds: [],
        vacationDays: [...DEFAULT_VACATION_DAYS],
        stats: { ...DEFAULT_STATS },
        shopPurchases: {},
        hiddenShopItems: [],
        presetsInitialized: false,
        settings: {}
    };
}

export function normalizeAppData(rawData) {
    const defaults = createDefaultAppData();
    const raw = asObject(rawData);
    const stats = asObject(raw.stats);

    return {
        ...defaults,
        ...raw,
        schemaVersion: Math.max(2, asFiniteNumber(raw.schemaVersion, 2)),
        tasks: asArray(raw.tasks).map(normalizeTask).filter(task => task.title),
        recurringTasks: asArray(raw.recurringTasks).map(normalizeTask).filter(task => task.title),
        recurringCompletions: asObject(raw.recurringCompletions),
        completedHistory: asArray(raw.completedHistory).map(normalizeTask).filter(task => task.title),
        rewards: asArray(raw.rewards).map(normalizeReward).filter(reward => reward.name),
        customShopItems: asArray(raw.customShopItems).map(normalizeShopItem).filter(item => item.name),
        focusPinnedIds: asArray(raw.focusPinnedIds).map(String),
        vacationDays: Array.isArray(raw.vacationDays)
            ? [...new Set(raw.vacationDays.map(String))]
            : defaults.vacationDays,
        stats: Object.fromEntries(
            Object.entries({ ...DEFAULT_STATS, ...stats }).map(([key, value]) => {
                if (key === 'lastActiveDate' || key === 'lastEarlyBirdBonusDate' || typeof value === 'boolean') {
                    return [key, value];
                }
                return [key, asFiniteNumber(value)];
            })
        ),
        shopPurchases: asObject(raw.shopPurchases),
        hiddenShopItems: asArray(raw.hiddenShopItems).map(String),
        settings: asObject(raw.settings),
        presetsInitialized: Boolean(raw.presetsInitialized)
    };
}

export function getTaskRewardCoins(task, difficultyCoins) {
    if (task?.distributeCoins && Array.isArray(task.subtasks) && task.subtasks.length > 0) {
        return task.subtasks.reduce((total, subtask) => total + Math.max(0, asFiniteNumber(subtask.coins)), 0);
    }

    return Math.max(0, asFiniteNumber(difficultyCoins?.[task?.difficulty]));
}

export function getCompletedSubtaskCoins(task) {
    if (!task?.distributeCoins || !Array.isArray(task.subtasks)) return 0;

    return task.subtasks.reduce((total, subtask) => (
        subtask.completed ? total + Math.max(0, asFiniteNumber(subtask.coins)) : total
    ), 0);
}

export function getCompletionCoinDelta(task, difficultyCoins) {
    return Math.max(0, getTaskRewardCoins(task, difficultyCoins) - getCompletedSubtaskCoins(task));
}

export function getRecordedCompletionCoins(record, difficultyCoins) {
    return Math.max(
        0,
        asFiniteNumber(record?.coins, getTaskRewardCoins(record, difficultyCoins))
    );
}

export function getDocumentSizeBytes(data) {
    return new TextEncoder().encode(JSON.stringify(data)).byteLength;
}

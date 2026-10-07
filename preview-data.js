function taskDateString(date = new Date()) {
    const adjusted = new Date(date);
    if (adjusted.getHours() < 6) adjusted.setDate(adjusted.getDate() - 1);
    return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, '0')}-${String(adjusted.getDate()).padStart(2, '0')}`;
}

function isoDaysAgo(days, hour = 19) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
}

export function createPreviewData() {
    const today = taskDateString();
    const recurringTasks = [
        { id: 'preview-brush', title: 'Morning reset', notes: 'water, brush, vitamins', difficulty: 'quick', type: 'daily', createdAt: isoDaysAgo(140) },
        { id: 'preview-read', title: 'Read', notes: '20 focused minutes', difficulty: 'easy', type: 'daily', createdAt: isoDaysAgo(120) },
        { id: 'preview-gym', title: 'Gym', notes: 'strength + mobility', difficulty: 'medium', type: 'interval', activeDays: 3, breakDays: 1, cycleStartDate: isoDaysAgo(100, 6), createdAt: isoDaysAgo(100) },
        { id: 'preview-review', title: 'Evening review', notes: 'close loops before tomorrow', difficulty: 'quick', type: 'daily', createdAt: isoDaysAgo(90) }
    ];

    const completedHistory = [];
    for (let day = 0; day < 42; day += 1) {
        recurringTasks.forEach((task, index) => {
            if ((day + index) % 5 !== 0) {
                completedHistory.push({
                    id: `preview-history-${day}-${task.id}`,
                    recurringId: task.id,
                    title: task.title,
                    notes: task.notes,
                    difficulty: task.difficulty,
                    coins: { quick: 5, easy: 15, medium: 25 }[task.difficulty],
                    isRecurring: true,
                    completed: true,
                    completedAt: isoDaysAgo(day, 8 + index * 3)
                });
            }
        });
    }

    return {
        schemaVersion: 2,
        tasks: [
            {
                id: 'preview-task-1',
                title: 'Shape the next BrownBook release',
                notes: 'Make the daily loop feel calm, fast, and unmistakably yours',
                difficulty: 'hard',
                createdAt: isoDaysAgo(1),
                distributeCoins: true,
                subtasks: [
                    { id: 'preview-sub-1', title: 'Audit the interaction loop', completed: true, coins: 15 },
                    { id: 'preview-sub-2', title: 'Refine the motion language', completed: false, coins: 20 },
                    { id: 'preview-sub-3', title: 'Check compact layouts', completed: false, coins: 15 }
                ]
            },
            { id: 'preview-task-2', title: 'Plan the next product sprint', notes: 'Write the three outcomes that matter', difficulty: 'medium', createdAt: isoDaysAgo(0), subtasks: [] },
            { id: 'preview-task-3', title: 'Reply to project email', notes: '', difficulty: 'quick', createdAt: isoDaysAgo(0), subtasks: [], expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() }
        ],
        recurringTasks,
        recurringCompletions: {
            'preview-brush': today,
            'preview-review': today
        },
        completedHistory,
        rewards: [
            { id: 'preview-reward-1', name: 'Watch an episode', description: 'No second-screen guilt', category: 'entertainment', cost: 80, timesClaimed: 3 },
            { id: 'preview-reward-2', name: 'Coffee out', description: 'Take the long walk there', category: 'food', cost: 120, timesClaimed: 1 }
        ],
        customShopItems: [
            { id: 'preview-shop-1', name: 'Game session', category: 'entertainment', emoji: '<i data-lucide="gamepad-2" class="icon icon-purple"></i>', baseCost: 70, scalingType: 'add', scaling: 20, isCustom: true },
            { id: 'preview-shop-2', name: 'Takeout', category: 'food', emoji: '<i data-lucide="utensils" class="icon icon-coral"></i>', baseCost: 150, scalingType: 'multiply', scaling: 2, isCustom: true }
        ],
        focusPinnedIds: ['preview-task-1', 'preview-read'],
        vacationDays: [],
        stats: {
            totalCoinsEarned: 2840,
            currentBalance: 465,
            tasksCompletedQuick: 96,
            tasksCompletedEasy: 44,
            tasksCompletedMedium: 28,
            tasksCompletedHard: 11,
            tasksCompletedEpic: 3,
            rewardsClaimed: 19,
            currentStreak: 8,
            bestStreak: 21,
            lastActiveDate: isoDaysAgo(0),
            emoji_to_lucide_migration: true
        },
        shopPurchases: {},
        hiddenShopItems: [],
        presetsInitialized: true,
        settings: { theme: 'default' }
    };
}

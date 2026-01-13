// BrownBook - App Logic

// Difficulty configurations
const DIFFICULTIES = {
    quick: { emoji: '🟢', name: 'Quick', coins: 5, time: '< 5 min' },
    easy: { emoji: '🔵', name: 'Easy', coins: 15, time: '5-15 min' },
    medium: { emoji: '🟡', name: 'Medium', coins: 25, time: '15-45 min' },
    hard: { emoji: '🟠', name: 'Hard', coins: 50, time: '45-90 min' },
    epic: { emoji: '🔴', name: 'Epic', coins: 75, time: '2+ hours' }
};

const CATEGORIES = {
    food: '🍕',
    entertainment: '🎮',
    purchase: '🛍️',
    experience: '✨',
    selfcare: '💆',
    other: '🎁'
};

// Preset shop items with scaling prices
// scalingType: 'add' (baseCost + count*scaling) or 'multiply' (baseCost * scaling^count)
const SHOP_ITEMS = [
    { id: 'ep30', name: 'Watch a 30 min episode', emoji: '📺', baseCost: 40, scaling: 10, scalingType: 'add' },
    { id: 'ep45', name: 'Watch a 45 min episode', emoji: '📺', baseCost: 50, scaling: 10, scalingType: 'add' },
    { id: 'ep60', name: 'Watch a 1 hour episode', emoji: '🎬', baseCost: 55, scaling: 10, scalingType: 'add' },
    { id: 'read', name: 'Read (book, article, etc.)', emoji: '📖', baseCost: 1, scaling: 2, scalingType: 'multiply' }
];

// Preset recurring tasks (added on first run)
const PRESET_RECURRING_TASKS = [
    { id: 'brush_morning', title: 'Brush', notes: 'morning', difficulty: 'quick' },
    { id: 'brush_night', title: 'Brush', notes: 'night', difficulty: 'quick' },
    { id: 'floss', title: 'Floss', notes: '', difficulty: 'quick' }
];

// App state
let appData = {
    tasks: [],
    recurringTasks: [], // Tasks that reset daily at 6AM
    recurringCompletions: {}, // { 'task_id': 'YYYY-MM-DD' } - tracks which recurring tasks completed today
    completedHistory: [], // All completed tasks (moved from tasks array)
    rewards: [],
    customShopItems: [], // User-created shop items with scaling
    stats: {
        totalCoinsEarned: 0,
        currentBalance: 0,
        tasksCompletedQuick: 0,
        tasksCompletedEasy: 0,
        tasksCompletedMedium: 0,
        tasksCompletedHard: 0,
        tasksCompletedEpic: 0,
        rewardsClaimed: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastActiveDate: null
    },
    shopPurchases: {}, // { 'ep30': { count: 2, lastResetDate: '2024-01-12' }, ... }
    presetsInitialized: false // Flag to track if preset recurring tasks have been added
};

let currentRewardToClaim = null;
let currentShopItemToClaim = null;

// Initialize app
async function init() {
    // Load data from storage
    if (window.electronAPI) {
        const savedData = await window.electronAPI.loadData();
        if (savedData) {
            appData = savedData;
            // Migrate old data: ensure new fields exist
            if (!appData.shopPurchases) {
                appData.shopPurchases = {};
            }
            if (!appData.customShopItems) {
                appData.customShopItems = [];
            }
            if (!appData.recurringTasks) {
                appData.recurringTasks = [];
            }
            if (!appData.recurringCompletions) {
                appData.recurringCompletions = {};
            }
            if (!appData.completedHistory) {
                appData.completedHistory = [];
            }

            // Migrate old completed tasks from tasks array to completedHistory
            const completedInTasks = appData.tasks.filter(t => t.completed);
            if (completedInTasks.length > 0) {
                appData.completedHistory = [...completedInTasks, ...appData.completedHistory];
                appData.tasks = appData.tasks.filter(t => !t.completed);
                await saveData();
            }

            // Clear stale recurring completions from previous days
            const today = getTodayDateString();
            let hasStaleCompletions = false;
            for (const taskId in appData.recurringCompletions) {
                if (appData.recurringCompletions[taskId] !== today) {
                    delete appData.recurringCompletions[taskId];
                    hasStaleCompletions = true;
                }
            }
            if (hasStaleCompletions) {
                await saveData();
            }
        }
    }

    // Add preset recurring tasks on first run
    if (!appData.presetsInitialized) {
        PRESET_RECURRING_TASKS.forEach(preset => {
            appData.recurringTasks.push({
                id: preset.id,
                title: preset.title,
                notes: preset.notes,
                difficulty: preset.difficulty,
                createdAt: new Date().toISOString()
            });
        });
        appData.presetsInitialized = true;
        await saveData();
    }


    setupEventListeners();
    renderAll();
}

// Save data
async function saveData() {
    if (window.electronAPI) {
        await window.electronAPI.saveData(appData);
    }
}

// Event Listeners
function setupEventListeners() {
    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Add Task
    document.getElementById('addTaskBtn').addEventListener('click', openAddTaskModal);
    document.getElementById('closeTaskModal').addEventListener('click', closeAddTaskModal);
    document.getElementById('cancelTask').addEventListener('click', closeAddTaskModal);
    document.getElementById('saveTask').addEventListener('click', saveNewTask);

    // Difficulty picker
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => selectDifficulty(btn));
    });

    // Recurring toggle - show/hide recurring options
    document.getElementById('recurringTaskToggle').addEventListener('change', (e) => {
        document.getElementById('recurringOptions').style.display = e.target.checked ? 'block' : 'none';
    });

    // Recurrence type radio - show/hide interval settings
    document.querySelectorAll('input[name="recurrenceType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('intervalSettings').style.display =
                e.target.value === 'interval' ? 'block' : 'none';
        });
    });

    // Add Reward
    document.getElementById('addRewardBtn').addEventListener('click', openAddRewardModal);
    document.getElementById('closeRewardModal').addEventListener('click', closeAddRewardModal);
    document.getElementById('cancelReward').addEventListener('click', closeAddRewardModal);
    document.getElementById('saveReward').addEventListener('click', saveNewReward);

    // Category picker
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => selectCategory(btn));
    });

    // Cost picker
    document.querySelectorAll('.cost-btn').forEach(btn => {
        btn.addEventListener('click', () => selectCost(parseInt(btn.dataset.cost)));
    });

    document.getElementById('costSlider').addEventListener('input', (e) => {
        selectCost(parseInt(e.target.value));
    });

    // Daily Shop toggle
    document.getElementById('addToShopToggle').addEventListener('change', (e) => {
        document.getElementById('scalingOptions').style.display = e.target.checked ? 'block' : 'none';
    });

    // Scaling type picker
    document.querySelectorAll('.scaling-btn').forEach(btn => {
        btn.addEventListener('click', () => selectScalingType(btn.dataset.type));
    });

    // Scaling presets
    document.querySelectorAll('.scale-preset').forEach(btn => {
        btn.addEventListener('click', () => selectScaling(parseInt(btn.dataset.value)));
    });

    // Scaling slider
    document.getElementById('scalingSlider').addEventListener('input', (e) => {
        selectScaling(parseInt(e.target.value));
    });

    // Claim modal
    document.getElementById('closeClaimModal').addEventListener('click', closeClaimModal);
    document.getElementById('cancelClaim').addEventListener('click', closeClaimModal);
    document.getElementById('confirmClaim').addEventListener('click', confirmClaimReward);

    // View JSON button
    document.getElementById('viewJsonBtn').addEventListener('click', viewJsonData);

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('open');
            }
        });
    });

    // Enter key for task input
    document.getElementById('taskTitle').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveNewTask();
    });

    document.getElementById('rewardName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveNewReward();
    });
}

// Tab navigation
function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${tabName}View`).classList.add('active');

    if (tabName === 'stats') {
        renderStats();
    } else if (tabName === 'history') {
        renderHistory();
    }
}

// Render all views
function renderAll() {
    renderTasks();
    renderRewards();
    renderStats();
    renderHistory();
    updateCoinDisplay();
    updateStreakDisplay();
}

// Update coin display in sidebar
function updateCoinDisplay() {
    document.querySelector('.coin-amount').textContent = appData.stats.currentBalance;
}

// Update streak display
function updateStreakDisplay() {
    const streakText = appData.stats.currentStreak === 1
        ? '1 day streak'
        : `${appData.stats.currentStreak} day streak`;
    document.querySelector('.streak-text').textContent = streakText;
}

// ============= TASKS =============

// Get today's date for reset (uses 6AM reset logic from shop)
function getTodayDateString() {
    const now = new Date();
    // If before 6AM, count as previous day
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Check if a recurring task is completed today
function isRecurringCompletedToday(taskId) {
    const today = getTodayDateString();
    return appData.recurringCompletions[taskId] === today;
}

// Check if an interval task should show today based on its cycle
function shouldShowIntervalTask(task) {
    // If not an interval task (daily or undefined type), always show
    if (!task.type || task.type === 'daily') {
        return true;
    }

    if (task.type !== 'interval' || !task.cycleStartDate) {
        return true;
    }

    const now = new Date();
    // Adjust for 6AM reset
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }
    now.setHours(6, 0, 0, 0);

    const startDate = new Date(task.cycleStartDate);
    startDate.setHours(6, 0, 0, 0);

    // Calculate days since cycle start
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceStart = Math.floor((now - startDate) / msPerDay);

    // Total cycle length
    const totalCycle = task.activeDays + task.breakDays;

    // Current position in cycle (0-indexed)
    const dayInCycle = daysSinceStart % totalCycle;

    // Show if within active days (0 to activeDays-1)
    return dayInCycle < task.activeDays;
}

function renderTasks() {
    const today = getTodayDateString();

    // Get regular active tasks
    const activeTasks = appData.tasks.filter(t => !t.completed);

    // Get today's completed tasks (completed after 6AM today, excluding recurring - those use recurringCompleted)
    const todayCompletedTasks = appData.completedHistory.filter(t => {
        if (!t.completedAt) return false;
        if (t.isRecurring) return false; // Skip recurring entries, they're shown from recurringCompleted
        const completedDate = new Date(t.completedAt);
        // Check if completed after 6AM today
        const todayStart = new Date(today + 'T06:00:00');
        return completedDate >= todayStart;
    });

    // Filter recurring tasks - only show interval tasks on active days
    const visibleRecurringTasks = appData.recurringTasks.filter(t => shouldShowIntervalTask(t));

    // Separate visible recurring tasks into completed and not completed for today
    const recurringNotCompleted = visibleRecurringTasks.filter(t => !isRecurringCompletedToday(t.id));
    const recurringCompleted = visibleRecurringTasks.filter(t => isRecurringCompletedToday(t.id));

    // Update count (recurring not completed + regular active)
    const totalRemaining = recurringNotCompleted.length + activeTasks.length;
    document.getElementById('taskCount').textContent =
        totalRemaining === 1
            ? '1 task remaining'
            : `${totalRemaining} tasks remaining`;

    // Show/hide sections
    const hasRecurring = recurringNotCompleted.length > 0;
    const hasActive = activeTasks.length > 0;
    const hasTodayCompleted = todayCompletedTasks.length > 0 || recurringCompleted.length > 0;
    const isEmpty = !hasRecurring && !hasActive && !hasTodayCompleted;

    document.getElementById('tasksEmpty').style.display = isEmpty ? 'block' : 'none';
    document.getElementById('recurringTasks').style.display = hasRecurring ? 'block' : 'none';
    document.getElementById('activeTasks').style.display = hasActive ? 'block' : 'none';
    document.getElementById('todayCompletedTasks').style.display = hasTodayCompleted ? 'block' : 'none';

    // Render only non-completed recurring tasks in Recurring section
    document.getElementById('recurringTaskList').innerHTML = recurringNotCompleted.map(task =>
        createRecurringTaskRow(task, false)
    ).join('');

    // Render active regular tasks
    document.getElementById('activeTaskList').innerHTML = activeTasks.map(task =>
        createTaskRow(task, false)
    ).join('');

    // Render today's completed (both regular tasks and completed recurring tasks)
    let todayCompletedHTML = recurringCompleted.map(task =>
        createRecurringTaskRow(task, true)
    ).join('');
    todayCompletedHTML += todayCompletedTasks.map(task =>
        createTaskRow(task, true)
    ).join('');
    document.getElementById('todayCompletedTaskList').innerHTML = todayCompletedHTML;

    // Add event listeners
    document.querySelectorAll('.task-checkbox:not(.recurring):not(.completed-task)').forEach(cb => {
        cb.addEventListener('click', () => toggleTask(cb.dataset.id));
    });

    document.querySelectorAll('.task-checkbox.completed-task').forEach(cb => {
        cb.addEventListener('click', () => uncompleteTask(cb.dataset.id));
    });

    document.querySelectorAll('.task-checkbox.recurring').forEach(cb => {
        cb.addEventListener('click', () => toggleRecurringTask(cb.dataset.id));
    });

    document.querySelectorAll('.task-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteTask(btn.dataset.id));
    });

    document.querySelectorAll('.recurring-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteRecurringTask(btn.dataset.id));
    });
}

function createTaskRow(task, isCompleted) {
    const diff = DIFFICULTIES[task.difficulty];
    return `
        <div class="task-row ${isCompleted ? 'completed' : ''}" data-id="${task.id}">
            <div class="task-checkbox ${isCompleted ? 'completed-task' : ''} ${task.difficulty} ${isCompleted ? 'checked' : ''}" data-id="${task.id}">
                ${isCompleted ? '✓' : ''}
            </div>
            <div class="task-content">
                <div class="task-title">${escapeHtml(task.title)}</div>
                ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ''}
            </div>
            <div class="task-coins ${task.difficulty}">
                ${diff.emoji} ${diff.coins}
            </div>
            ${!isCompleted ? `<button class="task-delete" data-id="${task.id}">🗑</button>` : ''}
        </div>
    `;
}

function createRecurringTaskRow(task, isCompleted) {
    const diff = DIFFICULTIES[task.difficulty];
    return `
        <div class="task-row recurring-row ${isCompleted ? 'completed' : ''}" data-id="${task.id}">
            <div class="task-checkbox recurring ${task.difficulty} ${isCompleted ? 'checked' : ''}" data-id="${task.id}">
                ${isCompleted ? '✓' : '🔄'}
            </div>
            <div class="task-content">
                <div class="task-title">${escapeHtml(task.title)}</div>
                ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ''}
            </div>
            <div class="task-coins ${task.difficulty}">
                ${diff.emoji} ${diff.coins}
            </div>
            <button class="recurring-delete" data-id="${task.id}">🗑</button>
        </div>
    `;
}

function openAddTaskModal() {
    document.getElementById('addTaskModal').classList.add('open');
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskNotes').value = '';
    document.getElementById('recurringTaskToggle').checked = false;
    document.getElementById('recurringOptions').style.display = 'none';
    document.getElementById('intervalSettings').style.display = 'none';
    document.querySelector('input[name="recurrenceType"][value="daily"]').checked = true;
    document.getElementById('activeDaysInput').value = '3';
    document.getElementById('breakDaysInput').value = '1';
    document.getElementById('cycleStartSelect').value = '0';
    selectDifficulty(document.querySelector('.diff-btn[data-difficulty="medium"]'));
    document.getElementById('taskTitle').focus();
}

function closeAddTaskModal() {
    document.getElementById('addTaskModal').classList.remove('open');
}

function selectDifficulty(btn) {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    const diff = DIFFICULTIES[btn.dataset.difficulty];
    document.getElementById('timeEstimate').textContent = diff.time;
    document.getElementById('coinReward').textContent = diff.coins;
}

function saveNewTask() {
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) return;

    const difficulty = document.querySelector('.diff-btn.selected').dataset.difficulty;
    const notes = document.getElementById('taskNotes').value.trim();
    const isRecurring = document.getElementById('recurringTaskToggle').checked;

    if (isRecurring) {
        const recurrenceType = document.querySelector('input[name="recurrenceType"]:checked').value;

        // Create recurring task
        const recurringTask = {
            id: 'custom_' + Date.now().toString(),
            title,
            notes,
            difficulty,
            type: recurrenceType, // 'daily' or 'interval'
            createdAt: new Date().toISOString()
        };

        // Add interval-specific properties
        if (recurrenceType === 'interval') {
            recurringTask.activeDays = parseInt(document.getElementById('activeDaysInput').value) || 3;
            recurringTask.breakDays = parseInt(document.getElementById('breakDaysInput').value) || 1;

            // Calculate cycle start date based on dropdown
            const daysAgo = parseInt(document.getElementById('cycleStartSelect').value) || 0;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysAgo);
            // Set to 6AM to match reset time
            startDate.setHours(6, 0, 0, 0);
            recurringTask.cycleStartDate = startDate.toISOString();
        }

        appData.recurringTasks.push(recurringTask);
    } else {
        // Create regular task
        const task = {
            id: Date.now().toString(),
            title,
            notes,
            difficulty,
            completed: false,
            createdAt: new Date().toISOString()
        };
        appData.tasks.unshift(task);
    }

    saveData();
    renderTasks();
    closeAddTaskModal();
}

function toggleTask(id) {
    const taskIndex = appData.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const task = appData.tasks[taskIndex];

    // Complete the task - add coins and move to history
    task.completed = true;
    task.completedAt = new Date().toISOString();
    const coins = DIFFICULTIES[task.difficulty].coins;
    appData.stats.totalCoinsEarned += coins;
    appData.stats.currentBalance += coins;
    incrementTaskCount(task.difficulty);
    updateStreak();

    // Move to completed history
    appData.completedHistory.unshift(task);
    appData.tasks.splice(taskIndex, 1);

    // Show coin animation
    showCoinPopup(id, coins);

    saveData();
    renderTasks();
    renderHistory();
    updateCoinDisplay();
}

function uncompleteTask(id) {
    // Find task in completedHistory
    const taskIndex = appData.completedHistory.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const task = appData.completedHistory[taskIndex];

    // Remove coins
    const coins = DIFFICULTIES[task.difficulty].coins;
    appData.stats.totalCoinsEarned -= coins;
    appData.stats.currentBalance -= coins;
    decrementTaskCount(task.difficulty);

    // Mark as not completed and move back to tasks
    task.completed = false;
    delete task.completedAt;
    appData.tasks.unshift(task);
    appData.completedHistory.splice(taskIndex, 1);

    saveData();
    renderTasks();
    renderHistory();
    updateCoinDisplay();
}

function toggleRecurringTask(id) {
    const task = appData.recurringTasks.find(t => t.id === id);
    if (!task) return;

    const today = getTodayDateString();
    const isCompleted = isRecurringCompletedToday(id);

    if (isCompleted) {
        // Uncomplete - remove coins and clear completion
        const coins = DIFFICULTIES[task.difficulty].coins;
        appData.stats.totalCoinsEarned -= coins;
        appData.stats.currentBalance -= coins;
        decrementTaskCount(task.difficulty);
        delete appData.recurringCompletions[id];

        // Remove from completedHistory (find today's entry for this recurring task)
        const historyIndex = appData.completedHistory.findIndex(t =>
            t.recurringId === id && t.completedAt && t.completedAt.startsWith(today)
        );
        if (historyIndex !== -1) {
            appData.completedHistory.splice(historyIndex, 1);
        }
    } else {
        // Complete - add coins and mark completion
        const coins = DIFFICULTIES[task.difficulty].coins;
        appData.stats.totalCoinsEarned += coins;
        appData.stats.currentBalance += coins;
        incrementTaskCount(task.difficulty);
        appData.recurringCompletions[id] = today;
        updateStreak();

        // Log to completedHistory for permanent record
        appData.completedHistory.unshift({
            id: 'recurring_' + id + '_' + Date.now(),
            recurringId: id,
            title: task.title,
            notes: task.notes,
            difficulty: task.difficulty,
            isRecurring: true,
            completed: true,
            completedAt: new Date().toISOString()
        });

        // Show coin animation
        showCoinPopup(id, coins);
    }

    saveData();
    renderTasks();
    renderHistory();
    updateCoinDisplay();
}

function deleteRecurringTask(id) {
    appData.recurringTasks = appData.recurringTasks.filter(t => t.id !== id);
    // Also clear any completion data for this task
    delete appData.recurringCompletions[id];
    saveData();
    renderTasks();
}

function showCoinPopup(taskId, coins) {
    const row = document.querySelector(`.task-row[data-id="${taskId}"]`);
    if (!row) return;

    row.style.position = 'relative';
    const popup = document.createElement('div');
    popup.className = 'coins-popup';
    popup.textContent = `+${coins} ✨`;
    row.appendChild(popup);

    setTimeout(() => popup.remove(), 800);
}

function incrementTaskCount(difficulty) {
    const key = `tasksCompleted${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}`;
    appData.stats[key]++;
}

function decrementTaskCount(difficulty) {
    const key = `tasksCompleted${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}`;
    if (appData.stats[key] > 0) {
        appData.stats[key]--;
    }
}

// ============= HISTORY =============

function renderHistory() {
    const historyList = document.getElementById('historyList');
    const historyEmpty = document.getElementById('historyEmpty');

    if (appData.completedHistory.length === 0) {
        historyEmpty.style.display = 'block';
        historyList.innerHTML = '';
        return;
    }

    historyEmpty.style.display = 'none';

    // Group by date (using 6AM reset logic - before 6AM counts as previous day)
    const grouped = {};
    appData.completedHistory.forEach(task => {
        let date = 'Unknown Date';
        if (task.completedAt) {
            const completedDate = new Date(task.completedAt);
            // If completed before 6AM, count as previous day
            if (completedDate.getHours() < 6) {
                completedDate.setDate(completedDate.getDate() - 1);
            }
            date = completedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }

        if (!grouped[date]) {
            grouped[date] = [];
        }
        grouped[date].push(task);
    });

    // Render grouped history
    let html = '';
    for (const [date, tasks] of Object.entries(grouped)) {
        const totalCoins = tasks.reduce((sum, t) => sum + DIFFICULTIES[t.difficulty].coins, 0);
        html += `
            <div class="history-group">
                <div class="history-date">
                    <span>${date}</span>
                    <span class="history-coins">+${totalCoins} coins</span>
                </div>
                <div class="history-tasks">
                    ${tasks.map(task => createHistoryTaskRow(task)).join('')}
                </div>
            </div>
        `;
    }

    historyList.innerHTML = html;
}

function createHistoryTaskRow(task) {
    const diff = DIFFICULTIES[task.difficulty];
    return `
        <div class="history-task-row">
            <div class="history-task-check">${diff.emoji}</div>
            <div class="history-task-title">${escapeHtml(task.title)}</div>
            <div class="history-task-coins">+${diff.coins}</div>
        </div>
    `;
}

function viewJsonData() {
    const jsonStr = JSON.stringify(appData, null, 2);
    // Copy to clipboard
    navigator.clipboard.writeText(jsonStr).then(() => {
        alert('JSON data copied to clipboard!\n\nYou can paste it in a text editor to view.');
    }).catch(() => {
        // Fallback: show in console
        console.log('App Data:', appData);
        alert('JSON data logged to console (press F12 to view).\n\nOr check the saved file in your app data folder.');
    });
}

function deleteTask(id) {
    appData.tasks = appData.tasks.filter(t => t.id !== id);
    saveData();
    renderTasks();
}

// ============= REWARDS & SHOP =============

// Get the reset date string for 6AM local time
function getResetDateString() {
    const now = new Date();

    // If it's before 6AM, we're still in "yesterday's" reset period
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }

    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Get current price for a shop item
function getShopItemPrice(item) {
    const resetDate = getResetDateString();
    const purchase = appData.shopPurchases[item.id];

    if (!purchase || purchase.lastResetDate !== resetDate) {
        // Reset or first time
        return item.baseCost;
    }

    // Calculate price based on scaling type
    if (item.scalingType === 'multiply') {
        // Multiplicative: baseCost * scaling^count (e.g., 1 → 2 → 4 → 8)
        return Math.round(item.baseCost * Math.pow(item.scaling, purchase.count));
    } else {
        // Additive: baseCost + count*scaling (e.g., 40 → 50 → 60)
        return item.baseCost + (purchase.count * item.scaling);
    }
}

// Get time until 6AM local time reset
function getTimeUntilReset() {
    const now = new Date();

    // Calculate next 6AM
    let next6AM = new Date(now);
    next6AM.setHours(6, 0, 0, 0);

    // If it's already past 6AM today, next reset is tomorrow
    if (now.getHours() >= 6) {
        next6AM.setDate(next6AM.getDate() + 1);
    }

    const diffMs = next6AM - now;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${mins}m`;
}

function renderRewards() {
    const container = document.getElementById('rewardsGrid');

    // Combine preset and custom shop items
    const allShopItems = [...SHOP_ITEMS, ...appData.customShopItems];

    // Build shop items HTML
    let shopHTML = `
        <div class="shop-section">
            <div class="shop-header">
                <h3>📺 Daily Shop</h3>
                <span class="reset-timer">Resets in ${getTimeUntilReset()}</span>
            </div>
            <div class="shop-items">
                ${allShopItems.map(item => createShopItemCard(item)).join('')}
            </div>
        </div>
    `;

    // Build custom rewards HTML
    let rewardsHTML = '';
    if (appData.rewards.length > 0) {
        rewardsHTML = `
            <div class="custom-rewards-section">
                <h3>🎁 My Rewards</h3>
                <div class="rewards-list">
                    ${appData.rewards.map(reward => createRewardCard(reward)).join('')}
                </div>
            </div>
        `;
    } else {
        rewardsHTML = `
            <div class="custom-rewards-section">
                <h3>🎁 My Rewards</h3>
                <div class="empty-state small">
                    <p>Add your own custom rewards!</p>
                </div>
            </div>
        `;
    }

    container.innerHTML = shopHTML + rewardsHTML;

    // Add event listeners for shop items
    document.querySelectorAll('.shop-claim-btn.can-claim').forEach(btn => {
        btn.addEventListener('click', () => openShopClaimModal(btn.dataset.id));
    });

    // Add event listeners for shop delete (custom items only)
    document.querySelectorAll('.shop-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteShopItem(btn.dataset.id));
    });

    // Add event listeners for custom rewards
    document.querySelectorAll('.claim-btn.can-claim').forEach(btn => {
        btn.addEventListener('click', () => openClaimModal(btn.dataset.id));
    });

    document.querySelectorAll('.reward-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteReward(btn.dataset.id));
    });
}

function createShopItemCard(item) {
    const currentPrice = getShopItemPrice(item);
    const canAfford = appData.stats.currentBalance >= currentPrice;
    const resetDate = getResetDateString();
    const purchase = appData.shopPurchases[item.id];
    const purchaseCount = (purchase && purchase.lastResetDate === resetDate) ? purchase.count : 0;
    const isCustom = item.isCustom || false;

    // Build scaling info text
    let scalingInfo = '';
    if (purchaseCount > 0) {
        if (item.scalingType === 'multiply') {
            scalingInfo = `<span class="price-increase">(×${item.scaling} each)</span>`;
        } else {
            scalingInfo = `<span class="price-increase">(+${item.scaling} each)</span>`;
        }
    }

    return `
        <div class="shop-item-card ${canAfford ? '' : 'unaffordable'}" data-id="${item.id}">
            <div class="shop-item-emoji">${item.emoji}</div>
            <div class="shop-item-info">
                <div class="shop-item-name">${escapeHtml(item.name)}</div>
                <div class="shop-item-price">
                    <span class="coin-icon">$</span>
                    <span class="price-amount ${canAfford ? '' : 'too-expensive'}">${currentPrice}</span>
                    ${scalingInfo}
                </div>
            </div>
            <button class="shop-claim-btn ${canAfford ? 'can-claim' : 'cannot-claim'}" data-id="${item.id}" ${!canAfford ? 'disabled' : ''}>
                ${canAfford ? 'Claim' : `Need ${currentPrice}`}
            </button>
            ${isCustom ? `<button class="shop-delete-btn" data-id="${item.id}">🗑</button>` : ''}
        </div>
    `;
}

function createRewardCard(reward) {
    const canAfford = appData.stats.currentBalance >= reward.cost;
    const emoji = CATEGORIES[reward.category] || '🎁';

    return `
        <div class="reward-card ${canAfford ? '' : 'unaffordable'}" data-id="${reward.id}">
            <div class="reward-header">
                <span class="reward-emoji">${emoji}</span>
                <button class="reward-delete" data-id="${reward.id}">🗑</button>
            </div>
            <div class="reward-name">${escapeHtml(reward.name)}</div>
            ${reward.description ? `<div class="reward-desc">${escapeHtml(reward.description)}</div>` : ''}
            <div class="reward-footer">
                <div class="reward-cost">
                    <span class="coin-icon">$</span>
                    <span>${reward.cost}</span>
                </div>
                <button class="claim-btn ${canAfford ? 'can-claim' : 'cannot-claim'}" data-id="${reward.id}" ${!canAfford ? 'disabled' : ''}>
                    ${canAfford ? 'Claim' : `Need ${reward.cost}`}
                </button>
            </div>
            ${reward.timesClaimed > 0 ? `<div class="reward-claimed">Claimed ${reward.timesClaimed} time${reward.timesClaimed > 1 ? 's' : ''}</div>` : ''}
        </div>
    `;
}

function openAddRewardModal() {
    document.getElementById('addRewardModal').classList.add('open');
    document.getElementById('rewardName').value = '';
    document.getElementById('rewardDesc').value = '';
    selectCategory(document.querySelector('.cat-btn[data-category="food"]'));
    selectCost(50);

    // Reset Daily Shop options
    document.getElementById('addToShopToggle').checked = false;
    document.getElementById('scalingOptions').style.display = 'none';
    selectScalingType('add');

    document.getElementById('rewardName').focus();
}

function closeAddRewardModal() {
    document.getElementById('addRewardModal').classList.remove('open');
}

function selectCategory(btn) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function selectCost(cost) {
    document.querySelectorAll('.cost-btn').forEach(b => {
        b.classList.toggle('selected', parseInt(b.dataset.cost) === cost);
    });
    document.getElementById('costSlider').value = cost;
    document.getElementById('costDisplay').textContent = cost;
}

// Scaling type selection
function selectScalingType(type) {
    document.querySelectorAll('.scaling-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector(`.scaling-btn[data-type="${type}"]`).classList.add('selected');

    // Update preset labels based on type
    const presets = document.getElementById('scalingPresets');
    if (type === 'multiply') {
        presets.innerHTML = `
            <button class="scale-preset selected" data-value="2">×2</button>
            <button class="scale-preset" data-value="3">×3</button>
            <button class="scale-preset" data-value="4">×4</button>
            <button class="scale-preset" data-value="5">×5</button>
        `;
        selectScaling(2);
    } else {
        presets.innerHTML = `
            <button class="scale-preset" data-value="5">+5</button>
            <button class="scale-preset selected" data-value="10">+10</button>
            <button class="scale-preset" data-value="15">+15</button>
            <button class="scale-preset" data-value="25">+25</button>
        `;
        selectScaling(10);
    }

    // Re-add event listeners
    document.querySelectorAll('.scale-preset').forEach(btn => {
        btn.addEventListener('click', () => selectScaling(parseInt(btn.dataset.value)));
    });
}

// Scaling amount selection
function selectScaling(value) {
    document.querySelectorAll('.scale-preset').forEach(b => {
        b.classList.toggle('selected', parseInt(b.dataset.value) === value);
    });
    document.getElementById('scalingSlider').value = value;

    const scalingType = document.querySelector('.scaling-btn.selected')?.dataset.type || 'add';
    const prefix = scalingType === 'multiply' ? '×' : '+';
    document.getElementById('scalingDisplay').textContent = prefix + value;
}

function saveNewReward() {
    const name = document.getElementById('rewardName').value.trim();
    if (!name) return;

    const addToShop = document.getElementById('addToShopToggle').checked;
    const category = document.querySelector('.cat-btn.selected').dataset.category;
    const baseCost = parseInt(document.getElementById('costSlider').value);

    if (addToShop) {
        // Create custom shop item
        const scalingType = document.querySelector('.scaling-btn.selected')?.dataset.type || 'add';
        const scaling = parseInt(document.getElementById('scalingSlider').value);

        const shopItem = {
            id: 'custom_' + Date.now().toString(),
            name,
            emoji: CATEGORIES[category] || '🎁',
            baseCost,
            scaling,
            scalingType,
            isCustom: true,
            createdAt: new Date().toISOString()
        };

        appData.customShopItems.push(shopItem);
    } else {
        // Create regular reward
        const reward = {
            id: Date.now().toString(),
            name,
            description: document.getElementById('rewardDesc').value.trim(),
            category,
            cost: baseCost,
            timesClaimed: 0,
            createdAt: new Date().toISOString()
        };

        appData.rewards.push(reward);
    }

    saveData();
    renderRewards();
    closeAddRewardModal();
}

// Shop item claim modal
function openShopClaimModal(itemId) {
    // Find in both preset and custom shop items
    let item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
        item = appData.customShopItems.find(i => i.id === itemId);
    }
    if (!item) return;

    const currentPrice = getShopItemPrice(item);
    currentShopItemToClaim = { item, price: currentPrice };

    document.getElementById('claimMessage').textContent =
        `Spend ${currentPrice} coins on "${item.name}"?\n\nGo enjoy your reward! 🎉`;
    document.getElementById('claimModal').classList.add('open');
}

// Delete custom shop item
function deleteShopItem(itemId) {
    appData.customShopItems = appData.customShopItems.filter(i => i.id !== itemId);
    saveData();
    renderRewards();
}

// Custom reward claim modal
function openClaimModal(id) {
    const reward = appData.rewards.find(r => r.id === id);
    if (!reward) return;

    currentRewardToClaim = reward;
    currentShopItemToClaim = null;
    document.getElementById('claimMessage').textContent =
        `Spend ${reward.cost} coins on "${reward.name}"?\n\nGo enjoy your reward! 🎉`;
    document.getElementById('claimModal').classList.add('open');
}

function closeClaimModal() {
    document.getElementById('claimModal').classList.remove('open');
    currentRewardToClaim = null;
    currentShopItemToClaim = null;
}

function confirmClaimReward() {
    if (currentShopItemToClaim) {
        // Claiming a shop item
        const { item, price } = currentShopItemToClaim;

        if (appData.stats.currentBalance < price) {
            closeClaimModal();
            return;
        }

        appData.stats.currentBalance -= price;
        appData.stats.rewardsClaimed++;

        // Update shop purchase tracking
        const resetDate = getResetDateString();
        if (!appData.shopPurchases[item.id] || appData.shopPurchases[item.id].lastResetDate !== resetDate) {
            appData.shopPurchases[item.id] = { count: 1, lastResetDate: resetDate };
        } else {
            appData.shopPurchases[item.id].count++;
        }

        saveData();
        renderRewards();
        updateCoinDisplay();
        closeClaimModal();
        return;
    }

    if (currentRewardToClaim) {
        // Claiming a custom reward
        appData.stats.currentBalance -= currentRewardToClaim.cost;
        appData.stats.rewardsClaimed++;
        currentRewardToClaim.timesClaimed++;
        currentRewardToClaim.lastClaimedAt = new Date().toISOString();

        saveData();
        renderRewards();
        updateCoinDisplay();
        closeClaimModal();
    }
}

function deleteReward(id) {
    appData.rewards = appData.rewards.filter(r => r.id !== id);
    saveData();
    renderRewards();
}

// ============= STATS =============

function renderStats() {
    const stats = appData.stats;

    // Main stats
    document.getElementById('statTotalEarned').textContent = stats.totalCoinsEarned;
    document.getElementById('statBalance').textContent = stats.currentBalance;

    const totalTasks = stats.tasksCompletedQuick + stats.tasksCompletedEasy +
        stats.tasksCompletedMedium + stats.tasksCompletedHard + stats.tasksCompletedEpic;
    document.getElementById('statTasksDone').textContent = totalTasks;

    // Streaks
    document.getElementById('statCurrentStreak').textContent = stats.currentStreak;
    document.getElementById('statBestStreak').textContent = stats.bestStreak;

    // Difficulty breakdown
    const diffStats = document.getElementById('difficultyStats');
    diffStats.innerHTML = Object.entries(DIFFICULTIES).map(([key, diff]) => {
        const count = stats[`tasksCompleted${key.charAt(0).toUpperCase()}${key.slice(1)}`] || 0;
        const total = count * diff.coins;
        return `
            <div class="diff-stat-row">
                <span class="emoji">${diff.emoji}</span>
                <span class="name">${diff.name}</span>
                <span class="count">${count}</span>
                <span class="calc">× ${diff.coins}</span>
                <span class="total">= ${total}</span>
            </div>
        `;
    }).join('');

    // Rewards claimed
    document.getElementById('statRewardsClaimed').textContent = stats.rewardsClaimed;
}

// ============= STREAK =============

function updateStreak() {
    const today = new Date().toDateString();
    const lastActive = appData.stats.lastActiveDate;

    if (!lastActive) {
        // First activity
        appData.stats.currentStreak = 1;
        appData.stats.bestStreak = 1;
    } else {
        const lastDate = new Date(lastActive).toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        if (lastDate === today) {
            // Same day, no change
        } else if (lastDate === yesterday) {
            // Consecutive day
            appData.stats.currentStreak++;
            if (appData.stats.currentStreak > appData.stats.bestStreak) {
                appData.stats.bestStreak = appData.stats.currentStreak;
            }
        } else {
            // Streak broken
            appData.stats.currentStreak = 1;
        }
    }

    appData.stats.lastActiveDate = new Date().toISOString();
    updateStreakDisplay();
}

// ============= UTILITIES =============

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start the app
init();

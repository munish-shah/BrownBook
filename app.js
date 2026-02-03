import { db, doc, onSnapshot, setDoc, getDoc } from "./firebase-config.js";

let DATA_DOC_REF = null; // Set dynamically based on secret key
let SECRET_KEY = localStorage.getItem('brownbook_secret_key');

// Generate random key if none exists (First load)
if (!SECRET_KEY) {
    SECRET_KEY = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('brownbook_secret_key', SECRET_KEY);
}

// Set reference immediately
DATA_DOC_REF = doc(db, "users", SECRET_KEY);

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
// Shop items are now user-created only (no presets)
const SHOP_ITEMS = [];

// Preset recurring tasks (added on first run)
const PRESET_RECURRING_TASKS = [
    { id: 'brush_morning', title: 'Brush', notes: 'morning', difficulty: 'quick' },
    { id: 'brush_night', title: 'Brush', notes: 'night', difficulty: 'quick' },
    { id: 'floss', title: 'Floss', notes: '', difficulty: 'quick' }
];

// App state - Default structure
let appData = {
    tasks: [],
    recurringTasks: [],
    recurringCompletions: {},
    completedHistory: [],
    rewards: [],
    customShopItems: [],
    focusPinnedIds: [], // Ordered list of pinned task IDs for Focus section
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
    shopPurchases: {},
    presetsInitialized: false
};

let currentRewardToClaim = null;
let currentShopItemToClaim = null;
let isFirstLoad = true;

// Initialize app with Firebase
async function init() {
    setupEventListeners();
    setupKeyManagement(); // Setup the new key UI

    console.log("Using Secret Key:", SECRET_KEY);

    // Listen for real-time updates from Cloud Firestore
    onSnapshot(DATA_DOC_REF, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            appData = { ...appData, ...data }; // Merge with defaults

            // Show sync indicator
            const syncStatus = document.getElementById('syncStatus');
            syncStatus.style.display = 'block';
            setTimeout(() => {
                syncStatus.style.opacity = '1';
                setTimeout(() => syncStatus.style.opacity = '0.5', 1000);
            }, 100);

            // Always show import button to allow data restoration/migration
            document.getElementById('importDataBtn').style.display = 'block';

            // Always clean up expired tasks on every load/sync
            cleanupExpiredTasks();

            // Run other migrations/cleanup only on first load
            if (isFirstLoad) {
                runMigrationsAndCleanup();
                runBackfillJan31(); // One-time fix for missing Jan 31st tasks
                isFirstLoad = false;
            }

            renderAll();
        } else {
            // New user or empty db
            console.log("No data found for this key, starting fresh.");
            // Show import button
            document.getElementById('importDataBtn').style.display = 'block';

            // Initialize presets if needed
            if (!appData.presetsInitialized) {
                addPresets();
            }
            renderAll();
        }
    });

    // Auto-refresh every minute for timer updates and expired task cleanup
    setInterval(() => {
        cleanupExpiredTasks(); // Delete any newly expired tasks
        renderTasks(); // Update countdown timers
    }, 60000); // 60,000ms = 1 minute
}

function addPresets() {
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
    saveData();
}

// Clean up expired tasks - runs on every sync
async function cleanupExpiredTasks() {
    const now = new Date();
    const expiredTasks = appData.tasks.filter(t => t.expiresAt && new Date(t.expiresAt) <= now);

    if (expiredTasks.length > 0) {
        appData.tasks = appData.tasks.filter(t => !t.expiresAt || new Date(t.expiresAt) > now);
        console.log(`Removed ${expiredTasks.length} expired task(s):`, expiredTasks.map(t => t.title));
        await saveData();
    }
}

async function runMigrationsAndCleanup() {
    let needsSave = false;

    // Ensure fields exist
    if (!appData.shopPurchases) { appData.shopPurchases = {}; needsSave = true; }
    if (!appData.customShopItems) { appData.customShopItems = []; needsSave = true; }
    if (!appData.recurringTasks) { appData.recurringTasks = []; needsSave = true; }
    if (!appData.recurringCompletions) { appData.recurringCompletions = {}; needsSave = true; }
    if (!appData.completedHistory) { appData.completedHistory = []; needsSave = true; }

    // Migrate completed tasks
    const completedInTasks = appData.tasks.filter(t => t.completed);
    if (completedInTasks.length > 0) {
        appData.completedHistory = [...completedInTasks, ...appData.completedHistory];
        appData.tasks = appData.tasks.filter(t => !t.completed);
        needsSave = true;
    }

    // Clear stale recurring completions
    const today = getTodayDateString();

    // RECALCULATE ECONOMY ONCE (Fixes the coin drain bug precisely)
    // The bug reduced both TotalEarned and CurrentBalance equally.
    // So: Spent = TotalEarned - CurrentBalance (This remains accurate).
    // We can reconstruct True TotalEarned from history, then restore Balance.
    if (!appData.stats.economy_recalc_2026_01) {
        // 1. Calculate implied spending (how much is missing from the total)
        const impliedSpending = appData.stats.totalCoinsEarned - appData.stats.currentBalance;

        // 2. Reconstruct True Earnings from History
        let trueTotalEarned = 0;
        appData.completedHistory.forEach(t => {
            if (t.difficulty && DIFFICULTIES[t.difficulty]) {
                trueTotalEarned += DIFFICULTIES[t.difficulty].coins;
            }
        });

        // 3. Apply corrections
        const oldBalance = appData.stats.currentBalance;
        appData.stats.totalCoinsEarned = trueTotalEarned;
        appData.stats.currentBalance = trueTotalEarned - impliedSpending;

        appData.stats.economy_recalc_2026_01 = true;

        const diff = appData.stats.currentBalance - oldBalance;
        if (diff !== 0) {
            console.log(`Economy repaired. Balance adjusted by ${diff > 0 ? '+' : ''}${diff}`);
            alert(`Economy Recalculated 🧮\nYour balance has been corrected based on your task history.\nCorrection: ${diff > 0 ? '+' : ''}${diff} coins.`);
        }
        needsSave = true;
    }

    // One-time refund for weekend sale implementation (Read reward overpayment)
    if (!appData.stats.weekend_sale_refund_2026_01_18) {
        const refundAmount = 36;
        appData.stats.currentBalance += refundAmount;
        appData.stats.weekend_sale_refund_2026_01_18 = true;
        console.log(`Weekend sale refund applied: +${refundAmount} coins`);
        alert(`🎉 Weekend Sale Refund!\n\nYou've been refunded ${refundAmount} coins for the Read reward purchases made before the sale logic was implemented.`);
        needsSave = true;
    }

    // One-time fix: Add missing Jan 20 completions for Brush (night) and Floss
    // One-time fix V2: Add missing Jan 20 completions for Brush (night) and Floss
    // (Renamed to v2 to force retry if v1 didn't stick)
    if (!appData.stats.jan20_missing_tasks_fix_v2) {
        const jan20Timestamp = '2026-01-20T22:00:00.000Z'; // 10 PM on Jan 20

        // Find the recurring tasks
        const brushNight = appData.recurringTasks.find(t => t.id === 'brush_night');
        const floss = appData.recurringTasks.find(t => t.id === 'floss');
        let addedCount = 0;

        if (brushNight) {
            // Check for duplicate before adding
            const exists = appData.completedHistory.some(h => h.id === 'fix_brush_night_jan20');
            if (!exists) {
                appData.completedHistory.push({
                    id: 'fix_brush_night_jan20',
                    title: brushNight.title,
                    notes: brushNight.notes,
                    difficulty: brushNight.difficulty,
                    isRecurring: true,
                    recurringId: brushNight.id,
                    completedAt: jan20Timestamp
                });
                addedCount++;
            }
        }

        if (floss) {
            // Check for duplicate before adding
            const exists = appData.completedHistory.some(h => h.id === 'fix_floss_jan20');
            if (!exists) {
                appData.completedHistory.push({
                    id: 'fix_floss_jan20',
                    title: floss.title,
                    notes: floss.notes,
                    difficulty: floss.difficulty,
                    isRecurring: true,
                    recurringId: floss.id,
                    completedAt: jan20Timestamp
                });
                addedCount++;
            }
        }

        // Add coins only if tasks were actually added (to avoid double payment if history existed but flag didn't?)
        // Actually, if we are in this block, we assume coins weren't given for v2 yet.
        // But let's just give the 10 coins regardless if we are running this one-time fix v2, 
        // assuming the user complained because they didn't get them.
        appData.stats.currentBalance += 10;
        appData.stats.totalCoinsEarned += 10;

        appData.stats.jan20_missing_tasks_fix_v2 = true;

        console.log(`Added missing Jan 20 completions + 10 coins. Tasks added: ${addedCount}`);
        alert(`🎉 Fix Applied!\n\nAdded missing completions for Jan 20 (Brush Night, Floss) and added 10 coins.`);
        needsSave = true;
    }

    // Cleanup: Sync History with Recurrence State
    // If it's in history for TODAY but NOT in recurringCompletions, it means it was unchecked (but history delete failed).
    // So we should REMOVE it from History.
    // If it's in recurringCompletions but NOT history, we leave it (or add to history? strictly logic 1 is mostly needed).

    if (appData.completedHistory) {
        // Filter OUT zombie tasks
        const initialLength = appData.completedHistory.length;
        appData.completedHistory = appData.completedHistory.filter(h => {
            if (!h.isRecurring || !h.completedAt) return true; // Keep regular tasks

            // Check if this recurring task matches TODAY
            const date = new Date(h.completedAt);
            if (date.getHours() < 6) date.setDate(date.getDate() - 1);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hDate = `${year}-${month}-${day}`;

            if (hDate === today) {
                // It is today's record. Is it marked completed in state?
                if (!appData.recurringCompletions[h.recurringId]) {
                    // It is NOT in completions map. It's a zombie. Kill it.
                    return false;
                }
            }
            return true;
        });

        if (appData.completedHistory.length !== initialLength) {
            console.log("Removed zombie history items.");
            needsSave = true;
        }
    }

    // REVERSE Cleanup: If it's in recurringCompletions but NOT in history, it's orphaned (remove it)
    // This fixes tasks showing as "checked" without actually being completed
    for (const taskId in appData.recurringCompletions) {
        if (appData.recurringCompletions[taskId] === today) {
            // Check if there's a matching history entry for this task today
            const hasHistoryEntry = appData.completedHistory.some(h => {
                if (h.recurringId !== taskId || !h.completedAt) return false;

                const date = new Date(h.completedAt);
                if (date.getHours() < 6) date.setDate(date.getDate() - 1);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hDate = `${year}-${month}-${day}`;

                return hDate === today;
            });

            if (!hasHistoryEntry) {
                // Orphaned completion - remove it
                console.log(`Removing orphaned completion for ${taskId}`);
                delete appData.recurringCompletions[taskId];
                needsSave = true;
            }
        }
    }

    // Also remove stale completions from map (different day)
    for (const taskId in appData.recurringCompletions) {
        if (appData.recurringCompletions[taskId] !== today) {
            delete appData.recurringCompletions[taskId];
            needsSave = true;
        }
    }

    if (needsSave) {
        await saveData();
    }
}

// Save data to Cloud Firestore
async function saveData() {
    try {
        await setDoc(DATA_DOC_REF, appData);
        // Sync indicator flash
        const syncStatus = document.getElementById('syncStatus');
        syncStatus.style.opacity = '1';
        setTimeout(() => syncStatus.style.opacity = '0.5', 500);
    } catch (e) {
        console.error("Error saving to cloud:", e);
        alert("Sync error! Check your connection.");
    }
}

// Event Listeners
// Toggle Subtask
async function toggleSubtask(event, parentId, subtaskId, type) {
    if (event) event.stopPropagation(); // Prevent main task toggle

    const listVar = type === 'recurring' ? 'recurringTasks' : 'tasks';
    const task = appData[listVar].find(t => t.id === parentId);
    if (!task) return;

    const subtask = task.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return;

    // Toggle completion
    subtask.completed = !subtask.completed;

    // Coin logic
    if (task.distributeCoins && subtask.coins > 0) {
        if (subtask.completed) {
            appData.stats.totalCoinsEarned += subtask.coins;
            appData.stats.currentBalance += subtask.coins;
            // Add generic history entry for subtask completion? Or just silent addition?
            // User requested distributed coins, so silent addition is probably best for subtasks, 
            // but maybe we should track it. For now silent.
        } else {
            appData.stats.currentBalance -= subtask.coins;
            appData.stats.totalCoinsEarned -= subtask.coins; // Revert earned
        }
    }

    // Check if ALL subtasks are completed
    const allCompleted = task.subtasks.every(s => s.completed);

    // If all subtasks done, complete the main task (but only if it's NOT already completed)
    // Note: User can complete main task anytime, which auto-completes subtasks.
    // If user checks last subtask, we likely want to complete the main task too.
    if (allCompleted) {
        if (type === 'task' && !task.completed) {
            await toggleTask(parentId, true); // Pass flag to skip subtask logic to prevent loop
            return; // toggleTask handles saving
        } else if (type === 'recurring' && !isRecurringCompletedToday(parentId)) {
            await toggleRecurringTask(parentId, true);
            return;
        }
    } else {
        // If we uncheck a subtask, and the main task WAS completed, should we uncomplete it?
        // Yes, likely.
        if (type === 'task' && task.completed) {
            await uncompleteTask(parentId); // Re-opens main task
            // We need to ensure uncompleteTask doesn't wipe subtask state if we just want to re-open it.
            // Standard uncompleteTask might be fine.
            return;
        }
        // For recurring, "uncompleting" checks history. 
        // If we uncheck a subtask for a DONE recurring task, we should remove the completion from history.
        if (type === 'recurring' && isRecurringCompletedToday(parentId)) {
            // Logic to remove recurring completion is in deleteRecurringTask (partially) or we need a new uncheck helper.
            // Currently recurring tasks just toggle. 
            // Let's call toggleRecurringTask which checks completion status.
            // But we need to ensure it doesn't auto-complete all subtasks again.
            // This is tricky. simpler: If main task is done, toggling a subtask to UNDONE should mark main task UNDONE.
            // For recurring:
            const historyIndex = appData.completedHistory.findIndex(h => {
                if (!h.completedAt || h.recurringId !== parentId) return false;
                const d = new Date(h.completedAt);
                if (d.getHours() < 6) d.setDate(d.getDate() - 1);
                return getDateString(d) === getTodayDateString();
            });
            if (historyIndex > -1) {
                // Remove from history (mark incomplete)
                const entry = appData.completedHistory[historyIndex];
                appData.stats.totalCoinsEarned -= entry.coins;
                appData.stats.currentBalance -= entry.coins;
                const diffKey = `tasksCompleted${entry.difficulty.charAt(0).toUpperCase() + entry.difficulty.slice(1)}`;
                if (appData.stats[diffKey] > 0) appData.stats[diffKey]--;

                appData.completedHistory.splice(historyIndex, 1);
            }
        }
    }

    await saveData();
    renderTasks();
}

// Toggle visibility of subtasks
function toggleSubtasks(event, taskId) {
    if (event) event.stopPropagation();
    const container = document.getElementById(`subtasks-${taskId}`);
    const btn = event.target;
    if (container) {
        container.classList.toggle('open');
        btn.classList.toggle('expanded');
    }
}

// Validate subtask coin distribution
function validateSubtaskCoins() {
    const distribute = document.getElementById('distributeCoinsToggle').checked;
    const msg = document.getElementById('subtaskValidationMsg');

    if (!distribute) {
        msg.style.display = 'none';
        return;
    }

    const rows = document.querySelectorAll('.subtask-input-row');
    if (rows.length === 0) {
        msg.style.display = 'none';
        return;
    }

    let subtotal = 0;
    rows.forEach(row => {
        const coinInput = row.querySelector('input[type="number"]');
        if (coinInput) {
            subtotal += parseInt(coinInput.value) || 0;
        }
    });

    const selectedDiff = document.querySelector('.diff-btn.selected');
    const target = selectedDiff ? parseInt(selectedDiff.dataset.coins) : 25;

    if (subtotal !== target) {
        msg.textContent = `Total: ${subtotal}/${target} coins`;
        msg.style.color = '#ef4444';
        msg.style.display = 'block';
    } else {
        msg.textContent = `Total: ${subtotal}/${target} coins ✓`;
        msg.style.color = '#22c55e';
        msg.style.display = 'block';
    }
}

// Add logic to setupEventListeners for adding subtasks in UI
function setupEventListeners() {
    // Add Subtask Button
    document.getElementById('addSubtaskBtn').addEventListener('click', () => {
        const container = document.getElementById('subtaskListInput');
        const distribute = document.getElementById('distributeCoinsToggle').checked;
        const id = Date.now();

        const row = document.createElement('div');
        row.className = `subtask-input-row ${distribute ? 'distributed' : ''}`;
        row.innerHTML = `
            <input type="text" placeholder="Subtask title">
            <input type="number" placeholder="Coins" value="0">
            <button class="btn-remove-subtask" onclick="this.parentElement.remove()">×</button>
        `;
        container.appendChild(row);
    });

    // Toggle Distribution Mode
    document.getElementById('distributeCoinsToggle').addEventListener('change', (e) => {
        const isDistrubted = e.target.checked;
        const rows = document.querySelectorAll('.subtask-input-row');
        rows.forEach(row => {
            if (isDistrubted) row.classList.add('distributed');
            else row.classList.remove('distributed');
        });

        // Show/Hide validation message
        const difficulty = document.querySelector('.diff-btn.selected');
        if (difficulty) validateSubtaskCoins();
    });

    // Difficulty change - re-validate
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(validateSubtaskCoins, 10);
        });
    });

    // Input change validation
    document.getElementById('subtaskListInput').addEventListener('input', validateSubtaskCoins);

    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Add Task
    document.getElementById('addTaskBtn').addEventListener('click', openAddTaskModal);
    document.getElementById('closeTaskModal').addEventListener('click', closeAddTaskModal);
    document.getElementById('cancelTask').addEventListener('click', closeAddTaskModal);
    document.getElementById('saveTask').addEventListener('click', saveNewTask);

    // Import Data Flow
    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importModal').classList.add('open');
    });
    document.getElementById('closeImportModal').addEventListener('click', () => {
        document.getElementById('importModal').classList.remove('open');
    });
    document.getElementById('cancelImport').addEventListener('click', () => {
        document.getElementById('importModal').classList.remove('open');
    });
    document.getElementById('confirmImport').addEventListener('click', async () => {
        const jsonStr = document.getElementById('importJsonInput').value;
        try {
            const importedData = JSON.parse(jsonStr);
            if (!importedData.stats) throw new Error("Invalid data format");

            if (confirm("This will OVERWRITE any existing cloud data. Are you sure?")) {
                appData = importedData;
                await saveData();
                document.getElementById('importModal').classList.remove('open');
                window.location.reload();
            }
        } catch (e) {
            alert("Invalid JSON data. Please check what you pasted.");
        }
    });

    // Difficulty picker
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => selectDifficulty(btn));
    });

    // Recurring toggle
    document.getElementById('recurringTaskToggle').addEventListener('change', (e) => {
        document.getElementById('recurringOptions').style.display = e.target.checked ? 'block' : 'none';
        // Hide expiration for recurring tasks (they reset, not expire)
        document.getElementById('expirationOptions').style.display = e.target.checked ? 'none' : 'block';
    });

    // Recurrence type radio
    document.querySelectorAll('input[name="recurrenceType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('intervalSettings').style.display =
                e.target.value === 'interval' ? 'block' : 'none';
        });
    });

    // Expiration dropdown - show custom datetime picker when "custom" selected
    document.getElementById('taskExpiration').addEventListener('change', (e) => {
        const customDT = document.getElementById('customExpirationDT');
        if (e.target.value === 'custom') {
            customDT.style.display = 'block';
            // Set min to now
            const now = new Date();
            const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            customDT.min = localIso;
            customDT.value = ''; // Clear any old value
        } else {
            customDT.style.display = 'none';
        }
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

    // Cost picker & Slider
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

    // Scaling presets & Slider
    document.querySelectorAll('.scale-preset').forEach(btn => {
        btn.addEventListener('click', () => selectScaling(parseInt(btn.dataset.value)));
    });
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

    // Enter key shortcuts
    document.getElementById('taskTitle').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveNewTask();
    });
    document.getElementById('rewardName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveNewReward();
    });

    // Progress view - Tab switcher (Recurring / Non-recurring)
    document.querySelectorAll('.progress-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.progress-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderProgress();
        });
    });

    // Progress view - Time filters (Daily / Weekly / Monthly)
    document.querySelectorAll('.time-filter').forEach(filter => {
        filter.addEventListener('click', () => {
            document.querySelectorAll('.time-filter').forEach(f => f.classList.remove('active'));
            filter.classList.add('active');
            renderProgress();
        });
    }); // Close time-filter forEach

    // Drag and drop for active tasks
    const activeList = document.getElementById('activeTaskList');
    activeList.addEventListener('dragover', (e) => handleDragOver(e, activeList));
    activeList.addEventListener('drop', (e) => handleDrop(e, 'active'));

    // Drag and drop for recurring tasks
    const recurringList = document.getElementById('recurringTaskList');
    recurringList.addEventListener('dragover', (e) => handleDragOver(e, recurringList));
    recurringList.addEventListener('drop', (e) => handleDrop(e, 'recurring'));

    // Drag and drop for focus tasks
    const focusList = document.getElementById('focusTaskList');
    focusList.addEventListener('dragover', (e) => handleDragOver(e, focusList));
    focusList.addEventListener('drop', (e) => handleDrop(e, 'focus'));

}

// ============= DRAG AND DROP =============

function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.id);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e, container) {
    e.preventDefault(); // Enable dropping
    const afterElement = getDragAfterElement(container, e.clientY);
    const draggable = document.querySelector('.dragging');
    if (!draggable) return;

    if (afterElement == null) {
        container.appendChild(draggable);
    } else {
        container.insertBefore(draggable, afterElement);
    }
}

async function handleDrop(e, type) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;

    let container, listVar;

    if (type === 'active') {
        container = document.getElementById('activeTaskList');
        listVar = 'tasks';
    } else if (type === 'recurring') {
        container = document.getElementById('recurringTaskList');
        listVar = 'recurringTasks';
    } else if (type === 'focus') {
        // Focus section - just reorder focusPinnedIds based on DOM order
        container = document.getElementById('focusTaskList');
        const taskRows = Array.from(container.querySelectorAll('.task-row'));
        appData.focusPinnedIds = taskRows.map(row => row.dataset.id);
        await saveData();
        renderTasks();
        return;
    } else {
        return;
    }

    const taskRows = Array.from(container.querySelectorAll('.task-row'));
    const newOrderIds = taskRows.map(row => row.dataset.id);

    // Reorder the corresponding array
    const sourceArray = appData[listVar];
    const taskMap = new Map(sourceArray.map(t => [t.id, t]));
    const newTasks = [];

    // 1. Add reordered visible items
    newOrderIds.forEach(taskId => {
        if (taskMap.has(taskId)) {
            newTasks.push(taskMap.get(taskId));
            taskMap.delete(taskId);
        }
    });

    // 2. Append any remaining items (invisible ones or ones not in the DOM list)
    if (taskMap.size > 0) {
        for (const task of taskMap.values()) {
            newTasks.push(task);
        }
    }

    appData[listVar] = newTasks;
    await saveData();

    // Re-render to ensure consistency
    renderTasks();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-row:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Toggle pin status for a task (add/remove from Focus)
async function togglePin(taskId) {
    if (!appData.focusPinnedIds) appData.focusPinnedIds = [];

    const index = appData.focusPinnedIds.indexOf(taskId);
    if (index > -1) {
        // Unpin
        appData.focusPinnedIds.splice(index, 1);
    } else {
        // Pin (add to end)
        appData.focusPinnedIds.push(taskId);
    }

    await saveData();
    renderTasks();
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
    } else if (tabName === 'progress') {
        renderProgress();
    }
}

// Render all views
function renderAll() {
    renderTasks();
    renderRewards();
    renderStats();
    renderHistory();
    renderProgress();
    updateCoinDisplay();
}

// Key Management UI
function setupKeyManagement() {
    const modal = document.getElementById('keyModal');
    const input = document.getElementById('secretKeyInput');

    // Open Modal
    const openModal = () => {
        input.value = SECRET_KEY;
        modal.classList.add('open');
    };

    document.getElementById('manageKeyBtn').addEventListener('click', openModal);
    // Listen for the Mobile Nav Tab version of the key button
    document.getElementById('navKeyBtn')?.addEventListener('click', openModal);

    // Close Modal
    document.getElementById('closeKeyModal').addEventListener('click', () => {
        modal.classList.remove('open');
    });
    document.getElementById('cancelKeyChange').addEventListener('click', () => {
        modal.classList.remove('open');
    });

    // Copy Key
    document.getElementById('copyKeyBtn').addEventListener('click', () => {
        input.select();
        document.execCommand('copy');
        const btn = document.getElementById('copyKeyBtn');
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = '📋', 1000);
    });

    // Save/Load Key
    document.getElementById('saveKeyChange').addEventListener('click', () => {
        const newKey = input.value.trim();
        if (newKey && newKey.length > 3) {
            localStorage.setItem('brownbook_secret_key', newKey);
            location.reload(); // Reload to switch user
        } else {
            alert("Key is too short!");
        }
    });

    // Recover Legacy Data
    document.getElementById('recoverLegacyBtn')?.addEventListener('click', async () => {
        if (confirm("⚠️ This will OVERWRITE your current data with the old 'primary_user' backup. Are you sure?")) {
            try {
                const legacyDocRef = doc(db, "users", "primary_user");
                const legacySnap = await getDoc(legacyDocRef);

                if (legacySnap.exists()) {
                    await setDoc(DATA_DOC_REF, legacySnap.data());
                    alert("Data recovered! Reloading...");
                    location.reload();
                } else {
                    alert("No legacy data found.");
                }
            } catch (error) {
                console.error("Recovery failed:", error);
                alert("Recovery failed: " + error.message);
            }
        }
    });
}

// Update coin display in sidebar
function updateCoinDisplay() {
    const balance = appData.stats.currentBalance;
    console.log("Updating coin display to:", balance);
    const el = document.querySelector('.coin-amount');
    if (el) {
        el.textContent = balance;
    } else {
        console.error("Could not find .coin-amount element!");
    }
}



// ============= TASKS =============

// Get today's date for reset (uses 6AM reset logic from shop)
function getTodayDateString() {
    const now = new Date();
    // If before 6AM, count as previous day
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }

    // Use LOCAL time, not ISO (which is UTC)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

    // ============= FOCUS SECTION =============
    // Ensure focusPinnedIds exists
    if (!appData.focusPinnedIds) appData.focusPinnedIds = [];

    // Build focus tasks from pinned IDs (preserve order)
    const focusTasks = [];
    appData.focusPinnedIds.forEach(id => {
        // Check if it's a regular task
        const task = activeTasks.find(t => t.id === id);
        if (task) {
            focusTasks.push({ task, type: 'task' });
            return;
        }
        // Check if it's a recurring task (and not completed today)
        const recurring = recurringNotCompleted.find(t => t.id === id);
        if (recurring) {
            focusTasks.push({ task: recurring, type: 'recurring' });
        }
    });

    // Clean up stale pinned IDs (tasks that no longer exist or are completed)
    const validPinnedIds = focusTasks.map(f => f.task.id);
    if (validPinnedIds.length !== appData.focusPinnedIds.length) {
        appData.focusPinnedIds = validPinnedIds;
        saveData(); // Async, fire and forget
    }

    const hasFocus = focusTasks.length > 0;
    document.getElementById('focusTasks').style.display = hasFocus ? 'block' : 'none';

    // Render Focus section
    document.getElementById('focusTaskList').innerHTML = focusTasks.map(f => {
        if (f.type === 'recurring') {
            return createRecurringTaskRow(f.task, false, true);
        } else {
            return createTaskRow(f.task, false, true);
        }
    }).join('');

    // Filter out pinned tasks from original sections (they only show in Focus)
    const unpinnedRecurring = recurringNotCompleted.filter(t => !validPinnedIds.includes(t.id));
    const unpinnedActive = activeTasks.filter(t => !validPinnedIds.includes(t.id));

    // Render only non-completed, unpinned recurring tasks in Recurring section
    document.getElementById('recurringTaskList').innerHTML = unpinnedRecurring.map(task =>
        createRecurringTaskRow(task, false)
    ).join('');

    // Render active regular tasks (excluding pinned)
    document.getElementById('activeTaskList').innerHTML = unpinnedActive.map(task =>
        createTaskRow(task, false)
    ).join('');

    // Update section visibility based on unpinned counts
    document.getElementById('recurringTasks').style.display = unpinnedRecurring.length > 0 ? 'block' : 'none';
    document.getElementById('activeTasks').style.display = unpinnedActive.length > 0 ? 'block' : 'none';

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

    // Pin button listeners
    document.querySelectorAll('.task-pin').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePin(btn.dataset.id);
        });
    });

    // Drag listeners for active tasks
    document.querySelectorAll('.task-row[draggable="true"]').forEach(row => {
        row.addEventListener('dragstart', handleDragStart);
        row.addEventListener('dragend', handleDragEnd);
    });
}

function createTaskRow(task, isCompleted, inFocusSection = false) {
    const diff = DIFFICULTIES[task.difficulty];
    const isPinned = appData.focusPinnedIds && appData.focusPinnedIds.includes(task.id);
    const pinIcon = isPinned ? '📍' : '📌';

    // Calculate expiration timer if applicable
    let expiryHtml = '';
    if (task.expiresAt && !isCompleted) {
        const timeLeft = getTimeRemaining(task.expiresAt);
        const isUrgent = timeLeft.totalMs < 2 * 60 * 60 * 1000; // < 2 hours
        expiryHtml = `<span class="task-expiry ${isUrgent ? 'urgent' : ''}">${timeLeft.display}</span>`;
    }

    // Pin button (only show for active tasks, not completed)
    const pinBtn = !isCompleted ? `<button class="task-pin ${isPinned ? 'pinned' : ''}" data-id="${task.id}" data-type="task">${pinIcon}</button>` : '';

    // Subtasks HTML
    let subtasksHtml = '';
    let expandBtn = '';
    if (task.subtasks && task.subtasks.length > 0) {
        expandBtn = `<button class="task-expand-btn" onclick="toggleSubtasks(event, '${task.id}')">▶</button>`;
        const subtaskRows = task.subtasks.map(st => {
            const stCompleted = st.completed ? 'completed' : '';
            const coinsHtml = task.distributeCoins ? `<span class="subtask-coins">+${st.coins}</span>` : '';
            return `
                <div class="subtask-row ${stCompleted}" data-id="${st.id}">
                    <div class="subtask-checkbox ${stCompleted}" onclick="toggleSubtask(event, '${task.id}', '${st.id}', 'task')">
                        ${st.completed ? '✓' : ''}
                    </div>
                    <span class="subtask-title">${escapeHtml(st.title)}</span>
                    ${coinsHtml}
                </div>
            `;
        }).join('');
        subtasksHtml = `<div class="subtasks-container" id="subtasks-${task.id}">${subtaskRows}</div>`;
    }

    return `
        <div class="task-row-wrapper">
            <div class="task-row ${isCompleted ? 'completed' : ''} ${inFocusSection ? 'in-focus' : ''}" data-id="${task.id}" data-type="task" draggable="${!isCompleted}">
                ${expandBtn}
                <div class="task-checkbox ${isCompleted ? 'completed-task' : ''} ${task.difficulty} ${isCompleted ? 'checked' : ''}" data-id="${task.id}">
                    ${isCompleted ? '✓' : ''}
                </div>
                <div class="task-content">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ''}
                </div>
                ${expiryHtml}
                <div class="task-coins ${task.difficulty}">
                    ${diff.emoji} ${diff.coins}
                </div>
                ${pinBtn}
                ${!isCompleted ? `<button class="task-delete" data-id="${task.id}">🗑</button>` : ''}
            </div>
            ${subtasksHtml}
        </div>
    `;
}

// Helper: Calculate time remaining until expiration
function getTimeRemaining(expiresAt) {
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) {
        return { display: 'Expired', totalMs: 0 };
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return { display: `⏰ ${days}d ${hours % 24}h`, totalMs: diff };
    }
    return { display: `⏰ ${hours}h ${minutes}m`, totalMs: diff };
}

function createRecurringTaskRow(task, isCompleted, inFocusSection = false) {
    const diff = DIFFICULTIES[task.difficulty];
    const isPinned = appData.focusPinnedIds && appData.focusPinnedIds.includes(task.id);
    const pinIcon = isPinned ? '📍' : '📌';

    // Pin button (only show for active recurring tasks, not completed)
    const pinBtn = !isCompleted ? `<button class="task-pin ${isPinned ? 'pinned' : ''}" data-id="${task.id}" data-type="recurring">${pinIcon}</button>` : '';

    // Subtasks HTML
    let subtasksHtml = '';
    let expandBtn = '';
    if (task.subtasks && task.subtasks.length > 0) {
        expandBtn = `<button class="task-expand-btn" onclick="toggleSubtasks(event, '${task.id}')">▶</button>`;
        const subtaskRows = task.subtasks.map(st => {
            const stCompleted = st.completed ? 'completed' : '';
            const coinsHtml = task.distributeCoins ? `<span class="subtask-coins">+${st.coins}</span>` : '';
            return `
                <div class="subtask-row ${stCompleted}" data-id="${st.id}">
                    <div class="subtask-checkbox ${stCompleted}" onclick="toggleSubtask(event, '${task.id}', '${st.id}', 'recurring')">
                        ${st.completed ? '✓' : ''}
                    </div>
                    <span class="subtask-title">${escapeHtml(st.title)}</span>
                    ${coinsHtml}
                </div>
            `;
        }).join('');
        subtasksHtml = `<div class="subtasks-container" id="subtasks-${task.id}">${subtaskRows}</div>`;
    }

    return `
        <div class="task-row-wrapper">
            <div class="task-row recurring-row ${isCompleted ? 'completed' : ''} ${inFocusSection ? 'in-focus' : ''}" data-id="${task.id}" data-type="recurring" draggable="${!isCompleted}">
                ${expandBtn}
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
                ${pinBtn}
                <button class="recurring-delete" data-id="${task.id}">🗑</button>
            </div>
            ${subtasksHtml}
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
    document.getElementById('expirationOptions').style.display = 'block'; // Show expiration for non-recurring
    document.getElementById('taskExpiration').value = ''; // Reset to no expiration
    document.getElementById('customExpirationDT').style.display = 'none'; // Hide custom picker
    document.getElementById('customExpirationDT').value = ''; // Clear custom value
    document.querySelector('input[name="recurrenceType"][value="daily"]').checked = true;
    document.getElementById('activeDaysInput').value = '3';
    document.getElementById('breakDaysInput').value = '1';
    document.getElementById('cycleStartSelect').value = '0';

    // Sub-tasks reset
    document.getElementById('distributeCoinsToggle').checked = false;
    document.getElementById('subtaskListInput').innerHTML = '';
    document.getElementById('subtaskValidationMsg').style.display = 'none';

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

    // Subtasks parsing
    const subtaskInputs = document.querySelectorAll('.subtask-input-row');
    const distributeCoins = document.getElementById('distributeCoinsToggle').checked;
    const subtasks = [];
    let subtaskTotalCoins = 0;

    subtaskInputs.forEach(row => {
        const titleInput = row.querySelector('input[type="text"]');
        const coinInput = row.querySelector('input[type="number"]');
        const sTitle = titleInput.value.trim();
        if (sTitle) {
            const sCoins = distributeCoins ? (parseInt(coinInput.value) || 0) : 0;
            subtasks.push({
                id: 'sub_' + Date.now() + Math.random().toString(36).substr(2, 5),
                title: sTitle,
                completed: false,
                coins: sCoins
            });
            subtaskTotalCoins += sCoins;
        }
    });

    const selectedDifficultyBtn = document.querySelector('.diff-btn.selected');
    const difficultyCoins = parseInt(selectedDifficultyBtn.dataset.coins);

    // Validation for distributed coins
    if (distributeCoins && subtasks.length > 0) {
        if (subtaskTotalCoins !== difficultyCoins) {
            alert(`Error: Subtask coins total (${subtaskTotalCoins}) must equal main task reward (${difficultyCoins}).`);
            return;
        }
    }

    if (isRecurring) {
        const recurrenceType = document.querySelector('input[name="recurrenceType"]:checked').value;

        // Create recurring task
        const recurringTask = {
            id: 'custom_' + Date.now().toString(),
            title,
            notes,
            subtasks,
            distributeCoins,
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
            subtasks,
            distributeCoins,
            difficulty,
            completed: false,
            createdAt: new Date().toISOString()
        };

        // Handle expiration
        const expirationDays = document.getElementById('taskExpiration').value;
        if (expirationDays === 'custom') {
            // Use custom datetime picker value
            const customDT = document.getElementById('customExpirationDT').value;
            if (customDT) {
                task.expiresAt = new Date(customDT).toISOString();
            }
        } else if (expirationDays !== '') {
            // Use preset (next 6AM + days)
            const now = new Date();
            let next6AM = new Date(now);
            next6AM.setHours(6, 0, 0, 0);
            // If already past 6AM today, next 6AM is tomorrow
            if (now.getHours() >= 6) {
                next6AM.setDate(next6AM.getDate() + 1);
            }
            // Add the offset days
            next6AM.setDate(next6AM.getDate() + parseInt(expirationDays));
            task.expiresAt = next6AM.toISOString();
        }

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
        const historyIndex = appData.completedHistory.findIndex(t => {
            if (t.recurringId !== id || !t.completedAt) return false;

            // Convert history timestamp to "App Date" (Local + 6AM offset)
            const date = new Date(t.completedAt);
            if (date.getHours() < 6) date.setDate(date.getDate() - 1);

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hDate = `${year}-${month}-${day}`;

            return hDate === today;
        });

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
// Get today's date string for shop reset (uses 6AM logic)
// Get today's date string for shop reset (uses 6AM logic)
function getResetDateString() {
    const now = new Date();
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }

    // Use LOCAL time, not ISO (which is UTC)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Check if weekend sale is active (6AM Saturday to 6AM Monday) or on a holiday
function isWeekendSale() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
    const hour = now.getHours();

    // Saturday 6AM onwards
    if (day === 6 && hour >= 6) return true;
    // All of Sunday
    if (day === 0) return true;
    // Monday before 6AM
    if (day === 1 && hour < 6) return true;

    // Check for holiday dates (6AM to 6AM next day)
    const holidays = [
        '2026-01-19', // MLK Day
    ];

    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Check if today is a holiday (after 6AM)
    if (holidays.includes(dateStr) && hour >= 6) return true;

    // Check if yesterday was a holiday (before 6AM today)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (holidays.includes(yesterdayStr) && hour < 6) return true;

    return false;
}

// Get current price for a shop item (isDailyShop determines if weekend sale applies)
function getShopItemPrice(item, isDailyShop = true) {
    const resetDate = getResetDateString();
    const purchase = appData.shopPurchases[item.id];
    const saleActive = isWeekendSale() && isDailyShop;
    const purchaseCount = (purchase && purchase.lastResetDate === resetDate) ? purchase.count : 0;

    // Determine scaling type and value
    const scalingType = item.scalingType || 'add';
    const scaling = item.scaling || 0;

    // Check if there's any increment
    const hasIncrement = (scalingType === 'multiply' && scaling > 1) ||
        (scalingType === 'add' && scaling > 0);

    if (!hasIncrement) {
        // No increment - just base price, 50% off during sale (ceiled)
        if (saleActive) {
            return Math.ceil(item.baseCost * 0.5);
        }
        return item.baseCost;
    }

    if (scalingType === 'multiply') {
        // Multiplicative scaling
        if (saleActive) {
            // Sale: half base, sqrt of multiplier
            const saleBase = Math.ceil(item.baseCost * 0.5);
            const saleScaling = Math.sqrt(scaling);
            return Math.ceil(saleBase * Math.pow(saleScaling, purchaseCount));
        } else {
            // Normal: baseCost * scaling^count
            return Math.round(item.baseCost * Math.pow(scaling, purchaseCount));
        }
    } else {
        // Additive scaling
        if (saleActive) {
            // Sale: half base (ceiled), increment every 2 purchases
            const saleBase = Math.ceil(item.baseCost * 0.5);
            const effectiveCount = Math.floor(purchaseCount / 2);
            return saleBase + (effectiveCount * scaling);
        } else {
            // Normal: baseCost + count * scaling
            return item.baseCost + (purchaseCount * scaling);
        }
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
    const saleActive = isWeekendSale();

    // Combine preset and custom shop items, filtering out hidden presets
    const hiddenIds = appData.hiddenShopItems || [];
    const visiblePresets = SHOP_ITEMS.filter(item => !hiddenIds.includes(item.id));
    const allShopItems = [...visiblePresets, ...appData.customShopItems];

    // Sale banner HTML
    const saleBanner = saleActive ? `
        <div class="sale-banner">
            <span class="sale-icon">🎉</span>
            <span class="sale-text">Weekend Sale - 50% Off!</span>
            <span class="sale-icon">🎉</span>
        </div>
    ` : '';

    // Build shop items HTML
    let shopHTML = `
        <div class="shop-section">
            ${saleBanner}
            <div class="shop-header">
                <h3>📺 Daily Shop</h3>
                <span class="reset-timer">Resets in ${getTimeUntilReset()}</span>
            </div>
            <div class="shop-items">
                ${allShopItems.map(item => createShopItemCard(item, saleActive)).join('')}
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

function createShopItemCard(item, saleActive = false) {
    // Get sale price (isDailyShop = true for daily shop items)
    const currentPrice = getShopItemPrice(item, true);
    // Get original price (isDailyShop = false to get non-sale price)
    const originalPrice = getShopItemPrice(item, false);

    const canAfford = appData.stats.currentBalance >= currentPrice;
    const resetDate = getResetDateString();
    const purchase = appData.shopPurchases[item.id];
    const purchaseCount = (purchase && purchase.lastResetDate === resetDate) ? purchase.count : 0;
    const isCustom = item.isCustom || false;

    // Build scaling info text
    const scalingType = item.scalingType || 'add';
    const scaling = item.scaling || 0;
    let scalingInfo = '';
    if (purchaseCount > 0 && scaling > 0) {
        if (scalingType === 'multiply' && scaling > 1) {
            scalingInfo = `<span class="price-increase">(×${scaling} each)</span>`;
        } else if (scalingType === 'add') {
            scalingInfo = `<span class="price-increase">(+${scaling} each)</span>`;
        }
    }

    // Price display with sale styling (show strikethrough if sale is active AND price is different)
    const showSalePrice = saleActive && originalPrice > currentPrice;
    const priceDisplay = showSalePrice
        ? `<span class="original-price">${originalPrice}</span> <span class="sale-price">${currentPrice}</span>`
        : `<span class="price-amount ${canAfford ? '' : 'too-expensive'}">${currentPrice}</span>`;

    return `
        <div class="shop-item-card ${canAfford ? '' : 'unaffordable'} ${showSalePrice ? 'on-sale' : ''}" data-id="${item.id}">
            <div class="shop-item-emoji">${item.emoji}</div>
            <div class="shop-item-info">
                <div class="shop-item-name">${escapeHtml(item.name)}</div>
                <div class="shop-item-price">
                    <span class="coin-icon">$</span>
                    ${priceDisplay}
                    ${scalingInfo}
                </div>
            </div>
            <button class="shop-claim-btn ${canAfford ? 'can-claim' : 'cannot-claim'}" data-id="${item.id}" ${!canAfford ? 'disabled' : ''}>
                ${canAfford ? 'Claim' : `Need ${currentPrice}`}
            </button>
            <button class="shop-delete-btn" data-id="${item.id}">🗑</button>
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

// Delete shop item (works for both custom and preset items)
function deleteShopItem(itemId) {
    // Check if it's a custom item
    const isCustom = appData.customShopItems.some(i => i.id === itemId);

    if (isCustom) {
        appData.customShopItems = appData.customShopItems.filter(i => i.id !== itemId);
    } else {
        // It's a preset item - add to hidden list
        if (!appData.hiddenShopItems) appData.hiddenShopItems = [];
        if (!appData.hiddenShopItems.includes(itemId)) {
            appData.hiddenShopItems.push(itemId);
        }
    }

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

// ============= PROGRESS =============

// Current progress view state
let progressState = {
    type: 'recurring', // 'recurring' or 'nonrecurring'
    range: 'daily' // 'daily', 'weekly', 'monthly'
};

function renderProgress() {
    // Get current filter states from UI
    const activeTab = document.querySelector('.progress-tab.active');
    const activeFilter = document.querySelector('.time-filter.active');

    progressState.type = activeTab ? activeTab.dataset.type : 'recurring';
    progressState.range = activeFilter ? activeFilter.dataset.range : 'daily';

    const chartContainer = document.getElementById('progressChart');
    const summaryContainer = document.getElementById('progressSummary');

    // Handle Non-recurring (Coming Soon)
    if (progressState.type === 'nonrecurring') {
        chartContainer.innerHTML = `
            <div class="coming-soon">
                <span class="coming-soon-icon">🚀</span>
                <h3>Coming Soon</h3>
                <p>Non-recurring task analytics are on the way!</p>
            </div>
        `;
        summaryContainer.innerHTML = '';
        return;
    }

    // Calculate recurring consistency data
    const data = calculateRecurringConsistency(progressState.range);

    if (data.length === 0) {
        chartContainer.innerHTML = `
            <div class="chart-empty">
                <span class="chart-empty-icon">📊</span>
                <p>No data yet. Complete some recurring tasks!</p>
            </div>
        `;
        summaryContainer.innerHTML = '';
        return;
    }

    // Render bar chart
    const chartHTML = renderBarChart(data);
    chartContainer.innerHTML = chartHTML;

    // Render summary - simple average of displayed bar percentages
    const avgRate = data.length > 0 ? Math.round(data.reduce((sum, d) => sum + d.rate, 0) / data.length) : 0;
    const avgClass = avgRate >= 80 ? 'good' : avgRate >= 50 ? 'okay' : 'poor';
    const bestItem = data.reduce((best, d) => d.rate > best.rate ? d : best, data[0]);
    const periodLabel = progressState.range === 'daily' ? 'Day' :
        progressState.range === 'weekly' ? 'Week' :
            progressState.range === 'monthly' ? 'Month' : 'Year';

    summaryContainer.innerHTML = `
        <div class="summary-card">
            <div class="summary-value ${avgClass}">${avgRate}%</div>
            <div class="summary-label">Average Consistency</div>
        </div>
        <div class="summary-card">
            <div class="summary-value">${bestItem.label}</div>
            <div class="summary-label">Best ${periodLabel}</div>
        </div>
        <div class="summary-card">
            <div class="summary-value">${appData.recurringTasks.length}</div>
            <div class="summary-label">Recurring Tasks</div>
        </div>
    `;
}

function renderBarChart(data) {
    const maxHeight = 140; // pixels
    const barsHTML = data.map(d => {
        const roundedRate = Math.round(d.rate);
        const height = Math.max(4, (d.rate / 100) * maxHeight);
        const colorClass = d.rate >= 80 ? 'high' : d.rate >= 50 ? 'medium' : 'low';

        // Build tooltip content if completedIds exists (daily view)
        let tooltipHTML = '';
        if (d.completedIds && d.activeTaskIds) {
            // Only show tasks that were scheduled for this day
            const activeTasks = appData.recurringTasks.filter(t => d.activeTaskIds.includes(t.id));
            if (activeTasks.length === 0) {
                tooltipHTML = `<div class="bar-tooltip"><div class="tooltip-task">No tasks scheduled</div></div>`;
            } else {
                const taskList = activeTasks.map(task => {
                    const isCompleted = d.completedIds.includes(task.id);
                    const icon = isCompleted ? '✓' : '✗';
                    const className = isCompleted ? 'completed' : 'missed';
                    return `<div class="tooltip-task ${className}"><span class="tooltip-icon">${icon}</span>${escapeHtml(task.title)}</div>`;
                }).join('');
                tooltipHTML = `<div class="bar-tooltip">${taskList}</div>`;
            }
        }

        return `
            <div class="chart-bar" ${d.completedIds ? 'data-has-tooltip="true"' : ''}>
                <div class="bar-value">${roundedRate}%</div>
                <div class="bar-fill-container">
                    <div class="bar-fill ${colorClass}" style="height: ${height}px;"></div>
                </div>
                <div class="bar-label">${d.label}</div>
                ${tooltipHTML}
            </div>
        `;
    }).join('');

    return `<div class="chart-bars">${barsHTML}</div>`;
}

function getFirstUseDate() {
    // Find the earliest date in completedHistory
    let earliest = null;
    appData.completedHistory.forEach(t => {
        if (t.completedAt) {
            const date = new Date(t.completedAt);
            if (!earliest || date < earliest) {
                earliest = date;
            }
        }
    });
    // Also check recurringTasks creation dates
    appData.recurringTasks.forEach(t => {
        if (t.createdAt) {
            const date = new Date(t.createdAt);
            if (!earliest || date < earliest) {
                earliest = date;
            }
        }
    });
    return earliest || new Date();
}

// Check if a recurring task was scheduled to be active on a given date
function isTaskActiveOnDate(task, date) {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    // Task didn't exist yet on this date
    if (task.createdAt) {
        const createdDate = new Date(task.createdAt);
        createdDate.setHours(0, 0, 0, 0);
        if (checkDate < createdDate) {
            return false;
        }
    }

    // Daily tasks are always active (if they existed)
    if (task.type === 'daily' || !task.type) {
        return true;
    }

    // Interval tasks: check if date falls on active or break day
    if (task.type === 'interval' && task.cycleStartDate) {
        const cycleStart = new Date(task.cycleStartDate);
        cycleStart.setHours(0, 0, 0, 0);

        // Calculate days since cycle start
        const daysDiff = Math.floor((checkDate - cycleStart) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) return false; // Before cycle started

        const cycleLength = task.activeDays + task.breakDays;
        const dayInCycle = daysDiff % cycleLength;

        // Active if we're within the active portion of the cycle
        return dayInCycle < task.activeDays;
    }

    return true;
}

function calculateRecurringConsistency(range) {
    const data = [];
    const now = new Date();
    const totalRecurring = appData.recurringTasks.length;
    const firstUse = getFirstUseDate();

    if (totalRecurring === 0) return [];

    // Get all recurring completions from history
    const recurringHistory = appData.completedHistory.filter(t => t.isRecurring);

    if (range === 'daily') {
        // Last 7 days (or since first use, whichever is shorter)
        const daysSinceFirstUse = Math.floor((now - firstUse) / (1000 * 60 * 60 * 24));
        const daysToShow = Math.min(7, daysSinceFirstUse + 1);

        for (let i = daysToShow - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = getDateString(date);

            // Get tasks that were ACTIVE on this day
            const activeTasksOnDay = appData.recurringTasks.filter(task => isTaskActiveOnDate(task, date));
            const activeTaskIds = activeTasksOnDay.map(t => t.id);

            const completedOnDay = new Set();
            recurringHistory.forEach(t => {
                if (t.completedAt) {
                    const tDate = new Date(t.completedAt);
                    if (tDate.getHours() < 6) tDate.setDate(tDate.getDate() - 1);
                    if (getDateString(tDate) === dateStr && t.recurringId) {
                        // Only count if this task was active on this day
                        if (activeTaskIds.includes(t.recurringId)) {
                            completedOnDay.add(t.recurringId);
                        }
                    }
                }
            });

            // Calculate rate based on tasks that were SUPPOSED to be done
            const tasksExpected = activeTasksOnDay.length;

            // Skip days with no tasks scheduled (don't inflate average)
            if (tasksExpected === 0) continue;

            const rate = (completedOnDay.size / tasksExpected) * 100;
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            data.push({
                label: i === 0 ? 'Today' : i === 1 ? 'Yest' : dayNames[date.getDay()],
                rate: rate,
                count: completedOnDay.size,
                expected: tasksExpected,
                completedIds: Array.from(completedOnDay),
                activeTaskIds: activeTaskIds
            });
        }
    } else if (range === 'weekly') {
        // Last 4 weeks
        for (let w = 3; w >= 0; w--) {
            const weekStart = new Date(now);
            weekStart.setDate(weekStart.getDate() - (w * 7) - weekStart.getDay());

            let dailyRates = [];

            for (let d = 0; d < 7; d++) {
                const date = new Date(weekStart);
                date.setDate(date.getDate() + d);
                if (date < firstUse || date > now) continue;
                const dateStr = getDateString(date);

                // Get tasks that were ACTIVE on this day
                const activeTasksOnDay = appData.recurringTasks.filter(task => isTaskActiveOnDate(task, date));
                if (activeTasksOnDay.length === 0) continue;

                const activeTaskIds = activeTasksOnDay.map(t => t.id);

                const completedOnDay = new Set();
                recurringHistory.forEach(t => {
                    if (t.completedAt) {
                        const tDate = new Date(t.completedAt);
                        if (tDate.getHours() < 6) tDate.setDate(tDate.getDate() - 1);
                        if (getDateString(tDate) === dateStr && t.recurringId) {
                            if (activeTaskIds.includes(t.recurringId)) {
                                completedOnDay.add(t.recurringId);
                            }
                        }
                    }
                });

                // Calculate this day's rate
                dailyRates.push((completedOnDay.size / activeTasksOnDay.length) * 100);
            }

            if (dailyRates.length === 0) continue;
            // Average of daily rates (consistent with how daily view works)
            const rate = dailyRates.reduce((sum, r) => sum + r, 0) / dailyRates.length;
            data.push({
                label: w === 0 ? 'This Week' : w === 1 ? 'Last Week' : `${w}w ago`,
                rate: rate,
                daysCount: dailyRates.length
            });
        }
    } else if (range === 'monthly') {
        // Last 6 months
        for (let m = 5; m >= 0; m--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0);

            // Skip months before first use
            if (monthEnd < firstUse) continue;

            const daysInMonth = monthEnd.getDate();
            let dailyRates = [];

            for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
                if (date < firstUse || date > now) continue;
                const dateStr = getDateString(date);

                // Get tasks that were ACTIVE on this day
                const activeTasksOnDay = appData.recurringTasks.filter(task => isTaskActiveOnDate(task, date));
                if (activeTasksOnDay.length === 0) continue;

                const activeTaskIds = activeTasksOnDay.map(t => t.id);

                const completedOnDay = new Set();
                recurringHistory.forEach(t => {
                    if (t.completedAt) {
                        const tDate = new Date(t.completedAt);
                        if (tDate.getHours() < 6) tDate.setDate(tDate.getDate() - 1);
                        if (getDateString(tDate) === dateStr && t.recurringId) {
                            if (activeTaskIds.includes(t.recurringId)) {
                                completedOnDay.add(t.recurringId);
                            }
                        }
                    }
                });

                // Calculate this day's rate
                dailyRates.push((completedOnDay.size / activeTasksOnDay.length) * 100);
            }

            if (dailyRates.length === 0) continue;
            // Average of daily rates (consistent with how daily view works)
            const rate = dailyRates.reduce((sum, r) => sum + r, 0) / dailyRates.length;
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            data.push({
                label: monthNames[monthDate.getMonth()],
                rate: rate,
                daysCount: dailyRates.length
            });
        }
    } else if (range === 'yearly') {
        // Show years since first use (up to 3 years back)
        const currentYear = now.getFullYear();
        const firstYear = firstUse.getFullYear();

        for (let y = Math.max(firstYear, currentYear - 2); y <= currentYear; y++) {
            let dailyRates = [];

            for (let m = 0; m < 12; m++) {
                const monthEnd = new Date(y, m + 1, 0);
                const daysInMonth = monthEnd.getDate();

                for (let d = 1; d <= daysInMonth; d++) {
                    const date = new Date(y, m, d);
                    if (date < firstUse || date > now) continue;
                    const dateStr = getDateString(date);

                    // Get tasks that were ACTIVE on this day
                    const activeTasksOnDay = appData.recurringTasks.filter(task => isTaskActiveOnDate(task, date));
                    if (activeTasksOnDay.length === 0) continue;

                    const activeTaskIds = activeTasksOnDay.map(t => t.id);

                    const completedOnDay = new Set();
                    recurringHistory.forEach(t => {
                        if (t.completedAt) {
                            const tDate = new Date(t.completedAt);
                            if (tDate.getHours() < 6) tDate.setDate(tDate.getDate() - 1);
                            if (getDateString(tDate) === dateStr && t.recurringId) {
                                if (activeTaskIds.includes(t.recurringId)) {
                                    completedOnDay.add(t.recurringId);
                                }
                            }
                        }
                    });

                    // Calculate this day's rate
                    dailyRates.push((completedOnDay.size / activeTasksOnDay.length) * 100);
                }
            }

            if (dailyRates.length === 0) continue;
            // Average of daily rates (consistent with how daily view works)
            const rate = dailyRates.reduce((sum, r) => sum + r, 0) / dailyRates.length;
            data.push({
                label: y.toString(),
                rate: rate,
                daysCount: dailyRates.length
            });
        }
    }

    return data;
}

function getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============= UTILITIES =============

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start the app
init();

// One-time backfill for Jan 31st 2026 missing tasks
async function runBackfillJan31() {
    const FIX_ID = 'backfill_jan31_v1';
    if (localStorage.getItem(FIX_ID)) return;

    console.log('Running backfill for Jan 31st...');

    // Date: Jan 31st 2026 (approx 11pm)
    const backfillDate = new Date('2026-01-31T23:00:00');
    const backfillDateStr = getDateString(backfillDate);

    let modifications = 0;
    const tasksToFind = [
        { id: 'brush_night', exactId: true },
        { id: 'floss', exactId: true },
        { title: 'Job Applications', exactId: false }
    ];

    tasksToFind.forEach(target => {
        // Find the task
        let task;
        if (target.exactId) {
            task = appData.recurringTasks.find(t => t.id === target.id);
        } else {
            task = appData.recurringTasks.find(t => t.title && t.title.toLowerCase().includes(target.title.toLowerCase()));
        }

        if (task) {
            // Check if already completed on that day
            const alreadyDone = appData.completedHistory.some(h => {
                if (!h.completedAt) return false;
                const d = new Date(h.completedAt);
                // Adjust for 6am day start if needed, but simple date string check usually enough for this specific request
                if (d.getHours() < 6) d.setDate(d.getDate() - 1);
                return getDateString(d) === backfillDateStr && h.recurringId === task.id;
            });

            if (!alreadyDone) {
                const diff = DIFFICULTIES[task.difficulty] || DIFFICULTIES['medium'];

                // Add to history
                appData.completedHistory.push({
                    id: Date.now() + Math.random().toString(), // unique ID
                    title: task.title,
                    difficulty: task.difficulty,
                    coins: diff.coins,
                    completedAt: backfillDate.toISOString(),
                    isRecurring: true,
                    recurringId: task.id
                });

                // Add coins
                appData.stats.totalCoinsEarned += diff.coins;
                appData.stats.currentBalance += diff.coins;

                // Update stats
                const diffKey = `tasksCompleted${task.difficulty.charAt(0).toUpperCase() + task.difficulty.slice(1)}`;
                if (appData.stats[diffKey] !== undefined) {
                    appData.stats[diffKey]++;
                }

                modifications++;
                console.log(`Backfilled: ${task.title}`);
            } else {
                console.log(`Skipped (already done): ${task.title}`);
            }
        } else {
            console.log(`Task not found: ${target.id || target.title}`);
        }
    });

    if (modifications > 0) {
        await saveData();
        alert(`Backfilled ${modifications} tasks for Jan 31st. +Coins added!`);
    }

    localStorage.setItem(FIX_ID, 'true');
}

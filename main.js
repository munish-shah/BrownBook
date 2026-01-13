const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Data storage path
const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'brownbook-data.json');

// Load or initialize data
function loadData() {
    try {
        if (fs.existsSync(dataFilePath)) {
            return JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
    return {
        tasks: [],
        rewards: [],
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
        }
    };
}

// Save data
function saveData(data) {
    try {
        fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 20, y: 20 },
        backgroundColor: '#FDF6E3',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC handlers for data operations
ipcMain.handle('load-data', () => {
    return loadData();
});

ipcMain.handle('save-data', (event, data) => {
    saveData(data);
    return true;
});

const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const isPreview = process.argv.includes('--preview');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 860,
        minHeight: 620,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 20, y: 19 },
        backgroundColor: '#11100f',
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) event.preventDefault();
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'), {
        query: isPreview ? { preview: '1' } : {}
    });
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

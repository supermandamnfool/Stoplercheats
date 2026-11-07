
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;
const fs = require('fs');

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.icns');
  mainWindow = new BrowserWindow({
    icon: fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'icon.png'),
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    const devURL = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    mainWindow.loadURL(devURL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '..', 'out', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

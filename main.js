const { app, BrowserWindow, ipcRenderer, ipcMain } = require("electron");
const path = require("path");
const fs = require('fs');
const os = require('os');

const moment = require('moment-timezone');
const express = require('express')
const expressApp = express()
const wechatGetRequests = require('./apiserver/apimain');
const { main } = require("@popperjs/core");
const port = 3000

let mainWindow;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: true,
            // Additional security options
            contextIsolation: false, // Consider setting this to true in production
            enableRemoteModule: false, // Consider setting this to true in production
        },
    });

    mainWindow.loadFile("index.html");

    mainWindow.on("closed", function () {
        mainWindow = null;
    });

    const networkInterfaces = os.networkInterfaces();
    let address;

    for (let name in networkInterfaces) {
        const iface = networkInterfaces[name];

        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];

            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                address = alias.address;
                break;
            }
        }
        if (address) break;
    }

    // mainWindow.loadURL(`http://localhost:${port}`);
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('server-info', { address, port });
    });


    if (fs.existsSync(path.join(__dirname,"localconfig.json"))) {
        mainWindow.loadFile('index.html')
    } else {
        mainWindow.loadFile("settings.html")
    }
}

// app.on("ready", createWindow);

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
    if (mainWindow === null) createWindow();
});

expressApp.get('/api/test', (req, res) => {
    res.json({ message: 'Hello from server!' })
})

expressApp.use("/", wechatGetRequests)

app.whenReady().then(() => {
    expressApp.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`)
        createWindow()
    })
})

ipcMain.on('get-user-data-path', (event) => {
    event.returnValue = app.getPath('userData')
})
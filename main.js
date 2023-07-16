const { app, BrowserWindow } = require("electron");
const path = require("path");
const moment = require('moment-timezone');
const express = require('express')
const expressApp = express()
const wechatGetRequests = require('./apiserver/apimain');
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

expressApp.use("/",wechatGetRequests)
  
app.whenReady().then(() => {
    expressApp.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`)
        createWindow()
    })
})
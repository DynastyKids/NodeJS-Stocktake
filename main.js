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
require('electron-reload')(__dirname);

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

    try{
        let fileStatus = fs.statSync(path.join(__dirname,"config/localsettings.json"))
        if (fileStatus.size > 10) {
            mainWindow.loadFile('index.html')
        } else {
            mainWindow.loadFile("settings.html")
        }
    } catch (err){
        mainWindow.loadFile('index.html')
        console.error(err)
    }

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
        const addressSet = getIPAddress() ? getIPAddress() : [];
        mainWindow.webContents.send('server-info', { address, port, addressSet});
    });
}

function getIPAddress(){
    const networkInterfaces = os.networkInterfaces();
    let addressSet=[];

    for (let interface in networkInterfaces) {
        networkInterfaces[interface].forEach(details => {
            // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
            if (!details.internal && details.family === 'IPv4' && details.address !== '127.0.0.1') {
                addressSet.push(details.address);
            }
        });
    }
    return addressSet
}

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
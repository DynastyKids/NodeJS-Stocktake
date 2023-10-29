const {app, BrowserWindow, ipcMain} = require("electron");
const path = require("path");
const os = require('os');

const net = require('net')
const express = require('express')
const http = require('http')
const https = require('https')
const fs = require('fs')

const cors=require("cors")
const apiRequests = require('./apiserver/apimain');
const {main} = require("@popperjs/core");
const portfinder = require('portfinder');
portfinder.basePort = 3000;
let currentPort = 3000;
require('electron-reload')(__dirname);

const Store = require('electron-store');
Store.initRenderer()

let navbarLanguage = "en"
if (!(new Store).get('language')){
    (new Store).set("language","en")
}

// The MongoDB URI should look as following (SRV for mongoAtlas)
// mongodb://myDatabaseUser:D1fficultP%40ssw0rd@mongodb0.example.com:27017/?authSource=admin&replicaSet=myRepl
// mongodb+srv://myDatabaseUser:D1fficultP%40ssw0rd@mongodb0.example.com/?authSource=admin&replicaSet=myRepl
if (!(new Store).get('mongoURI')){
    (new Store).set("mongoURI","mongodb://127.0.0.1:27017")
}
if(!(new Store).get("mongoDB")){
    (new Store).set("mongoDB","prod")
}

const i18next = require('i18next');
const Backend = require('i18next-electron-fs-backend');
const {MongoClient, ServerApiVersion} = require("mongodb");
const i18nextOptions = {
    debug: true,
    lng: 'en', // 默认语言
    fallbackLng: 'en',
    ns: ['translations'],
    defaultNS: 'translations',
    backend: {
        loadPath: path.join(__dirname, '/i18nLocales/{{lng}}/{{ns}}.json'),
        addPath: path.join(__dirname, '/i18nLocales/{{lng}}/{{ns}}.missing.json')
    }
};
ipcMain.on('change-language', (event, language) => {
    i18next.changeLanguage(language);
    mainWindow.webContents.send('set-language', language);
});

ipcMain.on('get-user-data-path', (event) => {
    event.returnValue = app.getPath('userData')
})
ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

let mainWindow;
function createWindow(portNumber) {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: true,
            // Additional security options
            contextIsolation: false, // 需要使用IPC Renderer,保持为False
            enableRemoteModule: false, // Consider setting this to true in production
        },
    });

    try {
        if (!(new Store).get('mongoURI') || !(new Store).get("mongoDB")){

        } else if (pingMongoDB((new Store).get('mongoURI'),(new Store).get("mongoDB"))){
            //尝试链接数据库，ping，如果无响应则跳转设置页面
            mainWindow.loadFile('Bootstrap5/pages/index.html')
        } else {
            mainWindow.loadFile("Bootstrap5/settings/settings.html")
        }
    } catch (err) {
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

    mainWindow.webContents.on('did-finish-load', () => {
        const addressSet = getIPAddress() ? getIPAddress() : [];
        mainWindow.webContents.send('server-info', {address, portNumber, addressSet});
    });

    mainWindow.on('resize', () => {
        let [width, height] = mainWindow.getSize();
        mainWindow.webContents.send('window-resize', {width, height});
    });

    ipcMain.on('print', (event) => {
        mainWindow.webContents.print({},(success, failureReason)=>{
            if (failureReason){
                console.error(failureReason);
            }
        });
    });
}

async function pingMongoDB(dburi,dbname){
    let client = new MongoClient(dburi, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let results = false
    try {
        await client.connect();
        // Send a ping to confirm a successful connection
        let response = await client.db(dbname).command({ping: 1})
        if (response.ok === 1){
            results = true
        }
    } catch (e) {
        console.error(e)
    } finally {
        await client.close();
    }
    return results
}

function getIPAddress() {
    const networkInterfaces = os.networkInterfaces();
    let addressSet = [];
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

const expressApp = express()
expressApp.use(cors())
expressApp.use("/api", apiRequests);
expressApp.use(express.static(path.join(__dirname, 'public')));

const credentials = {key: fs.readFileSync('config/key.pem', 'utf8'),
    cert:fs.readFileSync('config/cert.pem', 'utf8')}

app.whenReady().then(() => {
    // 使用portfinder插件查找可用端口，原有方法可能出现undefined
    portfinder.getPort((err,port)=>{
        if(err){
            console.error("Error when get portNo with portfinder:",err)
            return
        }
        expressApp.listen(port, ()=>{
            console.log(`Server running at http://localhost:${port}`)
            createWindow(port)
        })
    })

    const httpsServer = https.createServer(credentials, expressApp);
    httpsServer.listen(3001, () => {
        console.log('HTTPS Server running on port 3001');
    });
})

// 20231020新增，允许用户多开，通过推演端口号
function checkPort(port, callback) {
    const server = net.createServer();
    server.listen(port, () => {
        server.once('close', () => {
            callback(true);
        });
        server.close();
    });
    server.on('error', () => {
        callback(false);
    });
}


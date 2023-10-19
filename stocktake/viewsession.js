const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const path = require('path');
const fs = require('fs');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')

const {ipcRenderer} = require('electron');

var $ = require('jquery');
const {setInterval} = require('timers');
var DataTable = require('datatables.net')(window, $);
require('datatables.net-responsive');

const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
});
let table = new DataTable('#viewSessionTable', {responsive: true, pageLength: 25});

let shouldRefresh = true;
const countdownFrom = 30;
let countdown = countdownFrom;

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const Storage = require("electron-store");
const newStorage = new Storage();
i18next.use(Backend).init({
    lng: (newStorage.get('language') ? newStorage.get('language') : 'en'), backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_bodyContents();
        newStorage.set("language",e.target.value)
    });
});
function i18n_bodyContents() {
    document.title = `${i18next.t('viewsessions.pagetitle')} - Warehouse Electron`
    // Navbar Section
    document.querySelector("#navHome").textContent = i18next.t('navbar.home');
    document.querySelector("#sessionDropdown").textContent = i18next.t('navbar.sessions');
    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    sessionDropdownLinks[0].textContent = i18next.t('navbar.newsession');
    sessionDropdownLinks[1].textContent = i18next.t('navbar.allsession');

    document.querySelector("#productDropdown").textContent = i18next.t('navbar.products');
    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    productDropdownLinks[0].textContent = i18next.t('navbar.showallproducts');
    productDropdownLinks[1].textContent = i18next.t('navbar.addproduct');
    productDropdownLinks[2].textContent = i18next.t('navbar.showstocksoverview');
    productDropdownLinks[3].textContent = i18next.t('navbar.showmovementlog');
    productDropdownLinks[4].textContent = i18next.t('navbar.addmovementlog');

    document.querySelector("#navSettings").textContent = i18next.t('navbar.settings');
    document.querySelector("#LanguageDropdown").textContent = i18next.t('navbar.language');

    // Content Section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").innerText = i18next.t('index.pagetitle');
    breadcrumbs[1].querySelector("a").innerText = i18next.t('session.pagetitle');
    breadcrumbs[2].innerText = i18next.t('viewsession.pagetitle');

    document.querySelector('#sessionTitle').textContent = `${i18next.t("viewsession.h1title")} ${document.querySelector('#sessionTitle').textContent.split(" ")[1]}`
}


async function getSessionInfo(sessionCode) {
    const options = {sort: {loggingTime: -1}};
    const sessions = client.db(credentials.mongodb_db).collection("pollingsession");
    let cursor;
    let htmlContent = ""
    try {
        await client.connect();
        cursor = sessions.find({session: sessionCode});
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const x of cursor) {
            htmlContent = `From:\t${x.startDate}<br>Until:\t${x.endDate}`
        }

        if (htmlContent.length > 0) {
            document.querySelector("#sessionTimeText").innerHTML = htmlContent
        }
    } catch (err) {
        console.error(err)
    } finally {
        client.close()
    }
    return htmlContent;
}

async function getSessionItems(sessionCode) {
    const options = {sort: {startDate: -1},};
    const sessions = client.db(credentials.mongodb_db).collection("pollinglog");
    let cursor;
    let htmlContent = ""
    let alreadyInserted = []
    var tableData = []
    try {
        await client.connect();
        cursor = sessions.find({session: sessionCode});
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        table.clear().draw()
        for await (const x of cursor) {
            console.log(x)
            if (!alreadyInserted.includes(`${x.productCode}:${x.productLabel}`)) {
                table.row.add([`${x.productCode} - ${x.productName}`, `<small>${x.productLabel}</small>`, x.shelfLocation,
                    `${x.quantity} ${x.quantityUnit}`, x.bestbefore, (x.consumed === 1 ? "√" : ""),
                    "<a href='#'>Edit</a>"
                ]).draw(false);
            }
        }
    } catch (err) {
        console.log(err)
    } finally {
        client.close()
    }
    return htmlContent;
}

window.onload = () => {
    const QueryString = require('querystring')
    let query = QueryString.parse(global.location.search)
    let sessionId = query['?id']
    document.querySelector('#sessionTitle').innerText = `Session ${sessionId}`
    getSessionInfo(sessionId)
    getSessionItems(sessionId)
    const automaticRefresh = setInterval(() => {
        if (shouldRefresh) {
            getSessionItems(sessionId)
            countdown = countdownFrom;
        }
    }, countdownFrom * 1000)
    const countdownInterval = setInterval(() => {
        if (shouldRefresh) {
            countdown -= 1
            document.querySelector("#toggleRefreshText").innerText = `Automatic refresh in: ${countdown}s`
        }
    }, 1000)

    ipcRenderer.on('server-info', (event, {address, port, addressSet}) => {
        let addressHTML = ""
        if (addressSet.length > 0) {
            addressSet.forEach(eachadd => {
                addressHTML += eachadd + "<br>"
            })
            document.querySelector("#sessionConfigAddress").innerHTML = addressHTML;
        } else {
            document.querySelector("#sessionConfigAddress").innerText = `${address}`;
        }
        document.querySelector("#sessionConfigPort").innerText = `${port}`;
    });

    document.querySelector('#toggleRefresh').addEventListener('click', function () {
        shouldRefresh = !shouldRefresh;
        if (shouldRefresh) {
            document.querySelector("#toggleRefresh").innerText = "Pause"
            document.querySelector("#toggleRefresh").classList.remove("btn-outline-success")
            document.querySelector("#toggleRefresh").classList.add("btn-outline-warning")
            countdown = countdownFrom; // 重置倒计时
        } else {
            document.querySelector("#toggleRefresh").innerText = "Resume"
            document.querySelector("#toggleRefresh").classList.remove("btn-outline-warning")
            document.querySelector("#toggleRefresh").classList.add("btn-outline-success")
            document.querySelector('#toggleRefreshText').innerText = "Automatic refresh paused";
        }
    });
}
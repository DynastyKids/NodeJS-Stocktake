const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const path = require('path');

const {ipcRenderer} = require('electron');

var $ = require('jquery');
const {setInterval} = require('timers');
var DataTable = require('datatables.net')(window, $);
require('datatables.net-responsive');

const Storage = require("electron-store");
const newStorage = new Storage();

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

let table = new DataTable('#viewSessionTable', {responsive: true, pageLength: 25});

let shouldRefresh = true;
const countdownFrom = 60;
let countdown = countdownFrom;

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

i18next.use(Backend).init({
    lng: (newStorage.get('language') ? newStorage.get('language') : 'en'), backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar();
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar()
        i18n_bodyContents();
        newStorage.set("language",e.target.value)
    });
});
function i18n_navbar() { // Navbar Section
    for (let i = 0; i < document.querySelectorAll(".nav-topitem").length; i++) {
        document.querySelectorAll(".nav-topitem")[i].innerHTML = i18next.t(`navbar.navitems.${i}`)
    }
    for (let i = 0; i < document.querySelectorAll("#sessionDropdownList a").length; i++) {
        document.querySelectorAll("#sessionDropdownList a")[i].innerHTML = i18next.t(`navbar.sessions_navitems.${i}`)
    }
    for (let i = 0; i < document.querySelectorAll("#productDropdownList a").length; i++) {
        document.querySelectorAll("#productDropdownList a")[i].innerHTML = i18next.t(`navbar.products_navitems.${i}`)
    }
}
function i18n_bodyContents() {
    document.title = `${i18next.t('viewsessions.pagetitle')} - Warehouse Electron`

    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").innerText = i18next.t('index.pagetitle');
    breadcrumbs[1].querySelector("a").innerText = i18next.t('session.pagetitle');
    breadcrumbs[2].innerText = i18next.t('viewsession.pagetitle');

    var tableHeads = document.querySelectorAll(".container-fluid table thead tr th");
    var tableFoots = document.querySelectorAll(".container-fluid table tfoot tr th");
    for (let i = 0; i < tableHeads.length; i++) {
        tableHeads[i].textContent = i18next.t(`viewsession.table_titles.${i}`)
        tableFoots[i].textContent = i18next.t(`viewsession.table_titles.${i}`)
    }
    document.querySelector("#loadingTableText").textContent = i18next.t('general.loadingTableText')
    document.querySelector('#sessionTitle').textContent = `${i18next.t("viewsession.h1title")} ${document.querySelector('#sessionTitle').textContent.split(" ")[1]}`
}

async function getSessionInfo(sessionCode) {
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    const options = {sort: {loggingTime: -1}};
    const sessions = client.db(targetDB).collection("pollingsession");
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
        await client.close()
    }
    return htmlContent;
}

async function getSessionItems(sessionCode) {
    document.querySelector("#loadingStatus").style.removeProperty("display")
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    const options = {sort: {startDate: -1},};
    const sessions = client.db(targetDB).collection("pollinglog");
    let cursor;
    let htmlContent = ""
    let alreadyInserted = []
    try {
        table.clear().draw()
        await client.connect();
        cursor = await sessions.find({sessions: sessionCode}).toArray();
        if (cursor.length === 0 ){
            console.log("[MongoDB] Nothing Found");
        }
        console.log(cursor)
        cursor.forEach(x=>{
            if (!alreadyInserted.includes(`${x.productCode}:${x.productLabel}`)) {
                table.row.add([
                    `${x.productCode ? x.productCode : ""}${x.productName ? (x.productCode ? " - " : "")+ x.productName : ""}`,
                    `<small>${x.productLabel ? x.productLabel : ""}</small>`,
                    `${x.shelfLocation ? x.shelfLocation : ""}`,
                    `${x.quantity ? x.quantity + (x.quantityUnit ? " "+x.quantityUnit: ""): ""}`,
                    `${x.bestbefore ? x.bestbefore : ""}`,
                    (x.removed === 1 ? "√" : ""),
                    "<a href='#'>Edit</a>"
                ]).draw(false);
            }
        })
    } catch (err) {
        console.log(err)
    } finally {
        await client.close()
        document.querySelector("#loadingStatus").style.display="none"
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
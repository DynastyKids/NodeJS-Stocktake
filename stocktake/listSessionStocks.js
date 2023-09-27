const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const fs = require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')
let lastSession = ""

const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))
let client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
});

document.addEventListener("DOMContentLoaded", (ev) => {
    getSessions()
});

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
i18next.use(Backend).init({
    lng: 'en', backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar()
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar()
        i18n_bodyContents();
    });
});
function i18n_navbar() {
    // Navbar Section
    var navlinks = document.querySelectorAll(".nav-topitem");
    for (let i = 0; i < navlinks.length; i++) {
        navlinks[i].innerHTML = i18next.t(`navbar.navitems.${i}`)
    }

    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    for (let i = 0; i < sessionDropdownLinks.length; i++) {
        sessionDropdownLinks[i].innerHTML = i18next.t(`navbar.sessions_navitems.${i}`)
    }

    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    for (let i = 0; i < productDropdownLinks.length; i++) {
        productDropdownLinks[i].innerHTML = i18next.t(`navbar.products_navitems.${i}`)
    }
}
function i18n_bodyContents() {
    document.title = `${i18next.t('listsessionstock.pagetitle')} - Warehouse Electron`

    // Body Section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").innerText = i18next.t('index.pagetitle');
    breadcrumbs[1].querySelector("a").innerText = i18next.t('session.pagetitle');
    breadcrumbs[2].innerText = i18next.t('listsessionstock.pagetitle');

    document.querySelector("#datasource p").textContent = i18next.t('listsessionstock.selectlabeltext')
    document.querySelector(".container h1").textContent = i18next.t("listsessionstock.pagetitle");
    var tableTitles = document.querySelectorAll(".container table th");
    var table_headtitles = document.querySelectorAll(".container table thead th");
    var table_foottitles = document.querySelectorAll(".container table tfoot th");

    for (let i = 0; i < table_headtitles.length; i++) {
        table_headtitles[i].textContent = i18next.t(`listsessionstock.table_titles.${i}`)
        table_foottitles[i].textContent = i18next.t(`listsessionstock.table_titles.${i}`)
    }

    document.querySelectorAll(".tablebtn_consume").forEach(eachbutton => {
        eachbutton.textContent = i18next.t('tables.btn_consume');
    })
    document.querySelectorAll(".tablebtn_edit").forEach(eachbutton => {
        eachbutton.textContent = i18next.t('tables.btn_edit');
    });
}

async function getSessions() {
    const options = {sort: {startDate: -1},};
    client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    const sessions = client.db(credentials.mongodb_db).collection("pollingsession");
    let cursor;
    let htmlContent = ""
    try {
        await client.connect();
        cursor = await sessions.find({}, options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        let first = true
        for await (const x of cursor) {
            console.log(x)
            htmlContent += `<option value="${x.session}">${x.startDate.substring(0, 10)} > ${x.session}</option>`
            if (first) {
                htmlContent = `<option value="${x.session}" selected>${x.startDate.substring(0, 10)} > ${x.session} (latest)</option>`
                await getAllItemsFromSession(x.session)
                lastSession = x.session
                first = false
            }
        }

        if (htmlContent.length > 0) {
            document.querySelector("#sessionSelector").innerHTML = htmlContent
        }
    } catch (err) {
        console.error(err)
    } finally {
        await client.close()
    }

    return htmlContent;
}

document.querySelector("#sessionSelector").addEventListener("change", () => {
    document.querySelector("#activeTBody").innerHTML = ""
    getAllItemsFromSession(document.querySelector("#sessionSelector").value)
})

async function getAllItemsFromSession(sessionCode) {
    let nowTime = moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')
    const tomorrow = (new Date('today')).setDate(new Date('today').getDate() + 1)
    const options = {sort: {startDate: -1},};
    client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    const sessions = client.db(credentials.mongodb_db).collection("pollinglog");
    let cursor;
    let htmlContent = ""
    if (sessionCode == "") {
        sessionCode = lastSession
    }
    try {
        await client.connect();
        cursor = sessions.find({$or: [{session: ""}, {session: sessionCode}]});
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
            document.querySelector("#activeTBody").innerHTML = "<tr><td colspan=5>No item found in this session available</td></tr>"
        }

        for await (const x of cursor) {
            htmlContent += `<tr>
                <td><small>${x.productLabel}</small></td>
                <td><small>${x.productCode} - ${x.productName}</small></td>
                <td><small>${x.quantity} ${x.quantityUnit}</small></td>
                <td>${x.bestbefore}</td>
                <td>${x.shelfLocation}</td>
                <td class="action">
                    <a href="#" data-bs-toggle="modal" data-bs-target="#consumeModal" data-bs-stockid="${x.productLabel}" class="tablebtn_consume">Consume</a>
                    <a href="#" data-bs-toggle="modal" data-bs-target="#stockEditModal" data-bs-stockid="${x.productLabel}" class="tablebtn_edit">Edit</a>
                </td></tr>`
        }

        document.querySelector("#activeTBody").innerHTML = htmlContent
    } catch (err) {
        console.error(err)
        htmlContent = "<tr><td colspan=5>No item found in this session available</td></tr>"
        document.querySelector("#activeTBody").innerHTML = htmlContent
    } finally {
        await client.close()
    }

    return htmlContent;
}
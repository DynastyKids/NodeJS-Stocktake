const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const fs=require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')

const uriCompents = [credentials.mongodb_protocol,"://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))
const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
i18next.use(Backend).init({
    lng: 'en', backend: {loadPath: 'i18nLocales/{{lng}}/translations.json'}
}).then(() => {
    updateTexts();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        updateTexts();
    });
});
function updateTexts() {
    document.title = `${i18next.t('listsession.pagetitle')} - Warehouse Electron`
    // Navbar Section
    document.querySelector("#navHome").textContent=i18next.t('navbar.home');
    document.querySelector("#sessionDropdown").textContent=i18next.t('navbar.sessions');
    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    sessionDropdownLinks[0].textContent=i18next.t('navbar.newsession');
    sessionDropdownLinks[1].textContent=i18next.t('navbar.allsession');

    document.querySelector("#productDropdown").textContent=i18next.t('navbar.products');
    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    productDropdownLinks[0].textContent=i18next.t('navbar.showallproducts');
    productDropdownLinks[1].textContent=i18next.t('navbar.addproduct');
    productDropdownLinks[2].textContent=i18next.t('navbar.showstocksoverview');
    productDropdownLinks[3].textContent=i18next.t('navbar.showmovementlog');
    productDropdownLinks[4].textContent=i18next.t('navbar.addmovementlog');

    document.querySelector("#navSettings").textContent=i18next.t('navbar.settings');
    document.querySelector("#LanguageDropdown").textContent=i18next.t('navbar.language');

    // Body Section
    document.querySelector(".container h1").textContent = i18next.t("listsession.pagetitle");
    var tableTitles = document.querySelectorAll(".container table th");
    tableTitles[0].textContent = i18next.t('tables.stocktable_sessionid');
    tableTitles[1].textContent = i18next.t('tables.stocktable_startTime');
    tableTitles[2].textContent = i18next.t('tables.stocktable_endTime');
    tableTitles[3].textContent = i18next.t('tables.stocktable_setupTime');
    tableTitles[4].textContent = i18next.t('tables.stocktable_action');
    tableTitles[5].textContent = i18next.t('tables.stocktable_sessionid');
    tableTitles[6].textContent = i18next.t('tables.stocktable_startTime');
    tableTitles[7].textContent = i18next.t('tables.stocktable_endTime');
    tableTitles[8].textContent = i18next.t('tables.stocktable_setupTime');
    tableTitles[9].textContent = i18next.t('tables.stocktable_action');

    var tableRowActions = document.querySelectorAll(".tableaction_view")
    tableRowActions.forEach(eachRow =>{ eachRow.textContent = i18next.t('tables.btn_view'); })
}

document.addEventListener("DOMContentLoaded", (event) => {
    console.log(getAllSession())
});

async function getAllSession(){
    let nowTime= moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')
    const tomorrow = (new Date('today')).setDate(new Date('today').getDate()+1)
    const options = {sort: { startDate: -1 },};
    const sessions = client.db(credentials.mongodb_db).collection("pollingsession");
    let cursor;
    let htmlContent=""
    try {
        await client.connect();
        cursor = sessions.find({}, options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const  x of cursor) {
            htmlContent += `<tr><td>${x.session}</td><td>${x.startDate}</td><td>${x.endDate}</td><td>${x.logTime}` +
                `</td><td><a href="../stocktake/viewsession.html?id=${x.session}" class="tableaction_view">View</a></td></tr>`
        }

        if (htmlContent.length > 0){
            document.querySelector("#activeTBody").innerHTML = htmlContent
        }
    } finally {
        client.close();
    }

    return htmlContent;
}

window.onload = () => {
    // getCurrentSession()
    // console.log(getCurrentSession().catch(console.log));
}
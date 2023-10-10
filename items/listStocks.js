const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const fs = require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')
const {ipcRenderer} = require('electron');

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

var $ = require('jquery');
var DataTable = require('datatables.net-bs')(window, $);
require('datatables.net-responsive-bs');

const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))

const {setInterval} = require('timers');

let table = new DataTable('#stockTable', {
    responsive: true,
    pageLength: 50,
    columns: [{"width": "25%"}, null, null, {"width": "10%"}, null, null],
    order: [[2, 'asc']]
});
let shouldRefresh = true;
const countdownFrom = 60;
let countdown = 60;

i18next.use(Backend).init({
    lng: 'en', backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar();
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar();
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
    document.title = `${i18next.t('listnext3.pagetitle')} - Warehouse Electron`
    // Content - Breadcrumbs
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").innerText = i18next.t('index.pagetitle');
    breadcrumbs[1].querySelector("a").innerText = i18next.t('listproducts.pagetitle');
    breadcrumbs[2].innerText = i18next.t('liststocks.pagetitle');

    // Contents
    document.querySelector("h1").textContent = i18next.t('liststocks.pagetitle');
    document.querySelectorAll(".toggleRefreshText")[0].textContent = i18next.t(`liststocks.refreshText.${0}`)
    document.querySelectorAll(".toggleRefreshText")[1].textContent = i18next.t(`liststocks.refreshText.${1}`)
    document.querySelector("#areloadTable").textContent = i18next.t("liststocks.reloadTableLink")

    // Datatables
    var tableheaders = document.querySelectorAll("#stockTable thead th")
    var tablefooters = document.querySelectorAll("#stockTable tfoot th")
    for (let i = 0; i < tableheaders.length; i++) {
        tableheaders[i].textContent = i18next.t(`liststocks.table_head.${i}`)
    }
    for (let i = 0; i < tablefooters.length; i++) {
        tablefooters[i].textContent = i18next.t(`liststocks.table_head.${i}`)
    }
    document.querySelector("#stockTable_info").innerText.split(" ")

    // Table Actions
    var table_action_remove = document.querySelectorAll(".table_action_remove")
    for (let i = 0; i < table_action_remove.length; i++) {
        table_action_remove[i].textContent = i18next.t(`liststocks.table_actionRemove`)
    }

    var infotextNumbers = document.querySelector("#stockTable_info").innerText.match(/\d+/g)
    document.querySelector("#stockTable_info").innerText = i18next.t(`dataTables.table_entrydesc.${0}`)+
        infotextNumbers[0]+i18next.t(`dataTables.table_entrydesc.${1}`)+infotextNumbers[1]+
        i18next.t(`dataTables.table_entrydesc.${2}`)+infotextNumbers[2]+
        i18next.t(`dataTables.table_entrydesc.${3}`)

    document.querySelector("#stockTable_paginate .previous").textContent = i18next.t("dataTables.table_action.0")
    document.querySelector("#stockTable_paginate .next").textContent = i18next.t("dataTables.table_action.1")

    document.querySelector("#alert_success div").textContent = i18next.t("flashtext_success")
    document.querySelector("#alert_warning div").textContent = i18next.t("flashtext_notfound")
    document.querySelector("#alert_error div").textContent = i18next.t("flashtext_failed")
}

document.addEventListener("DOMContentLoaded", (event) => {
    loadStockInfoToTable()
    let shouldRefresh = true
    const automaticRefresh = setInterval(() => {
        if (shouldRefresh) {
            loadStockInfoToTable()
            countdown = countdownFrom;
        }
    }, countdownFrom * 1000)

    const countdownInterval = setInterval(() => {
        if (shouldRefresh) {
            countdown -= 1
            document.querySelector("#toggleTimes").innerText = `${countdown}`
        }
    }, 1000)

    document.querySelector("#apauseTimer").addEventListener("click", (ev)=> {
        shouldRefresh= !shouldRefresh
        if (!shouldRefresh){
            clearInterval(automaticRefresh)
            document.querySelector("#apauseTimer").innerText = "Resume & Refresh";
        } else {
            document.querySelector("#apauseTimer").innerText = "Pause";
            location.reload()
        }
    })
});

var removeModal = document.querySelector("#removeModal")
removeModal.addEventListener("show.bs.modal", function (ev) {
    var button = ev.relatedTarget
    var lableID = button.getAttribute("data-bs-labelid")
    let hiddenInput = removeModal.querySelector("#modalInputLabelid")
    hiddenInput.value = lableID
})

removeModal.querySelector("#removeModalYes").addEventListener("click", async function (ev) {
    ev.preventDefault()
    let labelId = removeModal.querySelector("#modalInputLabelid").value
    let model = bootstrap.Modal.getInstance(document.querySelector("#removeModal"));
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    try {
        await client.connect();
        const session = client.db(credentials.mongodb_db).collection("pollinglog");
        let result = await session.updateMany({productLabel: labelId, consumed: 0} , {$set: {consumed: 1, consumedTime: localTime.format("YYYY-MM-DD HH:mm:ss")}},{upsert: false})
        if (result.modifiedCount > 0 && result.matchedCount === result.modifiedCount) {
            //找到符合条件的数据且成功修改了，清空筛选条件，重新加载表格
            console.log("Successfully update status for: ",labelId)
            document.querySelector("#alert_success").style.display = 'flex'
        } else if (result.matchedCount === 0) { //未找到符合条件的数据但成功执行了
            console.log(`Label ID: ${labelId} Not Found`)
            document.querySelector("#alert_warning").style.display = 'flex'
        }
    } catch (e) {
        document.querySelector("#alert_error").style.display = 'flex'
        console.error(`Remove Stock Error when process: ${labelId};`,e)
    } finally {
        loadStockInfoToTable()
        await client.close()
        model.hide()
    }
})

document.querySelector("#areloadTable").addEventListener("click",function (ev) {
    loadStockInfoToTable()
})

document.querySelector("#filterdate").addEventListener("change", (ev)=>{
    loadStockInfoToTable();
});


function loadStockInfoToTable() {
    table.clear().draw()
    getAllStockItems().then(result => {
        if (result.acknowledged) {
            let results = result.resultSet
            table.column(2).order('asc');
            for (let index = 0; index < results.length; index++) {
                const element = results[index];
                if (document.querySelector("#filterdate").value !== "") {
                    console.log(document.querySelector("#filterdate").value)
                    if (new Date(element.loggingTime) < new Date(document.querySelector("#filterdate").value)) {
                        continue;
                    }
                }
                table.row.add([
                    `${element.productCode} - ${element.productName}`,
                    `${element.quantity} ${element.quantityUnit}`,
                    element.bestbefore,
                    element.shelfLocation,
                    element.productLabel,
                    (element.consumed < 1 ? `
                    <a href="#" class="table_actions table_action_edit" data-bs-toggle="modal" data-bs-target="#editModal" 
                        data-bs-labelid="${element.productLabel}" style="margin: 0 2px 0 2px">Edit</a>
                    <a href="#" class="table_actions table_action_remove" data-bs-toggle="modal" data-bs-target="#removeModal" 
                        data-bs-labelid="${element.productLabel}" style="margin: 0 2px 0 2px">Remove</a>
                    ` : "")
                ]).draw(false);
            }
        }
    })
}

async function getAllStockItems() {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let nowTime = moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss")
    const sessions = client.db(credentials.mongodb_db).collection("pollinglog");
    let cursor;
    let result = {acknowledged: false, resultSet: [], message: ""}
    try {
        const query = {consumed: 0}
        const options = {sort: {bestbefore: -1},}
        await client.connect();
        cursor = await sessions.find(query, options)
        if ((await sessions.countDocuments(query)) > 0) {
            result.acknowledged = true
            result.resultSet = await cursor.toArray()
        }
        console.log(result.resultSet)
    } catch (err) {
        console.error(err)
        result['message'] = err
    } finally {
        client.close()
    }

    return result
}
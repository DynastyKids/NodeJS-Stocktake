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
var DataTable = require('datatables.net-responsive-bs5')(window, $);

const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))

const {setInterval} = require('timers');

let fullResultSet = [];
let table = new DataTable('#stockTable', {
    responsive: true,
    pageLength: 25,
    lengthMenu:[10,15,25,50,100],
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
}

document.addEventListener("DOMContentLoaded", (event) => {
    const URLqueries = new URLSearchParams(window.location.search)
    if (URLqueries.get('q')){ // 该query存在则拉取所有数据
        document.querySelector(".container .container-fluid small").textContent = "*** Showing all stocks including history ***"
    } else {
        document.querySelector(".container .container-fluid small").textContent = "* Showing current stocks only."
    }
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

document.querySelector("#editModal").addEventListener("show.bs.modal", (ev)=>{
    //弹出后先填充表格
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-itemId")
    console.log(fullResultSet)
    document.querySelector("#modalEditLabelid").value = requestLabelId
    document.querySelector("#editModalSubmitBtn").disabled = true
    document.querySelector("#editModalSubmitBtn").textContent = "Submit"
    document.querySelector("#editModal .modal-title").textContent = `Loading Product Information`
    let originProperty = {}
    for (let i = 0; i < fullResultSet.length; i++) {
        if (fullResultSet[i].productLabel === requestLabelId){
            originProperty = fullResultSet[i]
            //找到了目标信息，继续填充
            document.querySelector("#editModal .modal-title").textContent = `Edit Stock: ${fullResultSet[i].productName}`
            document.querySelector("#editModal .modal-body p").innerHTML = `Product Info: ${fullResultSet[i].productCode} - ${fullResultSet[i].productName}<br>Label ID: ${fullResultSet[i].productLabel}`
            document.querySelector("#modalEditQuantity").value = (fullResultSet[i].quantity ? fullResultSet[i].quantity : "")
            document.querySelector("#modalEditUnit").value = (fullResultSet[i].quantityUnit ? fullResultSet[i].quantityUnit : "")
            document.querySelector("#modalEditBestbefore").value = (fullResultSet[i].bestbefore ? fullResultSet[i].bestbefore : "")
            document.querySelector("#modelEditLocation").value = (fullResultSet[i].shelfLocation ? fullResultSet[i].shelfLocation : "")
            document.querySelector("#editModalSubmitBtn").disabled = false
            break;
        }
    }
    
    document.querySelector("#editModalSubmitBtn").addEventListener("click", async (ev) => {
        let client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        });
        const session = client.db(credentials.mongodb_db).collection("pollinglog");
        document.querySelector("#editModalSubmitBtn").disabled = true
        document.querySelector("#editModalSubmitBtn").textContent = "Updating"
        let result = await session.updateOne({"productLabel": requestLabelId}, {
            $set: {
                quantity: (document.querySelector("#modalEditQuantity").value ? document.querySelector("#modalEditQuantity").value : originProperty.quantity ),
                quantityUnit: (document.querySelector("#modalEditUnit").value ? document.querySelector("#modalEditUnit").value : originProperty.quantityUnit ),
                bestbefore : (document.querySelector("#modalEditBestbefore").value ? document.querySelector("#modalEditBestbefore").value : originProperty.bestbefore),
                shelfLocation: (document.querySelector("#modelEditLocation").value ? document.querySelector("#modelEditLocation").value : originProperty.shelfLocation)
            }
        })
        if (result.acknowledged){
            bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
            loadStockInfoToTable()
        } else {
            document.querySelector("#editModal .modal-body p").textContent = "Error on Update"
        }
    })
})

let removeModal = document.querySelector("#removeModal")
removeModal.addEventListener("show.bs.modal", function (ev) {
    var lableID = ev.relatedTarget.getAttribute("data-bs-itemId")
    let hiddenInput = removeModal.querySelector("#modalInputLabelid")
    hiddenInput.value = lableID
    document.querySelector("#removeModalYes").disabled = false
    document.querySelector("#removeModalYes").textContent = "Confirm"
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

    document.querySelector("#removeModalYes").disabled = true
    document.querySelector("#removeModalYes").textContent = "Updating"
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
    const URLqueries = new URLSearchParams(window.location.search)
    let requestAllData = false
    if (URLqueries.get('q')){ // 该query存在则拉取所有数据
        requestAllData = true
    }
    getAllStockItems(requestAllData).then(result => {
        if (result.acknowledged) {
            let results = result.resultSet
            fullResultSet = result.resultSet
            table.column(2).order('asc');
            for (let index = 0; index < results.length; index++) {
                const element = results[index];
                if (document.querySelector("#filterdate").value !== "") {
                    console.log(document.querySelector("#filterdate").value)
                    if (element.loggingTime && new Date(element.loggingTime) < new Date(document.querySelector("#filterdate").value)) {
                        continue;
                    }
                }
                table.row.add([
                    `${element.productCode} - ${element.productName}`,
                    `${element.quantity} ${element.quantityUnit}`,
                    (element.bestbefore ? element.bestbefore : ""),
                    (element.shelfLocation ? element.shelfLocation : ""),
                    (element.productLabel ? element.productLabel : ""),
                    (element.consumed < 1 ? `
                    <a href="#" class="table_actions table_action_edit" data-bs-toggle="modal" data-bs-target="#editModal" 
                        data-bs-itemId="${element.productLabel}" style="margin: 0 2px 0 2px">Edit</a>
                    <a href="#" class="table_actions table_action_remove" data-bs-toggle="modal" data-bs-target="#removeModal" 
                        data-bs-itemId="${element.productLabel}" style="margin: 0 2px 0 2px">Remove</a>
                    ` : "")
                ]).draw(false);
            }
        }
    })
}

async function getAllStockItems(getAll) {
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
        const options = {sort: {bestbefore: -1},}
        await client.connect();
        if (getAll){
            cursor = await sessions.find({}, options)
        } else {
            cursor = await sessions.find({consumed: 0}, options)
        }
        result.acknowledged = true
        result.resultSet = await cursor.toArray()
        console.log(result)
    } catch (err) {
        console.error(err)
        result['message'] = err
    } finally {
        await client.close()
    }

    return result
}
const { ipcRenderer } = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const moment = require('moment-timezone')

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

const Storage = require("electron-store");
const newStorage = new Storage();
const path = require('path');

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const {setInterval} = require('timers');

let fullResultSet = [];
let table = new DataTable('#stockTable', {
    responsive: true,
    pageLength: 25,
    lengthMenu:[10,15,25,50,100],
    columns: [{"width": "25%"}, null, null, null, null, null, null],
    order: [[2, 'asc']]
});
let shouldRefresh = true;
const countdownFrom = 60;
let countdown = 60;

i18next.use(Backend).init({
    lng: (newStorage.get('language') ? newStorage.get('language') : 'en'), backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar();
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar();
        i18n_bodyContents();
        newStorage.set("language",e.target.value)
    });
});
function i18n_navbar() {
    // Navbar Section
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
    document.title = `${i18next.t('listnext3.pagetitle')} - Warehouse Electron`
    // Content - Breadcrumbs
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").innerText = i18next.t('index.pagetitle');
    breadcrumbs[1].querySelector("a").innerText = i18next.t('listproducts.pagetitle');
    breadcrumbs[2].querySelector("a").innerText = i18next.t('liststocks.pagetitle');
    breadcrumbs[3].innerText = i18next.t('listpreload.pagetitle');

    // Contents
    document.querySelector("h1").textContent = i18next.t('listpreload.pagetitle');
    document.querySelectorAll(".toggleRefreshText")[0].textContent = i18next.t(`listpreload.refreshText.${0}`)
    document.querySelectorAll(".toggleRefreshText")[1].textContent = i18next.t(`listpreload.refreshText.${1}`)
    document.querySelector("#areloadTable").textContent = i18next.t("listpreload.reloadTableLink")
    document.querySelector("#apauseTimer").textContent = i18next.t("listpreload.apauseTimer")
    document.querySelector("#loadingTableText").textContent = i18next.t('general.loadingTableText')
    document.querySelector("#printlink").textContent = i18next.t('general.print')

    // Datatables
    var tableheaders = document.querySelectorAll("#stockTable thead th")
    var tablefooters = document.querySelectorAll("#stockTable tfoot th")
    for (let i = 0; i < tableheaders.length; i++) {
        tableheaders[i].textContent = i18next.t(`listpreload.table_head.${i}`)
    }
    for (let i = 0; i < tablefooters.length; i++) {
        tablefooters[i].textContent = i18next.t(`listpreload.table_head.${i}`)
    }
    document.querySelector("#stockTable_info").innerText.split(" ")

    // Table Actions
    var table_action_remove = document.querySelectorAll(".table_action_remove")
    for (let i = 0; i < table_action_remove.length; i++) {
        table_action_remove[i].textContent = i18next.t(`listpreload.table_actionRemove`)
    }

    var infotextNumbers = document.querySelector("#stockTable_info").innerText.match(/\d+/g)
    document.querySelector("#stockTable_info").innerText = i18next.t(`dataTables.table_entrydesc.${0}`)+
        infotextNumbers[0]+i18next.t(`dataTables.table_entrydesc.${1}`)+infotextNumbers[1]+
        i18next.t(`dataTables.table_entrydesc.${2}`)+infotextNumbers[2]+
        i18next.t(`dataTables.table_entrydesc.${3}`)

    document.querySelector("#stockTable_paginate .previous").textContent = i18next.t("dataTables.table_action.0")
    document.querySelector("#stockTable_paginate .next").textContent = i18next.t("dataTables.table_action.1")

    document.querySelectorAll(".table_action_edit").forEach(eachItem=>{
        eachItem.textContent = i18next.t("dataTables.action_edit")
    })
    document.querySelectorAll(".table_action_remove").forEach(eachItem=>{
        eachItem.textContent = i18next.t("dataTables.action_remove")
    })
    document.querySelectorAll(".table_action_revert").forEach(eachItem=>{
        eachItem.textContent = i18next.t("dataTables.action_revert")
    })
}
function refreshCheckSwitch(){
    loadStockInfoToTable(true)
}

document.addEventListener("DOMContentLoaded", (event) => {
    const URLqueries = new URLSearchParams(window.location.search)
    loadStockInfoToTable(true)
    let shouldRefresh = true
    const automaticRefresh = setInterval(() => {
        if (shouldRefresh) {
            refreshCheckSwitch()
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
    //弹出后先填充表格, 表格填充完毕后，提交修改，然后复制该条目到polling,删除在preload中的数据
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-itemId")
    console.log(fullResultSet)
    document.querySelector("#modalEditLabelid").value = requestLabelId
    document.querySelector("#editModalSubmitBtn").disabled = true
    document.querySelector("#editModalSubmitBtn").textContent = "Save"
    document.querySelector("#editModalSubmitAddBtn").disabled = true
    document.querySelector("#editModalSubmitAddBtn").textContent = "Save & Add to stocks"
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
            document.querySelector("#editModalSubmitAddBtn").disabled = false
            break;
        }
    }

    async function updatePrealoadLog() {
        let client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        });
        const session = client.db(targetDB).collection("preloadlog");
        let result = await session.updateOne({"productLabel": requestLabelId}, {
            $set: {
                quantity: (document.querySelector("#modalEditQuantity").value ? document.querySelector("#modalEditQuantity").value : originProperty.quantity),
                quantityUnit: (document.querySelector("#modalEditUnit").value ? document.querySelector("#modalEditUnit").value : originProperty.quantityUnit),
                bestbefore: (document.querySelector("#modalEditBestbefore").value ? document.querySelector("#modalEditBestbefore").value : originProperty.bestbefore),
                shelfLocation: (document.querySelector("#modelEditLocation").value ? document.querySelector("#modelEditLocation").value : originProperty.shelfLocation)
            }
        })
        return result;
    }

    document.querySelector("#editModalSubmitBtn").addEventListener("click", async (ev) => {
        document.querySelector("#editModalSubmitBtn").disabled = true
        document.querySelector("#editModalSubmitAddBtn").disabled = true
        document.querySelector("#editModalSubmitBtn").textContent = "Updating"

        if (await updatePrealoadLog()){
            bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
            loadStockInfoToTable()
        } else {
            document.querySelector("#editModal .modal-body p").textContent = "Error on Update"
        }
    })

    document.querySelector("#editModalSubmitAddBtn").addEventListener("click",async (ev) => {
        document.querySelector("#editModalSubmitBtn").disabled = true
        document.querySelector("#editModalSubmitAddBtn").disabled = true
        document.querySelector("#editModalSubmitAddBtn").textContent = "Updating"

        if (await updatePrealoadLog()) {
            // Step 1 更新完成，Step2，获取该元素，复制到pollinglog,Step3，删除preloadlog记录
            await copyDocument("preloadlog", "pollinglog", {"productLabel": requestLabelId}, true)
            bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
            loadStockInfoToTable()
        } else {
            document.querySelector("#editModal .modal-body p").textContent = "Error on Update"
        }
    })
})

async function copyDocument(sourceCollectionName, targetCollectionName, query = {},reqDelete=true) {
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    let results=[{},{}];
    try {
        await client.connect();
        const sourceCollection = client.db(targetDB).collection(sourceCollectionName);
        const targetCollection = client.db(targetDB).collection(targetCollectionName);

        const documents = await sourceCollection.find(query).toArray();
        if (documents.length > 0) {
            results[0] = await targetCollection.insertMany(documents);
            results[1] = reqDelete ? await sourceCollection.deleteMany(documents) : {acknowledged: true}
        }
    } catch (error) {
        console.error("Error copying data:", error);
    } finally {
        await client.close();
    }
    return results;
}

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
        const session = client.db(targetDB).collection("preloadlog");
        let result = await session.remove({productLabel: labelId, removed: 0} , {$set: {removed: 1, removeTime: localTime.format("YYYY-MM-DD HH:mm:ss")}},{upsert: false})
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
    loadStockInfoToTable(true)
})

function loadStockInfoToTable(fetchAll) {
    table.clear().draw()
    let requestAllData = fetchAll ? fetchAll : false
    const URLqueries = new URLSearchParams(window.location.search)
    requestAllData = (URLqueries.get('q') ? true : requestAllData) // 该query存在则拉取所有数据
    getAllStockItems(requestAllData).then(result => {
        if (result.acknowledged) {
            let results = result.resultSet
            fullResultSet = result.resultSet
            table.column(2).order('asc');
            for (let index = 0; index < results.length; index++) {
                const element = results[index];
                table.row.add([
                    `${element.productCode} - ${element.productName}`,
                    `${element.quantity} ${element.quantityUnit}`,
                    (element.bestbefore ? element.bestbefore : ""),
                    (element.shelfLocation ? element.shelfLocation : ""),
                    `<small>${(element.productLabel ? element.productLabel : "")}</small>`,
                    `<small>${(element.POnumber ? element.POnumber : "")}</small>`,
                    `<a href="#" class="table_actions table_action_edit" data-bs-toggle="modal" data-bs-target="#editModal" 
                        data-bs-itemId="${element.productLabel}" style="margin: 0 2px 0 2px">${i18next.t("dataTables.action_edit")}</a>
                    <a href="#" class="table_actions table_action_remove" data-bs-toggle="modal" data-bs-target="#removeModal" 
                        data-bs-itemId="${element.productLabel}" style="margin: 0 2px 0 2px">${i18next.t("dataTables.action_remove")}</a>`
                ]).draw(false);
            }
        }
    })
}

async function getAllStockItems(getAll) {
    document.querySelector("#loadingStatus").style.removeProperty("display")
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let nowTime = moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss")
    const sessions = client.db(targetDB).collection("preloadlog");
    let cursor;
    let result = {acknowledged: false, resultSet: [], message: ""}
    try {
        const options = {sort: {bestbefore: -1},}
        await client.connect();
        if (getAll){
            cursor = await sessions.find({}, options)
        } else {
            cursor = await sessions.find({removed: 0}, options)
        }
        result.acknowledged = true
        result.resultSet = await cursor.toArray()
        console.log(result)
    } catch (err) {
        console.error(err)
        result['message'] = err
    } finally {
        await client.close()
        document.querySelector("#loadingStatus").style.display = "none"
    }
    return result
}

document.querySelector("#printlink").addEventListener("click",(ev)=>{
    ipcRenderer.send('print');
});

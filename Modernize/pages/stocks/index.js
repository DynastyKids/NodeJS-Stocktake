const { ipcRenderer } = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const moment = require('moment-timezone')
moment.locale("en-AU")

const Storage = require("electron-store");
const newStorage = new Storage();
const path = require('path');

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"


const {setInterval} = require('timers');
const i18next = require("i18next");

let fullResultSet = [];
let table = new DataTable('#table', {
    responsive: true,
    pageLength: 25,
    lengthMenu:[10,15,25,50,100],
    columns: [{"width": "25%"}, {"width": "15%"}, {"width": "15%"}, {"width": "10%"}, {"width": "20%"}, null],
    order: [[2, 'asc']]
});
let shouldRefresh = true;
const countdownFrom = 60;
let countdown = 60;


document.querySelector("#switchCheck").addEventListener("change", function(ev){
    refreshCheckSwitch()
})

function refreshCheckSwitch(){
    if (document.querySelector("#switchCheck").checked){
        document.querySelector("#switchDiv span").textContent = "Showing all stocks."
        loadStockInfoToTable(true)
    } else {
        document.querySelector("#switchDiv span").textContent = "Showing current stocks only"
        loadStockInfoToTable(false)
    }
}

document.addEventListener("DOMContentLoaded", (event) => {
    const URLqueries = new URLSearchParams(window.location.search)
    document.querySelector("#switchCheck").checked = ( URLqueries.get('q') ? true : false) // 该query存在则拉取所有数据
    refreshCheckSwitch()
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

    document.querySelector("#act_pause").addEventListener("click", (ev)=> {
        shouldRefresh= !shouldRefresh
        if (!shouldRefresh){
            clearInterval(automaticRefresh)
            document.querySelector("#act_pause").innerText = "Resume Timer";
        } else {
            document.querySelector("#act_pause").innerText = "Pause Timer";
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
            document.querySelector("#editModal .modal-body #productInfoText").textContent = `${fullResultSet[i].productCode} - ${fullResultSet[i].productName}`
            document.querySelector("#editModal .modal-body #labelIDText").textContent = `${fullResultSet[i].productLabel}`
            document.querySelector("#modalEditQuantity").value = (fullResultSet[i].quantity ? fullResultSet[i].quantity : "")
            document.querySelector("#modalEditUnit").value = (fullResultSet[i].quantityUnit ? fullResultSet[i].quantityUnit : "")
            document.querySelector("#modalEditBestbefore").value = (fullResultSet[i].bestbefore ? fullResultSet[i].bestbefore : "")
            document.querySelector("#modelEditLocation").value = (fullResultSet[i].shelfLocation ? fullResultSet[i].shelfLocation : "")
            document.querySelector("#modelEditPOIP").value = (fullResultSet[i].POIPnumber ? fullResultSet[i].POIPnumber : "")
            document.querySelector("#modelEditUnitprice").value = (fullResultSet[i].unitPrice ? fullResultSet[i].unitPrice : "")
            document.querySelector("#modelEditLoggingTime").value = (fullResultSet[i].loggingTime ? fullResultSet[i].loggingTime : "")
            document.querySelector("#modelCheckboxConsumed").checked = (fullResultSet[i].removed === 1)
            document.querySelector("#modelEditConsumeTime").value = (fullResultSet[i].removeTime ? fullResultSet[i].removeTime : "")
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
        const session = client.db(targetDB).collection("pollinglog");
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
            setTimeout(function(){
                bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
                window.location.reload()
            },2500)
        } else {
            document.querySelector("#editModal .modal-body p").textContent = "Error on Update"
        }
    })
})

document.querySelector("#modelCheckboxConsumed").addEventListener("change",(ev)=>{
    if (ev.target.checked){
        document.querySelector("#group_consumeTime").style = ""
    } else {
        document.querySelector("#group_consumeTime").style = "display:none"
        document.querySelector("#inpt_consumeTime").value = ""
    }
})

let removeModal = document.querySelector("#removeModal")
removeModal.addEventListener("show.bs.modal", function (ev) {
    var lableID = ev.relatedTarget.getAttribute("data-bs-itemId")
    let hiddenInput = removeModal.querySelector("#removeModal_labelid")
    hiddenInput.value = lableID
    document.querySelector("#removeModalYes").disabled = false
    document.querySelector("#removeModalYes").textContent = "Confirm"
})

removeModal.querySelector("#removeModalYes").addEventListener("click", async function (ev) {
    ev.preventDefault()
    let labelId = removeModal.querySelector("#removeModal_labelid").value
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
        const session = client.db(targetDB).collection("pollinglog");
        let result = await session.updateMany({productLabel: labelId, removed: 0} , {$set: {removed: 1, removeTime: localTime.format("YYYY-MM-DD HH:mm:ss")}},{upsert: false})
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

let revertModal = document.querySelector("#revertModal")
revertModal.addEventListener("show.bs.modal", function (ev) {
    var lableID = ev.relatedTarget.getAttribute("data-bs-itemId")
    let hiddenInput = revertModal.querySelector("#revertLabelid")
    hiddenInput.value = lableID

    document.querySelector("#revertLocation").value = ev.relatedTarget.getAttribute("data-bs-shelf")
    document.querySelector("#revertModalYes").disabled = false
    document.querySelector("#revertModalYes").textContent = "Confirm"
})
revertModal.querySelector("#revertModalYes").addEventListener("click", async function (ev) {
    ev.preventDefault()
    let labelId = revertModal.querySelector("#revertLabelid").value
    let model = bootstrap.Modal.getInstance(document.querySelector("#revertModal"));
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });

    document.querySelector("#revertModalYes").disabled = true
    document.querySelector("#revertModalYes").textContent = "Updating"
    try {
        await client.connect();
        const session = client.db(targetDB).collection("pollinglog");
        let result = await session.updateMany({productLabel: labelId, removed: 1} ,
            {$set: {removed: 0}, $unset: {"removeTime":""}},{upsert: false})
        if (result.modifiedCount > 0 && result.matchedCount === result.modifiedCount) {
            //找到符合条件的数据且成功修改了，清空筛选条件，重新加载表格
            console.log("Successfully reverted status for: ",labelId)
            document.querySelector("#alert_success").style.display = 'flex'
        } else if (result.matchedCount === 0) { //未找到符合条件的数据但成功执行了
            console.log(`Label ID: ${labelId} Not Found`)
            document.querySelector("#alert_warning").style.display = 'flex'
        }
    } catch (e) {
        document.querySelector("#alert_error").style.display = 'flex'
        console.error(`Revert Stock Error when process: ${labelId};`,e)
    } finally {
        loadStockInfoToTable()
        await client.close()
        model.hide()
    }
})

document.querySelector("#act_reloadTable").addEventListener("click",(ev) =>{
    if (document.querySelector("#switchCheck").checked){
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.0')
        loadStockInfoToTable(true)
    } else {
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.1')
        loadStockInfoToTable(false)
    }
})

document.querySelector("#filterdate").addEventListener("change", (ev)=>{
    if (document.querySelector("#switchCheck").checked){
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.0')
        loadStockInfoToTable(true)
    } else {
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.1')
        loadStockInfoToTable(false)
    }
});


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
                    // (element.bestbefore ? moment(element.bestbefore).format("l") : ""),
                    (element.shelfLocation ? element.shelfLocation : ""),
                    `<p>${(element.productLabel ? element.productLabel : "")}</p><p style="font-size: xx-small">${( element.loggingTime ? moment(element.loggingTime).format("lll") : "")}</p>`,
                    `<a href="#" class="table_actions table_action_edit" data-bs-toggle="modal" data-bs-target="#editModal" 
                        data-bs-itemId="${element.productLabel}" style="margin: 0 2px 0 2px">Edit</a>` +
                    (element.removed < 1 ? `
                    <a href="#" class="table_actions table_action_remove" data-bs-toggle="modal" data-bs-target="#removeModal" 
                        data-bs-itemId="${element.productLabel}" style="margin: 0 2px 0 2px">Remove</a>
                    ` : `<a href="#" class="table_actions table_action_revert" data-bs-toggle="modal" data-bs-target="#revertModal" 
                        data-bs-itemId="${element.productLabel}" data-bs-shelf="${(element.shelfLocation ? element.shelfLocation : "")}" style="margin: 0 2px 0 2px">Revert</a>
                        <p class="table_action_removed" style="font-size: xx-small;">${(element.removeTime ? "Removed on " +
                        element.removeTime.split(" ")[0]: "")}</p>`)
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
    const sessions = client.db(targetDB).collection("pollinglog");
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

document.querySelector("#filterdate").addEventListener("change", (ev)=>{
    if (document.querySelector("#switchCheck").checked){
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.0')
        loadStockInfoToTable(true)
    } else {
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.1')
        loadStockInfoToTable(false)
    }
});
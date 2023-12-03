const { ipcRenderer } = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');

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
    columns: [{"width": "25%"}, {"width": "15%"},null, {"width": "15%"}, {"width": "10%"}, {"width": "20%"}, null],
    order: [[2, 'asc']],
    columnDefs: [
        {
            target: 2,
            visible: false,
            searchable: false
        },
    ]
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
            document.querySelector("#modelEditPOnumber").value = (fullResultSet[i].POnumber ? fullResultSet[i].POnumber : "")
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
            },
        })
        if (originProperty.shelfLocation !== document.querySelector("#modelEditLocation").value) {
            // 2023 DEC update: 添加了过往location的记录
            await session.updateOne({"productLabel": requestLabelId}, {$push: {locationRecords: {datetime: new Date()}}})
        }
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

document.querySelector("#removeModal_check").addEventListener("change",(ev)=>{
    if (ev.target.checked) {
        document.querySelector("#removeModal_time").style = ""
        document.querySelector("#removeModal_datetime").value = new Date()
    } else {
        document.querySelector("#removeModal_time").style = "display:none"
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
    // 收到用户的确认请求，移除该库存
    ev.preventDefault()
    let labelId = removeModal.querySelector("#removeModal_labelid").value
    let model = bootstrap.Modal.getInstance(document.querySelector("#removeModal"));
    document.querySelector("#removeModalYes").disabled = true
    document.querySelector("#removeModalYes").textContent = "Updating"

    let localTime = new Date();
    if (document.querySelector("#removeModal_check").checked){ // 检查用户是否自定义了时间
        try {
            localTime = document.querySelector("#removeModal_datetime").value ? new Date(document.querySelector("#removeModal_datetime").value) : new Date()
        } catch (e) {
            // User provide incorrect data of date-time values, revert to default
            console.error("RemoveModal Error: Datetime not recognizable",e)
            localTime = new Date()
        }
    }

    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    try {
        await client.connect();
        const session = client.db(targetDB).collection("pollinglog");
        let result = await session.updateMany(
            {productLabel: labelId, removed: 0} ,
            {$set: {removed: 1, removeTime: new Date(localTime)}},
            {upsert: false}
        )
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
        // 如果用户设定了返回的地点，则一并写入
        if (String(document.querySelector("#revertLocation").value).length > 0){
            result = await session.updateMany({productLabel: labelId} ,
                {$set: {removed: 0, shelfLocation: document.querySelector("#revertLocation").value}},{upsert: false})
        }
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

                // Update 2023, using new location field
                let shelfLocationField = (element.shelfLocation ? `${element.shelfLocation}` : "")
                if (element.hasOwnProperty("locationRecords") && element.locationRecords.length > 1){
                    shelfLocationField = element.locationRecords[element.locationRecords.length-1].location
                }

                table.row.add([
                    `${(element.hasOwnProperty("productCode") ? element.productCode : "")} - ${element.productName}`,
                    `${element.hasOwnProperty("quantity") ? element.quantity + " " + (element.quantityUnit ? element.quantityUnit : "") : ""}`,
                    (element.bestbefore ? element.bestbefore : ""),
                    (element.bestbefore ? new Date(element.bestbefore).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' }) : ""),
                    (shelfLocationField ? `<a href=../stocks/location.html?location=${shelfLocationField}>${shelfLocationField}</a>`: ''),
                    `<p>${(element.productLabel ? element.productLabel : "")}</p>`+
                    `<p style="font-size: x-small">${( element.hasOwnProperty("createTime") ? "Added on "+new Date(element.createTime).toLocaleDateString('en-AU',{ timeZone: 'Australia/Sydney' }) : "")}</p>`,
                    `<a href="#" class="table_actions table_action_edit" data-bs-toggle="modal" data-bs-target="#editModal" 
                        data-bs-itemId="${element.productLabel}" style="margin: 0 2px 0 2px">Edit</a>` +
                    (element.removed < 1 ? `
                    <a href="#" class="table_actions table_action_remove" data-bs-toggle="modal" data-bs-target="#removeModal" 
                        data-bs-itemId="${element.productLabel}" style="margin: 0 2px 0 2px">Remove</a>
                    ` : `<a href="#" class="table_actions table_action_revert" data-bs-toggle="modal" data-bs-target="#revertModal" 
                        data-bs-itemId="${element.productLabel}" data-bs-shelf="${(element.shelfLocation ? element.shelfLocation : "")}" style="margin: 0 2px 0 2px">Revert</a>
                        <p class="table_action_removed" style="font-size: x-small;">${(element.removeTime ? "Removed on " + new Date(element.removeTime).toLocaleDateString("en-AU") : "")}</p>`)
                ]).draw(false);
            }
        }
    })
}

async function getAllStockItems(findall = false) {
    document.querySelector("#loadingStatus").style.removeProperty("display")
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    const sessions = client.db(targetDB).collection("pollinglog");
    let result = {acknowledged: false, resultSet: [], message: ""}
    try {
        const options = {sort: {bestbefore: -1},}
        await client.connect();
        result.acknowledged = true
        if (findall){
            result.resultSet = await sessions.find({}, options).toArray()
        } else {
            result.resultSet = await sessions.find({removed: 0}, options).toArray()
        }
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
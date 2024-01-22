const { ipcRenderer } = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, Decimal128, ObjectId} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const {setInterval} = require('timers');
const i18next = require("i18next");
const {jsPDF} = require('jspdf');

let stockList = [];
let table = new DataTable('#table', {
    responsive: true,
    pageLength: 25,
    lengthMenu:[10,15,25,50,100],
    columns: [{"width": "25%"}, {"width": "15%"},null, null, null, {"width": "20%"}, null],
    order: [[2, 'asc']],
    columnDefs: [
        {
            target: 2,
            visible: false,
            searchable: false
        },
    ],
});
let shouldRefresh = true;
const countdownFrom = 60;
let countdown = 60;


document.querySelector("#switchCheck").addEventListener("change", function(ev){
    refreshCheckSwitch()
})

function refreshCheckSwitch(){
    loadStockInfoToTable()
    document.querySelector("#switchDiv span").textContent = `${document.querySelector("#switchCheck").checked ? "Showing all stocks." : "Showing current stocks only"}`
}

document.addEventListener("DOMContentLoaded", (event) => {
    const URLqueries = new URLSearchParams(window.location.search)
    document.querySelector("#switchCheck").checked = ( !!URLqueries.get('q')) // 该query存在则拉取所有数据
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
            loadStockInfoToTable()
        }
    })
});

function getDateTimeforInput(date = new Date()) {
    let targetDate = date instanceof Date && !isNaN(date.valueOf()) ? date : new Date()
    var year = targetDate.getFullYear();
    var month = targetDate.getMonth() + 1; // January is 0!
    var day = targetDate.getDate();

    // Padding month and day with zero if they are less than 10
    month = month < 10 ? '0' + month : month;
    day = day < 10 ? '0' + day : day;

    return `${year}-${month}-${day}T${targetDate.getHours()}:${targetDate.getMinutes()}`
}


let editModalObject = {}
document.querySelector("#editModal").addEventListener("show.bs.modal", (ev)=>{
    //弹出后先填充表格
    editModalObject = {}
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-itemid")
    editModalObject.labelId = requestLabelId
    document.querySelector("#editModal_submitBtn").disabled = true
    document.querySelector("#editModal_submitBtn").textContent = "Submit"
    document.querySelector("#editModal .modal-title").textContent = `Loading Product Information`
    let originProperty = {}
    for (let i = 0; i < stockList.length; i++) {
        if ((stockList[i]._id).toString() === requestLabelId){
            originProperty = stockList[i] //找到了目标信息，继续填充
            editModalObject.originProps = stockList[i]
            document.querySelector("#editModal .modal-title").textContent = `Edit Stock: ${stockList[i].productName} | StockID: ${stockList[i].productLabel.slice(-7)}`
            document.querySelector("#editModal .modal-body #productInfoText").textContent = `${stockList[i].productCode} - ${stockList[i].productName}`
            document.querySelector("#editModal .modal-body #labelIDText").textContent = `${stockList[i].productLabel}`
            document.querySelector("#editModal #editModal_deleteBtn").setAttribute("data-bs-itemid", stockList[i]._id)
            document.querySelector("#modalEditQuantity").value = (stockList[i].hasOwnProperty("quantity") ? stockList[i].quantity : "")
            document.querySelector("#modalEditUnit").value = (stockList[i].hasOwnProperty("quantityUnit") ? stockList[i].quantityUnit : "")
            document.querySelector("#modalEditBestbefore").value = (stockList[i].hasOwnProperty("bestbefore") ? stockList[i].bestbefore : "")
            document.querySelector("#modelEditLocation").value = (stockList[i].hasOwnProperty("shelfLocation") ? stockList[i].shelfLocation : "")
            document.querySelector("#modelEditPOnumber").value = (stockList[i].hasOwnProperty("POnumber") ? stockList[i].POnumber : (stockList[i].hasOwnProperty("POIPnumber") ? stockList[i].POIPnumber : ""))
            document.querySelector("#modelEditUnitprice").value = (stockList[i].hasOwnProperty("unitPrice") ? stockList[i].unitPrice : "")
            document.querySelector("#modelEditCheckRemoved").checked = (stockList[i].hasOwnProperty("removed") && stockList[i].removed === 1)
            document.querySelector("#modelEditCreateTime").value = (stockList[i].hasOwnProperty("createTime") ? getDateTimeforInput(stockList[i].createTime) : "")
            document.querySelector("#group_removeTime").style = (document.querySelector("#modelEditCheckRemoved").checked ? "" : "display:none")
            document.querySelector("#modelEditRemoveTime").value = (stockList[i].hasOwnProperty("removeTime") ? getDateTimeforInput(stockList[i].removeTime) : "")

            document.querySelector('#modalEdit_quarantineYes').checked = (!!(stockList[i].hasOwnProperty("quarantine") && stockList[i].quarantine === 1))
            document.querySelector('#modalEdit_quarantineNo').checked = (!!(stockList[i].hasOwnProperty("quarantine") && stockList[i].quarantine === 0))
            document.querySelector('#modalEdit_quarantineFinished').checked = (!!(stockList[i].hasOwnProperty("quarantine") && stockList[i].quarantine === -1))

            document.querySelector("#modelEditComments").value = (stockList[i].hasOwnProperty("comments") ? stockList[i].comments : "")
            document.querySelector("#editModal_submitBtn").disabled = false
            break;
        }
    }
})
document.querySelector("#editModal_submitBtn").addEventListener("click", async (ev) => {
    let client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1,  useNewUrlParser: true,  useUnifiedTopology: true }});
    const session = client.db(targetDB).collection("pollinglog");
    document.querySelector("#editModal_submitBtn").disabled = true
    document.querySelector("#editModal_submitBtn").textContent = "Updating"
    // 当update时候，获取所有的输入框信息，并和原有的值对比，如果发生变化则添加到新系统中，并且添加个changelog

    let setObject = {}
    let changedObject = {datetime: new Date(), events:[]}
    var originProperty = editModalObject.originProps
    if (document.querySelector("#modalEditQuantity").value.toString().length > 0 ){
        setObject.quantity = parseInt(document.querySelector("#modalEditQuantity").value)
        if ((originProperty.hasOwnProperty("quantity") && originProperty.quantity !== document.querySelector("#modalEditQuantity").value)
            || !originProperty.hasOwnProperty("quantity")){
            changedObject.events.push({field:"quantity", before:parseInt(originProperty.quantity)})
        }
    }

    if (document.querySelector("#modalEditUnit").value.toString().length > 0){
        setObject.quantityUnit = document.querySelector("#modalEditUnit").value
        if ((originProperty.hasOwnProperty("quantityUnit") && originProperty.quantityUnit !== document.querySelector("#modalEditUnit").value)
            || !originProperty.hasOwnProperty("quantityUnit") ){
            changedObject.events.push({field:"quantityUnit", before:originProperty.quantityUnit})
        }
    }

    if (document.querySelector("#modalEditBestbefore").value.toString().length > 0){
        setObject.bestbefore = document.querySelector("#modalEditBestbefore").value
        if ((originProperty.hasOwnProperty("bestbefore") && originProperty.bestbefore !== document.querySelector("#modalEditBestbefore").value)
            || !originProperty.hasOwnProperty("bestbefore")){
            changedObject.events.push({field:"bestbefore", before: originProperty.bestbefore})
        }
    }

    if (document.querySelector("#modelEditLocation").value.toString().length > 0){
        setObject.shelfLocation = document.querySelector("#modelEditLocation").value
        if ((originProperty.hasOwnProperty("shelfLocation") && originProperty.shelfLocation !== document.querySelector("#modelEditLocation").value)
            || !originProperty.hasOwnProperty("shelfLocation")){
            changedObject.events.push({field:"shelfLocation", before: originProperty.shelfLocation})
        }
    }

    if (document.querySelector("#modelEditPOnumber").value.toString().length > 0){
        setObject.POnumber = document.querySelector("#modelEditPOnumber").value
        if ((originProperty.hasOwnProperty("POnumber") && originProperty.POnumber !== document.querySelector("#modelEditPOnumber").value)
            || !originProperty.hasOwnProperty("POnumber")){
            changedObject.events.push({field:"POnumber", before: originProperty.POnumber})
        }
    }

    if (document.querySelector("#modelEditUnitprice").value.toString().length > 0){
        setObject.unitPrice = Decimal128.fromString(document.querySelector("#modelEditUnitprice").value)
        if ((originProperty.hasOwnProperty("unitPrice") && originProperty.unitPrice !== document.querySelector("#modelEditUnitprice").value)
            || !originProperty.hasOwnProperty("unitPrice")){
            changedObject.events.push({field:"unitPrice", before: originProperty.unitPrice})
        }
    }

    if (document.querySelector("#modelEditCreateTime").value.toString().length > 0){
        setObject.createTime = new Date(document.querySelector("#modelEditCreateTime").value)
        if ((originProperty.hasOwnProperty("createTime") && originProperty.createTime !== document.querySelector("#modelEditCreateTime").value)
            || !originProperty.hasOwnProperty("createTime")){
            changedObject.events.push({field:"createTime", before: originProperty.createTime})
        }
    }

    if (!originProperty.hasOwnProperty("removed")) {
        setObject.removed = parseInt("0")
    } else if(originProperty.removed === 0 && document.querySelector("#modelEditCheckRemoved").checked){
        setObject.removed = parseInt("1")
        changedObject.events.push({field:"removed", before: 0})
    } else if (originProperty.removed === 1 && !document.querySelector("#modelEditCheckRemoved").checked){
        setObject.removed = parseInt("0")
        changedObject.events.push({field:"removed", before: 1})
    }

    try{
        if(document.querySelector("input[name='modalEdit_quarantineRatio']:checked").value){
            setObject.quarantine = parseInt(document.querySelector("input[name='modalEdit_quarantineRatio']:checked").value)
            changedObject.events.push({
                field:"quarantineRatio", before: (originProperty.hasOwnProperty("quarantine") ? parseInt(originProperty.quarantine) : null)
            })
        }
    } catch (e) {
        console.log("Original Property does not have quarantine Ratio")
    }

    if (String(document.querySelector("#modelEditComments").value).length > 0){
        // Comments变动不做记录保存
        setObject.comments = document.querySelector("#modelEditComments").value
    }

    // 位置发生变动，需要添加locationRecords
    let pushObject = {}
    if (originProperty.shelfLocation !== document.querySelector("#modelEditLocation").value) {
        changedObject.events.push({field:"shelfLocation", before: originProperty.shelfLocation})
        pushObject.locationRecords = {datetime: new Date(), location: document.querySelector("#modelEditLocation").value}
    }
    if (changedObject.events.length > 0){
        pushObject.changelog = changedObject
    }

    let result = await session.updateOne({"_id": new ObjectId(editModalObject.labelId)}, {$set: setObject, $push: pushObject})
    if (result.acknowledged){
        setTimeout(function(){
            bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
            loadStockInfoToTable()
        },3000)
    } else {
        document.querySelector("#editModal .modal-body p").textContent = "Error on Update"
    }
})

document.querySelector("#modelEditCheckRemoved").addEventListener("change",(ev)=>{
    if (ev.target.checked){
        document.querySelector("#group_removeTime").style = ""
    } else {
        document.querySelector("#group_removeTime").style = "display:none"
        document.querySelector("#modelEditRemoveTime").value = ""
    }
})

document.querySelector("#removeModal_setManualTimeCheck").addEventListener("change",(ev)=>{
    if (ev.target.checked) {
        document.querySelector("#removeModal_time").style = ""
        document.querySelector("#removeModal_datetime").value = new Date()
    } else {
        document.querySelector("#removeModal_time").style = "display:none"
    }
})

document.querySelector("#removeModal").addEventListener("show.bs.modal", function (ev) {
    var itemId = ev.relatedTarget.getAttribute("data-bs-itemid")
    document.querySelector("#removeModal_labelid").value = itemId
    document.querySelector("#removeModal_btnConfirm").disabled = false
    document.querySelector("#removeModal_btnConfirm").textContent = "Confirm"

    for (let i = 0; i < stockList.length; i++) {
        if ((stockList[i]._id).toString() === itemId){
            document.querySelector("#removeModal .modal-body p").textContent = `Are you sure to mark ${stockList[i].productName} with label ending in ${stockList[i].productLabel.slice(-7)} has been used?`
        }
    }
})

document.querySelector("#removeModal").querySelector("#removeModal_btnConfirm").addEventListener("click", async function (ev) {
    // 收到用户的确认请求，移除该库存
    ev.preventDefault()
    let labelId = document.querySelector("#removeModal_labelid").value
    let model = bootstrap.Modal.getInstance(document.querySelector("#removeModal"));
    document.querySelector("#removeModal_btnConfirm").disabled = true
    document.querySelector("#removeModal_btnConfirm").textContent = "Updating"

    let localTime = new Date();
    if (document.querySelector("#removeModal_setManualTimeCheck").checked){ // 检查用户是否自定义了时间
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
            {_id: new ObjectId(labelId), removed: 0} ,
            {$set: {removed: 1, removeTime: new Date(localTime)}},
            {upsert: false}
        )
        if (result.modifiedCount > 0 && result.matchedCount === result.modifiedCount) {
            //找到符合条件的数据且成功修改了，清空筛选条件，重新加载表格
            console.log("Successfully update status for: ",labelId)
            createAlert("success",`Successfully update status for ${labelId}`,3000)
        } else if (result.matchedCount === 0) { //未找到符合条件的数据但成功执行了
            console.log(`Label ID: ${labelId} Not Found`)
            createAlert("warning",`Not found item with label ID: ${labelId}`,5000)
        }
    } catch (e) {
        console.error(`Remove Stock Error when process: ${labelId};`,e)
    } finally {
        loadStockInfoToTable()
        await client.close()
        model.hide()
    }
})

let revertModal = document.querySelector("#revertModal")
revertModal.addEventListener("show.bs.modal", function (ev) {
    var itemId = ev.relatedTarget.getAttribute("data-bs-itemid")
    let hiddenInput = revertModal.querySelector("#revertLabelid")
    hiddenInput.value = itemId

    document.querySelector("#revertLocation").value = ev.relatedTarget.getAttribute("data-bs-shelf")
    document.querySelector("#revertModal_btnConfirm").disabled = false
    document.querySelector("#revertModal_btnConfirm").textContent = "Confirm"

    for (let i = 0; i < stockList.length; i++) {
        if ((stockList[i]._id).toString() === itemId){
            document.querySelector("#revertModal .modal-body p").textContent = `Are you sure to revert delete of ${stockList[i].productName} with label ending in ${stockList[i].productLabel.slice(-7)}?`
        }
    }
})
revertModal.querySelector("#revertModal_btnConfirm").addEventListener("click", async function (ev) {
    ev.preventDefault()
    let labelId =  ev.relatedTarget.getAttribute("data-bs-itemid")
    let model = bootstrap.Modal.getInstance(document.querySelector("#revertModal"));
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });

    document.querySelector("#revertModal_btnConfirm").disabled = true
    document.querySelector("#revertModal_btnConfirm").textContent = "Updating"
    try {
        await client.connect();
        const session = client.db(targetDB).collection("pollinglog");
        let result = await session.updateMany({_id: new ObjectId(labelId), removed: 1} ,
            {$set: {removed: 0}, $unset: {"removeTime":""}},{upsert: false})
        // 如果用户设定了返回的地点，则一并写入
        if (String(document.querySelector("#revertLocation").value).length > 0){
            result = await session.updateMany({_id: new ObjectId(labelId)} ,
                {$set: {removed: 0, shelfLocation: document.querySelector("#revertLocation").value}},{upsert: false})
        }
        if (result.modifiedCount > 0 && result.matchedCount === result.modifiedCount) {
            //找到符合条件的数据且成功修改了，清空筛选条件，重新加载表格
            document.querySelector("#alert_success").style.display = 'flex'
        } else if (result.matchedCount === 0) { //未找到符合条件的数据但成功执行了
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

let deleteModal = document.querySelector("#deleteModal")
deleteModal.addEventListener("show.bs.modal", (ev)=>{
    var itemId = ev.relatedTarget.getAttribute("data-bs-itemid")
    deleteModal.querySelector("#deleteModal_labelid").value = itemId
    deleteModal.querySelector("#deleteModal_btnReturn").setAttribute("data-bs-itemid", itemId)
    deleteModal.querySelector(".modal-footer").querySelectorAll("button").forEach(eachButton=>{
        eachButton.disabled = false
    })
    deleteModal.querySelector("#deleteModal_btnConfirm").textContent = `Confirm`
})
deleteModal.querySelector("#deleteModal_btnConfirm").addEventListener("click", (ev)=>{
    deleteModal.querySelector(".modal-footer").querySelectorAll("button").forEach(eachButton=>{
        eachButton.disabled = true
    })
    deleteModal.querySelector("#deleteModal_btnConfirm").textContent = `Please Wait`
    deleteStockitemById(String(deleteModal.querySelector("#deleteModal_labelid").value),"").then(result =>{
        bootstrap.Modal.getInstance(deleteModal).hide()
        loadStockInfoToTable()
        if (result.acknowledged){
            createAlert("success","Item has been successfully deleted", 3000)
        } else {
            createAlert("warning","Item delete failed, please try again later", 3000)
        }
    })
})

async function deleteStockitemById(databaseId = "", productLabel = "") {
    let deleteOption = {}
    let returnResponse = {acknowledged: false, message: ""}
    if (databaseId.length > 0) {
        deleteOption = {_id: new ObjectId(databaseId)}
    } else if (productLabel.length > 0) {
        deleteOption = {productLabel: productLabel}
    }

    if (Object.keys(deleteOption).length > 0) {
        // Confirmed delete option
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        const sessions = client.db(targetDB).collection("pollinglog");
        let result = {acknowledged: false, resultSet: [], message: ""}
        try {
            const options = {sort: {bestbefore: -1},}
            await client.connect();
            let result = await sessions.deleteOne(deleteOption)
            if (result.deletedCount === 1){
                returnResponse.acknowledged = true;
            }
        } catch (err) {
            returnResponse.message = err
        } finally {
            await client.close()
        }
    }

    return returnResponse
}

document.querySelector("#act_reloadTable").addEventListener("click",(ev) =>{
    loadStockInfoToTable()
})

document.querySelector("#filterdate").addEventListener("change", (ev)=>{
    loadStockInfoToTable()
});


function loadStockInfoToTable(fetchAll = document.querySelector("#switchCheck").checked) {
    let requestAllData = fetchAll ? fetchAll : false
    const URLqueries = new URLSearchParams(window.location.search)
    requestAllData = (URLqueries.get('q') ? true : requestAllData) // 该query存在则拉取所有数据
    getAllStockItems(requestAllData).then(result => {
        if (result.acknowledged) {
            table.clear().draw()
            let results = result.resultSet
            stockList = result.resultSet
            table.clear().draw()
            table.column(2).order('asc');
            for (let index = 0; index < results.length; index++) {
                const element = results[index];
                if (document.querySelector("#filterdate").value !== "") {
                    if (element.loggingTime && new Date(element.loggingTime) < new Date(document.querySelector("#filterdate").value)) {
                        continue;
                    }
                }
                table.row.add([
                    `<a href="#" data-bs-ponumber="${(element.productCode ? element.productCode : "")}" class="table_action_search">
                        ${(element.productCode ? element.productCode : "")}</a>`+
                    (element.hasOwnProperty("comments") || element.hasOwnProperty("quarantine") ? `<span>`+
                        (element.hasOwnProperty("comments") && element.comments.length > 0 ? `<i class="ti ti-message-dots"></i>`: "") +
                        (element.hasOwnProperty("quarantine") && element.quarantine === 1 ?
                            `<i class="ti ti-zoom-question"></i>`
                            : (element.quarantine === -1 ? `<i class="ti ti-zoom-check-filled"></i>`: "")) +
                        `</span>` : "" )
                    + "<br>" + `${element.productName ? (element.productName.length > 30 ? String(element.productName).substring(0,32)+'...' : element.productName) : ""}` ,
                    (element.bestbefore ? new Date(element.bestbefore).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' }) : ""),
                    (element.bestbefore ? new Date(element.bestbefore).getTime() : ""),
                    `${element.hasOwnProperty("quantity") ? element.quantity + " " + (element.quantityUnit ? element.quantityUnit.replace("carton","ctn").replace("bottle","btl") : "") : ""}`+'<br>'+
                    (element.shelfLocation ? `<a href=../stocks/location.html?location=${element.shelfLocation}>${element.shelfLocation}</a>`: '') ,
                    `<small>${(element.hasOwnProperty("createTime") ? "A:"+new Date(element.createTime).toLocaleDateString('en-AU',{ timeZone: 'Australia/Sydney' }) : "")}</small>`+
                    `<small>${(element.hasOwnProperty("removeTime") && element.removed === 1 ? "<br>R:"+new Date(element.removeTime).toLocaleDateString('en-AU',{ timeZone: 'Australia/Sydney' }) : "")}</small>`,
                    `<small>${(element.productLabel ? element.productLabel : "")}</small>`+
                    `<small><a href="#" data-bs-ponumber="${(element.POnumber ? element.POnumber : "")}" class="table_action_search">
                        ${(element.POnumber ? "<br>"+element.POnumber : "")}${(element.sequence ? "-"+element.sequence : "")}</a></small>`,
                    `<a href="#" class="table_actions table_action_edit" data-bs-toggle="modal" data-bs-target="#editModal" data-bs-itemid="${element._id}" >View/Edit</a>` +
                    (element.removed < 1 ? `
                    <a href="#" class="table_actions table_action_remove" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-itemid="${element._id}">Mark used</a>
                    ` : `<a href="#" class="table_actions table_action_revert" data-bs-toggle="modal" data-bs-target="#revertModal" 
                        data-bs-itemid="${element._id}" data-bs-shelf="${(element.shelfLocation ? element.shelfLocation : "")}">Revert</a>`) +
                    `<a href="#" class="table_actions table_action_print" data-bs-itemid="${element._id}">Print Label</a>`
                ]).draw(false);
            }
            createAlert("success", "Table has been updated", 3000)
        } else {
            createAlert("danger", "Disagree fetched data", 5000)
        }
    }).then(function(){
        document.querySelectorAll(".table_action_search").forEach(eachElement=>{
            eachElement.addEventListener("click",function(ev){
                ev.preventDefault()                                                                                                              
                table.search(eachElement.getAttribute("data-bs-ponumber")).draw()
            })
        })

    //     Regenerate Label
        document.querySelectorAll(".table_action_print").forEach(eachElement => {
            eachElement.addEventListener("click", function (ev) {
                try {
                    let elementDatabaseId = eachElement.getAttribute("data-bs-itemid")
                    generateLabelToPDF(elementDatabaseId)
                } catch (e) {
                    console.error("Error when attempting generate label:", e)
                }
            })
        })
        
        table.on("draw", function(){
            document.querySelectorAll(".table_action_print").forEach(eachElement => {
                eachElement.addEventListener("click", function (ev) {
                    try {
                        let elementDatabaseId = eachElement.getAttribute("data-bs-itemid")
                        generateLabelToPDF(elementDatabaseId)
                    } catch (e) {
                        console.error("Error when attempting generate label:", e)
                    }
                })
            })
        })
    })
}

function generateLabelToPDF(elementDatabaseId){
    try {
        var doc = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: 'a4',
            compress: true
        })
        for (let i = 0; i < stockList.length; i++) {
            if (new ObjectId(stockList[i]._id).toString() === elementDatabaseId) {
                let generateElement = stockList[i]
                if (generateElement.hasOwnProperty("_id")) {
                    delete generateElement._id
                }
                if (generateElement.hasOwnProperty("changelog")) {
                    delete generateElement.changelog
                }
                if (generateElement.hasOwnProperty("locationRecords")) {
                    delete generateElement.locationRecords
                }
                if (generateElement.hasOwnProperty("createTime")) {
                    delete generateElement.createTime
                }
                if (generateElement.hasOwnProperty("loggingTime")) {
                    delete generateElement.loggingTime
                }

                var initTextSize = 100
                doc.setFontSize(initTextSize).setFont("Helvetica", "normal")
                var productnameText = generateElement.productName ? generateElement.productName.slice(0, 30) : ""
                while (doc.getTextDimensions(productnameText).w > doc.internal.pageSize.getWidth() - 40) {
                    initTextSize -= 5;
                    doc.setFontSize(initTextSize).setFont("Helvetica", 'normal')
                }
                if (generateElement.productName.length <= 30) {
                    while (doc.getTextDimensions(productnameText).w > doc.internal.pageSize.getWidth() - 40) {
                        initTextSize -= 5;
                        doc.setFontSize(initTextSize).setFont("Helvetica", 'normal')
                    }
                    doc.text(generateElement.productName, doc.internal.pageSize.getWidth() / 2, 90, {lineHeightFactor: 0.9, align: "center"})
                } else {
                    while (doc.getTextDimensions(productnameText).w > doc.internal.pageSize.getWidth() - 40) {
                        initTextSize -= 5;
                        doc.setFontSize(initTextSize).setFont("Helvetica", 'normal')
                    }
                    doc.text(`${generateElement.productCode} - ${generateElement.productName.slice(0, 40)}...`, 15, 75, {
                        lineHeightFactor: 1.1,
                        align: "left",
                        maxWidth: doc.internal.pageSize.width - 30
                    })
                    generateElement.productName = `${generateElement.productCode} - ${generateElement.productName.slice(0, 40)}...`
                }

                let unitText = (generateElement.quantityUnit ? generateElement.quantityUnit.toLowerCase() : "")
                let UnitConvert = [
                    {unit: "bag", abberv: "bag", display: "bags"},
                    {unit: "box", abberv: "box", display: "boxes"},
                    {unit: "bottle", abberv: "btl", display: "btls"},
                    {unit: "carton", abberv: "ctn", display: "ctns"},
                    {unit: "pair", abberv: "pair", display: "pairs"},
                    {unit: "piece", abberv: "pc", display: "pcs"},
                    {unit: "roll", abberv: "roll", display: "rolls"}
                ]
                var unitResult = UnitConvert.find(element => element.unit.includes(unitText.toLowerCase()) || element.abberv.includes(unitText.toLowerCase()))
                if (unitResult) {
                    unitText = unitResult.display
                }

                doc.setFontSize(90).setFont("Helvetica", 'normal');
                doc.text(`${generateElement.quantity ? generateElement.quantity : ""} ${generateElement.quantityUnit ? generateElement.quantityUnit.toLowerCase() : ""}`,
                    20, doc.internal.pageSize.getHeight() - 190, {lineHeightFactor: 0.9});
                doc.setFontSize(90).setFont("Helvetica", 'normal')   // ↙Bestbefore
                doc.text(generateElement.bestbefore ? generateElement.bestbefore : "", 15, doc.internal.pageSize.getHeight() - 115, {lineHeightFactor: 0.9});
                doc.setFontSize(72).setFont("courier", 'bold')     // ↙Label
                doc.text(`${generateElement.productLabel ? generateElement.productLabel.slice(-7): ""}`, 15, doc.internal.pageSize.getHeight() - 55, {lineHeightFactor: 0.85});
                doc.setFontSize(36).setFont("courier", 'bold')      //  ↗Label
                doc.text(`${generateElement.POnumber ? generateElement.POnumber : ""} / ${generateElement.productLabel.toUpperCase().substring(0, 7)}`, doc.internal.pageSize.getWidth() - 20, 30, {
                    lineHeightFactor: 0.75,
                    align: "right"
                });

                let qrSize = 250
                let qrBase64 = QRCodeObjectGenerateV3(generateElement)
                doc.addImage(qrBase64, "PNG", doc.internal.pageSize.getWidth() - qrSize, doc.internal.pageSize.getHeight() - qrSize, qrSize, qrSize)

                doc.setFontSize(12).setFont("Helvetica", 'normal')
                let bottomVerfiyText = ["V3_Node", "P:" + (generateElement.POnumber ? generateElement.POnumber : " "),
                    "C:" + (generateElement.productCode ? generateElement.productCode : " "), "Q:" + (generateElement.quantity ? generateElement.quantity : " ") + unitText,
                    "E:" + (generateElement.bestbefore ? generateElement.bestbefore.replaceAll("-", "") : "*")]
                doc.text(bottomVerfiyText.toString(), 20, doc.internal.pageSize.getHeight() - 30, {lineHeightFactor: 0.8});
                let bottomTextPart2 = ["L:" + (generateElement.productLabel ? generateElement.productLabel : "")]
                doc.text(bottomTextPart2.toString(), 20, doc.internal.pageSize.getHeight() - 20, {lineHeightFactor: 0.8});
                let filename = `GeneratedLabel.pdf`
                doc.save(filename, {returnPromise: true}).then(() => {
                    ipcRenderer.send('print-pdf', filename)
                });
                break;// After finished generate PDF
            }
        }
    } catch (e) {
        console.error("Error when attempting generate label:", e)
    }
}

function QRCodeObjectGenerateV3(qrObject){
    // base64+JSON格式：https://127.0.0.1?item=base64{JSON字符串}
    let remoteServerAddress = "http://192.168.0.254:3000/qrstock?item="
    try {
        var qrText = remoteServerAddress + btoa(JSON.stringify(qrObject))
        var qrcode = new QRious({level: "L", size: 300, value: qrText, padding: 5});
        return qrcode.toDataURL("image/png")
    } catch (e) {
        console.error("Error when generating QRCode:",e)
        return null
    }
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
    } catch (err) {
        result['message'] = err
    } finally {
        await client.close()
        document.querySelector("#loadingStatus").style.display = "none"
    }
    return result
}

document.querySelector("#filterdate").addEventListener("change", (ev)=>{
    loadStockInfoToTable()
});

function createAlert(status, text, time = 5000){
    let alertAnchor = document.querySelector("#alertAnchor")
    let alertElement = document.createElement("div")
    alertElement.className= "alert alert-primary alert-dismissible bg-success text-white border-0 fade show";
    alertElement.role = "alert";
    let svgImage = document.createElement("svg")
    svgImage.className = "bi flex-shrink-0 me-2"
    svgImage.width = 24
    svgImage.height = 24
    svgImage.role = "img"
    svgImage.ariaLabel = "Info: "
    svgImage.innerHTML = `<use xlink:href="#info-fill"/>`

    let texts = document.createElement("span")
    texts.innerHTML = text ? text : ""
    if (status === "success"){
        alertElement.className= "alert alert-success alert-dismissible bg-success text-white border-0 fade show"
        svgImage.ariaLabel = "Success: "
        svgImage.innerHTML = `<use xlink:href="#check-circle-fill"/>`
    } else if (status === "danger"){
        alertElement.className= "alert alert-danger alert-dismissible bg-danger text-white border-0 fade show"
        svgImage.ariaLabel = "Danger: "
        svgImage.innerHTML = `<use xlink:href="#exclamation-triangle-fill"/>`
    } else if (status === "secondary"){
        alertElement.className= "alert alert-secondary alert-dismissible bg-secondary text-white border-0 fade show"
        svgImage.ariaLabel = "Info: "
        svgImage.innerHTML = `<use xlink:href="#info-fill"/>`
    }
    alertElement.append(svgImage)
    alertElement.append(text)
    alertAnchor.append(alertElement)
    setTimeout(function () {
        if (alertElement){
            alertElement.style.display = 'none'
        }
    }, isNaN(time) ? 3000 : time)
}
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

let fullResultSet = [];
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
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-itemId")
    editModalObject.labelId = requestLabelId
    document.querySelector("#editModal_submitBtn").disabled = true
    document.querySelector("#editModal_submitBtn").textContent = "Submit"
    document.querySelector("#editModal .modal-title").textContent = `Loading Product Information`
    let originProperty = {}
    for (let i = 0; i < fullResultSet.length; i++) {
        if ((fullResultSet[i]._id).toString() === requestLabelId){
            originProperty = fullResultSet[i] //找到了目标信息，继续填充
            editModalObject.originProps = fullResultSet[i]
            document.querySelector("#editModal .modal-title").textContent = `Edit Stock: ${fullResultSet[i].productName} | StockID: ${fullResultSet[i].productLabel.slice(-7)}`
            document.querySelector("#editModal .modal-body #productInfoText").textContent = `${fullResultSet[i].productCode} - ${fullResultSet[i].productName}`
            document.querySelector("#editModal .modal-body #labelIDText").textContent = `${fullResultSet[i].productLabel}`
            document.querySelector("#editModal #editModal_deleteBtn").setAttribute("data-bs-itemId", fullResultSet[i]._id)
            document.querySelector("#modalEditQuantity").value = (fullResultSet[i].hasOwnProperty("quantity") ? fullResultSet[i].quantity : "")
            document.querySelector("#modalEditUnit").value = (fullResultSet[i].hasOwnProperty("quantityUnit") ? fullResultSet[i].quantityUnit : "")
            document.querySelector("#modalEditBestbefore").value = (fullResultSet[i].hasOwnProperty("bestbefore") ? fullResultSet[i].bestbefore : "")
            document.querySelector("#modelEditLocation").value = (fullResultSet[i].hasOwnProperty("shelfLocation") ? fullResultSet[i].shelfLocation : "")
            document.querySelector("#modelEditPOnumber").value = (fullResultSet[i].hasOwnProperty("POnumber") ? fullResultSet[i].POnumber : (fullResultSet[i].hasOwnProperty("POIPnumber") ? fullResultSet[i].POIPnumber : ""))
            document.querySelector("#modelEditUnitprice").value = (fullResultSet[i].hasOwnProperty("unitPrice") ? fullResultSet[i].unitPrice : "")
            document.querySelector("#modelEditCheckRemoved").checked = (fullResultSet[i].hasOwnProperty("removed") && fullResultSet[i].removed === 1)
            document.querySelector("#modelEditCreateTime").value = (fullResultSet[i].hasOwnProperty("createTime") ? getDateTimeforInput(fullResultSet[i].createTime) : "")
            document.querySelector("#group_removeTime").style = (document.querySelector("#modelEditCheckRemoved").checked ? "" : "display:none")
            document.querySelector("#modelEditRemoveTime").value = (fullResultSet[i].hasOwnProperty("removeTime") ? getDateTimeforInput(fullResultSet[i].removeTime) : "")

            document.querySelector('#modalEdit_quarantineYes').checked = (!!(fullResultSet[i].hasOwnProperty("quarantine") && fullResultSet[i].quarantine === 1))
            document.querySelector('#modalEdit_quarantineNo').checked = (!!(fullResultSet[i].hasOwnProperty("quarantine") && fullResultSet[i].quarantine === 0))
            document.querySelector('#modalEdit_quarantineFinished').checked = (!!(fullResultSet[i].hasOwnProperty("quarantine") && fullResultSet[i].quarantine === -1))

            document.querySelector("#modelEditComments").value = (fullResultSet[i].hasOwnProperty("comments") ? fullResultSet[i].comments : "")
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
    var itemId = ev.relatedTarget.getAttribute("data-bs-itemId")
    document.querySelector("#removeModal_labelid").value = itemId
    document.querySelector("#removeModal_btnConfirm").disabled = false
    document.querySelector("#removeModal_btnConfirm").textContent = "Confirm"

    for (let i = 0; i < fullResultSet.length; i++) {
        if ((fullResultSet[i]._id).toString() === itemId){
            document.querySelector("#removeModal .modal-body p").textContent = `Are you sure to mark ${fullResultSet[i].productName} with label ending in ${fullResultSet[i].productLabel.slice(-7)} has been used?`
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
    var itemId = ev.relatedTarget.getAttribute("data-bs-itemId")
    let hiddenInput = revertModal.querySelector("#revertLabelid")
    hiddenInput.value = itemId

    document.querySelector("#revertLocation").value = ev.relatedTarget.getAttribute("data-bs-shelf")
    document.querySelector("#revertModal_btnConfirm").disabled = false
    document.querySelector("#revertModal_btnConfirm").textContent = "Confirm"

    for (let i = 0; i < fullResultSet.length; i++) {
        if ((fullResultSet[i]._id).toString() === itemId){
            document.querySelector("#revertModal .modal-body p").textContent = `Are you sure to revert delete of ${fullResultSet[i].productName} with label ending in ${fullResultSet[i].productLabel.slice(-7)}?`
        }
    }
})
revertModal.querySelector("#revertModal_btnConfirm").addEventListener("click", async function (ev) {
    ev.preventDefault()
    let labelId =  ev.relatedTarget.getAttribute("data-bs-itemId")
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
    var itemId = ev.relatedTarget.getAttribute("data-bs-itemId")
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
            fullResultSet = result.resultSet
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
                    `<a href="#" class="table_actions table_action_edit" data-bs-toggle="modal" data-bs-target="#editModal" data-bs-itemId="${element._id}" >View/Edit</a>` +
                    (element.removed < 1 ? `
                    <a href="#" class="table_actions table_action_remove" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-itemId="${element._id}">Mark used</a>
                    ` : `<a href="#" class="table_actions table_action_revert" data-bs-toggle="modal" data-bs-target="#revertModal" 
                        data-bs-itemId="${element._id}" data-bs-shelf="${(element.shelfLocation ? element.shelfLocation : "")}">Revert</a>`)
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
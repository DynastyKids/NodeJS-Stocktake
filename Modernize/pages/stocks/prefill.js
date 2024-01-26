const {ipcRenderer} = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId, Decimal128} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

let table = new DataTable('#table', {
    responsive: true,
    pageLength: 25,
    lengthMenu: [10, 15, 25, 50, 100],
    columns: [{"width": "25%"}, {"width": "15%"}, {"width": "15%"}, {"width": "10%"}, {"width": "20%"}, null],
    order: [[4, 'desc']],
});

let prefillLists = []
let productLists = []

document.addEventListener("DOMContentLoaded", async function () {
    await redrawTable(true)
    await fetchProductsList(true)

    createDataList(productLists)
    document.querySelector("#modalEdit_productCode").setAttribute("list","productCodeElements")
    document.querySelector("#modalEdit_productName").setAttribute("list","productNameElements")
})

async function redrawTable(forced = false) {
    document.querySelector("#loadingStatus").style = ""
    table.clear().draw()
    if (prefillLists.length <= 0 || forced){
        prefillLists = await fetchPrefillDatas(true)
    }
    prefillLists.forEach(eachRow => {
        table.row.add([
            (eachRow.stock.productCode ? eachRow.stock.productCode : ``) + (eachRow.stock.productCode && eachRow.stock.productName ? ` - ` : ``) + (eachRow.stock.productName ? eachRow.stock.productName : ``),
            (eachRow.stock.quantity ? eachRow.stock.quantity + ` ` + (eachRow.stock.quantityUnit ? eachRow.stock.quantityUnit : ``) : ``),
            (eachRow.stock.bestbefore ? new Date(eachRow.stock.bestbefore).toLocaleDateString("en-AU") : ``),
            (eachRow.stock.POnumber ? eachRow.stock.POnumber : ``)+(eachRow.stock.seq ? `<br><small>${eachRow.stock.seq}</small>` : ``),
            (eachRow.stock.productLabel ? eachRow.stock.productLabel.substring(0,15) : ``)+(eachRow.stock.createTime ? `<br><small>${new Date(eachRow.stock.createTime).toLocaleString('en-AU')}</small>` : (eachRow.stock.loggingTime ? `<br><small>${new Date(eachRow.stock.loggingTime).toLocaleString('en-AU')}</small>` : ``)),
            `<a href="#" class="table_actions table_action_remove" data-bs-labelId="${eachRow.stock.productLabel}" data-bs-toggle="modal" data-bs-target="#editModal" data-bs-modalaction="edit" style="margin: 0 2px 0 2px">Patch</a>` +
            `<a href="#" class="table_actions table_action_remove" data-bs-labelId="${eachRow.stock.productLabel}" data-bs-toggle="modal" data-bs-target="#removeModal" style="margin: 0 2px 0 2px">Remove</a>`
        ]).draw(false)
    })
    document.querySelector("#loadingStatus").style = "display: none"
}

document.querySelector("#act_reloadTable").addEventListener("click",async (ev)=>{
    await redrawTable(true)
})

function createDataList(productsArray = []){
    let productCodeElements = document.createElement("datalist")
    productCodeElements.id = "productCodeElements"
    let productNameElements = document.createElement("datalist")
    productNameElements.id = "productNameElements"
    productsArray.forEach(eachElement =>{
        var newCodeElement = document.createElement("option")
        if (eachElement.productCode){
            newCodeElement.value = eachElement.productCode
            newCodeElement.innerText = (eachElement.description ? eachElement.description : `${eachElement.productCode} - ${eachElement.labelname}`)
            productCodeElements.append(newCodeElement)
        }
        var newProductElement = document.createElement("option")
        if (eachElement.productCode){
            newProductElement.value = eachElement.labelname
            newProductElement.innerText = (eachElement.description ? eachElement.description : `${eachElement.productCode} - ${eachElement.labelname}`)
            productNameElements.append(newProductElement)
        }
    })
    document.querySelector("body").append(productCodeElements)
    document.querySelector("body").append(productNameElements)
}

/* 
*  Edit Modal Realted
* JAN24 Update: Add Modal has merged with Edit Modal
* 
* Req: Item Label ID
* 
* */
let editModalTarget = {}
let editModal = document.querySelector("#editModal")
editModal.addEventListener("show.bs.modal", async (ev) => {
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Loading stock informations..."
    editModalTarget = {}
    editModal.querySelectorAll("input").forEach(eachInputElement=>{
        if (eachInputElement.type === "text" || eachInputElement.type === "number"){
            eachInputElement.value = ""
        }

    })
    if (ev.relatedTarget.hasAttribute("data-bs-modalaction")) {
        editModal.querySelector("#modalEditAdd").value = ev.relatedTarget.getAttribute("data-bs-modalaction")
        if (ev.relatedTarget.getAttribute("data-bs-modalaction") === "add") { // Adding New product
            editModal.querySelector("#modalEditAdd").value = "add"
            editModal.querySelector("#modalEdit_btnSubmit").disabled = false
            editModal.querySelector("#modalEdit_btnSubmit").textContent = "Submit"
            editModal.querySelector("#modalEdit_labelid").disabled = false
            editModal.querySelector("#editModal .modal-title").textContent = `Add new stock prefill information`
        } else { // Modify based on existing product
            editModal.querySelector("#modalEditAdd").value = "edit"
            editModal.querySelector("#modalEdit_btnSubmit").disabled = true
            editModal.querySelector("#modalEdit_btnSubmit").textContent = "Please Wait"
            editModal.querySelector("#modalEdit_labelid").disabled = true
            editModal.querySelector("#editModal .modal-title").textContent = `Loading Product Information`
            let requestLabelId = ev.relatedTarget.hasAttribute("data-bs-labelId") ?
                ev.relatedTarget.getAttribute("data-bs-labelId") : ev.relatedTarget.getAttribute("data-bs-labelid")
            for (const eachElement of prefillLists) {
                if (eachElement.hasOwnProperty("stock") && eachElement.stock.productLabel === requestLabelId) {
                    editModalTarget = eachElement

                    editModal_write(eachElement.stock)
                    editModal.querySelector("#modalEdit_btnSubmit").textContent = "Submit"
                    editModal.querySelector("#modalEdit_btnSubmit").disabled = false
                    break;
                }
            }
        }

        if (editModal.querySelector("#modelCheck_customTime").checked) {
            editModal.querySelector("#modelEdit_createTime").style = ""
            if (editModal.querySelector("#modalEdit_checkRemove").checked) {
                editModal.querySelector("#modelEdit_removeTime").style = ""
            } else {
                editModal.querySelector("#modelEdit_removeTime").style = "display: none"
            }
        } else {
            editModal.querySelector("#modelEdit_removeTime").style = "display: none"
            editModal.querySelector("#modelEdit_createTime").style = "display: none"
        }
    }
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Ready"
})
editModal.querySelector("#modalEdit_labelid").addEventListener("change",async function (ev) {
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Checking existing stocks records"
    // After change, found on existing stock list to see if
    let inputValue = ev.target.value
    let existResults = await fetchStockInfoByLabelId(inputValue)
    if (existResults.stocks.length >= 1){
        editModal.querySelector("#modalEditAdd").value = "edit"
        editModal.querySelector(".modal-title").textContent = `Duplicate Stock: ${(existResults.stocks[0].hasOwnProperty("productName") ? existResults.stocks[0].productName: "")}`
        editModal_write(existResults.stocks[0])
        editModal.querySelector("#modalEdit_btnSubmit").disabled = true
        editModal.querySelector("#modalEdit_btnSubmit").textContent = "Duplicate in-stock info"
    }
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Ready"
})
editModal.querySelector("#modalEdit_labelid").addEventListener("input",async function (ev) {
    editModal.querySelector("#modalEdit_labelid").value.replaceAll(" ","")
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Checking existing "
    let inputValue = ev.target.value
    var found = false
    for (const prefill of prefillLists) {
        if (prefill.stock.productLabel === inputValue){
            editModal.querySelector("#modalEditAdd").value = "edit"
            editModalTarget = prefill
            editModal.querySelector(".modal-title").textContent = `Edit Stock: ${editModalTarget.stock.productName}`
            editModal_write(editModalTarget.stock)

            editModal.querySelector("#modalEdit_btnSubmit").textContent = "Submit"
            editModal.querySelector("#modalEdit_btnSubmit").disabled = false
            found = true
            break;
        }
    }
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Ready"
    return found
})
editModal.querySelector("#modalEdit_productCode").addEventListener("input", function(ev){
    let inputValue = ev.target.value
    productLists.forEach(eachProduct=>{
        if (eachProduct.hasOwnProperty("productCode") && eachProduct.productCode === inputValue){
            if (eachProduct.hasOwnProperty("palletQty")) { document.querySelector("#modalEdit_quantity").value = eachProduct.palletQty ? parseInt(eachProduct.palletQty) : "" }
            if (eachProduct.hasOwnProperty("unit")) { document.querySelector("#modalEdit_quantityUnit").value = eachProduct.unit }
            if (eachProduct.hasOwnProperty("unitPrice")) { document.querySelector("#modalEdit_unitPrice").value = parseFloat(eachProduct.unitPrice) }

            if (eachProduct.hasOwnProperty("labelname") && document.querySelector("#modalEdit_productName").value.toString() !== eachProduct.labelname){
                document.querySelector("#modalEdit_productName").value = eachProduct.labelname
            }
        }
    })
})
editModal.querySelector("#modalEdit_productName").addEventListener("input", function(ev){
    let inputValue = ev.target.value
    productLists.forEach(eachProduct=>{
        if (eachProduct.hasOwnProperty("labelname") && eachProduct.labelname === inputValue){
            if (eachProduct.hasOwnProperty("palletQty")) { document.querySelector("#modalEdit_quantity").value = eachProduct.palletQty ? parseInt(eachProduct.palletQty) : "" }
            if (eachProduct.hasOwnProperty("unit")) { document.querySelector("#modalEdit_quantityUnit").value = eachProduct.unit }
            if (eachProduct.hasOwnProperty("unitPrice")) { document.querySelector("#modalEdit_unitPrice").value = parseFloat(eachProduct.unitPrice) }
            if (eachProduct.hasOwnProperty("productCode")){ document.querySelector("#modalEdit_productCode").value = eachProduct.productCode }
        }
    })
})
editModal.querySelector("#modalEditDefaultPrice").addEventListener("click", (ev) => {
    if (editModalTarget.hasOwnProperty("productCode")){
        for (const product of productLists) {
            if (product.productCode === editModalTarget.productCode){
                document.querySelector("#modalEdit_unitPrice").value = product.unitPrice
            }
        }
    }
})
editModal.querySelector("#editModalResetBtn").addEventListener("click",(ev)=>{
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Clear Forms"
    editModalTarget = {}
    editModal.querySelectorAll("input").forEach(eachInput=>{
        if (eachInput.type === "text" || eachInput.type === "number" || eachInput.type === "date"){
             eachInput.value = ""
        }
    })
    editModal.querySelector("textarea").textContent=``
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Ready"
})
editModal.querySelector("#editModalSave").addEventListener("click", async (ev) => {
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Processing Data"
    let result = {}
    let productInformation = editModal_read()
    try{
        if (productInformation.hasOwnProperty("productLabel")){
            result.delete = await preloadlog_delete(productInformation.productLabel)
            result.add = await preloadlog_add(productInformation)
        }
        if (result.delete.acknowledged && result.add.acknowledged){
            bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
        } else if (!result.delete.acknowledged){
            editModal.querySelector("#modalEdit_statusTxt").textContent = `Failed on ${!result.delete.acknowledged ? "delete old data": ""} / ${!result.add.acknowledged ? "pushing new data": ""}`
        }
    } catch (e) {
        console.error("Error occurred when saving data at edit modal: ",e)
        editModal.querySelector("#modalEdit_statusTxt").textContent = "Error occurred when saving data at edit modal, check console for details"
    }
    await redrawTable(true)
})
editModal.querySelector("#modalEdit_btnSubmit").addEventListener("click", async (ev) => {
    editModal.querySelector("#modalEdit_statusTxt").textContent = "Processing Data"
    editModal.querySelector("#modalEdit_btnSubmit").disabled = true
    editModal.querySelector("#modalEdit_btnSubmit").textContent = "Updating"
    let result = {action: editModal.querySelector("#modalEditAdd").value, delete: {}, add: {}}
    try{
        let productInformation = editModal_read()
        if (editModal.querySelector("#modalEditAdd").value === "edit"){
            editModal.querySelector("#modalEdit_btnSubmit").textContent = "Popping out data from pre-load collection"
            result.delete = await preloadlog_delete(productInformation.productLabel)
            if (!result.delete.acknowledged){
                createAlert("warning","Stock information in prefill collection was failed to remove.")
            }
        }
        editModal.querySelector("#modalEdit_btnSubmit").textContent = "Pushing stock to collection."
        result.add = await pollinglog_add(productInformation)
    } catch (e) {
        console.error("Error occurred when submitting data at edit modal: ", e)
        editModal.querySelector("#modalEdit_statusTxt").textContent = "Error occurred when submitting data at edit modal, check console for details."
    }

    if (result.add.acknowledged){
        bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
        createAlert("success","Stock information has successfully added to current stock collection.")
    }
    await redrawTable(true)
})

editModal.querySelector("#modalEdit_checkRemove").addEventListener("change", (ev)=>{
    if(editModal.querySelector("#modalEdit_checkRemove").checked && editModal.querySelector("#modelCheck_customTime").checked){
        editModal.querySelector("#group_consumeTime").style = ""
    } else {
        editModal.querySelector("#group_consumeTime").style = "display:none"
    }
})

editModal.querySelector("#modelCheck_customTime").addEventListener("change", (ev)=>{
    if (editModal.querySelector("#modelCheck_customTime").checked){
        editModal.querySelector("#modelEdit_createTime").style = ""
        if(editModal.querySelector("#modalEdit_checkRemove").checked){
            editModal.querySelector("#group_consumeTime").style = ""
        } else {
            editModal.querySelector("#group_consumeTime").style = "display: none"
        }
    } else {
        editModal.querySelector("#modelEdit_createTime").style = "display: none"
        editModal.querySelector("#group_consumeTime").style = "display: none"
    }

})

function editModal_read(){
    let element = {}
    editModal.querySelectorAll("input").forEach(eachInput=>{
        var targetField = eachInput.getAttribute("data-bs-targetField")
        if (targetField != null){
            if (targetField === "quarantine" && eachInput.checked){
                element[targetField] = parseInt(editModal.querySelector("input[data-bs-targetField='quarantine']:checked").value)
            } else if (targetField === "removed"){
                element[targetField] = eachInput.checked ? 1 : 0
            } else if (targetField === "removedTime" && element.removed && element.removed === 1){
                element[targetField] = new Date(eachInput.value)
            } else if (targetField === "quantity"){
                element[targetField] = parseInt(eachInput.value)
            } else if (targetField === "unitPrice"){
                element[targetField] = Decimal128.fromString(String(eachInput.value))
            } else {
                element[targetField] = String(eachInput.value)
            }
        }
    })
    if(editModal.querySelector("textarea").textContent.toString().length > 0){
        element.notes = editModal.querySelector("textarea").textContent
    }

    Object.keys(element).forEach(eachKey =>{
        if (String(element[eachKey]).length <= 0){
            delete element[eachKey]
        }
    })

    return element
}
function editModal_write(element){
    editModal.querySelectorAll("input").forEach(eachInput=> {
        var targetField = eachInput.getAttribute("data-bs-targetField")

        if (targetField === "quarantine" && element.quarantine === 1){
            if (element.quarantine === 1){
                document.querySelector("#modalEdit_quarantineYes").checked = true
            } else if (element.quarantine === -1){
                document.querySelector("#modalEdit_quarantineFinished").checked = true
            } else {
                document.querySelector("#modalEdit_quarantineNo").checked = true
            }
        } else if (targetField === "removed"){
            editModal.querySelector("#modelEdit_removeTime").checked =  (element.removed === 1)
        } else {
            eachInput.value = element.hasOwnProperty(targetField) ? element[targetField] : ""
        }

        if (targetField === "quantity" && element.hasOwnProperty("quantity")){
            eachInput.value = parseInt(element[targetField])
        } else if (element.hasOwnProperty(targetField)){
            eachInput.value = element[targetField]
        }
    })
}

document.querySelector("#removeModal").addEventListener("show.bs.modal", function (ev) {
    if (ev.relatedTarget) {
        prefillLists.forEach(eachdata => {
            if (eachdata.productLabel === ev.relatedTarget.getAttribute("data-bs-labelId")){
                //     Change text
                document.querySelector("#removeModal .modal-body p").innerHTML =
                    `Are you sure to remove the '${eachdata.productName}' with label ID ends in '${eachdata.productLabel.slice(-7)}?'<br>This action CANNOT be reverted.`
            }
        })
        document.querySelector("#removeModal_labelid").value = ev.relatedTarget.getAttribute("data-bs-labelId")
    }
    //     No label ID captures, may request for removeAll / remove Duplicate
    document.querySelector("#removeModal_btnConfirm").disabled = false
    document.querySelector("#removeModal_btnCancel").disabled = false
    document.querySelector("#removeModal_btnConfirm").textContent = "Confirm"
})
document.querySelector("#removeModal_btnConfirm").addEventListener("click", async function (ev) {
    // 收到用户的确认请求，移除该库存
    ev.preventDefault()
    let labelId = document.querySelector("#removeModal_labelid").value
    let removeAllRequest = document.querySelector("#removeModal_allLabels").checked
    let removeDuplicateRequest = document.querySelector("#removeModal_duplicateLabels").checked
    document.querySelector("#removeModal_btnCancel").disabled = true
    document.querySelector("#removeModal_btnConfirm").disabled = true
    document.querySelector("#removeModal_btnConfirm").textContent = "Updating"
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1,  useNewUrlParser: true,  useUnifiedTopology: true,  retryWrites: false }
    });
    if (labelId.toString().length > 0) {
        try {
            await client.connect();
            const session = client.db(targetDB).collection("preloadlog");
            let result = await session.deleteMany({productLabel: labelId})
            if (result.acknowledged && result.deletedCount > 0){
                createAlert("success", `${result.deletedCount} stock has been successfully deleted.`)
            } else {
                createAlert("warning", `${labelId} delete failed, response as ${JSON.stringify(result)}`)
            }
        } catch (e) {
            console.error(`Remove Stock Error when process: ${labelId};`, e)
        } finally {
            await client.close()
            bootstrap.Modal.getInstance(document.querySelector("#removeModal")).hide()
        }
    } else if(removeDuplicateRequest){
        //     拉取当前列表和Stock表格，如果发现stock中已经存在了label和productCode均相同的产品，则删除prefill表格中的对应条目
        let prefillList = await fetchPrefillDatas()
        createAlert("info", `Checking databases, this may take a while`, 5000)
        for (let i = 0; i < prefillList.length; i++) {
            document.querySelector("#removeModal_StatusText").textContent = `Checking duplicate items. Processing ${i} of ${prefillList.length} items.`
            let stocksResults = await fetchStockInfoByLabelId(prefillList[i].productLabel)
            if (stocksResults.stocks.length > 0){
                await preloadlog_delete(prefillList[i].productLabel)
            }
        }
        createAlert("success", `Prefill Duplicate data check has finished`, 5000)
    } else if(removeAllRequest){
        let prefillList = await fetchPrefillDatas()
        createAlert("info", `Clear Databases`, 5000)
        for (let i = 0; i < prefillList.length; i++) {
            document.querySelector("#removeModal_StatusText").textContent = `Delete all items. Deleting ${i} of ${prefillList.length} items.`
            await preloadlog_delete(prefillList[i].productLabel)
        }
        createAlert("success", `Prefill Duplicate data check has finished`, 5000)
    }
    await redrawTable(true);
})

document.querySelector("#act_deleteAll").addEventListener("click", async function(ev){
    let modal = new bootstrap.Modal(document.querySelector("#removeModal") ,{})
    document.querySelector("#removeModal_labelid").value = ""
    document.querySelector("#removeModal_allLabels").checked = true
    document.querySelector("#removeModal_duplicateLabels").checked = false
    document.querySelector("#removeModal .modal-body p").innerHTML =
        `Are you sure to remove ALL prefill labels? <br>This action CANNOT be reverted.`
    modal.show()
})

document.querySelector("#act_deleteDuplicate").addEventListener("click", async function (ev) {
    let modal = new bootstrap.Modal(document.querySelector("#removeModal") ,{})
    document.querySelector("#removeModal_labelid").value = ""
    document.querySelector("#removeModal_allLabels").checked = false
    document.querySelector("#removeModal_duplicateLabels").checked = true
    document.querySelector("#removeModal .modal-body p").innerHTML =
        `Are you sure to remove duplicate labels that exists on both stock and prefill table? <br>This action CANNOT be reverted.`
    modal.show()
})

async function fetchPrefillDatas(forced = false) {
    let result = prefillLists
    if (forced || prefillLists.length <=0 ) {
        let client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        });
        try {
            await client.connect();
            const session = client.db(targetDB).collection("preloadlog");
            result = await session.find({}).toArray()
            prefillLists = result
        } catch (e) {
            console.error("Error when fetching preload data: ", e)
        } finally {
            await client.close()
        }
    }
    return result
}

async function fetchProductsList(forced = false) {
    let result = productLists
    if (forced || productLists.length <= 0) {
        let client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        });
        try {
            await client.connect();
            const session = client.db(targetDB).collection("products");
            result = await session.find({}).toArray()
            productLists = result
        } catch (e) {
            console.error("Error when fetching preload data: ", e)
        } finally {
            await client.close()
        }
    }
    return result
}

async function fetchStockInfoByLabelId(labelId = null){
    let result = { prefill:[] , stocks:[] }
    if (labelId.toString().length > 0){
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        try {
            await client.connect();
            let session = await client.db(targetDB)
            result = {
                stocks: await session.collection("pollinglog").find({productLabel: labelId}).toArray()
            }
        } catch (e) {
            console.error(`Fetching stock information error when attempt fetching: ${labelId};`, e)
        } finally {
            await client.close()
        }
    }
    return result
}

async function preloadlog_add(stockObject = {}){
    let result = {acknowledged:false, insertedId: null} // Using MongoDB response sample
    if(Object.keys(stockObject).length > 0){
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        try {
            await client.connect();
            const session = client.db(targetDB).collection("preloadlog");
            result = await session.insertOne({loggingTime:new Date(),stock: stockObject})
        } catch (e) {
            console.error(`Adding preload stock Error:`, e)
        } finally {
            await client.close()
        }
    }
    return result
}

async function preloadlog_delete(productLabelId = null) {
    let result = {acknowledged:false, deletedCount: 0} // Using MongoDB response sample
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        const session = client.db(targetDB).collection("preloadlog");
        result = await session.deleteMany({"stock.productLabel": productLabelId})
    } catch (e) {
        console.error(`Remove preload stock Error:`, e)
    } finally {
        await client.close()
    }
    return result
}

async function pollinglog_add(stockObject) {
    let result = {acknowledged: false, matchedCount: 0, modifiedCount: 0 }     // For UpdateMany field
    // let result = {acknowledged: false, insertedIds: []} // for InsertMany method
    if (Object.keys(stockObject).length > 0){
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        try {
            await client.connect();
            const pollingSession = client.db(targetDB).collection("pollinglog");
            result = await pollingSession.updateMany({productLabel: stockObject.productLabel}, {$set:stockObject}, {upsert: true})
            // result = await pollingSession.insertMany(stockObject)
        } catch (e) {
            console.error(`Insert Stock Error when process:;`, e)
        } finally {
            await client.close()
        }
    }
    return result
}

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
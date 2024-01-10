const {ipcRenderer} = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId, Decimal128} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();
const path = require('path');

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
    document.querySelector("#addModal_prodcode").setAttribute("list","productCodeElements")
    document.querySelector("#addModal_prodname").setAttribute("list","productNameElements")
})

async function redrawTable(forced = false) {
    document.querySelector("#loadingStatus").style = ""
    table.clear().draw()
    if (prefillLists.length <= 0 || forced){
        prefillLists = await fetchPrefillDatas(true)
    }
    prefillLists.forEach(eachRow => {
        table.row.add([
            (eachRow.productCode ? eachRow.productCode : ``) + (eachRow.productCode && eachRow.productName ? ` - ` : ``) + (eachRow.productName ? eachRow.productName : ``),
            (eachRow.quantity ? eachRow.quantity + ` ` + (eachRow.quantityUnit ? eachRow.quantityUnit : ``) : ``),
            (eachRow.bestbefore ? new Date(eachRow.bestbefore).toLocaleDateString("en-AU") : ``),
            (eachRow.POnumber ? eachRow.POnumber : ``)+(eachRow.seq ? `<br><small>${eachRow.seq}</small>` : ``),
            (eachRow.productLabel ? eachRow.productLabel.substring(0,15) : ``)+(eachRow.createTime ? `<br><small>${new Date(eachRow.createTime).toLocaleString('en-AU')}</small>` : (eachRow.loggingTime ? `<br><small>${new Date(eachRow.loggingTime).toLocaleString('en-AU')}</small>` : ``)),
            `<a href="#" class="table_actions table_action_remove" data-bs-labelId="${eachRow.productLabel}" data-bs-itemId="${eachRow._id}" data-bs-toggle="modal" data-bs-target="#editModal" style="margin: 0 2px 0 2px">Patch</a>` +
            `<a href="#" class="table_actions table_action_remove" data-bs-labelId="${eachRow.productLabel}" data-bs-itemId="${eachRow._id}" data-bs-toggle="modal" data-bs-target="#removeModal" style="margin: 0 2px 0 2px">Remove</a>`
        ]).draw(false)
    })
    document.querySelector("#loadingStatus").style = "display: none"
}

document.querySelector("#act_reloadTable").addEventListener("click",async (ev)=>{
    await redrawTable(true)
})

document.querySelector("#addModal_prodname").addEventListener("input", function(ev){
    let inputValue = ev.target.value
    productLists.forEach(eachProduct=>{
        if (eachProduct.hasOwnProperty("labelname") && eachProduct.labelname === inputValue){
            if (eachProduct.hasOwnProperty("palletQty")) { document.querySelector("#addModal_quantity").value = eachProduct.palletQty }
            if (eachProduct.hasOwnProperty("unit")) { document.querySelector("#addModal_produnit").value = eachProduct.unit }
            if (eachProduct.hasOwnProperty("unitPrice")) { document.querySelector("#addModal_unitprice").value = eachProduct.unitPrice }

            if (eachProduct.hasOwnProperty("productCode") && document.querySelector("#addModal_prodcode").value.toString() !== eachProduct.productCode ){
                document.querySelector("#addModal_prodcode").value = eachProduct.productCode
            }
        }
    })
})
document.querySelector("#addModal_prodcode").addEventListener("input", function(ev){
    let inputValue = ev.target.value
    productLists.forEach(eachProduct=>{
        if (eachProduct.hasOwnProperty("productCode") && eachProduct.productCode === inputValue){
            if (eachProduct.hasOwnProperty("palletQty")) { document.querySelector("#addModal_quantity").value = eachProduct.palletQty }
            if (eachProduct.hasOwnProperty("unit")) { document.querySelector("#addModal_produnit").value = eachProduct.unit }
            if (eachProduct.hasOwnProperty("unitPrice")) { document.querySelector("#addModal_unitprice").value = eachProduct.unitPrice }

            if (eachProduct.hasOwnProperty("labelname") && document.querySelector("#addModal_prodname").value.toString() !== eachProduct.labelname){
                document.querySelector("#addModal_prodname").value = eachProduct.labelname
            }
        }
    })
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

document.querySelector("#addModal_labelid").addEventListener("input",async function (ev) {
    let inputValue = ev.target.value
    let existResults = await fetchStockInfoByLabel(inputValue)
    if (existResults.stocks.length > 0){
    //     Found in exist stocks, disable the form
        document.querySelector("#addModal_prodcode").value = (existResults.stocks[0].hasOwnProperty("productCode") ? existResults.stocks[0].productCode: "")
        document.querySelector("#addModal_prodname").value = (existResults.stocks[0].hasOwnProperty("productName") ? existResults.stocks[0].productName: "")
        document.querySelector("#addModal_ponumber").value = (existResults.stocks[0].hasOwnProperty("POnumber") ? existResults.stocks[0].POnumber: "")
        document.querySelector("#addModal_quantity").value = (existResults.stocks[0].hasOwnProperty("quantity") ? existResults.stocks[0].quantity: "")
        document.querySelector("#addModal_produnit").value = (existResults.stocks[0].hasOwnProperty("productCode") ? existResults.stocks[0].productCode: "")
        document.querySelector("#addModal_bestbefore").value = (existResults.stocks[0].hasOwnProperty("bestbefore") ? existResults.stocks[0].bestbefore: "")
        document.querySelector("#addModal_location").value = (existResults.stocks[0].hasOwnProperty("shelfLocation") ? existResults.stocks[0].shelfLocation: "")
        document.querySelector("#addModal_unitprice").value = (existResults.stocks[0].hasOwnProperty("unitPrice") ? existResults.stocks[0].unitPrice: "")
        document.querySelector("#addModal_btnSubmit").setAttribute("disabled","disabled")
        if (existResults.prefill[0].hasOwnProperty("quarantine") === 1){ document.querySelector("#addModal_quarantineYes").checked = true }
        else if (existResults.prefill[0].hasOwnProperty("quarantine") === -1){ document.querySelector("#addModal_quarantineFinished").checked = true }
        else {document.querySelector("#addModal_quarantineNo").checked = true }
    } else if(existResults.prefill.length > 0){
    //     Found prefill stocks, prefill the form and show hint text
        document.querySelector("#addModal_prodcode").value = (existResults.prefill[0].hasOwnProperty("productCode") ? existResults.prefill[0].productCode: "")
        document.querySelector("#addModal_prodname").value = (existResults.prefill[0].hasOwnProperty("productName") ? existResults.prefill[0].productName: "")
        document.querySelector("#addModal_ponumber").value = (existResults.prefill[0].hasOwnProperty("POnumber") ? existResults.prefill[0].POnumber: "")
        document.querySelector("#addModal_quantity").value = (existResults.prefill[0].hasOwnProperty("quantity") ? existResults.prefill[0].quantity: "")
        document.querySelector("#addModal_produnit").value = (existResults.prefill[0].hasOwnProperty("productCode") ? existResults.prefill[0].productCode: "")
        document.querySelector("#addModal_bestbefore").value = (existResults.prefill[0].hasOwnProperty("bestbefore") ? existResults.prefill[0].bestbefore: "")
        document.querySelector("#addModal_location").value = (existResults.prefill[0].hasOwnProperty("shelfLocation") ? existResults.prefill[0].shelfLocation: "")
        document.querySelector("#addModal_unitprice").value = (existResults.prefill[0].hasOwnProperty("unitPrice") ? existResults.prefill[0].unitPrice: "")
        if (existResults.prefill[0].hasOwnProperty("quarantine") === 1){ document.querySelector("#addModal_quarantineYes").checked = true }
        else if (existResults.prefill[0].hasOwnProperty("quarantine") === -1){ document.querySelector("#addModal_quarantineFinished").checked = true }
        else {document.querySelector("#addModal_quarantineNo").checked = true}
    }
})

document.querySelector("#addModal_btnSubmit").addEventListener("click", async function (ev) {
    let productElement = {}
    if (document.querySelector("#addModal_labelid").value.toString().length <= 15) {
        document.querySelector("#addModal_statusText").textContent = `Product Label is required, format: YYYYMMDD+labelid`
    } else if (document.querySelector("#addModal_prodcode").value.toString().length <= 0 &&
        document.querySelector("#addModal_prodname").value.toString().length <= 0) {
        document.querySelector("#addModal_statusText").textContent = `Missing Product Code / Product Name`
    } else if (document.querySelector("#addModal_quantity").value.toString().length <= 0 &&
        document.querySelector("#addModal_produnit").value.toString().length <= 0) {
        document.querySelector("#addModal_statusText").textContent = `Missing Product quantity / units`
    } else {
        document.querySelector("#addModal_btnSubmit").textContent = `Processing`
        document.querySelector("#addModal_btnSubmit").setAttribute("disabled", "disabled")

        // Building Product Information
        productElement.productLabel = document.querySelector("#addModal_labelid").value.toString()
        productElement.productCode = document.querySelector("#addModal_prodcode").value.toString()
        productElement.productName = document.querySelector("#addModal_prodname").value.toString()
        productElement.quantity = document.querySelector("#addModal_quantity").value.toString()
        productElement.quantityUnit = document.querySelector("#addModal_produnit").value.toString()
        productElement.loggingTime = new Date()
        productElement.createTime = new Date()
        productElement.removed = parseInt("0")
        productElement.quarantine = parseInt(document.querySelector("input[name='addModal_quarantineRatio']:checked").value)
        if (document.querySelector("#addModal_bestbefore").value.toString().length > 0) {
            productElement.bestbefore = new Date(document.querySelector("#addModal_bestbefore").value)
        }
        if (document.querySelector("#addModal_unitprice").value.toString().length > 0) {
            productElement.unitPrice = Decimal128.fromString(document.querySelector("#addModal_unitprice").value)
        }
        if (document.querySelector("#addModal_location").value.toString().length > 0) {
            productElement.shelfLocation = document.querySelector("#addModal_location").value
        }
        if (document.querySelector("#addModal_ponumber").value.toString().length > 0) {
            productElement.POnumber = document.querySelector("#addModal_ponumber").value
        }
        let insertResult = await insertPrefillElement(productElement)
        console.log(insertResult)
        bootstrap.Modal.getInstance(document.querySelector("#addModalLabel")).hide()
    }

    await redrawTable(true)
})

async function insertPrefillElement(insertObject = {}) {
    let result = {}
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        let session = await client.db(targetDB)
        result = await session.collection("preloadlog").updateOne({productLabel: insertObject.productLabel}, insertObject, {upsert: true})
    } catch (e) {
        console.error(`Fail to insert/upsert for product: ${labelId};`, e)
    } finally {
        await client.close()
    }
    return result
}

async function fetchStockInfoByLabel(labelId = null){
    let result = { prefill:[] , stocks:[] }
    if (labelId.toString().length > 0){
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        try {
            await client.connect();
            let session = await client.db(targetDB)
            result = {
                prefill: await session.collection("preloadlog").find({productLabel: labelId}).toArray(),
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

async function fetchStockInfoByItemId(labelId = null){
    let result = { prefill:[] , stocks:[] }
    if (labelId.toString().length > 0){
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        try {
            await client.connect();
            let session = await client.db(targetDB)
            result = {
                prefill: await session.collection("preloadlog").find({_id: new ObjectId(labelId)}).toArray(),
                stocks: await session.collection("pollinglog").find({_id: new ObjectId(labelId)}).toArray()
            }
        } catch (e) {
            console.error(`Fetching stock information error when attempt fetching: ${labelId};`, e)
        } finally {
            await client.close()
        }
    }
    return result
}

async function fetchProductInformation(productCode) {
    let result = []
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        const session = client.db(targetDB).collection("products");
        result = await session.find({productCode: productCode}).toArray()
    } catch (e) {
        console.error(`Fetching product information error on: ${productCode};`, e)
    } finally {
        await client.close()
    }
    return result
}

async function deletePrefillData(productLabelId = null) {
//     Moving filled data from Prefill table to pollinglog Table
    let result = []
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        const session = client.db(targetDB).collection("preloadlog");
        result = await session.deleteMany({productLabel: productLabelId})
    } catch (e) {
        console.error(`Remove Stock Error when process: ${productLabelId};`, e)
    } finally {
        await client.close()
    }
    return result
}

async function insertToPollinglog(content) {
//     Moving filled data from Prefill table to pollinglog Table
    let result = []
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        const pollingSession = client.db(targetDB).collection("pollinglog");
        await pollingSession.insertMany(content)
    } catch (e) {
        console.error(`Insert Stock Error when process:;`, e)
    } finally {
        await client.close()
    }
    return result
}

document.querySelector("#editModal").addEventListener("show.bs.modal", async (ev) => {
    document.querySelectorAll("input").forEach(eachInput => { eachInput.value = ""})
    document.querySelectorAll("textarea").forEach(eachInput => { eachInput.value = ""})
    let requestItemId = ev.relatedTarget.getAttribute("data-bs-itemId")
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-labelId")
    let fetchedProductInfo = await fetchStockInfoByItemId(requestItemId)
    document.querySelector("#modalEditLabelid").value = requestItemId
    document.querySelector("#editModalSubmitBtn").disabled = true
    document.querySelector("#editModalSubmitBtn").textContent = "Submit"
    document.querySelector("#editModal .modal-title").textContent = `Loading Product Information`
    if (fetchedProductInfo.prefill.length > 0) {
        let fetchedPrefillInfo = fetchedProductInfo.prefill[0]
        let productModelInfo = await fetchProductInformation(fetchedPrefillInfo.productCode)
        document.querySelector("#editModal .modal-title").textContent = `Edit Stock: ${fetchedPrefillInfo.productName}`
        document.querySelector("#editModal .modal-body #productInfoText").textContent = `${fetchedPrefillInfo.productCode} - ${fetchedPrefillInfo.productName}`
        document.querySelector("#editModal .modal-body #labelIDText").textContent = `${fetchedPrefillInfo.productLabel}`
        document.querySelector("#modalEditQuantity").value = (fetchedPrefillInfo.quantity ? fetchedPrefillInfo.quantity :
            (productModelInfo.length > 0 && productModelInfo[0].hasOwnProperty("quantity") ? productModelInfo[0].quantity : ""))
        document.querySelector("#modalEditUnit").value = (fetchedPrefillInfo.quantityUnit ? fetchedPrefillInfo.quantityUnit :
            (productModelInfo.length > 0 && productModelInfo[0].hasOwnProperty("unit") ? productModelInfo[0].unit : ""))
        document.querySelector("#modalEditBestbefore").value = (fetchedPrefillInfo.bestbefore ? fetchedPrefillInfo.bestbefore : "")
        document.querySelector("#modelEditLocation").value = (fetchedPrefillInfo.shelfLocation ? fetchedPrefillInfo.shelfLocation : "")
        document.querySelector("#modelEditPOnumber").value = (fetchedPrefillInfo.POnumber ? fetchedPrefillInfo.POnumber : (fetchedPrefillInfo.POIPnumber ? fetchedPrefillInfo.POIPnumber : ""))
        document.querySelector("#modelEditUnitprice").value = (fetchedPrefillInfo.unitPrice ? fetchedPrefillInfo.unitPrice :
            (productModelInfo.length > 0 && productModelInfo[0].hasOwnProperty("unitPrice") ? productModelInfo[0].unitPrice : ""))
        document.querySelector("#modelCheckboxConsumed").checked = (fetchedPrefillInfo.removed === 1)
        document.querySelector("#modelEditConsumeTime").value = (fetchedPrefillInfo.removeTime ? fetchedPrefillInfo.removeTime : "")
        document.querySelector("#editModalSubmitBtn").disabled = false

        if (productModelInfo.length > 0 && productModelInfo[0].hasOwnProperty("unitPrice")) {
            document.querySelector("#modelEditDefaultPrice").style = ""
            document.querySelector("#modelEditDefaultPrice").addEventListener("click", (ev) => {
                document.querySelector("#modelEditUnitprice").value = productModelInfo[0].unitPrice
            })
        } else {
            document.querySelector("#modelEditDefaultPrice").style = "display: none"
        }
    }

    document.querySelector("#editModalSubmitBtn").addEventListener("click", async (ev) => {
        let fetchedPrefillInfo = fetchedProductInfo.prefill[0]
        document.querySelector("#editModalSubmitBtn").disabled = true
        document.querySelector("#editModalSubmitBtn").textContent = "Updating"
        let updateTarget = {}
        if (document.querySelector("#modalEditQuantity").value) {
            fetchedPrefillInfo.quantity = document.querySelector("#modalEditQuantity").value
        }
        if (document.querySelector("#modalEditUnit").value) {
            fetchedPrefillInfo.quantityUnit = document.querySelector("#modalEditUnit").value
        }
        if (document.querySelector("#modalEditBestbefore").value) {
            fetchedPrefillInfo.bestbefore = document.querySelector("#modalEditBestbefore").value
        }
        if (document.querySelector("#modelEditLocation").value) {
            fetchedPrefillInfo.shelfLocation = document.querySelector("#modelEditLocation").value
        }
        if (document.querySelector("#modelEditPOnumber").value) {
            fetchedPrefillInfo.POnumber = document.querySelector("#modelEditPOnumber").value
        }

        try {
            // 直接insert新数据到库中，然后删除旧数据即可
            let insertResult = await insertToPollinglog([fetchedPrefillInfo])
            let deleteResult = await deletePrefillData(requestLabelId)
            bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
            createAlert("success","Product has been successfully patched.")
        } catch (e) {
            console.error(`Error while Patching Data:`, e)
        }
        await redrawTable(true)
    })
})

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
        document.querySelector("#removeModal_itemid").value = ev.relatedTarget.getAttribute("data-bs-itemId")
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
            let stocksResults = await fetchStockInfoByLabel(prefillList[i].productLabel)
            if (stocksResults.stocks.length > 0){
                await deletePrefillData(prefillList[i].productLabel)
            }
        }
        createAlert("success", `Prefill Duplicate data check has finished`, 5000)
    } else if(removeAllRequest){
        let prefillList = await fetchPrefillDatas()
        createAlert("info", `Clear Databases`, 5000)
        for (let i = 0; i < prefillList.length; i++) {
            document.querySelector("#removeModal_StatusText").textContent = `Delete all items. Deleting ${i} of ${prefillList.length} items.`
            await deletePrefillData(prefillList[i].productLabel)
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
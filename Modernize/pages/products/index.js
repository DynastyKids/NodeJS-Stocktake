const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, Decimal128} = require('mongodb');
const ObjectID = require("mongodb").ObjectId

var $ = require("jquery");
const DataTable = require('datatables.net-responsive-bs5')(window, $);

let table=new DataTable('#productTable', {
    responsive: true,
    pageLength: 15,
    lengthMenu: [10, 15, 25, 50, 75, 100],
    columns: [{"width": "40%"}, null, null, null, null],
    order: [0, 'asc']
});
let dataset = [];
const Storage = require("electron-store");
const i18next = require("i18next");
const {initRenderer} = require("electron-store");
const {isNumber} = require("lodash");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

document.addEventListener("DOMContentLoaded", async (ev) => {
    document.querySelector("#loadingStatus").style.removeProperty("display")
    table.rows.add(await fetchTablesData()).draw()
    document.querySelector("#loadingStatus").style.display = "none"
})

let productsList = []
let stocksList = []
let stocksListSeperated = []
async function fetchProducts(forced = true) {
    let result = []
    if (forced || productsList.length <= 0){
        let client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        });
        let sessions = client.db(targetDB).collection("products");
        let options = {sort: {productCode: 1}};
        try {
            await client.connect();
            result = await sessions.find({}, options).toArray();
            productsList = result
        } catch (e) {
            console.error("Fetching error:", e)
        } finally {
            await client.close();
        }
    } else {
        result = productsList
    }
    return result
}

async function fetchStocks(forced = false, limitData = 100000){
    if (stocksList.length <= 0 || forced){
        document.querySelector("#loadingStatus").style.removeProperty("display")
        let client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        });
        try {
            await client.connect();
            stocksList = await client.db(targetDB).collection("pollinglog").find({}).limit(limitData).toArray();
        } catch (e) {
            console.error("Fetching error:", e)
        } finally {
            await client.close();
            document.querySelector("#loadingStatus").style.display = "none"
        }
    }
    return stocksList
}

async function fetchUnusedStocks(conditionObject) {
    let stocks = await fetchStocks(false)
    let products = await fetchProducts(false)
    let newStockList = []
    for (let stock of stocks) {
        if (stock.removed === 0){
            newStockList.push(stock)
        }
    }

    // Merging Stocks
    let mergedResult = {}
    newStockList.forEach(eachResult => {
        //     Convert from carton to unit
        for (let i = 0; i < products.length; i++) {
            if (eachResult.productCode === products[i].productCode) {
                if (eachResult.quantityUnit && products[i].hasOwnProperty("cartonQty") && products[i].hasOwnProperty("unit") &&
                    (eachResult.quantityUnit.toLowerCase().search("ctn") >= 0 || eachResult.quantityUnit.toLowerCase().search("carton") >= 0)) {
                    eachResult.quantityUnit = products[i].unit
                    eachResult.quantity = eachResult.quantity * products[i].cartonQty
                }
                if (eachResult.quantityUnit && products[i].hasOwnProperty("palletQty") && products[i].hasOwnProperty("unit") &&
                    (eachResult.quantityUnit.toLowerCase().search("plt") >= 0 && eachResult.quantityUnit.toLowerCase().search("pallet") >= 0)) {
                    eachResult.quantityUnit = products[i].unit
                    eachResult.quantity = eachResult.quantity * products[i].palletQty
                }
                break;
            }
        }
        if (mergedResult.hasOwnProperty(eachResult.productCode)) {
            if (mergedResult[eachResult.productCode].quantityUnit === eachResult.quantityUnit) {
                mergedResult[eachResult.productCode].quantity += eachResult.quantity
            }
        } else {
            mergedResult[eachResult.productCode] = {
                quantity: (eachResult.quantity ? eachResult.quantity : ""),
                unit: (eachResult.quantityUnit ? eachResult.quantityUnit : "")
            }
        }
    })
    return mergedResult
}

async function fetchUsedStock(){
    let stocks = await fetchStocks(false)
    let newStockList = []
    for (let stock of stocks) {
        if (stock.removed === 1){
            newStockList.push(stock)
        }
    }
    return newStockList
}

async function fetchTablesData() {
    let stocksLevel = await fetchUnusedStocks();
    let results = await fetchProducts(true);
    let usedStocks = await fetchUsedStock();
    dataset = []
    for (const eachItem of results) {
        let stockTurnoverRate = 0;
        let stockCount = 0;
        usedStocks.forEach(eachUsedRecord=>{
            if (eachUsedRecord.productCode === eachItem.productCode){
               if (eachUsedRecord.hasOwnProperty("createTime") && eachUsedRecord.hasOwnProperty("removeTime")){
                   stockTurnoverRate += parseInt(new Date(eachUsedRecord.removeTime).getTime() - new Date(eachUsedRecord.createTime).getTime())
                   stockCount ++;
               } else if (eachUsedRecord.hasOwnProperty("loggingTime") && eachUsedRecord.hasOwnProperty("removeTime")){
                   stockTurnoverRate += parseInt(new Date(eachUsedRecord.removeTime).getTime() - new Date(eachUsedRecord.loggingTime).getTime())
                   stockCount ++;
               }
            }
        })
        dataset.push([
            `${(eachItem.productCode ? eachItem.productCode : "")}${(eachItem.labelname && eachItem.productCode ? " - ": "")}${(eachItem.labelname ? eachItem.labelname : "")}<br><span>${eachItem.withBestbefore > 0 ? "<i class=\"ti ti-calendar-due\"></i>" : ""}</span>`,
            `${stockTurnoverRate > 0 && stockCount > 0 ?(stockTurnoverRate / stockCount / 86400000 ).toFixed(2): ""}`,
            // `${stocksLevel["eachItem.productCode"] && stocksLevel['eachItem.productCode'].hasOwnProperty("quantity") ?
            //     stocksLevel[eachItem.productCode].quantity + (stocksLevel[eachItem.productCode].quantity > 0 ? " "+stocksLevel[eachItem.productCode].unit :"") : ""}`,
            `${(eachItem.cartonQty ? eachItem.cartonQty + (eachItem.unit ? " " + eachItem.unit : "") : " - ")}` +
            `<br><small ${eachItem.cartonQty && eachItem.palletQty ? "data-bs-toggle=\"tooltip\" data-bs-placement=\"top\" " +
                "title=\" + eachItem.palletQty / eachItem.cartonQty +\" ctns" : null} >${(eachItem.palletQty ?
                eachItem.palletQty + (eachItem.unit ? " " + eachItem.unit : "") : " - ")}</small>`,
            `${(eachItem.unitPrice ? eachItem.unitPrice : "")}`,
            `
                <a href="#" data-bs-toggle="modal" data-bs-target="#editRowModal" data-bs-itemid="${eachItem._id.toHexString()}">Edit</a>
                <a href="#" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-productname="${eachItem.labelname}" data-bs-itemId="${eachItem._id.toHexString()}" data-bs-state="${eachItem.active}">${(eachItem.active ? "Remove" : "Revert (Add)")}</a>
            `
        ]);
    }
    return dataset;
}

async function findOneRecordById(recordId) {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let sessions = client.db(targetDB).collection("products");
    let results;
    try {
        await client.connect();
        results = await sessions.findOne({'_id': (new ObjectID(recordId))});
    } catch (e) {
        console.error("Fetching error:", e)
    } finally {
        await client.close();
    }
    return results
}

let removeModalTarget = {}
let removeModal = document.querySelector("#removeModal")
removeModal.addEventListener("show.bs.modal", async function (ev) {
    var itemId = ev.relatedTarget.getAttribute("data-bs-itemId")
    var productsList = await fetchProducts()
    removeModal.querySelector("#removeModal_btnConfirm").disabled = false
    removeModal.querySelector("#removeModal_btnConfirm").textContent = "Confirm"
    
    for (let i = 0; i < productsList.length; i++) {
        if (itemId === (productsList[i]._id).toString()) {
            console.log(itemId, productsList[i], itemId === productsList[i])
            removeModalTarget = productsList[i]
            removeModal.querySelector(".modal-body p").textContent = `Are you sure to mark '${productsList[i].labelname}' ${productsList[i].active && productsList[i].active === 1 ? "inactive" : "active" }?`
            break;
        }
    }
})

removeModal.querySelector("#removeModal_btnConfirm").addEventListener("click", async function (){
    let result = {acknowledged: false}
    for (let i = 0; i < productsList.length; i++) {
        if ((removeModalTarget._id).toString() === (productsList[i]._id).toString()) {
            result = await updateRecordById(removeModalTarget._id, {active: (productsList[i].active && productsList[i].active === 1 ? 0 : 1) })
            break;
        }
    }
    if (result.ok){
        bootstrap.Modal.getInstance(removeModal).hide()
        await redrawDataTable()
        createAlert("success", `${removeModalTarget.labelname} has been successfully marked as ${(productsList[i].active && productsList[i].active === 1 ? "inactive" : "active")}`)
    }
})


//修改弹窗，和原有的页面跳转暂时保持平行
let editModal = document.querySelector("#editRowModal")
let editModalTarget = {}
editModal.addEventListener('show.bs.modal', async (ev) => {
    let itemId = ev.relatedTarget.getAttribute("data-bs-itemid")
    let originProduct = await findOneRecordById(itemId)
    // 2023-10-11新增加Edit为Modal弹窗，通过弹窗直接修改对应参数，Add部分保持不变，旧的Edit/add通用页面继续保留

    //初始化设置，默认设置submit btn为不可用，清空所有input
    editModal.querySelector("#modelEditSubmitBtn").disabled = true;
    editModal.querySelector("#modelEditSubmitBtn").textContent = "Fetching...";
    editModal.querySelectorAll(".modal-body input").forEach(item => {
        item.disabled = true
        item.value = ""
    })
    editModal.querySelector("#editRowModalLabel").textContent = "Loading Data ..."
    editModal.querySelector("#expiredateCheck").checked = false
    try {
        editModal.querySelector("#editRowModalinput_productId").value = itemId
        //     回填数据到输入框，对输入框解除disabled
        editModalTarget = originProduct
        if (originProduct) {
            editModal.querySelector("#editRowModalLabel").textContent = `Edit Product Infos ${originProduct.productCode ? " for " + originProduct.productCode + (originProduct.labelname ? " - " + originProduct.labelname : "") : ""}`
            editModal.querySelector("#editRowModalinput_productCode").value = (originProduct.productCode ? originProduct.productCode : "")
            editModal.querySelector("#editRowModalinput_labelName").value = (originProduct.labelname ? originProduct.labelname : "")
            editModal.querySelector("#editRowModalinput_description").value = (originProduct.description ? originProduct.description : "")

            editModal.querySelector("#editRowModalinput_cartonQty").value = (originProduct.cartonQty ? originProduct.cartonQty : "")
            editModal.querySelector("#editRowModalinput_palletQty").value = (originProduct.palletQty ? originProduct.palletQty : "")
            editModal.querySelector("#editRowModalinput_unit").value = (originProduct.unit ? originProduct.unit : "")

            editModal.querySelector("#editRowModalinput_weight").value = (originProduct.weight ? originProduct.weight : "")
            editModal.querySelector("#editRowModalinput_length").value = (originProduct.sizeLength ? originProduct.sizeLength : "")
            editModal.querySelector("#editRowModalinput_width").value = (originProduct.sizeWidth ? originProduct.sizeWidth : "")
            editModal.querySelector("#editRowModalinput_height").value = (originProduct.sizeHeight ? originProduct.sizeHeight : "")

            editModal.querySelector("#editRowModalinput_vendorCode").value = (originProduct.vendorCode ? originProduct.vendorCode : "")
            editModal.querySelector("#editRowModalinput_purcPrice").value = (originProduct.unitPrice ? originProduct.unitPrice : "")
            // document.querySelector("#editRowModalinput_sellPrice").value = (result.sellPrice ? result.sellPrice : "")
            if (originProduct.withBestbefore && originProduct.withBestbefore === 1) {
                editModal.querySelector("#expiredateCheck").checked = true
            } else {
                editModal.querySelector("#expiredateCheck").checked = false
            }
        }

        editModal.querySelectorAll(".modal-body input").forEach(item => {
            item.disabled = false
        })
        editModal.querySelector("#modelEditSubmitBtn").disabled = false
        editModal.querySelector("#modelEditSubmitBtn").textContent = "Submit";
    } catch (e) {
        console.error("Error on editRowModal:", e)
    }
})

//当用户编辑完成后，开始提交
document.querySelector("#modelEditSubmitBtn").addEventListener("click", async (ev) => {
    editModal.querySelectorAll(".modal-body input").forEach(eachInputbox => {
        eachInputbox.disabled = true
    })
    editModal.querySelector("#modelEditSubmitBtn").disabled = true
    editModal.querySelector("#modelEditSubmitBtn").textContent = "Updating";

    let result = {
        productCode: (String(editModal.querySelector("#editRowModalinput_productCode").value).length > 0 ? editModal.querySelector("#editRowModalinput_productCode").value : ""),
        labelname: String(editModal.querySelector("#editRowModalinput_labelName").value).length > 0 ? editModal.querySelector("#editRowModalinput_labelName").value : "",
        description: String(editModal.querySelector("#editRowModalinput_description").value).length > 0 ? editModal.querySelector("#editRowModalinput_description").value : "",
        cartonQty: String(editModal.querySelector("#editRowModalinput_cartonQty").value).length > 0 ? parseInt(editModal.querySelector("#editRowModalinput_cartonQty").value) : "" ,
        palletQty:  String(editModal.querySelector("#editRowModalinput_palletQty").value).length > 0 ? parseInt(editModal.querySelector("#editRowModalinput_palletQty").value) : "",
        unit: String(editModal.querySelector("#editRowModalinput_unit").value).length > 0 ? editModal.querySelector("#editRowModalinput_unit").value : "",
        weight: String(editModal.querySelector("#editRowModalinput_weight").value).length > 0 ? parseFloat(editModal.querySelector("#editRowModalinput_weight").value)  : "",
        sizeLength: String(editModal.querySelector("#editRowModalinput_length").value).length > 0 ? parseFloat(editModal.querySelector("#editRowModalinput_length").value) : "",
        sizeWidth: String(editModal.querySelector("#editRowModalinput_width").value).length > 0 ? parseFloat(editModal.querySelector("#editRowModalinput_width").value) : "",
        sizeHeight: String(editModal.querySelector("#editRowModalinput_height").value).length > 0 ? parseFloat(editModal.querySelector("#editRowModalinput_height").value)  : "",
        vendorCode: String(document.querySelector("#editRowModalinput_vendorCode").value).length > 0 ? document.querySelector("#editRowModalinput_vendorCode").value : "",
        unitPrice: String(document.querySelector("#editRowModalinput_purcPrice").value).length > 0 ? Decimal128.fromString(document.querySelector("#editRowModalinput_purcPrice").value): ""
    }
    console.log(result)
    let patchElement = {}
    Object.keys(result).forEach(eachKey=>{
        if (result[eachKey] !== ""){
            patchElement[eachKey] = result[eachKey]
        }
    })

    let updateResult = await updateRecordById((editModalTarget._id).toString(), patchElement)
    //     当最后确认提交成功则dismiss并回弹成功信息
    if (updateResult.ok === 1 || updateResult.acknowledged) {
        bootstrap.Modal.getInstance(editModal).hide()
        createAlert("success", `Product information changes has been successfully saved`)
        await redrawDataTable()
    } else {
        document.querySelector("#deleteRowModal .modal-body p").innerText = "Error happened while on updates."
    }
})

async function updateRecordById(recordId, updateData) {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let sessions = client.db(targetDB).collection("products");
    let results;
    try {
        await client.connect();
        results = await sessions.findOneAndUpdate({'_id': (new ObjectID(recordId))}, {$set: updateData});
    } catch (e) {
        console.error("Fetching error:", e)
    } finally {
        await client.close();
    }
    return results
}

document.querySelector("#act_reloadTable").addEventListener("click", async (ev) => {
    if (table) {
        table.clear().draw()
        document.querySelector("#loadingStatus").style.removeProperty("display")
        table.rows.add(await fetchTablesData()).draw()
        document.querySelector("#loadingStatus").style.display = "none"
    }
})

async function redrawDataTable() {
    if (table) {
        table.clear().draw()
        document.querySelector("#loadingStatus").style.removeProperty("display")
        table.rows.add(await fetchTablesData()).draw()
        document.querySelector("#loadingStatus").style.display = "none"
    }
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
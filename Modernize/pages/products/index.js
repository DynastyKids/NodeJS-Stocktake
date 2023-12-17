const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const ObjectID = require("mongodb").ObjectId

var $ = require("jquery");
const DataTable = require('datatables.net-responsive-bs5')(window, $);

let table;
let dataset = [];
const Storage = require("electron-store");
const i18next = require("i18next");
const {initRenderer} = require("electron-store");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

window.onload = async () => {
    table = new DataTable('#productTable', {
        responsive: true,
        pageLength: 15,
        lengthMenu: [10, 15, 25, 50, 75, 100],
        columns: [{"width": "40%"}, null, null, null, null],
        order: [0, 'asc'],
        data: await fetchTablesData()
    });
}

async function fetchProducts(conditionObject) {
    document.querySelector("#loadingStatus").style.removeProperty("display")
    let results = []
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let sessions = client.db(targetDB).collection("products");
    let options = {sort: {productCode: 1}};
    try {
        await client.connect();
        if (conditionObject) {
            results = await sessions.find(conditionObject, options).toArray();
        } else {
            results = await sessions.find({}, options).toArray();
        }
    } catch (e) {
        console.error("Fetching error:", e)
    } finally {
        await client.close();
        document.querySelector("#loadingStatus").style.display = "none"
    }
    return results
}

async function fetchUnusedStocks(conditionObject) {
    let stocks = []
    let products = []
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    try {
        await client.connect();
        stocks = await client.db(targetDB).collection("pollinglog").find({removed: 0}, {sort: {productCode: 1}}).toArray();
        products = await client.db(targetDB).collection("products").find({active: 1}).toArray();
    } catch (e) {
        console.error("Fetching error:", e)
    } finally {
        await client.close();
        document.querySelector("#loadingStatus").style.display = "none"
    }
    // Merging Stocks
    let mergedResult = {}
    stocks.forEach(eachResult => {
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
    let stocks = []
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    try {
        await client.connect();
        stocks = await client.db(targetDB).collection("pollinglog").find({removed: 1}).limit(100000).toArray();
    } catch (e) {
        console.error("Fetching error:", e)
    } finally {
        await client.close();
    }
    console.log (stocks)
    return stocks
}


async function fetchTablesData() {
    let stocksLevel = await fetchUnusedStocks();
    let results = await fetchProducts();
    let usedStocks = await fetchUsedStock();
    dataset = []
    for (const eachItem of results) {
        let stockTurnoverRate = 0;
        let stockCount = 0;
        usedStocks.forEach(eachUsedRecord=>{
            if (eachUsedRecord.productCode === eachItem.productCode){
                console.log(eachUsedRecord.productCode , eachItem.productCode)
                console.log(eachItem)
               if (eachUsedRecord.hasOwnProperty("createTime") && eachUsedRecord.hasOwnProperty("removeTime")){
                   stockTurnoverRate += parseInt(new Date(eachUsedRecord.removeTime).getTime() - new Date(eachUsedRecord.createTime).getTime())
                   stockCount ++;
               } else if (eachUsedRecord.hasOwnProperty("loggingTime") && eachUsedRecord.hasOwnProperty("removeTime")){
                   stockTurnoverRate += parseInt(new Date(eachUsedRecord.removeTime).getTime() - new Date(eachUsedRecord.loggingTime).getTime())
                   stockCount ++;
               }
            }
        })
        console.log(eachItem.productCode,stockTurnoverRate,stockCount)
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
                <a href="#" data-bs-toggle="modal" data-bs-target="#deleteRowModal" data-bs-productname="${eachItem.labelname}" data-bs-itemid="${eachItem._id.toHexString()}" data-bs-state="${eachItem.active}">${(eachItem.active ? "Remove" : "Revert (Add)")}</a>
            `
        ]);
    }
    return dataset;
}

async function findOneRecordById(recordId) {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
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


// 删除条目弹窗
document.querySelector("#deleteRowModal").addEventListener('show.bs.modal', (ev) => {
    let itemId = ev.relatedTarget.getAttribute("data-bs-itemid");
    let itemStatus = ev.relatedTarget.getAttribute("data-bs-state");
    let result;
    // console.log("Delete Model: Delete Clicked", itemId, itemStatus)

    if (itemStatus === "true") {
        document.querySelector("#deleteRowModal .modal-title span").textContent = `delete?`
        document.querySelector("#deleteRowModal .modal-body span").textContent = `delete ${ev.relatedTarget.getAttribute("data-bs-productname")}?`
        document.querySelector("#deleteModalConfirmBtn").className = 'btn btn-danger'
        document.querySelector("#deleteModalConfirmBtn").textContent = "Disable"
        document.querySelector("#deleteModalConfirmBtn").disabled = false
    } else {
        document.querySelector("#deleteRowModal .modal-title span").textContent = `Add Back?`
        document.querySelector("#deleteRowModal .modal-body span").textContent = `add back ${ev.relatedTarget.getAttribute("data-bs-productname")}?`
        document.querySelector("#deleteModalConfirmBtn").className = 'btn btn-info'
        document.querySelector("#deleteModalConfirmBtn").textContent = "Enable"
        document.querySelector("#deleteModalConfirmBtn").disabled = false
    }

    document.querySelector("#deleteModalConfirmBtn").addEventListener("click", async (ev) => {
        document.querySelector("#deleteModalConfirmBtn").disabled = true
        document.querySelector("#deleteModalConfirmBtn").textContent = "Updating"
        result = (itemStatus === "true" ? await updateRecordById(itemId, {"active": false}) : await updateRecordById(itemId, {"active": true}))
        // console.log("Delete Model result", result)
        if (result.acknowledged) {
            location.reload()
        } else {
            document.querySelector("#deleteRowModal .modal-body p").innerText = "Error happened while on updates."
        }
        bootstrap.Modal.getInstance(document.querySelector("#deleteRowModal")).hide()
    });
})

//修改弹窗，和原有的页面跳转暂时保持平行
document.querySelector("#editRowModal").addEventListener('show.bs.modal', async (ev) => {
    let itemId = ev.relatedTarget.getAttribute("data-bs-itemid")
    // 2023-10-11新增加Edit为Modal弹窗，通过弹窗直接修改对应参数，Add部分保持不变，旧的Edit/add通用页面继续保留

    //初始化设置，默认设置submit btn为不可用，清空所有input
    document.querySelector("#modelEditSubmitBtn").disabled = true;
    document.querySelector("#modelEditSubmitBtn").textContent = "Fetching...";
    document.querySelectorAll("#editRowModal .modal-body input").forEach(item => {
        item.disabled = true
        item.value = ""
    })
    document.querySelector("#editRowModalLabel").textContent = "Loading Data ..."
    document.querySelector("#expiredateCheck").checked = false

    try {
        let result = await findOneRecordById(itemId)
        //     回填数据到输入框，对输入框解除disabled
        if (result) {
            document.querySelector("#editRowModalLabel").textContent = `Edit Product Infos ${result.productCode ? " for " + result.productCode + (result.labelname ? " - " + result.labelname : "") : ""}`
            document.querySelector("#editRowModalinput_productCode").value = (result.productCode ? result.productCode : "")
            document.querySelector("#editRowModalinput_labelName").value = (result.labelname ? result.labelname : "")
            document.querySelector("#editRowModalinput_description").value = (result.description ? result.description : "")

            document.querySelector("#editRowModalinput_cartonQty").value = (result.cartonQty ? result.cartonQty : "")
            document.querySelector("#editRowModalinput_palletQty").value = (result.palletQty ? result.palletQty : "")
            document.querySelector("#editRowModalinput_unit").value = (result.unit ? result.unit : "")

            document.querySelector("#editRowModalinput_weight").value = (result.productCode ? result.productCode : "")
            document.querySelector("#editRowModalinput_length").value = (result.sizeLength ? result.sizeLength : "")
            document.querySelector("#editRowModalinput_width").value = (result.sizeWidth ? result.sizeWidth : "")
            document.querySelector("#editRowModalinput_height").value = (result.sizeHeight ? result.sizeHeight : "")

            document.querySelector("#editRowModalinput_vendorCode").value = (result.vendorCode ? result.vendorCode : "")
            document.querySelector("#editRowModalinput_purcPrice").value = (result.unitPrice ? result.unitPrice : "")
            // document.querySelector("#editRowModalinput_sellPrice").value = (result.sellPrice ? result.sellPrice : "")
            if (result.withBestbefore && result.withBestbefore === 1) {
                document.querySelector("#expiredateCheck").checked = true
            } else {
                document.querySelector("#expiredateCheck").checked = false
            }
        }

        document.querySelectorAll("#editRowModal .modal-body input").forEach(item => {
            item.disabled = false
        })
        document.querySelector("#modelEditSubmitBtn").disabled = false
        document.querySelector("#modelEditSubmitBtn").textContent = "Submit";
    } catch (e) {
        console.error("Error on editRowModal:", e)
    }

    //当用户编辑完成后，开始提交
    document.querySelector("#modelEditSubmitBtn").addEventListener("click", async (ev) => {
        document.querySelectorAll("#editRowModal .modal-body input").forEach(eachInputbox => {
            eachInputbox.disabled = true
        })
        document.querySelector("#modelEditSubmitBtn").disabled = true
        document.querySelector("#modelEditSubmitBtn").textContent = "Updating";

        let result = {}
        result.productCode = document.querySelector("#editRowModalinput_productCode").value
        result.labelname = document.querySelector("#editRowModalinput_labelName").value
        result.description = document.querySelector("#editRowModalinput_description").value

        result.cartonQty = document.querySelector("#editRowModalinput_cartonQty").value
        result.palletQty = document.querySelector("#editRowModalinput_palletQty").value
        result.unit = document.querySelector("#editRowModalinput_unit").value

        result.weight = document.querySelector("#editRowModalinput_weight").value
        result.sizeLength = document.querySelector("#editRowModalinput_length").value
        result.sizeWidth = document.querySelector("#editRowModalinput_width").value
        result.sizeHeight = document.querySelector("#editRowModalinput_height").value

        result.vendorCode = document.querySelector("#editRowModalinput_vendorCode").value
        result.unitPrice = document.querySelector("#editRowModalinput_purcPrice").value
        // result.sellPrice = document.querySelector("#editRowModalinput_sellPrice").value

        let updateResult = await updateRecordById(itemId, result)
        //     当最后确认提交成功则dismiss并回弹成功信息
        if (updateResult.acknowledged) {
            bootstrap.Modal.getInstance(document.querySelector("#editRowModal")).hide()
            window.location.reload()
        } else {
            document.querySelector("#deleteRowModal .modal-body p").innerText = "Error happened while on updates."
        }
    })
})

async function updateRecordById(recordId, updateData) {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let sessions = client.db(targetDB).collection("products");
    let results;
    try {
        await client.connect();
        results = await sessions.updateOne({'_id': (new ObjectID(recordId))}, {$set: updateData});
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
        let results = await fetchTablesData();
        table.rows.add(results).draw()
    }
})
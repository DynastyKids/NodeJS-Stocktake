const {ipcRenderer} = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');

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

document.addEventListener("DOMContentLoaded", async function () {
    await redrawTable()
})

async function redrawTable() {
    table.clear().draw()
    let tableData = await getPrefillDatas()
    tableData.forEach(eachRow => {
        table.row.add([
            (eachRow.productCode ? eachRow.productCode : ``) + (eachRow.productCode && eachRow.productName ? ` - ` : ``) + (eachRow.productName ? eachRow.productName : ``),
            (eachRow.quantity ? eachRow.quantity + ` ` + (eachRow.quantityUnit ? eachRow.quantityUnit : ``) : ``),
            (eachRow.bestbefore ? new Date(eachRow.bestbefore).toLocaleDateString("en-AU") : ``),
            (eachRow.shelfLocation ? eachRow.shelfLocation : ``),
            (eachRow.productLabel ? eachRow.productLabel : ``),
            `<a href="#" class="table_actions table_action_remove" data-bs-itemId="${eachRow.productLabel}" data-bs-toggle="modal" data-bs-target="#editModal" style="margin: 0 2px 0 2px">Patch</a>` +
            `<a href="#" class="table_actions table_action_remove" data-bs-itemId="${eachRow.productLabel}" data-bs-toggle="modal" data-bs-target="#removeModal" style="margin: 0 2px 0 2px">Remove</a>`
        ]).draw(false)
    })
}

async function fetchPatchingItem(productLabel) {
    let result = []
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        const session = client.db(targetDB).collection("preloadlog");
        result = await session.find({productLabel: productLabel}).toArray()
        console.log(result)
    } catch (e) {
        console.error(`Fetching stock information error when attempt fetching: ${productLabel};`, e)
    } finally {
        await client.close()
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
        console.log(result)
    } catch (e) {
        console.error(`Fetching product information error on: ${productCode};`, e)
    } finally {
        await client.close()
    }
    return result
}

async function deletePrefillData(productLabel) {
//     Moving filled data from Prefill table to pollinglog Table
    let result = []
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        const session = client.db(targetDB).collection("preloadlog");
        result = await session.deleteMany({productLabel: productLabel})
        console.log(result)
    } catch (e) {
        console.error(`Remove Stock Error when process: ${productLabel};`, e)
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

async function migrateToPollinglog(productLabel) {
//     Moving filled data from Prefill table to pollinglog Table
    let result = []
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        const preloadSession = client.db(targetDB).collection("preloadlog");
        const pollingSession = client.db(targetDB).collection("pollinglog");
        result = await preloadSession.find({productLabel: productLabel}).toArray()
        if (result.length > 0) {
            await pollingSession.insertMany(result)
            await preloadSession.deleteMany({productLabel: productLabel})
        }
        console.log(result)
    } catch (e) {
        console.error(`Remove Stock Error when process: ${productLabel};`, e)
    } finally {
        await client.close()
    }
    return result
}

document.querySelector("#editModal").addEventListener("show.bs.modal", async (ev) => {
    //弹出后先填充表格
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-itemId")
    let fetchedProductInfo = await fetchPatchingItem(requestLabelId)
    document.querySelector("#modalEditLabelid").value = requestLabelId
    document.querySelector("#editModalSubmitBtn").disabled = true
    document.querySelector("#editModalSubmitBtn").textContent = "Submit"
    document.querySelector("#editModal .modal-title").textContent = `Loading Product Information`
    if (fetchedProductInfo.length > 0) {
        let productModelInfo = await fetchProductInformation(fetchedProductInfo[0].productCode)
        document.querySelector("#editModal .modal-title").textContent = `Edit Stock: ${fetchedProductInfo[0].productName}`
        document.querySelector("#editModal .modal-body #productInfoText").textContent = `${fetchedProductInfo[0].productCode} - ${fetchedProductInfo[0].productName}`
        document.querySelector("#editModal .modal-body #labelIDText").textContent = `${fetchedProductInfo[0].productLabel}`
        document.querySelector("#modalEditQuantity").value = (fetchedProductInfo[0].quantity ? fetchedProductInfo[0].quantity :
            (productModelInfo.length > 0 && productModelInfo[0].hasOwnProperty("quantity") ? productModelInfo[0].quantity : ""))
        document.querySelector("#modalEditUnit").value = (fetchedProductInfo[0].quantityUnit ? fetchedProductInfo[0].quantityUnit :
            (productModelInfo.length > 0 && productModelInfo[0].hasOwnProperty("unit") ? productModelInfo[0].unit : ""))
        document.querySelector("#modalEditBestbefore").value = (fetchedProductInfo[0].bestbefore ? fetchedProductInfo[0].bestbefore : "")
        document.querySelector("#modelEditLocation").value = (fetchedProductInfo[0].shelfLocation ? fetchedProductInfo[0].shelfLocation : "")
        document.querySelector("#modelEditPOnumber").value = (fetchedProductInfo[0].POnumber ? fetchedProductInfo[0].POnumber : (fetchedProductInfo[0].POIPnumber ? fetchedProductInfo[0].POIPnumber : ""))
        document.querySelector("#modelEditUnitprice").value = (fetchedProductInfo[0].unitPrice ? fetchedProductInfo[0].unitPrice :
            (productModelInfo.length > 0 && productModelInfo[0].hasOwnProperty("unitPrice") ? productModelInfo[0].unitPrice : ""))
        document.querySelector("#modelCheckboxConsumed").checked = (fetchedProductInfo[0].removed === 1)
        document.querySelector("#modelEditConsumeTime").value = (fetchedProductInfo[0].removeTime ? fetchedProductInfo[0].removeTime : "")
        document.querySelector("#editModalSubmitBtn").disabled = false
    }

    document.querySelector("#editModalSubmitBtn").addEventListener("click", async (ev) => {
        document.querySelector("#editModalSubmitBtn").disabled = true
        document.querySelector("#editModalSubmitBtn").textContent = "Updating"
        let updateTarget = {}
        if (document.querySelector("#modalEditQuantity").value) {
            fetchedProductInfo[0].quantity = document.querySelector("#modalEditQuantity").value
        }
        if (document.querySelector("#modalEditUnit").value) {
            fetchedProductInfo[0].quantityUnit = document.querySelector("#modalEditUnit").value
        }
        if (document.querySelector("#modalEditBestbefore").value) {
            fetchedProductInfo[0].bestbefore = document.querySelector("#modalEditBestbefore").value
        }
        if (document.querySelector("#modelEditLocation").value) {
            fetchedProductInfo[0].shelfLocation = document.querySelector("#modelEditLocation").value
        }
        if (document.querySelector("#modelEditPOnumber").value) {
            fetchedProductInfo[0].POnumber = document.querySelector("#modelEditPOnumber").value
        }

        try {
            // 直接insert新数据到库中，然后删除旧数据即可
            let insertResult = await insertToPollinglog([fetchedProductInfo[0]])
            let deleteResult = await deletePrefillData(requestLabelId)
            setTimeout(function () {
                bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
                window.location.reload()
            }, 2000)

        } catch (e) {
            console.error(`Error while Patching Data:`, e)
        }
    })
})

let removeModal = document.querySelector("#removeModal")
removeModal.addEventListener("show.bs.modal", function (ev) {
    let labelId = ev.relatedTarget.getAttribute("data-bs-itemId")
    removeModal.querySelector("#removeModal_labelid").value = labelId
    document.querySelector("#removeModalYes").disabled = false
    document.querySelector("#removeModalYes").textContent = "Confirm"
})
removeModal.querySelector("#removeModalYes").addEventListener("click", async function (ev) {
    // 收到用户的确认请求，移除该库存
    ev.preventDefault()
    let labelId = removeModal.querySelector("#removeModal_labelid").value
    console.log(labelId)
    let model = bootstrap.Modal.getInstance(document.querySelector("#removeModal"));
    document.querySelector("#removeModalYes").disabled = true
    document.querySelector("#removeModalYes").textContent = "Updating"
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
            retryWrites: false
        }
    });
    try {
        await client.connect();
        const session = client.db(targetDB).collection("preloadlog");
        let result = await session.deleteMany({productLabel: labelId})
        console.log(result)
    } catch (e) {
        console.error(`Remove Stock Error when process: ${labelId};`, e)
    } finally {
        await client.close()
        model.hide()
        await redrawTable();
    }
})


async function getPrefillDatas() {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let result = []
    try {
        await client.connect();
        const session = client.db(targetDB).collection("preloadlog");
        result = await session.find({}).toArray()
    } catch (e) {
        console.error("Error when fetching preload data: ", e)
    } finally {
        await client.close()
    }
    return result
}
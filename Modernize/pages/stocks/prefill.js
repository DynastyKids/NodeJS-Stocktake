const { ipcRenderer } = require('electron');
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
    lengthMenu:[10,15,25,50,100],
    columns: [{"width": "25%"}, {"width": "15%"}, {"width": "15%"}, {"width": "10%"}, {"width": "20%"}, null],
});

document.addEventListener("DOMContentLoaded",async function () {
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
        console.error(`Remove Stock Error when process: ${labelId};`,e)
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
        console.error("Error when fetching preload data: ",e)
    } finally {
        await client.close()
    }
    return result
}
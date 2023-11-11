// 使用pollingsession的结果，distinct掉相同的labelid，然后删除所有在listproduct中标注
// 了已经使用的产品，再加入到productlist中展示出来，，页面每30s刷新一次
// const {BrowserWindow} = require("electron").remote;

const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const ObjectID = require("mongodb").ObjectId

var $ = require("jquery");
const DataTable = require('datatables.net-responsive-bs5')(window, $);

let table;
let dataset = [];

const Storage = require("electron-store");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const path = require('path');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const {ipcRenderer} = require("electron");

window.onload = async () => {
    table = new DataTable('#productTable', {
        responsive: true,
        paging: false,
        searching:false,
        columns: [null, {"width": "45%"}, null, null, null],
        order: [0, 'asc'],
        data: await fetchTablesData()
    });
}

document.querySelector("#act_print").addEventListener("click",(ev)=>{
    ipcRenderer.send('print');
});

document.querySelector("#act_reload").addEventListener("click", async (ev) => {
    // 仅重新加载表格
    if (table) {
        table.clear().draw()
        let results = await fetchTablesData();
        table.rows.add(results).draw()
    }
})

async function fetchTablesData(){
    let results = await fetchProducts();
    dataset = []
    results.forEach(eachItem =>{
        dataset.push([
            eachItem.productCode,
            eachItem.labelname,
            `${(eachItem.cartonQty ? eachItem.cartonQty + (eachItem.unit ? " " + eachItem.unit : "") : " - ")}`,
            `${(eachItem.palletQty ? eachItem.palletQty + (eachItem.unit ? " " + eachItem.unit : "") : " - ")}` +
            `${((eachItem.cartonQty && eachItem.palletQty) ? "<br><small>" + eachItem.palletQty / eachItem.cartonQty + " ctns</small>" : "")}`,
            `${(eachItem.withBestbefore > 0 ? "√" : "")}`
        ]);
    })
    return dataset;
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
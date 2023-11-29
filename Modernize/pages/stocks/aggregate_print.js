const { ipcRenderer } = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const moment = require('moment-timezone')

const Storage = require("electron-store");
const newStorage = new Storage();
const path = require('path');

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const {setInterval} = require('timers');

let fullResultSet = [];
let table = new DataTable('#table', {
    responsive: true,
    paging:false,
    searching: false,
});
let shouldRefresh = true;
const countdownFrom = 60;
let countdown = 60;

document.querySelector("#act_print").addEventListener("click",(ev)=>{
    ipcRenderer.send('print');
});

document.addEventListener("DOMContentLoaded", async (event) => {
    console.log(await getAllStockItems())
    let fetchedData= await getAllStockItems()
    let finalDisplay = []

    fetchedData.products.forEach(eachProduct =>{
        let purposedCol1 = `${eachProduct.productCode} - ${eachProduct.labelname}`
        let purposedCol2 = []          // Col2 use to store quantity  {qty / unit}

        fetchedData.stocks.forEach(eachStock =>{
            if (eachStock.productCode === eachProduct.productCode){
            //     当找到产品后，查找是否有相同单位的产品，如果没有则直接插入一条新纪录
                var inserted = false
                for (let i = 0; i < purposedCol2.length; i++) {
                    if (purposedCol2[i].unit.includes(eachStock.quantityUnit) || eachStock.quantityUnit.includes(purposedCol2[i].unit)){
                        purposedCol2[i].quantity += parseInt(eachStock.quantity)
                        inserted = true
                        break;
                    }
                }
                if (!inserted){
                    purposedCol2.push({quantity: parseInt(eachStock.quantity), unit: eachStock.quantityUnit})
                }
            }
        })
        if (purposedCol2.length > 0 ){
            finalDisplay.push({product: purposedCol1, quantityInfo: purposedCol2})
        }
    })

    table.clear().draw()
    finalDisplay.forEach(eachRow =>{
        var quantityInfoText = ""
        for (let i = 0; i < eachRow.quantityInfo.length; i++) {
            quantityInfoText += `${eachRow.quantityInfo[i].quantity} ${eachRow.quantityInfo[i].unit}<br>`
        }

        table.row.add([
            eachRow.product,
            quantityInfoText
        ]).draw()
    })
    

    console.log(finalDisplay)
});

async function getAllStockItems() {
    document.querySelector("#loadingStatus").style.removeProperty("display")
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    const sessions = client.db(targetDB);
    let result = {stocks:[],products:[]}
    try {
        await client.connect();
        result.stocks = await sessions.collection("pollinglog").find({removed: 0}, {sort: {productCode: -1}}).toArray()
        result.products = await sessions.collection("products").find({}).toArray()
    } catch (err) {
        console.error(err)
    } finally {
        await client.close()
        document.querySelector("#loadingStatus").style.display = "none"
    }
    return result
}

document.querySelector("#printlink").addEventListener("click",(ev)=>{
    ipcRenderer.send('print');
});
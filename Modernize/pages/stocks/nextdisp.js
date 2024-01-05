const { ipcRenderer } = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();
const path = require('path');

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const {setInterval} = require('timers');

let shouldRefresh = true;
const countdownFrom = 90;
let countdown = 90;

let table = new DataTable('#table', {
    responsive: true,
    pageLength: 25,
    lengthMenu:[10,15,25,50,100, -1],
    columns: [{"width": "40%"}, {"width": "15%"},{"width": "15%"},{"width": "15%"},{"width": "15%"}],
    order: [[1, 'asc']],
    columnDefs: [{ targets: [1,2,3], className: 'datatable-Col-txtcenter' }]
});
document.addEventListener("DOMContentLoaded", async (event) => {
    // 页面自动刷新
    const automaticRefresh = setInterval(() => {
        if (shouldRefresh) {
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
            location.reload()
        }
    })

    let stockList = await fetchStockslist()       ;
    let displayList = assembleDisplayArray(stockList);
    displayList.forEach(eachRow=>{
        table.row.add([
            `${(eachRow.hasOwnProperty("productCode") ? eachRow.productCode : "")} - ${eachRow.hasOwnProperty("productName") ? eachRow.productName : ""}`,
            `${(eachRow.next.length>0 ? eachRow.next[0].location+(eachRow.next[0].quarantine === 1 ? `<span style="color: orange"><i class="ti ti-zoom-question"></i></span>`: "")+"<br>"+(eachRow.next[0].bestbefore ? eachRow.next[0].bestbefore: "") :"")}`,
            `${(eachRow.next.length>1 ? eachRow.next[1].location+(eachRow.next[1].quarantine === 1 ? `<span style="color: orange"><i class="ti ti-zoom-question"></i></span>`: "")+"<br>"+(eachRow.next[1].bestbefore ? eachRow.next[1].bestbefore: ""):"")}`,
            `${(eachRow.next.length>2 ? eachRow.next[2].location+(eachRow.next[2].quarantine === 1 ? `<span style="color: orange"><i class="ti ti-zoom-question"></i></span>`: "")+"<br>"+(eachRow.next[2].bestbefore ? eachRow.next[2].bestbefore: ""):"")}`,
            `${(eachRow.next.length>3 ? eachRow.next[3].location+(eachRow.next[3].quarantine === 1 ? `<span style="color: orange"><i class="ti ti-zoom-question"></i></span>`: "")+"<br>"+(eachRow.next[3].bestbefore ? eachRow.next[3].bestbefore: ""):"")}`,
        ]).draw(false)
    })
});

async function fetchStockslist () {
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, strict: true, deprecationErrors: true,
            useNewUrlParser: true, useUnifiedTopology: true}
    });
    let results;
    try {
        await client.connect();
        const sessions = client.db(targetDB).collection("pollinglog");
        const options = {'productCode': 1, 'bestbefore': 1, 'productLabel': 1};
        results = await sessions.find({removed: 0}, {projection: {"_id": 0 }}).sort(options).toArray();
    } catch (e) {
        console.error(e)
    } finally {
        await client.close()
    }
    return results
}

function assembleDisplayArray(stockData){
    let result =[]
    if (Array.isArray(stockData)){
        if (stockData.length > 0){
            result.push({
                productCode: stockData[0].productCode ? stockData[0].productCode : ``,
                productName: stockData[0].productName ? stockData[0].productName : ``,
                next:[{
                    location: stockData[0].hasOwnProperty("shelfLocation") ? stockData[0].shelfLocation : "",
                    bestbefore: stockData[0].hasOwnProperty("bestbefore") ? stockData[0].bestbefore : "",
                    quarantine: stockData[0].hasOwnProperty("quarantine") ? parseInt(stockData[0].quarantine) : 0,
                }]
            })
        }
        for (let i = 1; i < stockData.length; i++) {
            var foundFlag = false
            for (let j = 0; j < result.length; j++) {
                 if (result[j].productCode === stockData[i].productCode){
                     foundFlag = true
                     result[j].next.push({
                         location: stockData[i].hasOwnProperty("shelfLocation") ? stockData[i].shelfLocation : "",
                         bestbefore: stockData[i].hasOwnProperty("bestbefore") ? stockData[i].bestbefore : "",
                         quarantine: stockData[i].hasOwnProperty("quarantine") ? parseInt(stockData[i].quarantine) : 0,
                     })
                     break;
                 }
            }
            if (!foundFlag){
                result.push({
                    productCode: stockData[i].hasOwnProperty("productCode") ? stockData[i].productCode : ``,
                    productName: stockData[i].hasOwnProperty("productName") ? stockData[i].productName : ``,
                    next:[{
                        location: stockData[i].hasOwnProperty("shelfLocation") ? stockData[i].shelfLocation : "",
                        bestbefore: stockData[i].hasOwnProperty("bestbefore") ? stockData[i].bestbefore : "" ,
                        quarantine: stockData[i].hasOwnProperty("quarantine") ? parseInt(stockData[i].quarantine) : 0
                    }]
                })
            }
        }
    }
    return result
}

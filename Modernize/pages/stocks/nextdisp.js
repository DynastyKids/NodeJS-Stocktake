const { ipcRenderer } = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const {setInterval} = require('timers');

let shouldRefresh = true;
const countdownFrom = 90;
let countdown = 90;
let stockList = [];
let table = new DataTable('#table', {
    responsive: true,
    pageLength: 25,
    lengthMenu:[10,15,25,50,100, -1],
    columns: [{"width": "40%"}, {"width": "15%"},{"width": "15%"},{"width": "15%"},{"width": "15%"}],
    order: [[1, 'asc']],
    columnDefs: [{ targets: [1,2,3,4], className: 'datatable-Col-txtcenter' }]
});

document.addEventListener("DOMContentLoaded", async (event) => {
    await redrawStockList(true)

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

    document.querySelector("#act_pause").addEventListener("click", async (ev) => {
        shouldRefresh = !shouldRefresh
        if (!shouldRefresh) {
            clearInterval(automaticRefresh)
            document.querySelector("#act_pause").innerText = "Resume Timer";
        } else {
            document.querySelector("#act_pause").innerText = "Pause Timer";
            await redrawStockList(true)
        }
    })
});

document.querySelector("#act_reloadTable").addEventListener("click",async (ev)=>{
    await redrawStockList(true)
})

async function redrawStockList(forced = false) {
    document.querySelector("#loadingStatus").style = ""
    table.clear().draw()
    let displayList = assembleDisplayArray(await fetchStockslist(forced));
    displayList.forEach(eachRow => {
        table.row.add([
            `${(eachRow.hasOwnProperty("productCode") ? eachRow.productCode : "")} - ${eachRow.hasOwnProperty("productName") ? eachRow.productName : ""}`,
            `${(eachRow.next.length > 0 ? `<a href="#" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-labelId="${eachRow.next[0].productLabel}">` + String(eachRow.next[0].location).toUpperCase() + (eachRow.next[0].quarantine === 1 ? `<span style="color: orange"><i class="ti ti-zoom-question"></i></span>` : "") + "<br>" + (eachRow.next[0].bestbefore ? eachRow.next[0].bestbefore : "") + `</a>` : "")}`,
            `${(eachRow.next.length > 1 ? `<a href="#" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-labelId="${eachRow.next[1].productLabel}">` + String(eachRow.next[1].location).toUpperCase() + (eachRow.next[1].quarantine === 1 ? `<span style="color: orange"><i class="ti ti-zoom-question"></i></span>` : "") + "<br>" + (eachRow.next[1].bestbefore ? eachRow.next[1].bestbefore : "") + `</a>` : "")}`,
            `${(eachRow.next.length > 2 ? `<a href="#" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-labelId="${eachRow.next[2].productLabel}">` + String(eachRow.next[2].location).toUpperCase() + (eachRow.next[2].quarantine === 1 ? `<span style="color: orange"><i class="ti ti-zoom-question"></i></span>` : "") + "<br>" + (eachRow.next[2].bestbefore ? eachRow.next[2].bestbefore : "") + `</a>` : "")}`,
            `${(eachRow.next.length > 3 ? `<a href="#" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-labelId="${eachRow.next[3].productLabel}">` + String(eachRow.next[3].location).toUpperCase() + (eachRow.next[3].quarantine === 1 ? `<span style="color: orange"><i class="ti ti-zoom-question"></i></span>` : "") + "<br>" + (eachRow.next[3].bestbefore ? eachRow.next[3].bestbefore : "") + `</a>` : "")}`,
        ]).draw(false)
    })
    document.querySelector("#loadingStatus").style = "display: none"
}

let removeModalObject = {}
document.querySelector("#removeModal").addEventListener("show.bs.modal", function (ev) {
    var labelId = ev.relatedTarget.getAttribute("data-bs-labelId")

    document.querySelector("#removeModal_labelid").value = labelId
    document.querySelector("#removeModal_btnConfirm").disabled = false
    document.querySelector("#removeModal_btnConfirm").textContent = "Confirm"

    if (stockList.length >0){
        for (let i = 0; i < stockList.length; i++) {
            if (stockList[i].productLabel === labelId){
                removeModalObject = stockList[i]
                document.querySelector("#removeModal p").textContent = `Remove '${stockList[i].productName}' from location '${stockList[i].shelfLocation}'?`
            }
        }
    }
})
document.querySelector("#removeModal_btnConfirm").addEventListener("click", async function (ev) {
    document.querySelector("#removeModal_btnConfirm").disabled = true
    document.querySelector("#removeModal_btnConfirm").textContent = "Updating"
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, strict: true, deprecationErrors: true,
            useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    try {
        await client.connect();
        const sessions = client.db(targetDB).collection("pollinglog");
        let result = await sessions.deleteMany({productLabel: removeModalObject.productLabel});
    } catch (e) {
        console.error(e)
    } finally {
        await client.close()
        bootstrap.Modal.getInstance(document.querySelector("#removeModal")).hide()
        await redrawStockList(true)
    }
})

async function fetchStockslist (forced = false) {
    if (forced || stockList.length <=0){
        let client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        });
        try {
            await client.connect();
            const sessions = client.db(targetDB).collection("pollinglog");
            const options = {'productCode': 1, 'bestbefore': 1, 'productLabel': 1};
            stockList = await sessions.find({removed: 0}, {projection: {"_id": 0 }}).sort(options).toArray();
        } catch (e) {
            console.error(e)
        } finally {
            await client.close()
        }
    }
    return stockList
}

function assembleDisplayArray(stockData){
    let result =[]
    if (Array.isArray(stockData)){
        for (let i = 0; i < stockData.length; i++) {
            if (stockData[i].displayFIFO && stockData[i].displayFIFO !== 1){
                continue;
            }
            var foundFlag = false
            for (let j = 0; j < result.length; j++) {
                 if (result[j].productCode === stockData[i].productCode){
                     foundFlag = true
                     result[j].next.push({
                         productLabel: stockData[i].hasOwnProperty("productLabel") ? stockData[i].productLabel : null,
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
                        productLabel: stockData[i].hasOwnProperty("productLabel") ? stockData[i].productLabel : null,
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

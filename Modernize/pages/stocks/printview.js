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

let fullResultSet = [];
let table = new DataTable('#table', {
    responsive: true,
    paging:false,
    searching: false,
    columns: [{"width": "25%"}, {"width": "15%"}, {"width": "15%"}, {"width": "10%"}, {"width": "20%"}, null],
    order: [[3, 'asc']],
    orderFixed: [ 3, 'asc']
});
let shouldRefresh = true;
const countdownFrom = 60;
let countdown = 60;


document.querySelector("#switchCheck").addEventListener("change", function(ev){
    refreshCheckSwitch()
});

document.querySelector("#act_print").addEventListener("click",(ev)=>{
    ipcRenderer.send('print');
});

function refreshCheckSwitch(){
    if (document.querySelector("#switchCheck").checked){
        document.querySelector("#switchDiv span").textContent = "Showing all stocks."
        loadStockInfoToTable(true)
    } else {
        document.querySelector("#switchDiv span").textContent = "Showing current stocks only"
        loadStockInfoToTable(false)
    }
}

document.addEventListener("DOMContentLoaded", (event) => {
    const URLqueries = new URLSearchParams(window.location.search)
    document.querySelector("#switchCheck").checked = ( URLqueries.get('q') ? true : false) // 该query存在则拉取所有数据
    refreshCheckSwitch()
});

document.querySelector("#areloadTable").addEventListener("click",function (ev) {
    if (document.querySelector("#switchCheck").checked){
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.0')
        loadStockInfoToTable(true)
    } else {
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.1')
        loadStockInfoToTable(false)
    }
})

document.querySelector("#filterdate").addEventListener("change", (ev)=>{
    if (document.querySelector("#switchCheck").checked){
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.0')
        loadStockInfoToTable(true)
    } else {
        document.querySelector("#switchCheckLabel").textContent = i18next.t('liststocks.switchCheck.1')
        loadStockInfoToTable(false)
    }
});


function loadStockInfoToTable(fetchAll) {
    table.clear().draw()
    let requestAllData = fetchAll ? fetchAll : false
    const URLqueries = new URLSearchParams(window.location.search)
    requestAllData = (URLqueries.get('q') ? true : requestAllData) // 该query存在则拉取所有数据
    getAllStockItems(requestAllData).then(result => {
        if (result.acknowledged) {
            let results = result.resultSet
            fullResultSet = result.resultSet
            table.column(2).order('asc');
            for (let index = 0; index < results.length; index++) {
                const element = results[index];
                if (document.querySelector("#filterdate").value !== "") {
                    console.log(document.querySelector("#filterdate").value)
                    if (element.loggingTime && new Date(element.loggingTime) < new Date(document.querySelector("#filterdate").value)) {
                        continue;
                    }
                }
                table.row.add([
                    `${element.productCode} - ${element.productName}`,
                    `${element.quantity} ${element.quantityUnit}`,
                    (element.bestbefore ? element.bestbefore : ""),
                    (element.shelfLocation ? element.shelfLocation : ""),
                    `<small>${(element.productLabel ? element.productLabel : "")}</small>`,
                    (element.removed < 1 ? `` : `<small class="table_action_removed">${(element.removeTime ? "Removed on " + element.removeTime.split(" ")[0]: "")}</small>`)
                ]).draw(false);
            }
        }
    })
}

async function getAllStockItems(getAll) {
    document.querySelector("#loadingStatus").style.removeProperty("display")
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    const sessions = client.db(targetDB).collection("pollinglog");
    let cursor;
    let result = {acknowledged: false, resultSet: [], message: ""}
    try {
        const options = {sort: {bestbefore: -1},}
        await client.connect();
        if (getAll){
            cursor = await sessions.find({}, options)
        } else {
            cursor = await sessions.find({removed: 0}, options)
        }
        result.acknowledged = true
        result.resultSet = await cursor.toArray()
        console.log(result)
    } catch (err) {
        console.error(err)
        result['message'] = err
    } finally {
        await client.close()
        document.querySelector("#loadingStatus").style.display = "none"
    }
    return result
}

document.querySelector("#printlink").addEventListener("click",(ev)=>{
    ipcRenderer.send('print');
});
const {ipcRenderer} = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

let table = new DataTable('#table', {
    responsive: true,
    pageLength: 10,
    lengthMenu:[10,15,25,50,100],
});

const urlParams = new URLSearchParams(window.location.search)
const session = urlParams.get("session")
document.addEventListener("DOMContentLoaded", async () => {
    document.querySelector("#breadcrumb_viewSession").textContent = `View Session ${session}`
    if (!session){
    //     没有给定Session Code，弹出Alert， 3s后跳转回stock.index
        document.querySelector("#alertAnchor").append(createAlert("danger","Missing Parameter: session code; Redirect to session list in 5 seconds."))
        setTimeout(function(){
            window.location.replace('../sessions/index.html')
        },5000)

    }
    let shelfResults = await fetchStockBySession(session)
    if (shelfResults.length <=0 ){
        document.querySelector("#alertAnchor").append(createAlert("warning","No result found, redirect back to session list in 5 seconds."))
        setTimeout(function(){
            window.location.replace('../sessions/index.html')
        },5000)
    }
    console.log(shelfResults)
    table.clear().draw()
    shelfResults.forEach(eachResult =>{
        table.row.add([
            `${(eachResult.productCode ? eachResult.productCode + ` - ` + (eachResult.productName ? eachResult.productName : "") : "")}`,
            `${(eachResult.quantity ? eachResult.quantity + ` ` + (eachResult.quantityUnit ? eachResult.quantityUnit : "") : "")}`,
            `${(eachResult.bestbefore ? eachResult.bestbefore : "")}`,
            (eachResult.shelfLocation ? `<a href=../stocks/location.html?location=${eachResult.shelfLocation}>${eachResult.shelfLocation}</a>` : ""),
            `${(eachResult.productLabel ? eachResult.productLabel : "")}`
        ]).draw(false)
    })

})

function createAlert(type = "info", context=""){
//     type: info, success, danger, warning
    let alertElement = document.createElement("div")
    alertElement.setAttribute("role","alert")
    if (type === "success"){
        alertElement.className = "alert alert-success alert-dismissible bg-success text-white border-0 fade show"
    } else if (type === "danger"){
        alertElement.className = "alert alert-info alert-dismissible bg-info text-red border-0 fade show"
    } else if (type === "warning"){
        alertElement.className = "alert alert-warning alert-dismissible bg-warning text-yellow border-0 fade show"
    } else {
        alertElement.className = "alert alert-info alert-dismissible bg-info text-black border-0 fade show"
    }
    alertElement.innerHTML = `<button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert" aria-label="Close"></button>`
    let alertText = document.createElement("span")
    alertText.innerText = context
    alertElement.append(alertText)

    return alertElement
}


async function fetchStockBySession(session) {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    const sessions = client.db(targetDB).collection("pollinglog");
    let result = []
    try {
        await client.connect();
        result = await sessions.find({"sessions": session}).toArray()
    } catch (err) {
        console.error(err)
    } finally {
        await client.close()
        document.querySelector("#loadingStatus").style.display = "none"
    }
    return result
}

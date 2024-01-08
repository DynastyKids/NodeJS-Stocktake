const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");
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
    order: [[0, 'asc']]
});

document.addEventListener("DOMContentLoaded", async (event) => {
    let queries = getQueryParams(window.location)
    if (!queries.hasOwnProperty("session")){
        createAlert("warning","Session Code is not provided, return to Snapshot home page in 3 seconds")
        setTimeout(function(){
            window.location.replace('../sessions/index.html')
        },3000)
    } else {
        document.querySelector(".container-fluid h4").textContent = `View Snapshot ${queries.session}`
        buildTable(await fetchStockBySessioncode(queries.session))
    }
});

document.querySelector("#act_reloadTable").addEventListener("click",  async (ev) => {
    let queries = getQueryParams(window.location)
    let stocks = await fetchStockBySessioncode(queries.session)
    buildTable(stocks)
})

function buildTable(stocks = []) {
    document.querySelector("#loadingStatus").style = ""
    if (stocks.length > 0) {
        table.clear().draw()
        for (let i = 0; i < stocks.length; i++) {
            table.row.add([i + 1,
                `${(stocks[i].hasOwnProperty("productCode") ? stocks[i].productCode : "")}${(stocks[i].hasOwnProperty("productCode") && stocks[i].hasOwnProperty("productName") ? " - " : "")}${(stocks[i].hasOwnProperty("productName") ? stocks[i].productName : "")}`,
                `${(stocks[i].hasOwnProperty("quantity") ? stocks[i].quantity + " " + (stocks[i].hasOwnProperty("quantityUnit") ? stocks[i].quantityUnit : "") : "")}`,
                `${(stocks[i].hasOwnProperty("bestbefore") ? stocks[i].bestbefore : "")}`,
                `${(stocks[i].hasOwnProperty("shelfLocation") ? stocks[i].shelfLocation : "")}`,
                `${(stocks[i].hasOwnProperty("productLabel") ? stocks[i].productLabel : "")}`,
                `<a href="#" class="actions removeModal" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-dataId="${stocks[i]._id}">Delete</a>`
            ]).draw(false);
        }
    }
    document.querySelector("#loadingStatus").style = "display: none"
}

document.querySelector("#removeModal").addEventListener("show.bs.modal", function (ev) {
    var dataID = ev.relatedTarget.getAttribute("data-bs-dataId")
    let queries = getQueryParams(window.location)
    document.querySelector("#removeModal_dataId").value = dataID
    document.querySelector("#removeModal_mainText").innerHTML = `Are you sure to delete this record from this snapshot list?<br><br>This action cannot be reverted.`
    document.querySelector("#removeModal_btnConfirm").disabled = false
    document.querySelector("#removeModal_btnCancel").disabled = false
    document.querySelector("#removeModal_btnConfirm").textContent = "Confirm"
    document.querySelector("#removeModal_btnConfirm").addEventListener("click", async function (ev) {
        document.querySelector("#removeModal_statusText").textContent = "Processing..."
        document.querySelector("#removeModal_btnConfirm").disabled = true
        document.querySelector("#removeModal_btnCancel").disabled = true

        let response  = await removeSessionFromStock(queries.session ,dataID)
        if (response.acknowledged) {
            if (response.matchedCount === response.modifiedCount && response.modifiedCount === 1) {
                createAlert("success", "The log has been pulled out from current snapshots.")
            } else if (response.matchedCount === 0 ){
                createAlert("warning", "No matching log has found in current snapshots. Skipped")
            }
            bootstrap.Modal.getInstance(document.querySelector("#removeModal")).hide()
            buildTable(await fetchStockBySessioncode(queries.session))
        } else {
            createAlert("error", `Error occurred when processing delete on ${dataId}`)
            document.querySelector("#removeModal_statusText").textContent = `Error occurred when processing delete on ${dataId}`
            document.querySelector("#removeModal_btnConfirm").disabled = false
            document.querySelector("#removeModal_btnCancel").disabled = false
        }
    })
})

async function removeSessionFromStock(sessionCode = "", stockId = "") {
    let results = {acknowledged: false}
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    const sessions = client.db(targetDB).collection("pollinglog");
    const condition = {_id: new ObjectId(stockId)}
    let result;
    try {
        await client.connect();
        results = await sessions.updateOne(condition, {$pull:{ sessions:sessionCode }});
    } finally {
        await client.close();
    }
    return results;
}

async function fetchStockBySessioncode(sessionCode = "") {
    let stocks = []
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    const options = {};
    const sessions = client.db(targetDB).collection("pollinglog");
    const condition = {sessions: sessionCode}
    let result;
    try {
        await client.connect();
        stocks = await sessions.find(condition, options).toArray();
    } finally {
        await client.close();
    }
    return stocks;
}

function getQueryParams(url) {
    let queryParams = {};
    let searchParams = new URLSearchParams((new URL(url)).search);
    for (let [key, value] of searchParams.entries()) {
        queryParams[key] = value;
    }
    return queryParams;
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
    } else if (status === "warning") {
        alertElement.className= "alert alert-secondary alert-dismissible bg-warning text-white border-0 fade show"
        svgImage.ariaLabel = "Warning: "
        svgImage.innerHTML = `<use xlink:href="#info-fill"/>`
    } else {
        alertElement.className= "alert alert-secondary alert-dismissible bg-info text-white border-0 fade show"
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
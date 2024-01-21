const Storage = require("electron-store");
const newStorage = new Storage();

const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

document.addEventListener("DOMContentLoaded",async function () {
    let productRecords = await getRecords()
    let today = new Date()
    document.querySelector("#inpt_endDate").value = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`
    let lastyear = new Date()
    lastyear.setFullYear(new Date().getFullYear() - 1)
    document.querySelector("#inpt_startDate").value = `${lastyear.getFullYear()}-${lastyear.getMonth() + 1}-${lastyear.getDate()}`

    inflateTable(productRecords.products, productRecords.productlogs)
    document.querySelector("#loadingStatus").style = "display: none"
})

document.querySelector("#btn_filter").addEventListener("click",async (ev) => {
    ev.preventDefault()
    let direction = document.querySelector("#inpt_direction").value
    let startDate = document.querySelector("#inpt_startDate").value
    let endDate = document.querySelector("#inpt_endDate").value

    if (new Date(endDate) - new Date(startDate) <= 0) {
        var alert = document.createElement("div")
        alert.className = "alert alert-danger alert-dismissible bg-error text-red border-0 fade show"
        alert.setAttribute("role", "alert")
        alert.innerHTML = `<button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert" aria-label="Close"></button>
                <span id="alert_text"><strong>Date Error</strong> - Start Date must smaller than End Date.</span>`
        document.querySelector("#alertAnchor").append(alert)

        setTimeout(function () {
            alert.style = "display:none"
        }, 3000)
    } else {
        let updateResult = await getRecords(100000, new Date(startDate.value), new Date(endDate.value))
        inflateTable(updateResult.products, updateResult.productlogs, direction)
    }
    console.log(new Date(endDate) - new Date(startDate))
})

document.querySelector("#inpt_endDate").addEventListener("change",(ev)=>{
    let startDate = document.querySelector("#inpt_startDate")
    let endDate = document.querySelector("#inpt_endDate")
    endDate.className = "form-control"
    startDate.className = "form-control"
    if (new Date(endDate.value) - new Date(startDate.value) <= 0) {
        endDate.className = "form-control is-invalid"
        startDate.className = "form-control is-invalid"
    }
})

document.querySelector("#inpt_startDate").addEventListener("change",(ev)=>{
    let startDate = document.querySelector("#inpt_startDate")
    let endDate = document.querySelector("#inpt_endDate")
    endDate.className = "form-control"
    startDate.className = "form-control"
    if (new Date(endDate.value) - new Date(startDate.value) <= 0) {
        endDate.className = "form-control is-invalid"
        startDate.className = "form-control is-invalid"
    }
})

let table = new DataTable('#table', {
    responsive: true,
    pageLength: 25,
    lengthMenu:[10,15,25,50,100,-1],
    columnDefs: [
        {
            target: 1,
            visible: false,
            render: function (data) {
                return new Date(data).getTime()
            }
        },
    ],
    order: [[1, 'desc']],
});
function inflateTable(productsArray, productlogsArray, direction="ALL"){
    if (Array.isArray(productlogsArray) && Array.isArray(productsArray)){
        table.clear().draw()
        // 收到ProductLogsArray后添加一个field为对比时间，进出方向
        let fullCompareArray =[]
        productlogsArray.forEach(eachProductlog=>{
            var pushElement = eachProductlog
            if (eachProductlog.hasOwnProperty("removeTime") && eachProductlog.removed === 1 && (direction === "ALL" || direction === "OUT")){
                pushElement.compareTime = pushElement.removeTime
                pushElement.compareDirection = "OUT"
                fullCompareArray.push(pushElement)
            }
            if (eachProductlog.hasOwnProperty("createTime") && (direction === "ALL" || direction === "IN")){
                pushElement.compareTime = pushElement.createTime
                pushElement.compareDirection = "IN"
                fullCompareArray.push(pushElement)
            }
            if (eachProductlog.hasOwnProperty("locationRecords") && eachProductlog.locationRecords.length > 1 && (direction === "ALL" || direction === "MOVE")){
                // 至少有超过1次的移动记录，出了需要添加本次记录，还需要修改上一条的IN记录
                fullCompareArray[fullCompareArray.length - 1].shelfLocation = (eachProductlog.locationRecords[0].location ? eachProductlog.locationRecords[0].location : ``)
                for (let i = 1; i < eachProductlog.locationRecords.length; i++) {
                    var pushElement = eachProductlog
                    pushElement.compareTime = eachProductlog.locationRecords[i].datetime
                    pushElement.compareDirection = "MOVE"
                    pushElement.shelfLocation = eachProductlog.locationRecords[i].location
                    fullCompareArray.push(pushElement)
                }
            }
        })
        fullCompareArray.sort((a,b)=>new Date(b.compareTime).getTime() - new Date(a.compareTime).getTime())
        console.log(fullCompareArray)
        fullCompareArray.forEach(element =>{
            table.row.add([
                `${element.hasOwnProperty("compareDirection") ? element.compareDirection : ""}`,
                `${element.hasOwnProperty("compareTime") ? element.compareTime : ""}`,
                `${element.hasOwnProperty("compareTime") ? new Date(element.compareTime).toLocaleString('en-AU') : ""}`,
                `${element.hasOwnProperty("productCode") ? element.productCode : ""} - ${element.hasOwnProperty("productName") ? element.productName : ""}`,
                `${element.hasOwnProperty("quantity") ? element.quantity : ""} ${element.hasOwnProperty("quantityUnit") ? element.quantityUnit : ""}`,
                `${element.hasOwnProperty("bestbefore") && element.bestbefore? element.bestbefore : ""}`,
                `${element.hasOwnProperty("shelfLocation") && element.shelfLocation ? element.shelfLocation : ""}`
            ]).draw(false);
        })
    } else {
    //     Report Error message
    }
}

async function getRecords(limit = 100000, startDate = null, endDate = new Date()){
    // 默认筛选截止到今天的记录，如果用户限定了日期条件则仅筛选部分日期的部分
    if (startDate === null){
        startDate = new Date()
        startDate.setFullYear(new Date().getFullYear()-1)
    }
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    let result = {"products":[],"productlogs":[]}
    try {
        await client.connect()
        let products = await client.db(targetDB).collection("products").find({}).sort({"productCode":1}).toArray();
        let productLogs = await client.db(targetDB).collection("pollinglog").find({}).sort({"removeTime":-1,"loggingTime":-1}).limit(limit).toArray();
        result = {"products":products,"productlogs":productLogs}
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
        return result
    } finally {
        await client.close()
    }

    return result
}

function getRecentTransactions(recordsArray, limit = 500, direction = "both"){
    // Direction can be in/out/both
    let reorderedDupArray = []
    if (Array.isArray(recordsArray)) {
        if (direction=== "both" || direction === "in") {
            for (let i = 0; i < recordsArray.length; i++) {
                if (recordsArray[i].hasOwnProperty("loggingTime")) {
                    let pushElement = recordsArray[i]
                    pushElement.compTime = recordsArray[i].loggingTime
                    pushElement.direction = "in"
                    reorderedDupArray.push(pushElement)
                }
            }
        }
        if (direction=== "both" || direction === "out") {
            for (let i = 0; i < recordsArray.length; i++) {
                if (recordsArray[i].hasOwnProperty("removeTime")) {
                    let pushElement = recordsArray[i]
                    pushElement.compTime = recordsArray[i].removeTime
                    pushElement.direction = "out"
                    reorderedDupArray.push(pushElement)
                }
            }
        }
        reorderedDupArray.sort((a,b)=>new Date(b.compTime) - new Date(a.compTime))
    }
    return reorderedDupArray
}
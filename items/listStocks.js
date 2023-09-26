const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const fs = require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')
const {ipcRenderer} = require('electron')

const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))

const {setInterval} = require('timers');
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
});

var $ = require('jquery');
var DataTable = require('datatables.net')(window, $);
require('datatables.net-responsive');


let table = new DataTable('#stockTable', {
    responsive: true,
    pageLength: 50,
    columns: [{"width": "25%"}, null, null, {"width": "10%"}, null, null],
    order: [[2, 'asc']]
});
let shouldRefresh = true;
const countdownFrom = 120;
let countdown = 120;

let displayAll = false;

document.addEventListener("DOMContentLoaded", (event) => {
    loadStockInfoToTable()
    const automaticRefresh = setInterval(() => {
        if (shouldRefresh) {
            loadStockInfoToTable()
            countdown = countdownFrom;
        }
    }, countdownFrom * 1000)
    const countdownInterval = setInterval(() => {
        if (shouldRefresh) {
            countdown -= 1
            document.querySelector("#toggleRefreshText").innerText = `Automatic refresh in: ${countdown}s`
        }
    }, 1000)

    document.querySelector('#toggleRefresh').addEventListener('click', function () {
        shouldRefresh = !shouldRefresh;
        if (shouldRefresh) {
            document.querySelector("#toggleRefresh").innerText = "Pause"
            document.querySelector("#toggleRefresh").classList.remove("btn-outline-success")
            document.querySelector("#toggleRefresh").classList.add("btn-outline-warning")
            countdown = countdownFrom; // 重置倒计时
        } else {
            document.querySelector("#toggleRefresh").innerText = "Resume"
            document.querySelector("#toggleRefresh").classList.remove("btn-outline-warning")
            document.querySelector("#toggleRefresh").classList.add("btn-outline-success")
            document.querySelector('#toggleRefreshText').innerText = "Automatic refresh paused";
        }
    });
});

var consumeModal = document.querySelector("#consumeModal")
consumeModal.addEventListener("show.bs.modal", function (ev) {
    var button = ev.relatedTarget
    var lableID = button.getAttribute("data-bs-labelid")
    let hiddenInput = consumeModal.querySelector("#modalInputLabelid")
    hiddenInput.value = lableID
})

consumeModal.querySelector("#consumeModalYes").addEventListener("click", async function (ev) {
    ev.preventDefault()
    let labelId = consumeModal.querySelector("#modalInputLabelid").value
    let model = bootstrap.Modal.getInstance(document.querySelector("#consumeModal"));
    let localTime = moment(new Date()).tz("Australia/Sydney");
    try {
        await client.connect();
        const session = client.db(credentials.mongodb_db).collection("pollinglog");
        let result = await session.updateMany({productLabel: labelId, consumed: 0} , {$set: {consumed: 1, consumedTime: localTime.format("YYYY-MM-DD HH:mm:ss")}},{upsert: false})
        if (result.modifiedCount > 0 && result.matchedCount === result.modifiedCount) { //找到符合条件的数据且成功修改了
            console.log("Successfully update status for: ",labelId)
        } else if (result.matchedCount === 0) { //未找到符合条件的数据但成功执行了
            console.log(`Label ID: ${labelId} Not Found`)
        }
    } catch (e) {
        console.error(`Remove Stock Error when process: ${labelId};`,e)
    } finally {
        client.close()
        model.hide()
    }
})

function loadStockInfoToTable() {
    table.clear().draw()
    getAllStockItems().then(result => {
        if (result.acknowledged) {
            let results = result.resultSet
            table.column(2).order('asc');
            for (let index = 0; index < results.length; index++) {
                const element = results[index];
                table.row.add([
                    `${element.productCode} - ${element.productName}`,
                    `${element.quantity} ${element.quantityUnit}`,
                    element.bestbefore,
                    element.shelfLocation,
                    element.productLabel,
                    `<a href="#" data-bs-toggle="modal" data-bs-target="#consumeModal" data-bs-labelid="${element.productLabel}" style="margin: 0 2px 0 2px">Remove</a>`
                ]).draw(false);
            }
        }
    })
}

async function getAllStockItems() {
    let nowTime = moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss")
    const sessions = client.db(credentials.mongodb_db).collection("pollinglog");
    let cursor;
    let result = {acknowledged: false, resultSet: [], message: ""}
    try {
        const query = {consumed: 0}
        const options = {sort: {bestbefore: -1},}
        await client.connect();
        cursor = await sessions.find(query, options)
        if ((await sessions.countDocuments(query)) > 0) {
            result.acknowledged = true
            result.resultSet = await cursor.toArray()
        }
        console.log(result.resultSet)
    } catch (err) {
        console.error(err)
        result['message'] = err
    } finally {
        client.close()
    }

    return result
}
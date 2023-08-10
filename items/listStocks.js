const MongoClient = require('mongodb').MongoClient;
const { ServerApiVersion } = require('mongodb');
const fs = require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')
const { ipcRenderer } = require('electron')
const uri = encodeURI(credentials.mongodb_protocol + "://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");
const { setInterval } = require('timers');
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true } });

var $ = require('jquery');
const { response } = require('express');
var DataTable = require('datatables.net')(window, $);
require('datatables.net-responsive');


let table = new DataTable('#stockTable', {
    responsive: true,
    pageLength: 50,
    columns: [{ "width": "25%" }, null, null, { "width": "10%" }, null, null],
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

    // document.querySelector('#toggleLot').addEventListener('click', function () {
    //     displayAll = !displayAll;
    //     loadStockInfoToTable()
    //     if (!displayAll) {
    //         document.querySelector("#toggleLot").innerText = "Show All"
    //         document.querySelector("#toggleLot").classList.remove("btn-outline-info")
    //         document.querySelector("#toggleLot").classList.add("btn-outline-warning")
    //         document.querySelector('#toggleLotText').innerText = "Listing: Next 3 lots by date";
    //     } else {
    //         document.querySelector("#toggleLot").innerText = "Show next 3"
    //         document.querySelector("#toggleLot").classList.remove("btn-outline-warning")
    //         document.querySelector("#toggleLot").classList.add("btn-outline-info")
    //         document.querySelector('#toggleLotText').innerText = "Listing: All products by date";
    //     }
    // });
});

function loadStockInfoToTable() {
    table.clear().draw()
    getAllStockItems().then(result => {
        if (result.acknowledged) {
            let results = result.resultSet
            table.column(2).order('asc');
            for (let index = 0; index < results.length; index++) {
                const element = results[index];
                // table.row.add([`${element.productCode} - ${element.productName}`, `${element.quantity} ${element.quantityUnit}`, element.bestbefore, element.shelfLocation, element.productLabel, `<a href="#" data-bs-labelid="${element.productLabel}">Consume</a>`]).draw(false);
                table.row.add([`${element.productCode} - ${element.productName}`, `${element.quantity} ${element.quantityUnit}`, element.bestbefore, element.shelfLocation, element.productLabel, ``]).draw(false);
                // table.row.add([ `${element.productCode} - ${element.productName}`, `${element.quantity} ${element.quantityUnit}`, element.bestbefore, element.shelfLocation, element.productLabel,`<a href="#" data-bs-toggle="modal" data-bs-target="#consumeModal" data-bs-labelid="${element.productLabel}">Consume</a>`]).draw(false);
            }
        }
    })
}

async function getAllStockItems() {
    let nowTime = moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss")
    const sessions = client.db(credentials.mongodb_db).collection("pollinglog");
    let cursor;
    let result = { acknowledged: false, resultSet: [], message: "" }
    try {
        const query = { consumed: 0 }
        const options = { sort: { bestbefore: -1 }, }
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
    }

    return result
}
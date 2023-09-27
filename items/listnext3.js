const {setInterval} = require('timers');
const {remote, onWindowResize} = require('electron');
var $ = require('jquery');

const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const fs = require("fs");
const path = require("path");
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
});


let shouldRefresh = true;
const countdownFrom = 180;
let countdown = 180;

let productsDisplay = []
document.addEventListener("DOMContentLoaded", (event) => {
    // 页面自动刷新，默认为180s
    const automaticRefresh = setInterval(() => {
        if (shouldRefresh) {
            countdown = countdownFrom;
        }
    }, countdownFrom * 1000)
    const countdownInterval = setInterval(() => {
        if (shouldRefresh) {
            countdown -= 1
            document.querySelector("#refreshCountdown").innerText = `Refresh in: ${countdown}s`
        }
    }, 1000)

    fetchProducts();
    //跑马灯滚动
    const tbody = document.querySelector('#scroll-tbody');
});

async function fetchProducts() {
    try {
        await client.connect();
        const sessions = client.db(credentials.mongodb_db).collection("pollinglog");
        const query = {consumed: 0};
        const options = {'productCode': 1, 'bestbefore': 1, 'productLabel': 1};
        const cursor = sessions.find(query).sort(options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        const seenProducts = new Set();
        await cursor.forEach(product => {
            if (product.consumed === 0) {
                seenProducts.add(product);
            }
        });
        productsDisplay = build2DProductArray(seenProducts)
    } catch (e) {
        console.error(e)
    } finally {
        client.close()
        let htmlContent = '';
        productsDisplay.forEach(item => {
            if (item.bestbeforeArray.length > 0 && item.LocationArray.length > 0 && item.bestbeforeArray[0]) {
                htmlContent += `<tr><td class="tableItemName">${(item.productCode ? item.productCode : "")} ${item.productName}</td>`
                htmlContent += `<td class="tableNext1">${item.LocationArray[0]}<br>${item.bestbeforeArray[0]}</td>`
                if (item.bestbeforeArray.length > 1 && item.LocationArray.length > 1) {
                    htmlContent += `<td class="tableNext2">${item.LocationArray[1]}<br>${item.bestbeforeArray[1]}</td>`
                } else {
                    htmlContent += `<td class="tableNext2"></td>`
                }
                if (item.bestbeforeArray.length > 2 && item.LocationArray.length > 2) {
                    htmlContent += `<td class="tableNext2">${item.LocationArray[2]}<br>${item.bestbeforeArray[2]}</td>`
                } else {
                    htmlContent += `<td class="tableNext2"></td>`
                }
                htmlContent += `</tr>`
            }
        })
        document.querySelector("#table-body").innerHTML = htmlContent
    }
}

function build2DProductArray(productList) {
    let productArray = []
    productList.forEach(item => {
        if (productArray.length > 0 && item.productCode !== "") {
            console.log(productArray[productArray.length - 1])
            if (productArray[productArray.length - 1].productCode === item.productCode) {
                productArray[productArray.length - 1]["bestbeforeArray"].push(item.bestbefore.replaceAll("-", ""))
                productArray[productArray.length - 1]["LocationArray"].push(item.shelfLocation)
            } else {
                productArray.push(item)
                productArray[productArray.length - 1]["bestbeforeArray"] = [item.bestbefore.replaceAll("-", "")]
                productArray[productArray.length - 1]["LocationArray"] = [item.shelfLocation]
                delete productArray[productArray.length - 1].session;
                delete productArray[productArray.length - 1]._id;
                delete productArray[productArray.length - 1].POIPnumber;
                delete productArray[productArray.length - 1].consumed;
                delete productArray[productArray.length - 1].loggingTime;
            }
        } else {
            productArray.push(item)
            productArray[productArray.length - 1]["bestbeforeArray"] = [item.bestbefore.replaceAll("-", "")]
            productArray[productArray.length - 1]["LocationArray"] = [item.shelfLocation]
            delete productArray[productArray.length - 1].session;
            delete productArray[productArray.length - 1]._id;
            delete productArray[productArray.length - 1].POIPnumber;
            delete productArray[productArray.length - 1].consumed;
            delete productArray[productArray.length - 1].loggingTime;
        }
    })
    return productArray
}

window.onload = function () {
    setTimeout(function () {
        let tableBodyContainer = document.querySelector('#table-body-container');
        let tableBody = document.querySelector('#table-body');

        let clonedBody = tableBody.cloneNode(true);
        tableBody.appendChild(clonedBody.querySelector('tbody'));

        const step = 1;

        function scrollTable() {
            let currentTop = parseInt(getComputedStyle(tableBody).marginTop) || 0;
            if (Math.abs(currentTop) >= tableBody.offsetHeight / 2) {
                tableBody.style.marginTop = '0px'; // 滚动位置=原始表格体的高度时重置到0
            } else {
                tableBody.style.marginTop = (currentTop - step) + 'px';
            }

            requestAnimationFrame(scrollTable); // 递归持续滚动
        }

        scrollTable();

    }, 2500); // 2.5s滚动冷却时间
};
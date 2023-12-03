const {setInterval} = require('timers');
const {remote, onWindowResize} = require('electron');
var $ = require('jquery');

const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');

const path = require("path");

const Storage = require("electron-store");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

let shouldRefresh = true;
const countdownFrom = 90;
let countdown = 90;

let productsDisplay = []
document.addEventListener("DOMContentLoaded", (event) => {
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

    fetchProducts();
    //跑马灯滚动
    const tbody = document.querySelector('#scroll-tbody');
});

async function fetchProducts() {
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, strict: true, deprecationErrors: true,
            useNewUrlParser: true, useUnifiedTopology: true}
    });

    try {
        await client.connect();
        const sessions = client.db(targetDB).collection("pollinglog");
        const query = {removed: 0};
        const options = {'productCode': 1, 'bestbefore': 1, 'productLabel': 1};
        const cursor = sessions.find(query).sort(options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        const seenProducts = new Set();
        await cursor.forEach(product => {
            if (product.removed === 0) {
                seenProducts.add(product);
            }
        });
        productsDisplay = build2DProductArray(seenProducts)
    } catch (e) {
        console.error(e)
    } finally {
        await client.close()
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
                productArray[productArray.length - 1]["bestbeforeArray"].push(item.bestbefore ? item.bestbefore.replaceAll("-", ""): "")
                productArray[productArray.length - 1]["LocationArray"].push(item.shelfLocation ? item.shelfLocation : "")
            } else {
                productArray.push(item)
                productArray[productArray.length - 1]["bestbeforeArray"] = [item.bestbefore ? item.bestbefore.replaceAll("-", ""): ""]
                productArray[productArray.length - 1]["LocationArray"] = [item.shelfLocation ? item.shelfLocation : ""]
                delete productArray[productArray.length - 1].session;
                delete productArray[productArray.length - 1]._id;
                delete productArray[productArray.length - 1].POIPnumber;
                delete productArray[productArray.length - 1].removed;
                delete productArray[productArray.length - 1].loggingTime;
            }
        } else {
            productArray.push(item)
            productArray[productArray.length - 1]["bestbeforeArray"] = [item.bestbefore ? item.bestbefore.replaceAll("-", ""): ""]
            productArray[productArray.length - 1]["LocationArray"] = [item.shelfLocation ? item.shelfLocation : ""]
            delete productArray[productArray.length - 1].session;
            delete productArray[productArray.length - 1]._id;
            delete productArray[productArray.length - 1].POIPnumber;
            delete productArray[productArray.length - 1].removed;
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

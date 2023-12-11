const {ipcRenderer} = require('electron');
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);

const urlParams = new URLSearchParams(window.location.search)
let shelfLocation = urlParams.get("location")

let table = new DataTable('#table', {
    responsive: true,
    pageLength: 10,
    lengthMenu:[10,15,25,50,100],
});

document.addEventListener("DOMContentLoaded", async () => {
    document.querySelector("#bodyTitle").textContent = `Activity Details for ${shelfLocation}`
    let shelfResults = await fetchStockByLocation(shelfLocation)
    let compareArray = []
    for (let i = 0; i < shelfResults.length; i++) {
        if (shelfResults[i].shelfLocation === shelfLocation) {
            compareArray.push(shelfResults[i])
            compareArray[compareArray.length-1]['compareTime'] = new Date(shelfResults[i].createTime).getTime()
            compareArray[compareArray.length-1]['compareDirection'] = "IN"
            // let resultElement = shelfResults[i]
            // //     当前库位即是所需物品库位
            // resultElement['compareTime'] = new Date(resultElement.createTime).getTime()
            // resultElement['compareDirection'] = "IN"
            // compareArray.push(resultElement)
            // console.log(resultElement)
        }
        if (shelfResults[i].removed === 1 && shelfResults[i].hasOwnProperty("removeTime")) { // 如果产品已经被移除，则需要添加过往记录
            let resultElement = shelfResults[i]
            resultElement['compareTime'] = new Date(resultElement.removeTime).getTime()
            resultElement['compareDirection'] = "OUT"
            compareArray.push(resultElement)
            console.log(resultElement)
        }

        if (shelfResults[i].hasOwnProperty("locationRecords") && shelfResults[i].locationRecords.length > 1) {
            // 如果产品已经移动2次或以上，则需要补充记录
            for (let j = 1; j < shelfResults[i].locationRecords.length; j++) {
                if (shelfResults[i].locationRecords[j].location === shelfLocation) {
                    let resultElement = shelfResults[i]
                    resultElement['compareTime'] = new Date(resultElement.locationRecords[j].datetime).getTime()
                    resultElement['compareDirection'] = "IN"
                    compareArray.push(resultElement)
                    if (j < resultElement.locationRecords.length - 1) { //如果紧跟着后续还有记录，则代表其离开了这个位置
                        shelfResults[i]['compareTime'] = new Date(shelfResults[i].locationRecords[j+1].datetime).getTime()
                        shelfResults[i]['compareDirection'] = "OUT"
                        compareArray.push(shelfResults[i])
                    }
                }
            }
        }
    }
    compareArray.sort((a,b)=> {b.compareTime - a.compareTime})
    table.clear().draw()
    compareArray.forEach(eachElement => {
        table.row.add([
            `${new Date(eachElement.compareTime).toLocaleString('en-AU')}`,
            `${eachElement.productCode ? eachElement.productCode + ' ' +(eachElement.productName ? eachElement.productName : ''): ''}`,
            `${eachElement.quantity ? eachElement.quantity +' '+(eachElement.quantityUnit ? eachElement.quantityUnit : ''): ''}`,
            `${eachElement.productLabel ? eachElement.productLabel : ''}`,
            `${eachElement.compareDirection ? eachElement.compareDirection : ''}`
        ]).draw(false);
    })
})


// 等待数据库格式修改好后即可使用
async function fetchStockByLocation(location) {
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
        const options = {sort: {bestbefore: -1},}
        await client.connect();
        result = await sessions.find({"locationRecords.location": location}, options).toArray()
        console.log(result)
    } catch (err) {
        console.error(err)
    } finally {
        await client.close()
        document.querySelector("#loadingStatus").style.display = "none"
    }
    return result
}

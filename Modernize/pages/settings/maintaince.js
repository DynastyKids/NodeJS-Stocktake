const MongoClient = require('mongodb').MongoClient;
const {ipcRenderer} = require('electron')
const path = require('path')
const {ServerApiVersion, Decimal128} = require('mongodb');

const Storage = require("electron-store");
const {isNumber} = require("lodash");
const newStorage = new Storage();

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"                                                                                                                                                                                                                                                                                                                                                                                                                                          

let productsList = []

document.addEventListener("DOMContentLoaded", async (event) => {
    // console.log(newStorage.get('mongoURI'), newStorage.get('mongoDB'))
    console.log(await fetchProducts(true))
    console.log(await fetchStocks(true, false))
    console.log(await fetchStocks(false,true))
});

async function fetchProducts(forced = false) {
    let result =[]
    if (productsList.length <= 0 || forced) {
        const client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1, strict: true, deprecationErrors: true, useNewUrlParser: true, useUnifiedTopology: true
            }
        });

        try {
            await client.connect();
            let collection = client.db(targetDB).collection("products")
            result = await collection.find({}).toArray()
            productsList = result
            createAlert("success", "Product List has successfully fetched")
        } catch (e) {
            createAlert("danger", "Connection Error: " + e)
        } finally {
            await client.close();
        }
    }
    return result
}

async function fetchStocks(unitPriceMissingOnly = false, grossPriceMissingOnly = false, limit = 50000){
    const client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, strict: true, deprecationErrors: true, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    let result = []
    try {
        await client.connect();
        let collection = client.db(targetDB).collection("pollinglog")
        let condition = {}
        if (unitPriceMissingOnly){
            condition.unitPrice = {$exists:false}
        }
        if (grossPriceMissingOnly){
            condition.grossPrice = {$exists:false}
        }
        result = await collection.find(condition).limit(limit).toArray()
        createAlert("success", "Stocks List has successfully fetched")
    } catch (e) {
        createAlert("danger", "Connection Error: " + e)
    } finally {
        await client.close();
    }
    return result
}

document.querySelector("#updateQtyAndUnits").addEventListener("click",async (ev) => {
//     用户点击后，所有和product表格不一致的单位数量均会修正，如cartons均会转换为bottle最小数量计算
    if (productsList.length <= 0){
        await fetchProducts(true)
    }
    let stockList = fetchStocks();
    const client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, strict: true, deprecationErrors: true, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    try {
        await client.connect();
        let correctionCollection = await client.db(targetDB).collection("pollinglog").find().toArray()
        stockList.forEach(eachStockItem =>{

        })
        createAlert("success", "Stocks lists has successfully fetched")
    } catch (e) {
        createAlert("danger", "Connection Error: " + e)
    } finally {
        await client.close();
    }
})

document.querySelector("#updateStockUnitPrice").addEventListener("click",async (ev) => {
    ev.preventDefault()
    let missingUnitPriceStocks = await fetchStocks(true, false);
    if (productsList.length <= 0){
        await fetchProducts(true)
    }
    const client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, strict: true, deprecationErrors: true, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    try {
        await client.connect();
        let session = client.db(targetDB).collection("pollinglog")
        let seq = 0
        for (const eachStockItem of missingUnitPriceStocks) {
            seq ++
            for (let i = 0; i < productsList.length; i++) {
                if (productsList[i].productCode === eachStockItem.productCode){
                    if(productsList[i].hasOwnProperty("unitPrice") && !eachStockItem.hasOwnProperty("unitPrice")) {
                        document.querySelector("#runningStatus").textContent = `Update Unit Price: ${seq}/${missingUnitPriceStocks.length} : ${eachStockItem.productLabel}`
                        await session.updateMany({productLabel: String(eachStockItem.productLabel)}, {$set: {unitPrice: productsList[i].unitPrice}})
                    }
                }
            }
        }
        createAlert("success", "Stock Unit Price has been successfully updated")
        setTimeout(function(){
            window.location.reload()
        },5000)
    } catch (e) {
        createAlert("danger", e)
    } finally {
        await client.close()
    }

})

document.querySelector("#updateStockGrossPrice").addEventListener("click",async (ev) => {
    ev.preventDefault()
    // 计算GrossPrice时候需要注意单位转换
    let stocksList = await fetchStocks(false, true);
    if (productsList.length <= 0){
        await fetchProducts(true)
    }
    const client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, strict: true, deprecationErrors: true, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    try {
        await client.connect();
        let session = client.db(targetDB).collection("pollinglog")
        let seq = 0;
        for (const eachStockItem of stocksList) {
            seq ++ ;
            if (eachStockItem.hasOwnProperty("grossPrice")){
                continue;
            }
            let unitPrice = 0.0
            let grossPrice = 0
            for (let i = 0; i < productsList.length; i++) {
                if (productsList[i].productCode === eachStockItem.productCode) {
                    if (eachStockItem.hasOwnProperty("unitPrice") && !isNaN(eachStockItem.unitPrice)){ // Use Stock's Own unitPrice overwrite default unitPrice
                        unitPrice = eachStockItem.unitPrice
                    } else if(eachStockItem.hasOwnProperty("unitPrice")){
                        unitPrice = Number(eachStockItem.unitPrice.toString())
                    } else if(productsList[i].hasOwnProperty("unitPrice") && isNaN(productsList[i].unitPrice)){
                        unitPrice = Number(productsList[i].unitPrice.toString())
                    }

                    if ( (String(eachStockItem.quantityUnit).toLowerCase() === String(productsList[i].unit).toLowerCase()) ||
                        (("cartons/ctns").includes(eachStockItem.quantityUnit.toLowerCase()) && ("cartons/ctns").includes(productsList[i].unit.toLowerCase())) ||
                        (("bottles/btls").includes(eachStockItem.quantityUnit.toLowerCase()) && ("bottles/btls").includes(productsList[i].unit.toLowerCase())) ||
                        (("bags").includes(eachStockItem.quantityUnit.toLowerCase()) && ("bags").includes(productsList[i].unit.toLowerCase()))
                    ) {
                        //     两者Unit相同
                        grossPrice = Number(unitPrice * eachStockItem.quantity).toFixed(2)
                    } else if (("cartons/ctns").includes(eachStockItem.quantityUnit.toLowerCase()) && productsList[i].hasOwnProperty("cartonQty") && isNumber(productsList[i].cartonQty)){
                        //     两者Unit不同，确认转换关系后计算
                        grossPrice = Number(unitPrice * eachStockItem.quantity * productsList[i].cartonQty).toFixed(2)
                    }
                    document.querySelector("#runningStatus").textContent = `Update Gross Price: ${seq}/${stocksList.length} : ${eachStockItem.productLabel} ${grossPrice}`
                    if (grossPrice > 0){
                        await session.updateMany({productLabel: String(eachStockItem.productLabel)}, {$set:{grossPrice: Decimal128.fromString(grossPrice.toString())}})
                    }
                    break;
                }
            }
        }
        createAlert("success", "Stock Gross Price has been updated")
        setTimeout(function(){
            window.location.reload()
        },5000)
    } catch (e) {
        createAlert("danger", "Error: " + e)
    } finally {
        await client.close();
    }
})

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
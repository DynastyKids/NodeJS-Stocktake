let countdownTime = 300000;
let timeout;
let rawStockdata = []
let productList = []
let nextItems = 5
// 后续修补部分，产品表中添加display参数，如果display为1则显示该产品在NextDisplay中，如果没有参数默认不显示

function fetchStocks(){
    return new Promise((resolve, reject)=>{
        fetch(`/api/v1/stocks?removed=0`,{timeout: 10000})
            .then(response => response.json())
            .then(data=>resolve(data))
            .catch(error => reject(error));
    })
}

function fetchProducts(){
    return new Promise((resolve, reject) =>{
        fetch("/api/v1/products",{timeout: 5000})
            .then(response => response.json())
            .then(data=>resolve(data))
            .catch(error => reject(error));
    })
}

async function getStockData(forced = false) {
    if (rawStockdata.length <= 0 || forced) {
        let fetchedData = await fetchStocks()
        if (fetchedData.hasOwnProperty("data") && fetchedData.data.length > 0) {
            rawStockdata = fetchedData.data
        }
    }
    return rawStockdata
}

// 根据fetched获得的数据组装好数组
async function assembleProductArray() {
    let productsList = await getStockData()
    let assembledArray = []
    // [{productCode:"xxx",vendorCode:"", displayFIFO: "",items:[]}]
    productsList.forEach(eachItem=>{
        try{
            var foundTag = false
            if (eachItem.displayFIFO !== 1){
                // Skipped
            } else if (eachItem.hasOwnProperty("productCode")){
                assembledArray.forEach(eachAssembledItem=>{
                    if (eachAssembledItem.hasOwnProperty("productCode")){
                        if(eachAssembledItem.productCode === eachItem.productCode){
                            foundTag = true
                            eachAssembledItem.items.push(eachItem)

                            if (eachItem.hasOwnProperty("vendorCode") && eachAssembledItem.vendorCode === ""){
                                // Patch vendor Code if possible
                                eachAssembledItem.vendorCode = eachItem.vendorCode
                            }
                        }
                    }
                })
                if (!foundTag){
                    assembledArray.push({
                        "productCode": (eachItem.hasOwnProperty("productCode") ? `${eachItem.productCode}` : ""),
                        "vendorCode": (eachItem.hasOwnProperty("vendorCode") ? `${eachItem.vendorCode}`: ""),
                        "productName": (eachItem.hasOwnProperty("productName") ? `${eachItem.productName}`: ""),
                        "items": [eachItem]
                    })
                }
            } else if(eachItem.hasOwnProperty("vendorCode")){
                // Product does not have product code, use vendorCode as ALT option
                assembledArray.forEach(eachAssembledItem=>{
                    if (eachAssembledItem.hasOwnProperty("vendorCode")){
                        if (eachAssembledItem.vendorCode === eachItem.vendorCode){
                            foundTag = true
                            eachAssembledItem.items.push(eachItem)

                            if (eachItem.hasOwnProperty("productCode") && eachAssembledItem.productCode === ""){
                                eachAssembledItem.productCode = eachItem.productCode
                            }
                        }
                    }
                })
                if (!foundTag){
                    assembledArray.push({
                        "productCode": (eachItem.hasOwnProperty("productCode") ? `${eachItem.productCode}` : ""),
                        "vendorCode": (eachItem.hasOwnProperty("vendorCode") ? `${eachItem.vendorCode}`: ""),
                        "productName": (eachItem.hasOwnProperty("productName") ? `${eachItem.productName}`: ""),
                        "items":[eachItem]
                    })
                }
            } else {
                // Skipped
            }
        } catch (e) {
            console.warn("Operation failed:",e,eachItem)
        }
    })

    return assembledArray
}

// 针对ProductArray中的所有元素按照时间重新排序
async function reorderProductArray() {
    let assembledProductArray = await assembleProductArray()
    // Reorder Whole Array by product Code
    assembledProductArray.sort((a,b) =>{
        if (a.productCode <= b.productCode){
            return -1;
        } else {
            return 1;
        }
    })

    // Reorder each row by expire date (FIFO)
    assembledProductArray.forEach(eachRowElement =>{
        if (eachRowElement.items.length > 1){
            eachRowElement.items.forEach(eachItem=>{
                eachItem["expiredate"] = parseInt(String(eachItem.bestbefore).replaceAll("-",""))
            })
            eachRowElement.items.sort((a,b)=>{
                if(a.expiredate <= b.expiredate){
                    return -1;
                } else {
                    return 1;
                }
            })
        }
    })
    return assembledProductArray
}

async function assembleProductTable() {
    let assembledData = await reorderProductArray()
    let tableBodyElement = document.createElement("tbody")
    tableBodyElement.id = "table-body"
    try{
        assembledData.forEach(eachRow=>{
            var rowElements = document.createElement("tr")
            var productNameCol = document.createElement("td")
            productNameCol.innerText = `${eachRow.productCode} - ${eachRow.productName.replace(eachRow.productCode,"")}`
            productNameCol.className = "tableItemName"
            rowElements.append(productNameCol)
            for (let i = 0; i < nextItems && i< eachRow.items.length; i++) {
                var productInfoCol = document.createElement("td")
                productInfoCol.innerHTML = `${eachRow.items[i].hasOwnProperty("shelfLocation") ? eachRow.items[i].shelfLocation.toUpperCase() : ""} / <small>${eachRow.items[i].productLabel.slice(-7)}</span><br><small>${eachRow.items[i].bestbefore ? new Date(eachRow.items[i].bestbefore).toLocaleDateString() : ""}</small>`
                productInfoCol.className = "tableNext"
                rowElements.append(productInfoCol)
            }
            tableBodyElement.append(rowElements)
        })
    } catch (e) {
        console.warn("Error occurred when assemble table: ",e)
        createAlert("danger",`Error occurred when create next dispatch list: ${e}`)
    }
    createAlert("success","Next Dispatch list has successfully loaded", 2000)
    return tableBodyElement

}
document.addEventListener("DOMContentLoaded", async (event) => {
    await getStockData(true)
    assembleTableHeader()
    // let assembledProductArray = await assembleProductArray()
    await reorderProductArray()
    document.querySelector("#table-body").replaceWith(await assembleProductTable())

    const tbody = document.querySelector('#scroll-tbody');
})

document.querySelector("#input_selnextitems").addEventListener("change",async (ev) => {
    nextItems = ev.target.value
    assembleTableHeader(nextItems)
    document.querySelector("#table-body").replaceWith(await assembleProductTable())
    // Require to re-assemble array data
})

function assembleTableHeader(itemsInRows = 5){
    document.querySelector("#nextDispatchTable thead")
    let innerElement = document.createElement("tr")
    let productCol = document.createElement("td")
    productCol.innerHTML = "Product Name"
    productCol.className = "tableItemName"
    innerElement.append(productCol)

    for (let i = 0; i < itemsInRows; i++) {
        let itemCol = document.querySelector("td")
        itemCol.innerHTML = `No.${i+1}<br>Location / Item Id<br>Date`
        itemCol.className = "tableNext"
        innerElement.append(itemCol)
    }

    document.querySelector("#nextDispatchTable thead").innerHTML = ""
    document.querySelector("#nextDispatchTable thead").replaceChildren( innerElement );
}
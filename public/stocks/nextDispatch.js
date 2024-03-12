let countdownTime = 300000;
let timeout;
let stockData = []
let productList = []
// 后续修补部分，产品表中添加display参数，如果display为1则显示该产品在NextDisplay中，如果没有参数默认不显示

function fetchStocks(){
    return new Promise((resolve, reject)=>{
        fetch(`/api/v1/stocks?removed=0`,{timeout: 10000})
            .then(response => response.json())
            .then(data=>resolve(data))
            .catch(error => reject(error));
    })
}

document.addEventListener("DOMContentLoaded", async (event) => {
    let fetchedData = await fetchStocks()
    if (fetchedData.data && fetchedData.data.length > 0) {
        stockData = fetchedData.data
    }

    let displayList = assembleDisplayArray()
    let htmlContent = '';
    try{
        for (const eachProduct of displayList) {
            if (eachProduct.next.length > 0 && (!eachProduct.hasOwnProperty("displayFIFO") ||  eachProduct.displayFIFO === 1)){
                let product = (eachProduct.productCode ? eachProduct.productCode : "") + ' - ' + (eachProduct.productName ? eachProduct.productName : "")
                htmlContent += `<tr><td class="tableItemName">${(product.length > 30 ? product.substring(0,30)+'...' : product)}</td>`
                for (let i = 0; i < eachProduct.next.length && i<5; i++) {
                    var item = eachProduct.next[i]
                    htmlContent += `<td class="tableNext">${item.location ? item.location: ""} ${item.hasOwnProperty("quarantine") && item.quarantine === 1 ? '<span style="color: orange"><i class="ti ti-zoom-question"></i></span>': ""}<br>${item.bestbefore ? item.bestbefore : ""}</td>`
                }
                htmlContent += `</tr>`
            }
        }
    } catch (e) {
        console.error("Error occurred when appending table: ", e)
    } finally {
        document.querySelector("#loadingAnimation").style = "display: none"
    }
    document.querySelector("#table-body").innerHTML = htmlContent
    const tbody = document.querySelector('#scroll-tbody');
})

function assembleDisplayArray(){
    let result=[]
    if (Array.isArray(stockData)){
        for (let i = 1; i < stockData.length; i++) {
            if (stockData[i].hasOwnProperty("displayFIFO") && stockData[i].displayFIFO != 1){
                continue;
            }
            var foundFlag = false
            for (let j = 0; j < result.length; j++) {
                if (result[j].productCode === stockData[i].productCode){
                    foundFlag = true
                    sortOnPush(result[j].next, {
                        productLabel: stockData[i].hasOwnProperty("productLabel") ? stockData[i].productLabel : null,
                        location: stockData[i].hasOwnProperty("shelfLocation") ? stockData[i].shelfLocation : "",
                        bestbefore: stockData[i].hasOwnProperty("bestbefore") ? new Date(stockData[i].bestbefore).toLocaleDateString() : getDateStringFromLabel(stockData[i].productLabel),
                        quarantine: stockData[i].hasOwnProperty("quarantine") ? parseInt(stockData[i].quarantine) : 0,
                    },"bestbefore")
                    break;
                }
            }
            if (!foundFlag){
                sortOnPush(result, {
                    productCode: stockData[i].hasOwnProperty("productCode") ? stockData[i].productCode : ``,
                    productName: stockData[i].hasOwnProperty("productName") ? stockData[i].productName : ``,
                    next:[{
                        productLabel: stockData[i].hasOwnProperty("productLabel") ? stockData[i].productLabel : null,
                        location: stockData[i].hasOwnProperty("shelfLocation") ? stockData[i].shelfLocation : "",
                        bestbefore: stockData[i].hasOwnProperty("bestbefore") ? new Date(stockData[i].bestbefore).toLocaleDateString() : getDateStringFromLabel(stockData[i].productLabel),
                        quarantine: stockData[i].hasOwnProperty("quarantine") ? parseInt(stockData[i].quarantine) : 0
                    }]
                }, "productCode")
            }
        }
    }
    return result
}

function getDateStringFromLabel(productLabel){
    try{
        if (productLabel.length >= 8){
            return `${productLabel.substring(0,4)}-${productLabel.substring(4,6)}-${productLabel.substring(6,8)}`
        }
    }   catch (e) {
        console.error("Error when convert productLabel to datestring: ",e)
        return ""
    }
}

function sortOnPush(array, item, fieldname){
    array.push(item)
    array.sort(function (a,b){
        return a[fieldname].localeCompare(b[fieldname])
    });
}
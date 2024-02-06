let countdownTime = 300000;
let timeout;
let stockData = []
let displatList = {productCode:"",productName:"",next:[]}
document.addEventListener("DOMContentLoaded", async (event) => {
    let fetchedData = await fetchStocks()
    if (fetchedData.data && fetchedData.data.length > 0){
        stockData = fetchedData.data
    }

    let displayList = assembleDisplayArray()

    let htmlContent = '';
    try{
        displayList.forEach(eachProduct=>{
            if (eachProduct.next.length > 0){
                let product = (eachProduct.productCode ? eachProduct.productCode : "") + ' - ' + (eachProduct.productName ? eachProduct.productName : "")
                htmlContent += `<tr><td class="tableItemName">${(product.length > 30 ? product.substring(0,30)+'...' : product)}</td>`
                for (let i = 0; i < eachProduct.next.length && i<3; i++) {
                    var item = eachProduct.next[i]
                    htmlContent += `<td class="tableNext">${item.location ? item.location: ""} ${item.hasOwnProperty("quarantine") && item.quarantine === 1 ? '<span style="color: orange"><i class="ti ti-zoom-question"></i></span>': ""}<br>${item.bestbefore ? item.bestbefore : ""}</td>`
                }
                htmlContent += `</tr>`
            }
        })
    }  catch (e) {
        console.error("Error occurred when appending table: ", e)
    }
    document.querySelector("#table-body").innerHTML = htmlContent
    const tbody = document.querySelector('#scroll-tbody');
});

function assembleDisplayArray(){
    let result=[]
    if (Array.isArray(stockData)){
        if (stockData.length > 0){
            result.push({
                productCode: stockData[0].productCode ? stockData[0].productCode : ``,
                productName: stockData[0].productName ? stockData[0].productName : ``,
                next:[{
                    productLabel: stockData[0].hasOwnProperty("productLabel") ? stockData[0].productLabel : null,
                    location: stockData[0].hasOwnProperty("shelfLocation") ? stockData[0].shelfLocation : "",
                    bestbefore: stockData[0].hasOwnProperty("bestbefore") ? stockData[0].bestbefore : getDateStringFromLabel(stockData[i].productLabel),
                    quarantine: stockData[0].hasOwnProperty("quarantine") ? parseInt(stockData[0].quarantine) : 0,
                }]
            })
        }
        for (let i = 1; i < stockData.length; i++) {
            var foundFlag = false
            for (let j = 0; j < result.length; j++) {
                if (result[j].productCode === stockData[i].productCode){
                    foundFlag = true
                    sortOnPush(result[j].next, {
                        productLabel: stockData[i].hasOwnProperty("productLabel") ? stockData[i].productLabel : null,
                        location: stockData[i].hasOwnProperty("shelfLocation") ? stockData[i].shelfLocation : "",
                        bestbefore: stockData[i].hasOwnProperty("bestbefore") ? stockData[i].bestbefore : getDateStringFromLabel(stockData[i].productLabel),
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
                        bestbefore: stockData[i].hasOwnProperty("bestbefore") ? stockData[i].bestbefore : getDateStringFromLabel(stockData[i].productLabel),
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

// 页面发生操作则重新计时
document.addEventListener('mousemove', resetTimer);
document.addEventListener('keypress', resetTimer);
document.addEventListener('scroll', resetTimer);
document.addEventListener('click', resetTimer);

function resetTimer() {
    clearTimeout(timeout);
    countdownTime = 5 * 60 * 1000; // 重置倒计时时间
    updateCountdownDisplay(); // 更新显示
    timeout = setTimeout(() => {
        window.location.reload();
    }, countdownTime);
}

function updateCountdownDisplay() {
    let minutes = Math.floor(countdownTime / 60000);
    let seconds = ((countdownTime % 60000) / 1000).toFixed(0);
    document.querySelector("#toggleTimes").textContent = ` ${minutes}:${(seconds < 10 ? '0' : '')+seconds}`;
}
setInterval(() => {
    if (countdownTime > 0) {
        countdownTime -= 1000;
        updateCountdownDisplay();
    }
}, 1000);

function fetchStocks(){
    return new Promise((resolve, reject)=>{
        fetch(`/api/v1/stocks?removed=0`,{timeout: 10000})
            .then(response => response.json())
            .then(data=>resolve(data))
            .catch(error => reject(error));
    })
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
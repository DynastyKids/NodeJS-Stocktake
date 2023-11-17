const MongoClient = require('mongodb').MongoClient;
const {ipcRenderer} = require('electron')
const path = require('path')
const {ServerApiVersion} = require('mongodb');

const Storage = require("electron-store");
const {error} = require("jquery");
const newStorage = new Storage();

const WeekNumber = require("weeknumber")
const {weekNumberYearSun} = require("weeknumber");

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const dbname = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const moment = require("moment")

// Preset Global Vaiable, Request data on page load
let stockRecords = []
let productsList = []
// Apex Charts

document.addEventListener("DOMContentLoaded",async () => {
    stockRecords = await getAllStockRecords();
    productsList = await getProductsList();

    console.log(stockRecords)
    console.log(productsList)

    // 预先转换所有Carton单位到最小单位，避免后续二次转换出错
    for (let i = 0; i < stockRecords.length; i++) {
        stockRecords[i].quantityUnit = stockRecords[i].quantityUnit.toLowerCase()
        if (stockRecords[i].quantityUnit.includes("ctn") || stockRecords[i].quantityUnit.includes("carton")){
            for (let j = 0; j < productsList.length; j++) {
                if (productsList[j].productCode === stockRecords[i].productCode && productsList[j].hasOwnProperty("cartonQty")){
                    stockRecords[i].quantityUnit = productsList[j].unit
                    stockRecords[i].quantity = stockRecords[i].quantity * productsList[j].cartonQty
                    break;
                }
            }
        }
    }


    // index.js Apex chart 1, Quarterly Breakup
    //// 脚注标记
    let quarterlyBreakupFootnote = document.querySelectorAll("#apex_quarterlyBreakup .col-12 .fs-2")
    let last4Qtrs = getLast4Quarters()
    for (let i = 0; i < last4Qtrs.length; i++) {
        quarterlyBreakupFootnote[i].innerText = last4Qtrs[i]
    }

    //// 获取季度数据
    let quarterDatas= [0,0,0,0]
    for (let i = 0; i < stockRecords.length; i++) {
        for (let j = 0; j < last4Qtrs.length; j++) {
            if (last4Qtrs[j] === getFiscalQuarter(stockRecords[i].consumedTime) && stockRecords[i].hasOwnProperty("unitPrice")){
                quarterDatas[j] += Math.round(parseInt(stockRecords[i].quantity) * parseFloat(stockRecords[i].unitPrice))
            }
        }
    }

    document.querySelector("#apex_quarterlyBreakup .card-title").textContent = "Quarterly Sale Breakup"
    document.querySelector("#apex_quarterlyBreakup h4").textContent = `A$ ${new Intl.NumberFormat('en-AU').format(quarterDatas[0])}`
    let posResult = !!(100 - Math.round(quarterDatas[0] / quarterDatas[1] * 100))//Positive growth ?
    if (posResult){
        document.querySelector("#diffWithLastYear span").className = "me-1 rounded-circle bg-light-success round-20 d-flex align-items-center justify-content-center"
        document.querySelector("#diffWithLastYear span").innerHTML = `<i class="ti ti-arrow-up-right text-success"></i>`
    } else {
        document.querySelector("#diffWithLastYear span").className = "me-1 rounded-circle bg-light-danger round-20" +
            " d-flex align-items-center justify-content-center"
        document.querySelector("#diffWithLastYear span").innerHTML = `<i class="ti ti-arrow-down-right text-danger"></i>`
    }
    document.querySelector("#diffWithLastYear").append()
    document.querySelector("#diffWithLastYear p").innerHTML = `${ posResult ? "+":"-"}${Math.abs(100-Math.round(quarterDatas[0]/quarterDatas[1]*100))}% than ${last4Qtrs[1]}`


    // Yearly Breakup Charts
    // 按照季度计算整托盘产品的出货数量，1个托盘记为1件/或可以用货值替代，需要记录出货时候的货值
    // 如果产品按照box/carton计算，则需要另外计算其托盘价值
    var quarterBreakup = {
        color: "#adb5bd",
        series: quarterDatas,
        labels: getLast4Quarters(),
        chart: {
            width: 175,
            type: "donut",
            fontFamily: "sans-serif",
            foreColor: "#adb0bb",
        },
        plotOptions: {
            pie: {
                startAngle: 0,
                endAngle: 360,
                donut: {size: '75%',},
            },
        },
        stroke: {show: false,},
        dataLabels: {enabled: false,},
        legend: {show: false,},
        colors: ["#5b42ff", "#6b1fcf", "#be02f7","#ff004c"],
        responsive: [
            {
                breakpoint: 991,
                options: {
                    chart: {width: 140,},
                },
            },
        ],
        tooltip: {
            theme: "light",
            fillSeriesColor: false,
        },
    };
    new ApexCharts(document.querySelector("#breakup"), quarterBreakup).render();


    // Apex Chart 2  Stock Turnover Time
    // Stock Turnover部分仅整托盘计算(出库时间-入库时间)/总托盘数量
    let stockTurnOverArray = calcStockTurnover(stockRecords)  // Stock Turnover time will be calculated in days/hours
    if (stockTurnOverArray.length>0){
        let avgTime = 0
        stockTurnOverArray.forEach(eachItem=>{
            avgTime += eachItem.timediff
        })
        avgTime = Math.round(avgTime/stockTurnOverArray.length)

        let lastMonthTurnoverRate = calcStockTurnover(stockRecords,25000,new Date(new Date().getFullYear(),new Date().getMonth(),0))  // Stock
        let lastmonthAvg = 0
        if (lastMonthTurnoverRate.length>0) {
            lastMonthTurnoverRate.forEach(eachItem => {
                lastmonthAvg += eachItem.timediff
            })
            lastmonthAvg = Math.round(lastmonthAvg / stockTurnOverArray.length)
        }

        document.querySelector("#apex_turnoverChart h5").textContent = `Stock Turnover Time`
        document.querySelector("#apex_turnoverChart h4").textContent = `${(avgTime/60/60/24).toFixed(1)} days*`
        if(avgTime/lastmonthAvg-1 >0){
            document.querySelector("#apex_turnoverChart .col-12 span").className = "me-2 rounded-circle bg-light-danger round-20 d-flex align-items-center justify-content-center"
            document.querySelector("#apex_turnoverChart .col-12 span").innerHTML = `<i class="ti ti-arrow-down-right text-danger"></i>`
        } else {
            document.querySelector("#apex_turnoverChart .col-12 span").className = "me-2 rounded-circle bg-light-success round-20 d-flex align-items-center justify-content-center"
            document.querySelector("#apex_turnoverChart .col-12 span").innerHTML = `<i class="ti ti-arrow-up-right text-success"></i>`
        }
        document.querySelector("#apex_turnoverChart .col-12 p")
        document.querySelector("#apex_turnoverChart .col-12 p").textContent = `${(avgTime/lastmonthAvg-1) >0 ?  "+": "-"}${Math.abs(Math.round((avgTime/lastmonthAvg-1)*100))}% days compared on last month`
    }

    let turnOverChartData = RecentWeeksRemoveCount();
    var turnOvers= {
        chart: {
            id: "sparkline3",
            type: "area",
            height: 75,
            sparkline: {
                enabled: true,
            },
            group: "sparklines",
            fontFamily: "Plus Jakarta Sans', sans-serif",
            foreColor: "#adb0bb",
        },
        series: [
            {
                name: "Pallets Out",
                color: "#49BEFF",
                type: "area",
                data: turnOverChartData.pallets.reverse(),
            },
            {
                name: "$ Value",
                color: "#3200FF",
                type: "line",
                data: turnOverChartData.value.reverse(),
            },
        ],
        stroke: {
            curve: "smooth",
            width: 1,
        },
        fill: {
            colors: ["#f3feff"],
            type: "solid",
            opacity: [0.05,1],
        },
        yaxis:[
            {title:{text:"Outbound pallets"}},
            {opposite: true,title:{text:"Value"}}
        ],
        markers: {size: 0,},
        tooltip: {
            theme: "light",
            intersect: false,
            fixed: {
                enabled: true,
                position: "right",
            },
            x: {show: false},
            y: {show: false}
        },
    };
    new ApexCharts(document.querySelector("#turnovers"), turnOvers).render();


    // Card 3: Best Seller page
    let topSeller = getTopSeller(stockRecords,productsList)
    let successfulInsert = 5
    document.querySelector("#card_topseller h5").textContent = `Top ${successfulInsert} sellers in last 3 months`
    for (let i = 0; i < topSeller.length && successfulInsert > 0; i++) {
        try{
            let itemDiv = document.createElement("div")
            itemDiv.className = "d-flex justify-content-between align-items-center mb-3"
            itemDiv.innerHTML = `<div><h6 class="mb-1 fs-3 fw-semibold">${topSeller[i]['labelname'] ? topSeller[i]['labelname'] : ''}</h6></div>`+
                `<div><span class="badge bg-light-info text-info fw-normal fs-2">$ ${new Intl.NumberFormat('en-AU').format(topSeller[i]['value'])}</span></div>`
            document.querySelector("#card_topseller").append(itemDiv)
            successfulInsert -= 1
        } catch (e) {
            console.log("Error while insert best seller:",e)
        }
    }

    // Card 4 - Apex Chart 3 Inventory Report
    // 创建一个循环，循环到第一个pollinglog时候的数据的年份，然后添加对应的财年选项，每次用户选定财年后再拉取数据
    let earliestLog = getEarliestTransactionLog();
    earliestLog = (earliestLog.length > 0 ? new Date(earliestLog[0].loggingTime) : new Date())
    console.log(earliestLog)
    // 计算该财年的时间，然后制作对应的选项列表，并给对应的选项列表创建方法
    for (var i= earliestLog.getFullYear(); i < new Date().getFullYear()+1; i++){
        var newFYoption = document.createElement("option")
        newFYoption.value = i;
        newFYoption.textContent = "Financial Year "+i
        console.log(newFYoption)
        document.querySelector("#inv_optionslist").append(newFYoption);
    }

    var inventoryStatChart = {
        series: [
            {
                name: "Imported this month",
                data: [1.5, 2.7, 2.2, 3.6, 1.5, 1.0],
            },
            {
                name: "Exported this month",
                data: [-1.8, -1.1, -2.5, -1.5, -0.6, -1.8],
            },
        ],
        chart: {
            toolbar: {
                show: false,
            },
            type: "bar",
            fontFamily:  "sans-serif",
            foreColor: "#adb0bb",
            height: 320,
            stacked: true,
        },
        colors: ["var(--bs-primary)", "var(--bs-secondary)"],
        plotOptions: {
            bar: {
                horizontal: false,
                barHeight: "60%",
                columnWidth: "20%",
                borderRadius: [6],
                borderRadiusApplication: "end",
                borderRadiusWhenStacked: "all",
            },
        },
        dataLabels: {
            enabled: false,
        },
        legend: {
            show: false,
        },
        grid: {
            borderColor: "rgba(0,0,0,0.1)",
            strokeDashArray: 3,
            xaxis: {
                lines: {
                    show: false,
                },
            },
        },
        yaxis: {
            min: -5,
            max: 5,
            title: {
                // text: 'Age',
            },
            tickAmount: 4,
        },
        xaxis: {
            axisBorder: {
                show: false,
            },
            categories: getXlabels(),
        },
        tooltip: { theme: "light" },
    };

    new ApexCharts(document.querySelector("#inventoryOverviewChart"), inventoryStatChart).render();
    document.querySelector("#inventoryOverviews h5").textContent = "Inventory Overview"
    document.querySelector("#inventoryOverviews #stockValue").textContent = `$ ${new Intl.NumberFormat('en-AU').format(calculateInstockValue(stockRecords)[0])}`
    document.querySelector("#inventoryOverviews #inboundValue").textContent = `$ ${new Intl.NumberFormat('en-AU').format(calculateInstockValue(stockRecords)[1])}`
    document.querySelector("#inventoryOverviews #outboundValue").textContent = `$ ${new Intl.NumberFormat('en-AU').format(calculateInstockValue(stockRecords)[2])}`


    // Recent Transactions
    let recentTransList = getRecentTransactions(stockRecords);
    console.log(recentTransList)
    document.querySelector("#recentTransactionsCard h5").textContent = "Recent Transactions"
    for (let i = 0; i < 10 && i<recentTransList.length; i++) {
        let newRow = document.createElement("li")
        newRow.className = "timeline-item d-flex position-relative overflow-hidden"
        let iconElement = document.createElement("div")
        iconElement.className = "timeline-badge-wrap d-flex flex-column align-items-center"
        iconElement.innerHTML = `<span class="timeline-badge border-2 border ${(recentTransList[i].direction === "in" ? "border-success" : "border-primary")} flex-shrink-0 my-8"></span>
                                        <span class="timeline-badge-border d-block flex-shrink-0"></span>`
        let timeElement = document.createElement("div")
        timeElement.className = "timeline-time text-dark flex-shrink-0 text-end"
        timeElement.textContent = (recentTransList[i].direction === "in" ?
            moment(recentTransList[i].loggingTime).format("MMM DD HH:mm") :
            moment(recentTransList[i].consumedTime).format("MMM DD HH:mm"))

        let itemElement = document.createElement("div")
        itemElement.className = "timeline-item fw-semibold fs-3 text-dark mt-n1"
        itemElement.innerHTML = `${recentTransList[i].productCode} - ${recentTransList[i].productName} ` +
            ` Action: ${recentTransList[i].direction === "in"? '<i class="ti ti-transfer-in"></i>': '<i class="ti ti-transfer-out"></i>'}`

        let itemElementSmallText = document.createElement("div")
        itemElementSmallText.className = "timeline-desc d-block fw-normal"
        itemElementSmallText.innerHTML = `${recentTransList[i].quantity} ${recentTransList[i].quantityUnit}`+
            `${recentTransList[i].hasOwnProperty("bestbefore") ? " / Best before: "+ moment(recentTransList[i].bestbefore).format("DD MMM YYYY"): ""}` +
            " / " + (recentTransList[i].direction === "in" ? "<i class='ti ti-transfer-in'></i>" : '<i class="ti ti-transfer-out"></i>')+ recentTransList[i].direction+
            `${recentTransList[i].hasOwnProperty("shelfLocation") ? " / " + recentTransList[i].shelfLocation :""}`


        itemElement.append(itemElementSmallText)
        newRow.append(iconElement,timeElement,itemElement)

        document.querySelector("#recentTransactionsCard ul").append(newRow)

    }
})

async function getEarliestTransactionLog() {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    try {
        await client.connect()
        let session = await client.db(dbname).collection("pollinglog");
        return await session.find({loggingTime: {$exists: true, $ne: null}}).sort({loggingTime: 1}).limit(1).toArray()
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
        return false;
    } finally {
        await client.close()
    }
    return []
}

function getProductbyCode(productCodeIn) {
    for (let i = 0; i < productsList.length; i++) {
        if (productsList[i].productCode === productCodeIn) {
            return productsList[i]
        }
    }
    return {}
}

function getXlabels(date = new Date(), count=6){
    // 默认仅获取近半年记录，整财年记录需要调整count为12
    let months = [];
    for (let i = 0; i < count; i++) {
        let year = date.getFullYear().toString().slice(-2);
        let month = ('0' + (date.getMonth() + 1)).slice(-2);

        months.push(`${month}/${year}`);
        date.setMonth(date.getMonth() - 1);
    }
    return months;
}

function getRecentTransactions(recordsArray, limit = 500){
    let reorderedDupArray = []
    if (Array.isArray(recordsArray)) {
        for (let i = 0; i < recordsArray.length; i++) {
            if (recordsArray[i].hasOwnProperty("loggingTime")) {
                let pushElement = recordsArray[i]
                pushElement.compTime = recordsArray[i].loggingTime
                pushElement.direction = "in"
                reorderedDupArray.push(pushElement)
            }
        }
        for (let i = 0; i < recordsArray.length; i++) {
            if (recordsArray[i].hasOwnProperty("consumedTime")) {
                let pushElement = recordsArray[i]
                pushElement.compTime = recordsArray[i].consumedTime
                pushElement.direction = "out"
                reorderedDupArray.push(pushElement)
            }
        }
        reorderedDupArray.sort((a,b)=>new Date(b.compTime) - new Date(a.compTime))
    }
    return reorderedDupArray
}

function calculateMonthStockMovementValue(stockRecords,date = new Date()){
    // 使用Date对象，用户给定一个时间，获取当月的所有销售进出数值，并在图标上计算进出货品数量
    let monthlyImport={value:0 , count: 0}
    let monthlyExport = {value: 0, count: 0}
    if (Array.isArray(stockRecords)){
        stockRecords.forEach(eachRecord =>{
            if (eachRecord.hasOwnProperty("loggingTime") && isSameYearmonth(new Date(eachRecord.loggingTime),date)){
                monthlyImport.count += 1;
                if (eachRecord.hasOwnProperty("unitPrice") && eachRecord.hasOwnProperty("quantity")){
                    monthlyImport.value += (monthlyImport.value+eachRecord.unitPrice*eachRecord.quantity).toFixed(2)
                }
            }
            if (eachRecord.hasOwnProperty("consumed") && eachRecord.consumed === 1 &&
                eachRecord.hasOwnProperty("consumedTime") && isSameYearmonth(new Date(eachRecord.consumedTime),date)){
                monthlyExport.count += 1;
                if (eachRecord.hasOwnProperty("unitPrice") && eachRecord.hasOwnProperty("quantity")){
                    monthlyImport.value += (monthlyImport.value+eachRecord.unitPrice*eachRecord.quantity).toFixed(2)
                }
            }
        })
    }
    return {import : monthlyImport, export: monthlyExport}
}

function calculateInstockValue(stockRecords){
    let currentInstockvalue=0;
    let thisMonthImportVal = 0;
    let thisMonthExportVal = 0
    if (Array.isArray(stockRecords)){
        stockRecords.forEach(eachRecord=>{
            if (eachRecord.hasOwnProperty("unitPrice") && eachRecord.hasOwnProperty("quantity")){
                currentInstockvalue += eachRecord.quantity * eachRecord.quantity
                if (eachRecord.hasOwnProperty("loggingTime") && isSameYearmonth(new Date(eachRecord.loggingTime))){
                    thisMonthImportVal += eachRecord.quantity * eachRecord.quantity
                    if (eachRecord.hasOwnProperty("consumedTime") && isSameYearmonth(new Date(eachRecord.consumedTime))){
                        thisMonthExportVal += eachRecord.quantity * eachRecord.quantity
                    }
                }
            }
        })
    }
    return [currentInstockvalue,thisMonthImportVal,thisMonthExportVal]
}

function isSameYearmonth(date = new Date(), date2 = new Date()){
    return date.getMonth() === date2.getMonth() && date.getFullYear() === date2.getFullYear();

}

function getTopSeller(stockRecords, productList) { // 默认选择x位的top seller
    let stockList = []
    for (let i = 0; i < stockRecords.length; i++) {
        let eachStock = stockRecords[i]
        let productInfo = {}
        for (let j = 0; j < productList.length; j++) {
            if (productList[j].productCode === eachStock.productCode) {
                productInfo=productList[j]
            }
        }

        if (new Date(new Date() - new Date(stockRecords[i].consumedTime)).getUTCMonth() > 3){
            continue; //时间不在范围内，跳过
        } //时间在范围内可继续计算

        let foundInList = false
        for (let j = 0; j < stockList.length && !foundInList; j++) { //查找这样产品是否在已经添加的列表里面
            if (stockList[j].productCode === stockRecords[i].productCode){
                foundInList = true

                stockList[j].quantity += (isNaN(stockRecords[i].quantity) ? parseInt(stockRecords[i].quantity) : stockRecords[i].quantity)
                if (stockRecords[i].hasOwnProperty("unitPrice")){
                    stockList[j].value += Math.round((isNaN(stockRecords[i].quantity) ? parseInt(stockRecords[i].quantity) : stockRecords[i].quantity) * (!isNaN(stockRecords[i].unitPrice) ? stockRecords[i].unitPrice : 0))
                }
            }
        }

        if (!foundInList) {              //如果不在当前库存列表记录则创建新纪录
            stockList.push({
                productCode: stockRecords[i].productCode,
                labelname: stockRecords[i].productName,
                quantity: stockRecords[i].quantity,
                unit: stockRecords[i].quantityUnit,
                value: Math.round((!isNaN(stockRecords[i].quantity) ? stockRecords[i].quantity : 0) * (!isNaN(stockRecords[i].unitPrice) ? stockRecords[i].unitPrice : 0))
            })
        }
    }

    stockList.sort((a, b) => b.value - a.value)
    return stockList
}

function calcStockTurnover(stockData, limit = 25000, compareDate = new Date()){ // 该方法仅计算Turnover时长，默认仅计算最近的25000组数据，默认计算截止时间到现在
    let turnOverArrayDiff=[]
    // array of[{productCode:, timediff: byseconds}]
    if (Array.isArray(stockData)){
        for (let i = 0; i < stockData.length && i< limit; i++) {
            const eachItem = stockData[i]
            if (eachItem.hasOwnProperty("consumedTime")){
                if(new Date(eachItem.consumedTime) > compareDate){
                    continue;
                }
                if (eachItem.hasOwnProperty("consumed") && eachItem.consumed === 1 && eachItem.hasOwnProperty("loggingTime")){
                    let logTime = new Date(eachItem.loggingTime);
                    let removeTime = new Date(eachItem.consumedTime);
                    turnOverArrayDiff.push({productCode:eachItem.productCode, consumedTime: eachItem.consumedTime, timediff: Math.floor(Math.abs(removeTime-logTime)/1000)})
                }
            }
        }
    } else {
        throw error("Data format incorrect")
    }
    return turnOverArrayDiff
}

function isInWeek(YYWW, isoDateString){ // YY-2digit of year, WW - 2 digit of week number
    const year = Math.floor(YYWW / 100) + 2000;
    const week = YYWW % 100;
    const date = new Date(isoDateString);
    const dateYear = date.getFullYear();
    const dateWeek = parseInt(`${weekNumberYearSun(date).year}`+`${weekNumberYearSun(date).week}`);

    return year === dateYear && week === dateWeek;
}

function getFiscalQuarter(isoDateString = new Date()){
    const date = new Date(isoDateString);
    let quarter;
    if (date.getMonth() < 3) { // JAN-MAR
        quarter = 'Q1';
    } else if ( date.getMonth() < 6) { // APR-JUN
        quarter = 'Q2';
    } else if ( date.getMonth() < 9) { // JUL-SEPT
        quarter = 'Q3';
    } else { // OCT-DEC
        quarter = 'Q4';
    }

    return `${date.getFullYear().toString().substring(2)}${quarter}`;
}

function getLast4Quarters(isoDateString  = new Date()){
    let currentYear = new Date(isoDateString).getFullYear();
    const currentMonth = new Date(isoDateString).getMonth();

    // 确定当前季度
    let currentQuarter;
    if (currentMonth < 3) {
        currentQuarter = 1;
    } else if (currentMonth < 6) {
        currentQuarter = 2;
    } else if (currentMonth < 9) {
        currentQuarter = 3;
    } else {
        currentQuarter = 4;
    }

    // 生成包含当前季度和过去三个季度的数组
    let quarters = [];
    for (let i = 0; i < 4; i++) {
        quarters.push(`${currentYear.toString().substring(2)}Q${currentQuarter}`);
        currentQuarter -= 1; // 移动到上一个季度
        if (currentQuarter === 0) { // 如果当前季度是Q1，转到上一年的Q4
            currentQuarter = 4;
            currentYear -= 1;
        }
    }
    return quarters;
}

function RecentWeeksRemoveCount(weeks = 12) {// 计算最近连续的X个周的出货数量,至多计算25000条
    let turnOverValueArrays = {pallets: [], value: [], week: []}  //Weeknum将会存放一个日期，在每次需要验证时候，由weekNumberYearSun转换验证
    for (let i = 0; i < weeks; i++) {
        if (i === 0) {
            turnOverValueArrays.week.push(new Date())
        } else {
            turnOverValueArrays.week.push(new Date(turnOverValueArrays.week[i - 1].getTime() - 7 * 24 * 60 * 60 * 1000))
            turnOverValueArrays.week[i-1] = weekNumberYearSun(turnOverValueArrays.week[i-1])
        }
        turnOverValueArrays.pallets.push(0);
        turnOverValueArrays.value.push(0);
    }
    turnOverValueArrays.week[weeks-1] = weekNumberYearSun(turnOverValueArrays.week[weeks-1])
    for (let i = 0; i < stockRecords.length && i < 25000; i++) {
        if (stockRecords[i].hasOwnProperty("consumedTime")) {
            for (let j = 0; j < turnOverValueArrays.week.length; j++) {
                if (turnOverValueArrays.week[j].week === weekNumberYearSun(stockRecords[i]["consumedTime"]).week &&
                    turnOverValueArrays.week[j].year === weekNumberYearSun(stockRecords[i]["consumedTime"]).year) {
                    for (let k = 0; k < productsList.length; k++) {
                        if (productsList[k].productCode === stockRecords[i]['productCode'] && productsList[k].hasOwnProperty('cartonQty')&&
                            (stockRecords[i]['quantityUnit'].toLowerCase().includes("carton") || stockRecords[i]['quantityUnit'].toLowerCase().includes("ctn"))){
                            stockRecords[i]['quantity'] = Math.round(parseInt(stockRecords[i]['quantity']) * parseInt(productsList[k]['cartonQty']))
                            break;
                        }
                    }
                    turnOverValueArrays.pallets[j] += 1
                    if (isNaN(turnOverValueArrays.value[j])){
                        turnOverValueArrays.value[j]=0
                    }

                    turnOverValueArrays.value[j] += Math.round(parseInt(stockRecords[i]['quantity']) * parseFloat(stockRecords[i]['unitPrice']))
                }
            }
        }
    }
    return turnOverValueArrays
}

async function checkDBConnection() {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    try {
        await client.connect()
        const sessions = client.db(dbname);
        let collections = await sessions.listCollections().toArray()
        return (collections.length >= 0 )
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
        return false;
    } finally {
        await client.close()
    }
    return false
}

async function getAllStockRecords(limit = 50000){
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    let result = []
    try {
        await client.connect()
        let collections = client.db(dbname).collection("pollinglog");
        if (limit < 0){
            result = await collections.find({}).sort({"consumedTime":-1,"loggingTime":1}).toArray()
        } else {
            result = await collections.find({}).sort({"consumedTime":-1,"loggingTime":1}).limit(limit).toArray()
        }
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
        return result
    } finally {
        await client.close()
    }
    return result
}

async function getProductsList(){
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    let result = []
    try {
        await client.connect()
        let collections = client.db(dbname).collection("products");
        result = await collections.find().sort({"productCode":1}).toArray()
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
        return result
    } finally {
        await client.close()
    }
    return result
}


async function getSalesDataByYear(date = new Date()) {
    // 根据用户输入获取指定的整个月的的sales进出数据，获得的数据按照月份分割，如果未传入参数则默认为当前月份
    // 设定年份和时间
    let year = date.getFullYear()
    let month = date.getMonth()

    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    try {
        await client.connect()
        let collections = await client.db(dbname).listCollections().toArray();
        return (collections.length >= 0 )
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
        return false;
    } finally {
        await client.close()
    }

    return false
}
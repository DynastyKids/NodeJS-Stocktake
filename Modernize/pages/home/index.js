const MongoClient = require('mongodb').MongoClient;
const {ipcRenderer} = require('electron')
const path = require('path')
const {ServerApiVersion, Decimal128} = require('mongodb');

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
let stockRecordsSinceLastYears = []
let productsList = []
// Apex Charts

document.addEventListener("DOMContentLoaded",async () => {
    await getAllStockRecords(true);
    await updateProductList(true);
    await lastXmonthsPollinglog(24,true)

    if (stockRecords.length <=0 && productsList.length <=0 ){
    //     如果两者均小于0，则提示用户检查数据库链接是否正确
        var alert = document.createElement("div");
        alert.className = "alert alert-danger alert-dismissible fade show";
        alert.setAttribute("role", "alert");
        alert.innerHTML = `<div>No product data or item information available in database, please check database connection details are correct.</div>` +
            `<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`
    }

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

    await cardQuarterSales()      // index.js Apex chart 1, Quarterly Breakup
    await cardTurnoverTimes()     // index.js Apex chart 2, Turnover Rates


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
    // 计算该财年的时间，然后制作对应的选项列表，并给对应的选项列表创建方法
    for (var i= earliestLog.getFullYear(); i < new Date().getFullYear()+1; i++){
        var newFYoption = document.createElement("option")
        newFYoption.value = i;
        newFYoption.textContent = "Year "+i
        document.querySelector("#inv_optionslist").append(newFYoption);
    }

    let fetchInventoryData = await fetchInventoryGraphData()
    console.log(fetchInventoryData)
    let maxy = 0
    for (let i = 0; i < fetchInventoryData.import.length; i++) {
        maxy = (fetchInventoryData.import[i] > maxy ? fetchInventoryData.import[i] : maxy )
        maxy = (Math.abs(fetchInventoryData.export[i]) > maxy ? Math.abs(fetchInventoryData.export[i]) : maxy)
    }
    maxy = Math.ceil(maxy/1000)*1000

    console.log(fetchInventoryData)
    var inventoryStatChart = {
        series: [
            {
                name: "Imported this month",
                data: fetchInventoryData.import
            },
            {
                name: "Exported this month",
                data: fetchInventoryData.export,
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
            min: -maxy,
            max: maxy,
            title: {
                text: 'Value',
            },
            tickAmount: 8,
        },
        xaxis: {
            axisBorder: {show: false,},
            title: {
                text: 'Month/Year',
            },
            categories: getXaxislabels(new Date(), 12),
        },
        tooltip: { theme: "light" },
    };

    document.querySelector("#inventoryOverviews h5").textContent = "Inventory Overview"
    document.querySelector("#inventoryOverviews #stockValue").textContent = `$ ${new Intl.NumberFormat('en-AU').format(calculateInstockValue(stockRecords)[0])}`
    document.querySelector("#inventoryOverviews #inboundValue").textContent = `$ ${new Intl.NumberFormat('en-AU').format(calculateInstockValue(stockRecords)[1])}`
    document.querySelector("#inventoryOverviews #outboundValue").textContent = `$ ${new Intl.NumberFormat('en-AU').format(calculateInstockValue(stockRecords)[2])}`
    new ApexCharts(document.querySelector("#inventoryOverviewChart"), inventoryStatChart).render();

    // Recent Transactions
    var recentTransList = getRecentTransactions(stockRecords, 200, "in");
    document.querySelector("#recentTransactionsCardIn h5").textContent = "Recent Inbound Transactions"
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
            moment(recentTransList[i].removeTime).format("MMM DD HH:mm"))

        let itemElement = document.createElement("div")
        itemElement.className = "timeline-item fw-semibold fs-3 text-dark mt-n1"
        itemElement.innerHTML = `${recentTransList[i].productCode} - ${recentTransList[i].productName} ` +
            ` ${recentTransList[i].direction === "in"? '<i class="ti ti-transfer-in"></i>': '<i class="ti ti-transfer-out"></i>'}`

        let itemElementSmallText = document.createElement("div")
        itemElementSmallText.className = "timeline-desc d-block fw-normal"
        itemElementSmallText.innerHTML = `${recentTransList[i].quantity} ${recentTransList[i].quantityUnit}`+
            `${recentTransList[i].hasOwnProperty("bestbefore") ? " / Best before: "+ moment(recentTransList[i].bestbefore).format("DD MMM YYYY"): ""}` +
            " / " + (recentTransList[i].direction === "in" ? "<i class='ti ti-transfer-in'></i>" : '<i class="ti ti-transfer-out"></i>')+ recentTransList[i].direction+
            `${recentTransList[i].hasOwnProperty("shelfLocation") ? " / " + recentTransList[i].shelfLocation :""}`


        itemElement.append(itemElementSmallText)
        newRow.append(iconElement,timeElement,itemElement)

        document.querySelector("#recentTransactionsCardIn ul").append(newRow)

    }

    var recentTransList = getRecentTransactions(stockRecords, 200, "out");
    document.querySelector("#recentTransactionsCardOut h5").textContent = "Recent Outbound Transactions "
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
            moment(recentTransList[i].removeTime).format("MMM DD HH:mm"))

        let itemElement = document.createElement("div")
        itemElement.className = "timeline-item fw-semibold fs-3 text-dark mt-n1"
        itemElement.innerHTML = `${recentTransList[i].productCode} - ${recentTransList[i].productName} ` +
            ` ${recentTransList[i].direction === "in"? '<i class="ti ti-transfer-in"></i>': '<i class="ti ti-transfer-out"></i>'}`

        let itemElementSmallText = document.createElement("div")
        itemElementSmallText.className = "timeline-desc d-block fw-normal"
        itemElementSmallText.innerHTML = `${recentTransList[i].quantity} ${recentTransList[i].quantityUnit}`+
            `${recentTransList[i].hasOwnProperty("bestbefore") ? " / Best before: "+ moment(recentTransList[i].bestbefore).format("DD MMM YYYY"): ""}` +
            " / " + (recentTransList[i].direction === "in" ? "<i class='ti ti-transfer-in'></i>" : '<i class="ti ti-transfer-out"></i>')+ recentTransList[i].direction+
            `${recentTransList[i].hasOwnProperty("shelfLocation") ? " / " + recentTransList[i].shelfLocation :""}`


        itemElement.append(itemElementSmallText)
        newRow.append(iconElement,timeElement,itemElement)

        document.querySelector("#recentTransactionsCardOut ul").append(newRow)

    }
})

function calculatePalletValue(itemObject){
//     计算单个产品的单板数量货值
    if (itemObject || !itemObject.hasOwnProperty("quantityUnit") && !itemObject.hasOwnProperty("quantity")){
        return 0;
    } else {
        let productProperty = productsList.find(element => element.productCode === itemObject.productCode)
        if (productProperty.unit === itemObject.quantityUnit){ //单位一致，直接计算
            let unitPrice = (itemObject.hasOwnProperty("unitPrice") ? itemObject.unitPrice :
                (productProperty.hasOwnProperty("unitPrice") ? productProperty.unitPrice : null))
            if (unitPrice === null){
                return 0
            } else {
                return itemObject.quantity * unitPrice
            }
        } else if (("cartons/ctns").includes(itemObject.quantityUnit.toLowerCase()) && productProperty.hasOwnProperty("cartonQty")){
            // If unit is smaller than ctns
            let unitPrice = (itemObject.hasOwnProperty("unitPrice") ? itemObject.unitPrice :
                (productProperty.hasOwnProperty("unitPrice") ? productProperty.unitPrice : null))
            return itemObject.quantity * parseInt(productProperty.cartonQty) * unitPrice
        } else if(("pallets/ptls").includes(itemObject.quantityUnit.toLowerCase()) && productProperty.hasOwnProperty("palletQty")){
            let unitPrice = (itemObject.hasOwnProperty("unitPrice") ? itemObject.unitPrice :
                (productProperty.hasOwnProperty("unitPrice") ? productProperty.unitPrice : null))
            return itemObject.quantity * parseInt(productProperty.palletQty) * unitPrice
        } else {
            return 0
        }
    }
}
async function cardQuarterSales() {
    let stockDatas = await lastXmonthsPollinglog(24, false) //     获取到了过去两年的数据

    // 计算过去X个季度的数据，并制作数组数据
    // 确定当前季度
    let seasonsData = [
        {seasonName: getLastXQuarters()[0], pallet: 0, value:0},
        {seasonName: getLastXQuarters()[1], pallet: 0, value:0},
        {seasonName: getLastXQuarters()[2], pallet: 0, value:0},
        {seasonName: getLastXQuarters()[3], pallet: 0, value:0}
    ]

    // 每条数据都需要传入如下方法，用来确定消耗的时间和对应锁计算你的财年
    console.log(stockDatas)
    stockDatas.forEach(eachData=>{
        // Quarter Sales 要求:该数据要有RemoveTime时间参数，或removed参数为1，且有LoggingTime参数
        let fiscalQ = undefined
        if (eachData.hasOwnProperty("removed") && eachData.hasOwnProperty("removeTime") && eachData.removed === 1){
            fiscalQ = getFiscalQuarter(eachData.removeTime)
        } else if( eachData.hasOwnProperty("removed") && eachData.hasOwnProperty("loggingTime") && eachData.removed === 1){
            fiscalQ = getFiscalQuarter(eachData.loggingTime)
        }

        for (let i = 0; i < seasonsData.length; i++) {
            if (fiscalQ === seasonsData[i].seasonName){
                //     季度名称相同，查找对应的value，如果没有value则放弃
                if (eachData.hasOwnProperty("grossPrice")){
                    seasonsData[i].pallet++;
                    if (eachData.grossPrice instanceof Decimal128){
                        seasonsData[i].value += parseFloat(eachData.grossPrice.toString())
                    } else {
                        seasonsData[i].value += eachData.grossPrice
                    }
                } else if (eachData.hasOwnProperty("unitPrice") && eachData.hasOwnProperty("quantityUnit") && eachData.hasOwnProperty("quantity")){ //
                    if(calculatePalletValue(eachData) > 0){
                        seasonsData[i].pallet++;
                        seasonsData[i].value += calculatePalletValue(eachData)
                    }
                }
            }
        }
        //     如果在SeasonsData中有找到对应的seasonName,则尝试计算Value，如果产品没有UnitPrice,尝试从Product获取，否则跳过该产品不计算
    })

    seasonsData.forEach(eachSeasons=>{
        eachSeasons.value = eachSeasons.value.toFixed(2)
    })
    console.log(seasonsData)


    // index.js Apex chart 1, Quarterly Breakup
    //// 脚注标记
    let quarterlyBreakupFootnote = document.querySelectorAll("#apex_quarterlyBreakup .col-12 .fs-2")
    let last4Qtrs = getLastXQuarters(4)
    for (let i = 0; i < last4Qtrs.length; i++) {
        quarterlyBreakupFootnote[i].innerText = last4Qtrs[i]
    }

    document.querySelector("#apex_quarterlyBreakup .card-title").textContent = "Quarterly Sale Breakup"
    document.querySelector("#apex_quarterlyBreakup h4").textContent = `A$ ${new Intl.NumberFormat('en-AU').format(Math.round(seasonsData[0].value))}`

    let posResult = !!(100 - Math.round(seasonsData[0].value / seasonsData[1].value * 100))//Positive growth ?
    if (posResult){
        document.querySelector("#diffWithLastYear span").className = "me-1 rounded-circle bg-light-success round-20 d-flex align-items-center justify-content-center"
        document.querySelector("#diffWithLastYear span").innerHTML = `<i class="ti ti-arrow-up-right text-success"></i>`
    } else {
        document.querySelector("#diffWithLastYear span").className = "me-1 rounded-circle bg-light-danger round-20" +
            " d-flex align-items-center justify-content-center"
        document.querySelector("#diffWithLastYear span").innerHTML = `<i class="ti ti-arrow-down-right text-danger"></i>`
    }
    document.querySelector("#diffWithLastYear").append()
    document.querySelector("#diffWithLastYear p").innerHTML = `${ posResult ? "+":"-"}${Math.abs(100-Math.round(seasonsData[0].value/seasonsData[1].value*100))}% than ${last4Qtrs[1]}`

    if (isNaN(100 - Math.round(seasonsData[0].value / seasonsData[1].value * 100))){
        document.querySelector("#diffWithLastYear").innerHTML = `<p>Data not available</p>`
    }

    // Yearly Breakup Charts
    // 按照季度计算整托盘产品的出货数量，1个托盘记为1件/或可以用货值替代，需要记录出货时候的货值
    // 如果产品按照box/carton计算，则需要另外计算其托盘价值
    var quarterBreakup = {
        color: "#adb5bd",
        series: [Math.round(seasonsData[0].value), Math.round(seasonsData[1].value), Math.round(seasonsData[2].value), Math.round(seasonsData[3].value)],
        labels: getLastXQuarters(4),
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
                donut: {size: '75%'},
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
}
async function fetchInventoryGraphData(yearoption = new Date().getFullYear()){
    if(yearoption < 2000 || yearoption > 2999) {
        yearoption = new Date().getFullYear()
    }
    let result = [];
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    try {
        await client.connect()
        let session = await client.db(dbname).collection("pollinglog");
        let regex = new RegExp("^"+yearoption)
        result = await session.find({$or:[
            {createTime: {$gte: new Date(yearoption, 0, 1), $lte: new Date(yearoption, 11, 31,23,59,59)}},
                {removeTime: {$gte: new Date(yearoption, 0, 1), $lte: new Date(yearoption, 11, 31,23,59,59)}}
            ]}).toArray()
    } catch (e) {           
        console.error(`Error on CheckDBConnection: ${e}`)
    } finally {
        await client.close()
    }

    let values = {import: [0,0,0,0,0,0,0,0,0,0,0,0,0], export:[0,0,0,0,0,0,0,0,0,0,0,0,0]}
    if (result.length > 0) {
        result.forEach(eachData => {
            if (eachData.hasOwnProperty("grossPrice")){
                if (eachData.grossPrice instanceof Decimal128){
                    if (eachData.hasOwnProperty("createTime")) {
                        values.import[new Date(eachData.createTime).getMonth()] += Number(eachData.grossPrice.toString())
                    }
                    if (eachData.hasOwnProperty("removeTime")) {
                        values.export[new Date(eachData.removeTime).getMonth()] -= Number(eachData.grossPrice.toString())
                    }
                } else {
                    if (eachData.hasOwnProperty("createTime")) {
                        values.import[new Date(eachData.createTime).getMonth()] += Number(eachData.grossPrice)
                    }
                    if (eachData.hasOwnProperty("removeTime")) {
                        values.export[new Date(eachData.removeTime).getMonth()] -= Number(eachData.grossPrice)
                    }
                }
            }
        })

        for (let i = 0; i < values.import.length; i++) {
            values.import[i] = Math.round(values.import[i])
            values.export[i] = Math.round(values.export[i])
        }
    }
    return values
}


async function cardTurnoverTimes() {
    if (stockRecords.length <=0){
        await getAllStockRecords(true);
    }
    let quarterTurnoverRates = calculateTurnoverRate(stockRecords, 'quarters')
    let monthlyTurnoverRates = calculateTurnoverRate(stockRecords, 'months')
    let weeklyTurnoverRates = calculateTurnoverRate(stockRecords, 'weeks')
    console.log(quarterTurnoverRates,monthlyTurnoverRates,weeklyTurnoverRates)

    document.querySelector("#apex_turnoverChart h5").textContent = `Stock Turnover Time`
    document.querySelector("#turnoverFootnote").textContent = `* Data are calculated on period of: ${monthlyTurnoverRates[monthlyTurnoverRates.length-1].period}`
    document.querySelector("#apex_turnoverChart h4").textContent = `${monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate} days*`
    if (monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate > monthlyTurnoverRates[monthlyTurnoverRates.length-2].rate) {
        document.querySelector("#apex_turnoverChart .col-12 span").className = "me-2 rounded-circle bg-light-danger round-20 d-flex align-items-center justify-content-center"
        document.querySelector("#apex_turnoverChart .col-12 span").innerHTML = `<i class="ti ti-arrow-down-right text-danger"></i>`
    } else {
        document.querySelector("#apex_turnoverChart .col-12 span").className = "me-2 rounded-circle bg-light-success round-20 d-flex align-items-center justify-content-center"
        document.querySelector("#apex_turnoverChart .col-12 span").innerHTML = `<i class="ti ti-arrow-up-right text-success"></i>`
    }
    document.querySelector("#apex_turnoverChart .col-12 p").textContent =
        `${(monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate / monthlyTurnoverRates[monthlyTurnoverRates.length-2].rate - 1) > 0 ? "+" : "-"}${Math.abs(Math.round((monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate / monthlyTurnoverRates[monthlyTurnoverRates.length-2].rate - 1) * 100))}% days compared on last month`

    let monthlyTurnOverRatesArray = []
    monthlyTurnoverRates.forEach(eachData => {
        monthlyTurnOverRatesArray.push(eachData.rate)
    })
    // Apex Chart 2  Stock Turnover Time
    // Stock Turnover部分仅整托盘计算(出库时间-入库时间)/总托盘数量
    var turnOvers = {
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
                name: "Turnover Days",
                color: "#49BEFF",
                type: "area",
                data: monthlyTurnOverRatesArray,
            },
            // {
            //     name: "$ Value",
            //     color: "#3200FF",
            //     type: "line",
            //     data: turnOverChartData.value.reverse(),
            // },
        ],
        stroke: {
            curve: "smooth",
            width: 1,
        },
        fill: {
            colors: ["#f3feff"],
            type: "solid",
            opacity: [0.05, 1],
        },
        yaxis: [
            {title: {text: "Outbound pallets"}},
            {opposite: true, title: {text: "Value"}}
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
}

document.querySelector("#inv_optionslist").addEventListener("change",(ev)=>{
    console.log(ev)
    console.log(document.querySelector("#inv_optionslist").value)
    if (document.querySelector("#inv_optionslist").value === -6){
    //     切换图形到近6个月出入库信息
    } else {
        
    }
})

async function lastXmonthsPollinglog(months = 24,forced = false){
    const recordTimeLimit = new Date().setMonth(new Date().getMonth() - months)
    if (stockRecordsSinceLastYears.length <=0 || forced === true) {
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        let result = []
        try {
            await client.connect()
            let session = await client.db(dbname).collection("pollinglog");
            result = await session.find({
                $or: [
                    {createTime: {$exists: true, $gte: new Date(recordTimeLimit)}},
                    {loggingTime: {$exists: true, $gte: new Date(recordTimeLimit)}}
                ],
                removed: 1
            }).sort({createTime: 1, loggingTime: 1}).toArray()
            stockRecordsSinceLastYears = result;
        } catch (e) {
            console.error(`Error on CheckDBConnection: ${e}`)
        } finally {
            await client.close()

        }
    }
    return stockRecordsSinceLastYears
}

async function getEarliestTransactionLog() {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    let result = []
    try {
        await client.connect()
        let session = await client.db(dbname).collection("pollinglog");
        result = await session.find({loggingTime: {$exists: true, $ne: null}}).sort({loggingTime: 1}).limit(1).toArray()
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
    } finally {
        await client.close()
    }
    return result
}

function getXaxislabels(date = new Date()){
    // 默认仅获取近半年记录，整财年记录需要调整count为12
    let months = [];
    for (let i = 0; i < 12; i++) {
        let year = date.getFullYear().toString().slice(-2);
        let month = ('0' + (i+1)).slice(-2);

        months.push(`${month}/${year}`);
        date.setMonth(date.getMonth() - 1);
    }
    return months;
}

function getRecentTransactions(recordsArray, limit = 500, direction = "both"){
    // Direction can be in/out/both
    let reorderedDupArray = []
    if (Array.isArray(recordsArray)) {
        if (direction=== "both" || direction === "in") {
            for (let i = 0; i < recordsArray.length; i++) {
                if (recordsArray[i].hasOwnProperty("loggingTime")) {
                    let pushElement = recordsArray[i]
                    pushElement.compTime = recordsArray[i].loggingTime
                    pushElement.direction = "in"
                    reorderedDupArray.push(pushElement)
                }
            }
        }
        if (direction=== "both" || direction === "out") {
            for (let i = 0; i < recordsArray.length; i++) {
                if (recordsArray[i].hasOwnProperty("removeTime")) {
                    let pushElement = recordsArray[i]
                    pushElement.compTime = recordsArray[i].removeTime
                    pushElement.direction = "out"
                    reorderedDupArray.push(pushElement)
                }
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
            if (eachRecord.hasOwnProperty("removed") && eachRecord.removed === 1 &&
                eachRecord.hasOwnProperty("removeTime") && isSameYearmonth(new Date(eachRecord.removeTime),date)){
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
    let currentInstockvalue= 0;
    let thisMonthImportVal = 0;
    let thisMonthExportVal = 0
    if (Array.isArray(stockRecords)){
        stockRecords.forEach(eachRecord=>{
            if (eachRecord.hasOwnProperty("unitPrice") && eachRecord.hasOwnProperty("quantity")){
                currentInstockvalue += eachRecord.quantity * eachRecord.quantity
                if (eachRecord.hasOwnProperty("loggingTime") && isSameYearmonth(new Date(eachRecord.loggingTime))){
                    thisMonthImportVal += eachRecord.quantity * eachRecord.quantity
                }
                if (eachRecord.hasOwnProperty("removeTime") && isSameYearmonth(new Date(eachRecord.removeTime))){
                    thisMonthExportVal += eachRecord.quantity * eachRecord.quantity
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

        if (new Date(new Date() - new Date(stockRecords[i].removeTime)).getUTCMonth() > 3){
            continue; //时间不在范围内，跳过
        } //时间在范围内可继续计算

        let foundInList = false
        for (let j = 0; j < stockList.length && !foundInList; j++) { //查找这样产品是否在已经添加的列表里面
            if (stockList[j].productCode === stockRecords[i].productCode){
                foundInList = true
                stockList[j].quantity += (isNaN(stockRecords[i].quantity) ? parseInt(stockRecords[i].quantity) : stockRecords[i].quantity)
                stockList[j].value = stockList[j].value + (stockRecords[i].hasOwnProperty("grossPrice") ? (stockRecords[i].grossPrice instanceof Decimal128 ? parseInt(stockRecords[i].grossPrice.toString()): stockRecords[i].grossPrice) : calculatePalletValue(stockRecords[i]))
            }
        }

        if (!foundInList) { //如果不在当前库存列表记录则创建新纪录
            stockList.push({
                productCode: stockRecords[i].productCode,
                labelname: stockRecords[i].productName,
                quantity: stockRecords[i].quantity,
                unit: stockRecords[i].quantityUnit,
                value: Math.round((!isNaN(stockRecords[i].quantity) ? stockRecords[i].quantity : 0) * (!isNaN(stockRecords[i].unitPrice) ? stockRecords[i].unitPrice : 0))
            })
        }
    }
    if (stockList.length > 1){
        stockList.sort((a, b) => b.value - a.value)
    }

    return stockList
}

// 19DEC23 修正TurnOver计算时间方法
// 主要显示：当月对比上月，当月所使用的产品turnover dates，对比上月所使用的产品turnoverdays
// 根据删除时间分配到对应的turnover项目中，仅针对使用过的产品分类

function getLastPeriods(now, count, monthsPerPeriod) {
    let periods = [];
    for (let i = 0; i < count; i++) {
        let end = new Date(now.getFullYear(), now.getMonth() - (monthsPerPeriod * i), now.getDate());
        let start = new Date(now.getFullYear(), now.getMonth() - (monthsPerPeriod * (i + 1)), now.getDate());
        periods.unshift({ start, end, label: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}` });
    }
    return periods;
}
function getLastWeeks(now, count) {
    let weeks = [];
    for (let i = 0; i < count; i++) {
        let end = new Date(now);
        end.setDate(now.getDate() - now.getDay() - (i * 7));
        let start = new Date(end);
        start.setDate(end.getDate() - 6);
        weeks.unshift({
            start,
            end,
            label: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`
        });
    }
    return weeks;
}

function calculateTurnoverRate(data, periodType) {
    let now = new Date();
    let periods = [];
    let turnoverRates = [];

    // 根据不同的周期类型确定时间段
    switch (periodType) {
        case 'quarters':
            periods = getLastPeriods(now, 4, 3);
            break;
        case 'months':
            periods = getLastPeriods(now, 12, 1);
            break;
        case 'weeks':
            periods = getLastWeeks(now, 12);
            break;
        default:
            return [];
    }

    // 对于每个周期，计算周转率
    periods.forEach(period => {
        let totalDays = 0;
        let itemCount = 0;

        data.forEach(item => {
            if (item.hasOwnProperty("createTime") && item.hasOwnProperty("removeTime")) {
                if (item.createTime >= period.start && item.removeTime <= period.end) {
                    totalDays += (item.removeTime - item.createTime) / (24 * 60 * 60 * 1000); // 将毫秒转换为天
                    itemCount++;
                }
            }
        });

        let averageTurnover = itemCount > 0 ? (totalDays / itemCount).toFixed(1) : 0;
        turnoverRates.push({ period: period.label, rate: averageTurnover });
    });

    return turnoverRates;
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

function getLastXFiscalQuartersAU(isoDateString = new Date().toISOString(), quarters = 4, fiscalYearStartMonth = 7) {
    const startDate = new Date(isoDateString);
    let year = startDate.getFullYear();
    let month = startDate.getMonth() + 1;
    let fiscalQuarter;

    if (month < fiscalYearStartMonth || (month === fiscalYearStartMonth && startDate.getDate() === 1)) {
        year--;
    } else {
        year++;
    }


    fiscalQuarter = Math.floor((month - fiscalYearStartMonth + 12) % 12 / 3) + 1;
    const quartersList = [];
    for (let i = 0; i < quarters; i++) {
        const quarterName = `${year % 100}Q${fiscalQuarter}`;
        const startMonth = ((fiscalQuarter - 1) * 3 + fiscalYearStartMonth) % 12 || 12;
        const endMonth = (fiscalQuarter * 3 + fiscalYearStartMonth - 1) % 12 || 12;
        const startTime = new Date(year, startMonth - 1, 1).toISOString().split('T')[0];
        const endTime = new Date(year, endMonth, 0).toISOString().split('T')[0];

        quartersList.push({
            name: quarterName,
            startTime: startTime,
            endTime: endTime
        });

        if (fiscalQuarter === 1) {
            fiscalQuarter = 4;
            year--; // Last FY
        } else {
            fiscalQuarter--;
        }
    }

    return quartersList;
}

function getLastXQuarters(quarters = 4, isoDateString = new Date().toISOString()) {
    const startQuarterDate = new Date(isoDateString);
    let year = startQuarterDate.getFullYear();
    let quarter = Math.floor(startQuarterDate.getMonth() / 3) + 1;
    const quartersList = [];

    for (let i = 0; i < quarters; i++) {
        quartersList.push(`${year % 100}Q${quarter}`);
        if (quarter === 1) {
            quarter = 4;
            year--;
        } else {
            quarter--;
        }
    }
    return quartersList;
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
        if (stockRecords[i].hasOwnProperty("removeTime")) {
            for (let j = 0; j < turnOverValueArrays.week.length; j++) {
                if (turnOverValueArrays.week[j].week === weekNumberYearSun(stockRecords[i]["removeTime"]).week &&
                    turnOverValueArrays.week[j].year === weekNumberYearSun(stockRecords[i]["removeTime"]).year) {
                    for (let k = 0; k < productsList.length; k++) {
                        if (productsList[k].productCode === stockRecords[i]['productCode'] && productsList[k].hasOwnProperty('cartonQty') &&
                            (("cartons/ctns").includes(stockRecords[i]['quantityUnit'].toLowerCase()))){
                            stockRecords[i]['quantity'] = Math.round(parseInt(stockRecords[i]['quantity']) * parseInt(productsList[k]['cartonQty']))
                            break;
                        }
                    }
                    turnOverValueArrays.pallets[j] += 1
                    if (isNaN(turnOverValueArrays.value[j])){
                        turnOverValueArrays.value[j] = 0
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

async function getAllStockRecords(forced = false,limit = 50000){
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
        }
    });
    let result = []
    if (stockRecords.length > 0 && !forced){
        return stockRecords
    }
    try {
        await client.connect()
        let collections = client.db(dbname).collection("pollinglog");
        result = ( limit <= 0 ?
            await collections.find({}).sort({"removeTime":-1,"loggingTime":1}).toArray() :
            await collections.find({}).sort({"removeTime":-1,"loggingTime":1}).limit(limit).toArray()
        )
        stockRecords = result
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
    } finally {
        await client.close()
    }
    return result
}

async function updateProductList(forced = false){
    if (forced === true || productsList.length <= 0){
    // 当强制要求刷新时
        let client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true
            }
        });
        try {
            await client.connect()
            let collections = client.db(dbname).collection("products");
            productsList = await collections.find().sort({"productCode":1}).toArray()
        } catch (e) {
            console.error(`Error on CheckDBConnection: ${e}`)
        } finally {
            await client.close()
        }
    }
    return productsList
}
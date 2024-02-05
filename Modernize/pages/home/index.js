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
let pollinglogs = []
let productsList = []

// Apex Charts
let salesBreakupApexCharts; // Chart 1 Quarter/Month Sales Breakup
let salesBreakupApexChartColours = ["#FF5733","#33FF57","#3357FF","#FF33F6","#F6FF33","#33FFF6","#FF5733","#8D33FF","#FF8D33","#33FF8D","#8DFF33","#338DFF"]
let turnoverRatesApexCharts; // Chart 2 Stock Turnover Time

document.addEventListener("DOMContentLoaded",async () => {
    await fetchStocks(true);
    await fetchProducts(true);
    await lastXmonthsPollinglog(24,true)


    drawSalesBreakupPieChart()
    await getSalesData() // index.js Apex chart 1, Quarterly Breakup
    // await cardQuarterSales()      // index.js Apex chart 1, Quarterly Breakup
    
    await cardTurnoverTimes()     // index.js Apex chart 2, Turnover Rates


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
            console.error("Error while insert best seller:",e)
        }
    }
    
    // Card 4 - Apex Chart 3 Inventory Report
    let fetchInventoryData = await calculateStockValues()
    let maxy = 0
    fetchInventoryData.monthsIn.reverse()
    fetchInventoryData.monthsOut.reverse()
    for (let i = 0; i < fetchInventoryData.monthsIn.length; i++) {
        fetchInventoryData.monthsIn[i] = fetchInventoryData.monthsIn[i].toFixed(2)
        fetchInventoryData.monthsOut[i] = fetchInventoryData.monthsOut[i].toFixed(2)
        maxy = (fetchInventoryData.monthsIn[i] > maxy ? parseInt(fetchInventoryData.monthsIn[i]) : maxy )
        maxy = (fetchInventoryData.monthsOut[i] > maxy ? parseInt(fetchInventoryData.monthsOut[i]) : maxy)
        fetchInventoryData.monthsOut[i] = -fetchInventoryData.monthsOut[i]
    }
    maxy = Math.ceil(maxy/1000)*1000
    
    var inventoryStatChart = {
        series: [
            {
                name: "Imported this month",
                data: fetchInventoryData.monthsIn
            },
            {
                name: "Exported this month",
                data: fetchInventoryData.monthsOut,
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

    let inventoryCalculation = await calculateStockValues()

    document.querySelector("#inventoryOverviews h5").textContent = "Inventory Overview"
    document.querySelector("#inventoryOverviews #stockValue").textContent =
        `$ ${new Intl.NumberFormat('en-AU').format(inventoryCalculation.current)}`
    document.querySelector("#inventoryOverviews #inboundValue").textContent =
        `$ ${new Intl.NumberFormat('en-AU').format(inventoryCalculation.monthsIn[0])} / ${inventoryCalculation.qtyIn[0]} Plts`
    document.querySelector("#inventoryOverviews #outboundValue").textContent =
        `$ ${new Intl.NumberFormat('en-AU').format(inventoryCalculation.monthsOut[0])} / ${inventoryCalculation.qtyOut[0]} Plts`
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

async function getSalesData(count = 6, period = "quarter") {
    if (pollinglogs.length <= 0) {
        await lastXmonthsPollinglog(24, true)
    }
    let periodsArray = createPeriodsArray(count, "quarter")
    if (period === "quarter") {
        periodsArray = createPeriodsArray(count, "quarter")
    } else if (period === "month") {
        periodsArray = createPeriodsArray(count, "month")
    } else if (period === "week") {
        periodsArray = createWeeksPeriodArray(count)
    }
    periodsArray.forEach(eachData => {
        eachData.pallet = 0
        eachData.value = 0
    })

    for (let i = 0; i < pollinglogs.length; i++) {
        if (pollinglogs[i].hasOwnProperty("removed") && pollinglogs[i].removed === 1) { // Used stock, can be used in calculate
            if (!pollinglogs[i].hasOwnProperty("removeTime")) {
                continue;
            }
            let stockEndTime = pollinglogs[i].removeTime

            for (let j = 0; j < periodsArray.length; j++) { //     对比时间区间
                if (new Date(stockEndTime) >= new Date(`${periodsArray[j].sessionStart}T00:00:00`) &&
                    new Date(stockEndTime) <= new Date(`${periodsArray[j].sessionEnd}T23:59:59`)) {
                    periodsArray[j].pallet += 1
                    if (pollinglogs[i].hasOwnProperty("grossPrice")) {
                        if (pollinglogs[i].grossPrice instanceof Decimal128) {
                            periodsArray[j].value += parseFloat(pollinglogs[i].grossPrice.toString())
                        } else {
                            periodsArray[j].value += parseFloat(pollinglogs[i].grossPrice)
                        }
                    }
                    break;
                }
            }
        }
    }

    var chartLabels = []
    var chartSeriesData = []
    for (let i = 0; i < periodsArray.length; i++) {
        chartLabels.push(periodsArray[i].sessionName)
        chartSeriesData.push(Math.round(periodsArray[i].value))
        document.querySelector("#salesBreakup_labels").querySelectorAll("span")[i].setAttribute("style",`color: ${salesBreakupApexChartColours[i]}`)
    }

    // 脚注标记
    let quarterlyBreakupFootnote = document.querySelectorAll("#apex_quarterlyBreakup .col-12 .fs-2")
    for (let i = 0; i < chartLabels.length && i < quarterlyBreakupFootnote.length; i++) {
        quarterlyBreakupFootnote[i].innerText = chartLabels[i]
    }

    document.querySelector("#apex_quarterlyBreakup .card-title").textContent = `Sales Breakup by ${period}`
    document.querySelector("#apex_quarterlyBreakup h4").textContent = `A$ ${new Intl.NumberFormat('en-AU').format(Math.round(chartSeriesData[0]))}`
    document.querySelector("#diffWithLastYear span").className = `me-1 rounded-circle ${(chartSeriesData[0] > chartSeriesData[1]) ? 'bg-light-success' : 'bg-light-danger'} round-20 d-flex align-items-center justify-content-center`
    document.querySelector("#diffWithLastYear span").innerHTML = (chartSeriesData[0] > chartSeriesData[1]) ? `<i class="ti ti-arrow-up-right text-success"></i>` : `<i class="ti ti-arrow-down-right text-danger"></i>`
    document.querySelector("#diffWithLastYear").append()
    document.querySelector("#diffWithLastYear p").innerHTML = `${chartSeriesData[0] > chartSeriesData[1] ? "+" : "-"}${Math.abs(100 - Math.round(chartSeriesData[0] / chartSeriesData[1] * 100))}% than ${chartLabels[1]}`


    if (isNaN(100 - Math.round(chartSeriesData[0] / chartSeriesData[1] * 100))) {
        document.querySelector("#diffWithLastYear").innerHTML = `<p>Data not available</p>`
    }

    salesBreakupApexCharts.updateOptions({series: chartSeriesData, labels: chartLabels}, true)
}

function drawSalesBreakupPieChart(series = [0,0,0,0], labels = ["label 1","label 2","label 3","label 4"]){
    var quarterBreakup = {
        color: "#adb5bd",
        series: [0,0,0,0],
        labels: ["label 1","label 2","label 3","label 4"],
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
        colors: salesBreakupApexChartColours,
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
    salesBreakupApexCharts = new ApexCharts(document.querySelector("#breakup"), quarterBreakup)
    salesBreakupApexCharts.render();
}

document.querySelector("#radio_salesStaticsQuarter").addEventListener("change", async (ev) => {
    if (ev.target.checked) {getSalesData(6,'quarter')  }
})
document.querySelector("#radio_salesStaticsMonth").addEventListener("change", async (ev) => {
    if (ev.target.checked) { getSalesData(6,'month') }
})

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

async function cardTurnoverTimes(period = "month") {
    if (stockRecords.length <=0){
        await fetchStocks(true);
    }
    // let quarterTurnoverRates = calculateTurnoverRate(stockRecords, 'quarter')
    let monthlyTurnoverRates = calculateTurnoverRate(stockRecords, 'month')
    // let weeklyTurnoverRates = calculateTurnoverRate(stockRecords, 'week')

    document.querySelector("#apex_turnoverChart h5").textContent = `Monthly Stock Turnover Time`
    document.querySelector("#apex_turnoverChart h4").textContent = `${monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate} days*`
    document.querySelector("#apex_turnoverChart .col-12 span").className = `me-2 rounded-circle ${(monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate > monthlyTurnoverRates[monthlyTurnoverRates.length-2].rate) ? 'bg-light-success' : 'bg-light-danger' } round-20 d-flex align-items-center justify-content-center`
    document.querySelector("#apex_turnoverChart .col-12 span").innerHTML = (monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate > monthlyTurnoverRates[monthlyTurnoverRates.length-2].rate) ? `<i class="ti ti-arrow-up-right text-success"></i>`:`<i class="ti ti-arrow-down-right text-danger"></i>`
    document.querySelector("#apex_turnoverChart .col-12 p").textContent =
        `${(monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate / monthlyTurnoverRates[monthlyTurnoverRates.length-2].rate - 1) > 0 ? "+" : "-"}${Math.abs(Math.round((monthlyTurnoverRates[monthlyTurnoverRates.length-1].rate / monthlyTurnoverRates[monthlyTurnoverRates.length-2].rate - 1) * 100))}% days compared on last month`

    var turnoverDatas = {turnoverRates: [], periods:[]}
    monthlyTurnoverRates.forEach(eachData => {
        turnoverDatas.turnoverRates.push(eachData.rate)
        turnoverDatas.periods.push(eachData.sessionPeriod)
    })
    drawTurnOverRateRate(monthlyTurnoverRates,turnoverDatas)
}

document.querySelector("#radio_turnoverMonth").addEventListener("change", async (ev) => {
    if (ev.target.checked) {
        let turnoverRates = calculateTurnoverRate(stockRecords, 'month')
        document.querySelector("#apex_turnoverChart h5").textContent = `Monthly Stock Turnover Time`
        document.querySelector("#apex_turnoverChart h4").textContent = `${turnoverRates[turnoverRates.length - 1].rate} days*`

        document.querySelector("#apex_turnoverChart .col-12 span").className = `me-2 rounded-circle ${(turnoverRates[turnoverRates.length - 1].rate > turnoverRates[turnoverRates.length - 2].rate) ? 'bg-light-success':'bg-light-danger'} round-20 d-flex align-items-center justify-content-center`
        document.querySelector("#apex_turnoverChart .col-12 span").innerHTML = (turnoverRates[turnoverRates.length - 1].rate > turnoverRates[turnoverRates.length - 2].rate) ? `<i class="ti ti-arrow-up-right text-success"></i>` : `<i class="ti ti-arrow-down-right text-danger"></i>`
        document.querySelector("#apex_turnoverChart .col-12 p").textContent =
            `${(turnoverRates[turnoverRates.length - 1].rate / turnoverRates[turnoverRates.length - 2].rate - 1) > 0 ? "+" : "-"}${Math.abs(Math.round((turnoverRates[turnoverRates.length - 1].rate / turnoverRates[turnoverRates.length - 2].rate - 1) * 100))}% days compared on last month`

        var turnoverDatas = {turnoverRates: [], periods: []}
        turnoverRates.forEach(eachData => {
            turnoverDatas.turnoverRates.push(eachData.rate)
            turnoverDatas.periods.push(eachData.sessionPeriod)
        })

        // Apex Chart 2  Stock Turnover Time
        // Stock Turnover部分仅整托盘计算(出库时间-入库时间)/总托盘数量
        turnoverRatesApexCharts.updateOptions({
            series:[
                {
                    data:turnoverDatas.turnoverRates
                }
            ],
            tooltip:{
                x:{
                    show: true,
                    formatter: function (val, opts) {
                        return `Period: ${turnoverDatas.periods[val - 1]}`
                    }
                }
            }
        }, true)
    }
})
document.querySelector("#radio_turnoverQuarter").addEventListener("change", async (ev) => {
    if (ev.target.checked) {
        let turnoverRates = calculateTurnoverRate(stockRecords, 'quarter')
        document.querySelector("#apex_turnoverChart h5").textContent = `Quarterly Stock Turnover Time`
        document.querySelector("#apex_turnoverChart h4").textContent = `${turnoverRates[turnoverRates.length - 1].rate} days*`

        document.querySelector("#apex_turnoverChart .col-12 span").className = `me-2 rounded-circle ${(turnoverRates[turnoverRates.length - 1].rate > turnoverRates[turnoverRates.length - 2].rate) ? 'bg-light-success' : 'bg-light-danger' } round-20 d-flex align-items-center justify-content-center`
        document.querySelector("#apex_turnoverChart .col-12 span").innerHTML = (turnoverRates[turnoverRates.length - 1].rate > turnoverRates[turnoverRates.length - 2].rate) ? `<i class="ti ti-arrow-up-right text-success"></i>` : `<i class="ti ti-arrow-down-right text-danger"></i>`
        document.querySelector("#apex_turnoverChart .col-12 p").textContent =
            `${(turnoverRates[turnoverRates.length - 1].rate / turnoverRates[turnoverRates.length - 2].rate - 1) > 0 ? "+" : "-"}${Math.abs(Math.round((turnoverRates[turnoverRates.length - 1].rate / turnoverRates[turnoverRates.length - 2].rate - 1) * 100))}% days compared on last month`

        var turnoverDatas = {turnoverRates: [], periods: []}
        turnoverRates.forEach(eachData => {
            turnoverDatas.turnoverRates.push(eachData.rate)
            turnoverDatas.periods.push(eachData.sessionPeriod)
        })

        // Apex Chart 2  Stock Turnover Time
        // Stock Turnover部分仅整托盘计算(出库时间-入库时间)/总托盘数量
        turnoverRatesApexCharts.updateOptions({
            series:[{data:turnoverDatas.turnoverRates}],
            tooltip:{x:{formatter: function (val, opts) { return `Period: ${turnoverDatas.periods[val - 1]}` }}}
        }, true)
    }
})

function drawTurnOverRateRate(turnoverRates, turnoverData) {
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
                data: turnoverData.turnoverRates,
            },
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
            {title: {text: "Turnover Days"}},
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
            x: {
                show: true,
                formatter: function (val, opts) {
                    return `Period: ${turnoverRates[val - 1].sessionPeriod}`
                }
            },
            y: {show: false}
        },
    };
    turnoverRatesApexCharts = new ApexCharts(document.querySelector("#turnovers"), turnOvers)
    turnoverRatesApexCharts.render()
}

async function lastXmonthsPollinglog(months = 24,forced = false){
    const recordTimeLimit = new Date().setMonth(new Date().getMonth() - months)
    if (pollinglogs.length <=0 || forced === true) {
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
            pollinglogs = result;
        } catch (e) {
            console.error(`Error on CheckDBConnection: ${e}`)
        } finally {
            await client.close()

        }
    }
    return pollinglogs
}

function getXaxislabels(date = new Date()){
    const months = [];
    const currentDate = new Date();

    for (let i = 0; i < 12; i++) {
        let month = currentDate.getMonth() - i;
        let year = currentDate.getFullYear();
        if (month < 0) {
            month += 12;
            year -= 1;
        }
        const formattedMonth = (month + 1).toString().padStart(2, '0');
        months.unshift(`${formattedMonth}/${year}`);
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

/*
* 计算当前库存价值
*
* 1.计算当前货品价值：通过已经抓取到的stock列表，和product列表，如果stock中有grossPrice,则直接使用
* 2. 计算当月入库货值，筛选createTime部分为当前月的时间戳，如果stock中有grossPrice，则直接使用，如果没有，则使用product中的货值
* 3. 计算当月出库货值，筛选removeTime部分为当前月的时间戳，*/
// 计算当前库存的货品价值
// 当前库存货品价值：
//

async function calculateStockValues(){
    let stockList = await fetchStocks(false)
    let productList  = await fetchProducts(false)
    let valueResponse = {current: 0, calculateTime: new Date(),
        monthsIn:[0,0,0,0,0,0,0,0,0,0,0,0], monthsOut:[0,0,0,0,0,0,0,0,0,0,0,0],
        qtyIn:[0,0,0,0,0,0,0,0,0,0,0,0], qtyOut:[0,0,0,0,0,0,0,0,0,0,0,0]};
    try{
        for (const eachStock of stockList) {
            let productElement = {}
            for (const eachProduct of productList) { //尝试查找对应产品
                if (eachStock.productCode && String(eachStock.productCode).length > 0 && eachProduct.productCode && eachStock.productCode === eachProduct.productCode){
                    productElement = eachProduct
                    break;
                }
            }

            let stockValue = 0
            if (eachStock.hasOwnProperty("grossPrice") && parseFloat(eachStock.grossPrice) > 0) {
                //     如果当前货品有grossPrice，则直接使用
                stockValue = parseFloat(eachStock.grossPrice)
            }else if(eachStock.hasOwnProperty("quantityUnit") && productElement.hasOwnProperty("unit") && eachStock.quantityUnit === productElement.unit){
                //      如果当前货品没有grossValue，则需要对比单位是否和product表中一致,如果一致则尝试使用unitPrice
                if (eachStock.hasOwnProperty("unitPrice") && parseFloat(eachStock.unitPrice) > 0) {
                    stockValue = parseFloat(eachStock.unitPrice) * parseInt(eachStock.quantity)
                } else if(productElement.hasOwnProperty("unitPrice") && parseFloat(productElement.unitPrice) > 0) {
                    stockValue = parseFloat(productElement.unitPrice) * parseInt(eachStock.quantity)
                } else { //如果没有单价信息直接跳过
                    continue;
                }
            }else if(eachStock.hasOwnProperty("quantity") && parseInt(eachStock.quantity) > 0 &&
                productElement.hasOwnProperty("cartonQty") && parseInt(eachStock.cartonQty) > 0){
                // 如果当前货品没有grossValue，且单位不一致，当前stock使用了carton标记，则尝试使用cartonQty计算总数后再计算货值
                if (eachStock.hasOwnProperty("unitPrice") && parseFloat(eachStock.unitPrice) > 0) {
                    stockValue = parseFloat(eachStock.unitPrice) * parseInt(eachStock.quantity) * parseInt(eachStock.cartonQty)
                } else if(productElement.hasOwnProperty("unitPrice") && parseFloat(productElement.unitPrice) > 0) {
                    stockValue = parseFloat(productElement.unitPrice) * parseInt(eachStock.quantity) * parseInt(eachStock.cartonQty)
                } else { //如果没有单价信息直接跳过
                    continue;
                }
            } else {
                continue;
            }

            // 货值计算完毕，开始分类
            if (eachStock.hasOwnProperty("removed") && eachStock.removed === 0){  //当前库内货值
                valueResponse.current += stockValue
            }
            if (eachStock.hasOwnProperty("createTime")) {
                var monthDiff = calcMonthDiff(new Date(eachStock.createTime))
                if (monthDiff<12){
                    valueResponse.monthsIn[monthDiff] += stockValue
                    valueResponse.qtyIn[monthDiff] ++
                }
            }
            if (eachStock.hasOwnProperty("removed") && eachStock.removed === 1 && eachStock.hasOwnProperty("removeTime")){
                var monthDiff = calcMonthDiff(new Date(eachStock.removeTime))
                if (monthDiff<12){
                    valueResponse.monthsOut[monthDiff] += stockValue
                    valueResponse.qtyOut[monthDiff] ++
                }
            }
        }
    } catch (e) {
        console.error("Error occurred when calculating Stock values.")
    }
    return valueResponse
}

// Default:
// withDate=false: Not including date difference, only Month & Years, 20240131 - 20240201 = 1 month diff
// withDate=true: Including date difference, only Month & Years, 20240131 - 20240201 =  in same month
function calcMonthDiff (inputDate, withDate = false){
    if (!(inputDate instanceof Date)) {
        throw new Error('Data Type must be date');
    }
    const currentDate = new Date();
    let yearDifference = currentDate.getFullYear() - inputDate.getFullYear();
    let monthDifference = currentDate.getMonth() - inputDate.getMonth();
    let totalMonthDifference = yearDifference * 12 + monthDifference;

    if (withDate && currentDate.getDate() < inputDate.getDate()) {
        totalMonthDifference--;
    }

    return totalMonthDifference;
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
function createPeriodsArray(count = 12, period = "month") {
    const sessionArray = [];
    const currentDate = new Date();
    let currentYear = currentDate.getFullYear();
    let currentQuarter = Math.floor((currentDate.getMonth() / 3)) + 1;
    let currentMonth = currentDate.getMonth() + 1;

    if (period === "quarter"){
        for (let i = 0; i < count && i<12; i++) {
            var sessionName = `${String(currentYear).slice(-2)}Q${currentQuarter}`;
            var sessionStart = new Date(currentYear, (currentQuarter - 1) * 3, 1);
            var sessionEnd = new Date(currentYear, currentQuarter * 3, 0);
            var formattedSessionStart = `${sessionStart.getFullYear()}-${String(sessionStart.getMonth() + 1).padStart(2, '0')}-${String(sessionStart.getDate()).padStart(2, '0')}`;
            var formattedSessionEnd = `${sessionEnd.getFullYear()}-${String(sessionEnd.getMonth() + 1).padStart(2, '0')}-${String(sessionEnd.getDate()).padStart(2, '0')}`;

            sessionArray.push({sessionName: sessionName, sessionStart: formattedSessionStart, sessionEnd: formattedSessionEnd});

            if (currentQuarter === 1) {
                currentQuarter = 4;
                currentYear--;
            } else {
                currentQuarter--;
            }
        }
    } else if (period === "month"){
        for (let i = 0; i < count && i<12; i++) {
            var sessionName = `${currentYear}${String(currentMonth).padStart(2, '0')}`;
            var monthStart = new Date(currentYear, currentMonth - 1, 1);
            var monthEnd = new Date(currentYear, currentMonth, 0); // 下个月的第0天即为当前月的最后一天
            var formattedMonthStart = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(monthStart.getDate()).padStart(2, '0')}`;
            var formattedMonthEnd = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

            sessionArray.push({ sessionName: sessionName,  sessionStart: formattedMonthStart,  sessionEnd: formattedMonthEnd});

            if (currentMonth === 1) {
                currentMonth = 12;
                currentYear--;
            } else {
                currentMonth--;
            }
        }
    }
    return sessionArray;
}
function createWeeksPeriodArray(count = 12) {
    const weeksArray = [];
    let currentDate = new Date();

    currentDate.setDate(currentDate.getDate() - currentDate.getDay());

    for (let i = 0; i < 12; i++) {
        let weekStart = new Date(currentDate);
        let weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() + 6);

        let formattedWeekStart = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
        let formattedWeekEnd = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;

        let weekNumber = Math.ceil((weekStart.getDate() - 1 + firstDayOfYear(weekStart)) / 7);
        let sessionName = `${weekStart.getFullYear().toString().substr(-2)}${String(weekNumber).padStart(2, '0')}`;

        weeksArray.push({ sessionName: sessionName, sessionStart: formattedWeekStart, sessionEnd: formattedWeekEnd });
        currentDate.setDate(currentDate.getDate() - 7);
    }

    return weeksArray;
}
function firstDayOfYear(date) { return new Date(date.getFullYear(), 0, 1).getDay(); }
function calculateTurnoverRate(data, periodType = "months") {
    let periods = [];
    let turnoverRates = [];

    switch (periodType) {
        case 'quarter':
            periods = createPeriodsArray(8,"quarter")
            break;
        case 'month':
            periods = createPeriodsArray(12,"month")
            break;
        case 'week':
            periods = createWeeksPeriodArray()
            break;
        default:
            return [];
    }

    periods.forEach(period => {
        let totalDays = 0;
        let itemCount = 0;
        data.forEach(item => {
            if ((item.hasOwnProperty("createTime") || item.hasOwnProperty("loggingTime"))  && item.hasOwnProperty("removeTime")) {
                if (item.removeTime <= new Date(period.sessionEnd)) {
                    totalDays += (item.removeTime - (item.hasOwnProperty("createTime") ? item.createTime : item.loggingTime)) / (24 * 60 * 60 * 1000); // 将毫秒转换为天
                    itemCount++;
                }
            }
        });

        let averageTurnover = itemCount > 0 ? (totalDays / itemCount).toFixed(1) : 0;
        turnoverRates.push({sessionName: period.sessionName ,sessionPeriod: `${period.sessionStart} > ${period.sessionEnd}`, rate: averageTurnover});
    });

    return turnoverRates.reverse();
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

async function fetchStocks(forced = false,limit = 50000){
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
        result = ( limit <= 0 ? await collections.find({}).toArray() : await collections.find({}).limit(limit).toArray())
        stockRecords = result
    } catch (e) {
        console.error(`Error on CheckDBConnection: ${e}`)
    } finally {
        await client.close()
    }
    return result
}

async function fetchProducts(forced = false){
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
            productsList = await collections.find().toArray()
        } catch (e) {
            console.error(`Error on CheckDBConnection: ${e}`)
        } finally {
            await client.close()
        }
    }
    return productsList
}
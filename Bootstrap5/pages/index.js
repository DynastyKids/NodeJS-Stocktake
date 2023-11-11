const {ipcRenderer} = require("electron");
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const path = require('path');
const moment = require('moment-timezone');

const Storage = require("electron-store");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
i18next.use(Backend).init({
    lng: (newStorage.get('language') ? newStorage.get('language') : 'en'), backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar()
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar()
        i18n_bodyContents();
        newStorage.set("language",e.target.value)
    });
});
function i18n_navbar() {
    // Navbar Section
    var navlinks = document.querySelectorAll(".nav-topitem");
    for (let i = 0; i < navlinks.length; i++) {
        navlinks[i].innerHTML = i18next.t(`navbar.navitems.${i}`)
    }

    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    for (let i = 0; i < sessionDropdownLinks.length; i++) {
        sessionDropdownLinks[i].innerHTML = i18next.t(`navbar.sessions_navitems.${i}`)
    }

    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    for (let i = 0; i < productDropdownLinks.length; i++) {
        productDropdownLinks[i].innerHTML = i18next.t(`navbar.products_navitems.${i}`)
    }
}
function i18n_bodyContents() {
    document.title = `${i18next.t('index.pagetitle')} - Warehouse Electron`
    // Content Section
    document.querySelector(".breadcrumb-item").textContent = i18next.t('index.pagetitle');
    document.querySelector(".container h1").textContent = i18next.t('index.pagetitle');
    var h4subtitles = document.querySelectorAll(".container h4")
    h4subtitles[0].textContent = i18next.t('index.h4label_stocktakeaction');
    h4subtitles[1].textContent = i18next.t('index.h4label_stocksaction');
    h4subtitles[2].textContent = i18next.t('index.h4label_productaction');

    var h3subtitles = document.querySelectorAll(".container h3")
    h3subtitles[0].textContent = i18next.t('index.h3label_currentactivestocktake');
    h3subtitles[1].textContent = i18next.t('index.h3label_environment');

    var actionLinks = document.querySelectorAll(".container table a")
    // Stock-take actions
    actionLinks[0].textContent = i18next.t('index.link_allsessions');
    actionLinks[1].textContent = i18next.t('index.session_stocks');
    actionLinks[2].textContent = i18next.t('index.new_stocktake');
    // Stock actions
    actionLinks[3].textContent = i18next.t('index.showstocksoverview');
    actionLinks[4].textContent = i18next.t('index.addmovementlog');
    actionLinks[5].textContent = i18next.t('index.nextpallet2unwrap');
    actionLinks[6].textContent = i18next.t('index.showPrefilled');
    // products actions
    actionLinks[7].textContent = i18next.t('index.showallproducts');
    actionLinks[8].textContent = i18next.t('index.addproduct');

    var tableTitles = document.querySelectorAll("#activeStocktakeContainer table th")
    tableTitles[0].textContent = i18next.t('tables.stocktable_sessionid');
    tableTitles[1].textContent = i18next.t('tables.stocktable_startTime');
    tableTitles[2].textContent = i18next.t('tables.stocktable_endTime');
    tableTitles[3].textContent = i18next.t('tables.stocktable_action');

    var tableRowActions = document.querySelectorAll(".tableaction_view")
    tableRowActions.forEach(eachRow => {
        eachRow.textContent = i18next.t('tables.btn_view');
    })

    var addMovementLogModal = document.querySelector("#addMovementLogModal")
    addMovementLogModal.querySelector(".modal-header .modal-title").textContent = i18next.t("index.addMovementLogModal.title")
    addMovementLogModal.querySelector(".modal-body p").textContent = i18next.t("index.addMovementLogModal.description")
    var labelId=0
    addMovementLogModal.querySelectorAll(".modal-body label").forEach(eachLabelItem => {
        eachLabelItem.textContent = i18next.t(`index.addMovementLogModal.labels.${labelId}`);
        labelId+=1;
    })
    addMovementLogModal.querySelector("#shelfHelp").textContent = i18next.t("index.addMovementLogModal.hinttext_shelf")
    addMovementLogModal.querySelector("#labelHelp").textContent = i18next.t("index.addMovementLogModal.hinttext_labelid")

    let optionId = 0;
    addMovementLogModal.querySelectorAll("#formSelectAction option").forEach(eachOption =>{
        eachOption.innerText = i18next.t(`index.addMovementLogModal.selections.${optionId}`);
        optionId += 1;
    });

}

ipcRenderer.on('server-info', (event, {address, port, addressSet}) => {
    let addressHTML = ""
    if (addressSet.length > 0) {
        addressSet.forEach(eachadd => {
            addressHTML += eachadd + "<br>"
        })
        document.querySelector("#serverAddressText").innerHTML = addressHTML;
    } else {
        document.querySelector("#serverAddressText").innerHTML = address;
    }
    document.querySelector("#serverPortText").innerText = port ? port : "";
});

async function getCurrentSession() {
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    let cursor;
    let htmlContent = ""
    try {
        await client.connect();

        let localTime = moment(new Date()).tz("Australia/Sydney")
        const options = {sort: {startDate: 1},};
        const sessions = client.db(targetDB).collection("pollingsession");
        let findingQuery = {endDate: {$gte: localTime.format('YYYY-MM-DD HH:mm:ss')}}


        cursor = sessions.find(findingQuery, options);
        if ((await sessions.countDocuments(findingQuery)) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const x of cursor) {
            htmlContent += `<tr><td>${x.session}</td><td>${x.startDate}</td><td>${x.endDate}</td><td><a href="../stocktake/viewsession.html?id=${x.session}" class="tableaction_view">View</a></td></tr>`
        }

        if (htmlContent.length > 0) {
            document.querySelector("#activeSessionTBody").innerHTML = htmlContent
        }
    } catch (err) {
        console.error(err)
    } finally {
        await client.close()
    }

    return [cursor, htmlContent];
}

window.onload = () => {
    console.log(getCurrentSession().catch(console.log));
    qrv2patch()
}

async function qrv2patch() {
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    try {
        await client.connect();
        const logsessions = client.db(targetDB).collection("pollinglog");
        const productsessions = client.db(targetDB).collection("products");
        var productList = productsessions.find({})
        for await (const x of productList) {
            var whereCondition = {productCode: x.labelname}
            var updateInfo = {
                $set: {productCode: x.itemcode, productName: x.labelname}
            }
            var updateResult = await logsessions.updateMany(whereCondition, updateInfo)
        }

        var logLists = logsessions.find({})
        for await (const x of logLists) {
            if (String(x.productCode).includes("TP") || String(x.productCode).includes("SP") || String(x.productCode) === "IG001") {
                if (x.quantityUnit === "" && x.quantity < 50) {
                    logsessions.updateOne({_id: x._id}, {$set: {quantityUnit: "carton"}})
                } else if (x.quantityUnit === "" && x.quantity >= 50) {
                    logsessions.updateOne({_id: x._id}, {$set: {quantityUnit: "bottles"}})
                }
            }
        }
    } catch (e) {
        console.error("Error when executing qrv2patch(deprecated): ",e)
    } finally {
        await client.close()
    }
}

document.querySelector("#formSelectAction").addEventListener("change", function (e) {
    if (this.value === 'consume') {
        document.querySelector("#inputNewLocation").value = ""
        document.querySelector("#inputNewLocation").setAttribute("disabled", "")
    } else if (this.value === 'move') {
        document.querySelector("#inputNewLocation").value = ""
        document.querySelector("#inputNewLocation").removeAttribute("disabled")
    }
})

document.querySelector("#inputShelfLocation").addEventListener("input", async function (e) {
    document.querySelector("#addMovementForm .modal-footer .btn-primary").disabled = true
    document.querySelector("#inputProductLabel").value=""
    document.querySelectorAll("#modalFetchedInput input").forEach(eachInput=>{
        eachInput.value = ""
    })
    if (this.value.length >= 3) {
        // 当用户输入库位信息后,转换为大写,然后开始搜索是否有符合的信息,如果没有则无反应
        const regex = /[A-Za-z]{2}[0-9]/
        if (regex.test(String(this.value))) {
            let resultOne = await inputSearchShelf(String(this.value).toUpperCase());
            if (resultOne !== null) {
                document.querySelector("#addMovementForm .modal-footer .btn-primary").disabled = false
                document.querySelector("#inputProductLabel").value = (resultOne.productLabel ? resultOne.productLabel : "")
                document.querySelector("#inputProductName").value = (resultOne.productName ? resultOne.productName : "")
                document.querySelector("#inputQuantity").value = `${(resultOne.quantity ? resultOne.quantity : "")} ${(resultOne.quantityUnit ? resultOne.quantityUnit : "")}`
                document.querySelector("#inputBestBefore").value = (resultOne.bestbefore ? resultOne.bestbefore : "")
            }
        }
    }
});
document.querySelector("#inputProductLabel").addEventListener("input", async function (e) {
    document.querySelector("#addMovementForm .modal-footer .btn-primary").disabled = true
    document.querySelector("#inputShelfLocation").value = ""
    document.querySelectorAll("#modalFetchedInput input").forEach(eachInput=>{
        eachInput.value = ""
    })
    if (this.value.length > 8) {
        // 当用户输入产品标签信息后,转换为大写,然后开始搜索是否有符合的信息,如果没有则无反应，标签需要至少输入9位，信息会动态更新
        const regex = /[A-Za-z]{2}[0-9]/
        if (regex.test(String(this.value))) {
            let resultOne = await inputSearchLabel(String(this.value).toLowerCase());
            if (resultOne !== null) {
                document.querySelector("#addMovementForm .modal-footer .btn-primary").disabled = false
                document.querySelector("#inputShelfLocation").value = (resultOne.shelfLocation ? resultOne.shelfLocation : "")
                document.querySelector("#inputProductName").value = (resultOne.productName ? resultOne.productName : "")
                document.querySelector("#inputQuantity").value = `${(resultOne.quantity ? resultOne.quantity : "")} ${(resultOne.quantityUnit ? resultOne.quantityUnit : "")}`
                document.querySelector("#inputBestBefore").value = (resultOne.bestbefore ? resultOne.bestbefore : "")
            }
        }
    }
});

document.querySelector("#addMovementForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    var result = {acknowledged: false}
    try {
        await client.connect();
        var formAction = document.querySelector("#formSelectAction").value

        var regexLabel = /[0-9]{8}[A-Fa-f0-9]{7}/
        if (regexLabel.test(document.querySelector("#inputProductLabel").value)) {
            //用户提交表单,修改loggingTime,如果是move则更新shelfLocation,如果是consumed则修改consumed为1
            var productInfo = {productLabel: document.querySelector("#inputProductLabel").value}
            const session = client.db(targetDB).collection("pollinglog");
            if (formAction === "consume") {
                result = await session.updateMany(productInfo, {
                    consumed: 1,
                    loggingTime: moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')
                }, {upsert: false})
            }
            if (formAction === "move") {
                var newLocation = document.querySelector("#inputNewLocation").value
                const regex = /[A-Za-z]{2}[0-9]/
                if (regex.test(String(newLocation))) {
                    result = await session.updateMany(productInfo, {
                        shelfLocation: newLocation,
                        loggingTime: moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')
                    }, {upsert: false})
                }
            }
        }
    }  catch (e) {
        console.error("Error when execute AddMovementForm: ",e)
    } finally {
        await client.close()
    }
    console.log(result)
})

async function inputSearchLabel(labelid) {
    // 通过label搜索在库物品，需要确认：物品未被使用，使用findOne，按照loggingTime -1排序
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    let result = {}
    try {
        await client.connect();
        const logsessions = client.db(targetDB).collection("pollinglog");
        const query = {productLabel: labelid, consumed: 0}
        const options = {
            sort: {loggingTime: -1},
            projection: {
                _id: 1,
                productCode: 1,
                quantity: 1,
                quantityUnit: 1,
                shelfLocation: 1,
                productName: 1,
                productLabel: 1,
                bestbefore: 1
            }
        }
        let productInfo = await logsessions.findOne(query, options)
        console.log(productInfo)
        result = productInfo
    } catch (err) {
        console.error("Error when execuet InputSearchLabel: ",err)
    } finally {
        await client.close()
    }

    return result
}

async function inputSearchShelf(shelfString) {
    // 通过库位在库物品，需要确认：物品未被使用，使用loggingTime -1，只取一个findOne
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    let result = {}
    try {
        await client.connect();
        const logsessions = client.db(targetDB).collection("pollinglog");
        const query = {shelfLocation: shelfString, consumed: 0}
        const options = {
            sort: {loggingTime: -1},
            projection: {
                _id: 0,
                productCode: 1,
                quantity: 1,
                quantityUnit: 1,
                shelfLocation: 1,
                productName: 1,
                productLabel: 1,
                bestbefore: 1
            }
        }
        let productInfo = await logsessions.findOne(query, options)
        console.log(productInfo)
        result = productInfo
    } catch (e) {
        console.error("Error when executing inputSearchShelf: ", e)
    } finally {
        await client.close()
    }

    return result
}
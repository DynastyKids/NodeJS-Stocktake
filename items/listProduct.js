// 使用pollingsession的结果，distinct掉相同的labelid，然后删除所有在listproduct中标注
// 了已经使用的产品，再加入到productlist中展示出来，，页面每30s刷新一次
const {ipcRenderer} = require("electron");
// const {BrowserWindow} = require("electron").remote;

const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const ObjectID = require("mongodb").ObjectId

const fs = require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));

var $ = require("jquery");
const DataTable = require('datatables.net-responsive-bs5')(window, $);

let table;
let dataset = [];
const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

window.onload = async () => {
    table = new DataTable('#productTable', {
        responsive: true,
        pageLength: 15,
        lengthMenu: [10, 15, 25, 50, 75, 100],
        columns: [null, {"width": "45%"}, null, null, null, null],
        order: [0, 'asc'],
        data: await fetchTablesData()
    });
}

// 删除条目弹窗
document.querySelector("#deleteRowModal").addEventListener('show.bs.modal', (ev) => {
    let itemId = ev.relatedTarget.getAttribute("data-bs-itemid");
    let itemStatus = ev.relatedTarget.getAttribute("data-bs-state");
    let result;
    console.log("Delete Model: Delete Clicked", itemId, itemStatus)

    if (itemStatus === "true"){
        document.querySelector("#deleteRowModal .modal-title span").textContent = `delete?`
        document.querySelector("#deleteRowModal .modal-body span").textContent = `delete ${ev.relatedTarget.getAttribute("data-bs-productname")}?`
        document.querySelector("#deleteModalConfirmBtn").className = 'btn btn-danger'
        document.querySelector("#deleteModalConfirmBtn").textContent = "Disable"
        document.querySelector("#deleteModalConfirmBtn").disabled = false
    } else {
        document.querySelector("#deleteRowModal .modal-title span").textContent = `Add Back?`
        document.querySelector("#deleteRowModal .modal-body span").textContent = `add back ${ev.relatedTarget.getAttribute("data-bs-productname")}?`
        document.querySelector("#deleteModalConfirmBtn").className = 'btn btn-info'
        document.querySelector("#deleteModalConfirmBtn").textContent = "Enable"
        document.querySelector("#deleteModalConfirmBtn").disabled = false
    }

    document.querySelector("#deleteModalConfirmBtn").addEventListener("click", async (ev) => {
        document.querySelector("#deleteModalConfirmBtn").disabled = true
        document.querySelector("#deleteModalConfirmBtn").textContent = "Updating"
        result = (itemStatus === "true" ? await updateRecordById(itemId, {"inuse": false}) : await updateRecordById(itemId, {"inuse": true}))
        console.log("Delete Model result", result)
        if (result.acknowledged) {
            location.reload()
        } else {
            document.querySelector("#deleteRowModal .modal-body p").innerText = "Error happened while on updates."
        }
        bootstrap.Modal.getInstance(document.querySelector("#deleteRowModal")).hide()
    });
})

//修改弹窗，和原有的页面跳转暂时保持平行
document.querySelector("#editRowModal").addEventListener('show.bs.modal', async (ev) => {
    let itemId = ev.relatedTarget.getAttribute("data-bs-itemid")
    // 2023-10-11新增加Edit为Modal弹窗，通过弹窗直接修改对应参数，Add部分保持不变，旧的Edit/add通用页面继续保留

    //初始化设置，默认设置submit btn为不可用，清空所有input
    document.querySelector("#modelEditSubmitBtn").disabled = true;
    document.querySelector("#modelEditSubmitBtn").textContent = "Fetching...";
    document.querySelectorAll("#editRowModal .modal-body input").forEach(item=>{
        item.disabled = true
        item.value=""
    })
    document.querySelector("#editRowModalLabel").textContent = "Loading Data ..."
    document.querySelector("#expiredateCheck").checked = false

    try {
        let result = await findOneRecordById(itemId)
    //     回填数据到输入框，对输入框解除disabled
        if (result){
            document.querySelector("#editRowModalLabel").textContent = `Edit Product Infos ${result.productCode ? " for "+ result.productCode + (result.labelname ? " - " + result.labelname : "") : ""}`
            document.querySelector("#editRowModalinput_productCode").value = (result.productCode ? result.productCode : "")
            document.querySelector("#editRowModalinput_labelName").value = (result.labelname ? result.labelname : "")
            document.querySelector("#editRowModalinput_description").value = (result.description ? result.description : "")

            document.querySelector("#editRowModalinput_cartonQty").value = (result.cartonQty ? result.cartonQty : "")
            document.querySelector("#editRowModalinput_palletQty").value = (result.palletQty ? result.palletQty : "")
            document.querySelector("#editRowModalinput_unit").value = (result.unit ? result.unit : "")

            document.querySelector("#editRowModalinput_weight").value = (result.productCode ? result.productCode : "")
            document.querySelector("#editRowModalinput_length").value = (result.sizeLength ? result.sizeLength : "")
            document.querySelector("#editRowModalinput_width").value = (result.sizeWidth ? result.sizeWidth : "")
            document.querySelector("#editRowModalinput_height").value = (result.sizeHeight ? result.sizeHeight : "")

            document.querySelector("#editRowModalinput_vendorCode").value = (result.vendorCode ? result.vendorCode : "")
            if (result.withBestbefore && result.withBestbefore == 1){
                document.querySelector("#expiredateCheck").checked = true
            } else {
                document.querySelector("#expiredateCheck").checked = false
            }
        }

        document.querySelectorAll("#editRowModal .modal-body input").forEach(item=>{
            item.disabled = false
        })
        document.querySelector("#modelEditSubmitBtn").disabled = false
        document.querySelector("#modelEditSubmitBtn").textContent = "Submit";
    } catch (e) {
        console.error("Error on editRowModal:", e)
    }

    //当用户编辑完成后，开始提交
    document.querySelector("#modelEditSubmitBtn").addEventListener("click",async (ev) => {
        document.querySelector("#modelEditSubmitBtn").disabled = true
        document.querySelector("#modelEditSubmitBtn").textContent = "Updating";

        let result = {}
        result.productCode = document.querySelector("#editRowModalinput_productCode").value
        result.labelname = document.querySelector("#editRowModalinput_labelName").value
        result.description = document.querySelector("#editRowModalinput_description").value

        result.cartonQty = document.querySelector("#editRowModalinput_cartonQty").value
        result.palletQty = document.querySelector("#editRowModalinput_palletQty").value
        result.unit = document.querySelector("#editRowModalinput_unit").value

        result.weight = document.querySelector("#editRowModalinput_weight").value
        result.sizeLength = document.querySelector("#editRowModalinput_length").value
        result.sizeWidth = document.querySelector("#editRowModalinput_width").value
        result.sizeHeight = document.querySelector("#editRowModalinput_height").value

        result.vendorCode = document.querySelector("#editRowModalinput_vendorCode").value

        let updateResult = await updateRecordById(itemId, result)
        //     当最后确认提交成功则dismiss并回弹成功信息
        if (updateResult.acknowledged) {
            bootstrap.Modal.getInstance( document.querySelector("#editRowModal")).hide()
            if (table) {
                let results = await fetchTablesData();
                table.clear().draw()
                table.rows.add(results).draw()
            }
        } else {
            document.querySelector("#deleteRowModal .modal-body p").innerText = "Error happened while on updates."
        }
    })
})

async function updateRecordById(recordId, updateData) {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let sessions = client.db(credentials.mongodb_db).collection("products");
    let results;
    console.log("Running updateRecordById:", recordId, updateData)
    try {
        await client.connect();
        results = await sessions.updateOne({'_id': (new ObjectID(recordId))}, {$set: updateData});
        console.log("Running updateRecordById:", results)
    } catch (e) {
        console.error("Fetching error:", e)
    } finally {
        await client.close();
    }
    return results
}

async function findOneRecordById(recordId){
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let sessions = client.db(credentials.mongodb_db).collection("products");
    let results;
    try {
        await client.connect();
        results = await sessions.findOne({'_id': (new ObjectID(recordId))});
    } catch (e) {
        console.error("Fetching error:", e)
    } finally {
        await client.close();
    }
    return results
}

i18next.use(Backend).init({
    lng: 'en', backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar();
    i18n_bodyContents();
});
document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar();
        i18n_bodyContents();
    });
});

document.querySelector("#areloadTable").addEventListener("click", async (ev) => {
    // 仅重新加载表格
    if (table) {
        table.clear().draw()
        let results = await fetchTablesData();
        table.rows.add(results).draw()
    }
})

async function fetchTablesData(){
    let results = await getProducts();
    dataset = []
    results.forEach(eachItem =>{
        dataset.push([
            eachItem.productCode,
            eachItem.labelname,
            `${(eachItem.cartonQty ? eachItem.cartonQty + (eachItem.unit ? " " + eachItem.unit : "") : " - ")}`,
            `${(eachItem.palletQty ? eachItem.palletQty + (eachItem.unit ? " " + eachItem.unit : "") : " - ")}` +
            `${((eachItem.cartonQty && eachItem.palletQty) ? "<br><small>" + eachItem.palletQty / eachItem.cartonQty + " ctns</small>" : "")}`,
            `${(eachItem.withBestbefore > 0 ? "√" : "")}`,
            // <a href="addProduct.html?mode=edit&id=${eachItem._id.toHexString()}">Edit</a> +
            `
                <a href="#" data-bs-toggle="modal" data-bs-target="#editRowModal" data-bs-itemid="${eachItem._id.toHexString()}">Edit</a>
                <a href="#" data-bs-toggle="modal" data-bs-target="#deleteRowModal" data-bs-productname="${eachItem.labelname}" data-bs-itemid="${eachItem._id.toHexString()}" data-bs-state="${eachItem.inuse}">${(eachItem.inuse ? "Remove" : "Add Back")}</a>
            `
        ]);
    })
    return dataset;
}

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
    document.title = `${i18next.t('listproducts.pagetitle')} - Warehouse Electron`
    // Body section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item")
    breadcrumbs[0].querySelector('a').textContent = i18next.t('index.pagetitle');
    breadcrumbs[1].textContent = i18next.t('listproducts.pagetitle');

    document.querySelector('.container-fluid h1').textContent = i18next.t("listproducts.pagetitle");
    document.querySelector('.container-fluid h4').textContent = i18next.t("listproducts.h4title_action");
    document.querySelector('.container-fluid ul li a').textContent = i18next.t("listproducts.a_checkstockitems")

    //Table Head & foot
    var tableHeads = document.querySelectorAll("#productTable thead th")
    var tableFoots = document.querySelectorAll("#productTable tfoot th")
    for (let i = 0; i < tableHeads.length; i++) {
        tableHeads[i].textContent = i18next.t(`listproducts.table_head.${i}`);
    }
    for (let i = 0; i < tableFoots.length; i++) {
        tableFoots[i].textContent = i18next.t(`listproducts.table_head.${i}`);
    }
}

async function getProducts(conditionObject) {
    console.log("Running getProducts, param:", conditionObject)
    let results = []
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let sessions = client.db(credentials.mongodb_db).collection("products");
    let options = {sort: {productCode: 1}};
    try {
        await client.connect();
        if (conditionObject) {
            results = await sessions.find(conditionObject, options).toArray();
        } else {
            results = await sessions.find({}, options).toArray();
        }
    } catch (e) {
        console.error("Fetching error:", e)
    } finally {
        await client.close();
    }
    console.log("Running getProducts, results:", results)
    return results
}
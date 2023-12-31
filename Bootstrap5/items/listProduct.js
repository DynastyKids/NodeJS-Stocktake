// 使用pollingsession的结果，distinct掉相同的labelid，然后删除所有在listproduct中标注
// 了已经使用的产品，再加入到productlist中展示出来，，页面每30s刷新一次
// const {BrowserWindow} = require("electron").remote;

const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const ObjectID = require("mongodb").ObjectId

var $ = require("jquery");
const DataTable = require('datatables.net-responsive-bs5')(window, $);

let table;
let dataset = [];

const Storage = require("electron-store");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const path = require('path');
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
    // console.log("Delete Model: Delete Clicked", itemId, itemStatus)

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
        result = (itemStatus === "true" ? await updateRecordById(itemId, {"active": false}) : await updateRecordById(itemId, {"active": true}))
        // console.log("Delete Model result", result)
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
    let sessions = client.db(targetDB).collection("products");
    let results;
    // console.log("Running updateRecordById:", recordId, updateData)
    try {
        await client.connect();
        results = await sessions.updateOne({'_id': (new ObjectID(recordId))}, {$set: updateData});
        // console.log("Running updateRecordById:", results)
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
    let sessions = client.db(targetDB).collection("products");
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
    lng: (newStorage.get('language') ? newStorage.get('language') : 'en'), backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar();
    i18n_bodyContents();
});
document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_bodyContents();
        i18n_navbar();
        newStorage.set(e.target.value)
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
function i18n_navbar() { // Navbar Section
    for (let i = 0; i < document.querySelectorAll(".nav-topitem").length; i++) {
        document.querySelectorAll(".nav-topitem")[i].innerHTML = i18next.t(`navbar.navitems.${i}`)
    }
    for (let i = 0; i < document.querySelectorAll("#sessionDropdownList a").length; i++) {
        document.querySelectorAll("#sessionDropdownList a")[i].innerHTML = i18next.t(`navbar.sessions_navitems.${i}`)
    }
    for (let i = 0; i < document.querySelectorAll("#productDropdownList a").length; i++) {
        document.querySelectorAll("#productDropdownList a")[i].innerHTML = i18next.t(`navbar.products_navitems.${i}`)
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
    document.querySelector("#loadingTableText").textContent = i18next.t('general.loadingTableText')

    let pageactions = document.querySelectorAll('.container-fluid .container-fluid ul li')
    for (let i = 0; i < pageactions.length; i++) {
        pageactions[i].querySelector("a").textContent = i18next.t(`listproducts.a_checkstockitems.${i}`)
    }

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
            `
                <a href="#" data-bs-toggle="modal" data-bs-target="#editRowModal" data-bs-itemid="${eachItem._id.toHexString()}">${i18next.t("dataTables.action_edit")}</a>
                <a href="#" data-bs-toggle="modal" data-bs-target="#deleteRowModal" data-bs-productname="${eachItem.labelname}" data-bs-itemid="${eachItem._id.toHexString()}" data-bs-state="${eachItem.active}">${(eachItem.active ? i18next.t("dataTables.action_remove") : i18next.t("dataTables.action_addback"))}</a>
            `
        ]);
    })
    return dataset;
}

async function getProducts(conditionObject) {
    document.querySelector("#loadingStatus").style.removeProperty("display")
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
    let sessions = client.db(targetDB).collection("products");
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
        document.querySelector("#loadingStatus").style.display = "none"
    }
    return results
}
// 使用pollingsession的结果，distinct掉相同的labelid，然后删除所有在listproduct中标注
// 了已经使用的产品，再加入到productlist中展示出来，，页面每30s刷新一次
const { ipcRenderer } = require("electron");
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');

const fs=require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));

var $ = require("jquery");
const DataTable = require('datatables.net-bs')(window, $);
require('datatables.net-responsive-bs');
let table;
let dataset = [];
const uriCompents = [credentials.mongodb_protocol,"://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))
const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

window.onload = async () => {
    let results = await getAllProducts();
    results.forEach(eachItem=>{
        dataset.push([
            eachItem.itemcode,
            eachItem.description.replace(eachItem.itemcode+" - ","").replace(eachItem.itemcode+"- ",""),
            `${(eachItem.cartonQty ? eachItem.cartonQty + (eachItem.unit ? " "+eachItem.unit:""): " - ")}`,
            `${(eachItem.palletQty ? eachItem.palletQty + (eachItem.unit ? " "+eachItem.unit:""): " - ")}`+
            `${((eachItem.cartonQty && eachItem.palletQty) ? "<br><small>"+eachItem.palletQty/eachItem.cartonQty+" ctns</small>" : "")}`,
            `${(eachItem.withBestbefore>0 ? "√": "")}`,
            `<a href="addProduct.html?mode=edit&id=${eachItem._id.toHexString()}">Edit</a>`
        ]);
    })

    table = new DataTable('#productTable', {
        responsive: true,
        pageLength: 15,
        lengthMenu:[10,15,25,50,75,100],
        columns: [null,{ "width": "45%" }, null, null, null, null],
        order: [0, 'asc'],
        data: dataset
    });
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
    await reloadTable()
})
async function reloadTable(){
    if (table){
        table.clear().draw()
        let results = await getAllProducts();
        dataset=[]
        results.forEach(eachItem=>{
            dataset.push([
                eachItem.itemcode,
                eachItem.description.replace(eachItem.itemcode+" - ","").replace(eachItem.itemcode+"- ",""),
                `${(eachItem.cartonQty ? eachItem.cartonQty + (eachItem.unit ? " "+eachItem.unit:""): " - ")}`,
                `${(eachItem.palletQty ? eachItem.palletQty + (eachItem.unit ? " "+eachItem.unit:""): " - ")}`+
                `${((eachItem.cartonQty && eachItem.palletQty) ? "<br><small>"+eachItem.palletQty/eachItem.cartonQty+" ctns</small>" : "")}`,
                `${(eachItem.withBestbefore>0 ? "√": "")}`,
                `<a href="addProduct.html?mode=edit&id=${eachItem._id.toHexString()}">Edit</a>`
            ]);
        })
        table.rows.add(dataset).draw()
    }
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

    document.querySelector('.container h1').textContent = i18next.t("listproducts.pagetitle");
    document.querySelector('.container h4').textContent = i18next.t("listproducts.h4title_action");
    document.querySelector('.container ul li a').textContent = i18next.t("listproducts.a_checkstockitems")

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

async function getAllProducts(){
    let results = []
    const sessions = client.db(credentials.mongodb_db).collection("products");
    const options = {sort: { itemcode: 1}};
    try {
        await client.connect();
        results = await sessions.find({}, options).toArray();
    } catch (e) {
        console.error("Fetching error:" ,e)
    } finally {
        await client.close();
        return results
    }
}
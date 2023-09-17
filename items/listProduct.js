// 使用pollingsession的结果，distinct掉相同的labelid，然后删除所有在listproduct中标注
// 了已经使用的产品，再加入到productlist中展示出来，，页面每30s刷新一次
const { ipcRenderer } = require("electron");
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const fs=require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')
const $ = require("jquery");
var DataTable = require('datatables.net')(window, $);
require('datatables.net-responsive');

const uriCompents = [credentials.mongodb_protocol,"://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))
const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
i18next.use(Backend).init({
    lng: 'en', backend: {loadPath: 'i18nLocales/{{lng}}/translations.json'}
}).then(() => {
    updateTexts();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {updateTexts();});
});
function updateTexts() {
    document.title = `${i18next.t('listproducts.pagetitle')} - Warehouse Electron`
    // Navbar Section
    document.querySelector("#navHome").textContent=i18next.t('index.pagetitle');
    document.querySelector("#sessionDropdown").textContent=i18next.t('navbar.sessions');
    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    sessionDropdownLinks[0].textContent=i18next.t('navbar.newsession');
    sessionDropdownLinks[1].textContent=i18next.t('navbar.allsession');

    document.querySelector("#productDropdown").textContent=i18next.t('navbar.products');
    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    productDropdownLinks[0].textContent=i18next.t('navbar.showallproducts');
    productDropdownLinks[1].textContent=i18next.t('navbar.addproduct');
    productDropdownLinks[2].textContent=i18next.t('navbar.showstocksoverview');
    productDropdownLinks[3].textContent=i18next.t('navbar.showmovementlog');
    productDropdownLinks[4].textContent=i18next.t('navbar.addmovementlog');

    document.querySelector("#navSettings").textContent=i18next.t('navbar.settings');
    document.querySelector("#LanguageDropdown").textContent=i18next.t('navbar.language');

    // Body section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item")
    breadcrumbs[0].querySelector('a').textContent = i18next.t('index.pagetitle');
    breadcrumbs[1].textContent = i18next.t('listproducts.pagetitle');

    document.querySelector('.container h1').textContent = i18next.t("listproducts.pagetitle");
    document.querySelector('.container h4').textContent = i18next.t("listproducts.h4title_action");
    document.querySelector('.container ul li a').textContent = i18next.t("listproducts.a_checkstockitems")

    //datatables
    var tableentry_label =  document.querySelector("#productTable_length label").innerHTML.split(" ")
    tableentry_label[0] = i18next.t('listproducts.table_entries.0')
    tableentry_label[tableentry_label.length -1] = i18next.t('listproducts.table_entries.1')
    document.querySelector("#productTable_length label").innerHTML = tableentry_label.toString().replaceAll(","," ")

    var tablefilter_label = document.querySelector("#productTable_filter label").innerHTML.split(":")
    tablefilter_label[0] = i18next.t('listproducts.table_searchlabel')
    document.querySelector("#productTable_filter label").innerHTML = tablefilter_label.toString().replaceAll(",",": ")

    //Table Head & foot
    var tableHeads = document.querySelectorAll("#productTable thead th")
    var tableFoots = document.querySelectorAll("#productTable tfoot th")

    for (let i = 0; i < tableHeads.length; i++) {
        tableHeads[i].textContent = i18next.t(`listproducts.table_titles.${i}`);
        tableFoots[i].textContent = i18next.t(`listproducts.table_titles.${i}`);
    }
}

let table = new DataTable('#productTable', {
    responsive: true,
    pageLength: 15,
    lengthMenu:[10,15,25,50,75,100],
    columns: [null,{ "width": "40%" }, null, null, null, null],
    order: [[1, 'asc']]
});
async function getAllProducts(){
    table.clear().draw()
    const options = {sort: { itemcode: 1},};
    const sessions = client.db(credentials.mongodb_db).collection("products");
    let cursor;
    let htmlContent=""
    try {
        await client.connect();
        cursor = sessions.find({}, options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const  x of cursor) {
            console.log(x)
            table.row.add([x.itemcode, x.description.replace(x.itemcode+" - ",""),
                `${x.unitsInbox ? x.unitsInbox +" "+x.productUnit: " - "}`,
                `${x.palletqty ?  x.palletqty+" " + x.productUnit: " - "}<br><small>${x.unitsInbox ? "("+x.palletqty / x.unitsInbox +" ctns)": " - "}</small>`,
                `${(x.withBestbefore>0 ? "√": "")}`,`<a href="editProduct.html?id=${x.itemcode}">Edit</a>`
            ]).draw(false);

        }
    } finally {
        client.close();
    }
    return htmlContent;
}

window.onload = () => {
    getAllProducts()
}
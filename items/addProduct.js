const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const path = require('path');
const fs = require('fs');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')

const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
});

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
i18next.use(Backend).init({
    lng: 'en', backend: {loadPath: 'i18nLocales/{{lng}}/translations.json'}
}).then(() => {
    updateTexts();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        updateTexts();
    });
});

function updateTexts() {
    document.title = `${i18next.t('addproducts.pagetitle')} - Warehouse Electron`
    // Navbar Section
    document.querySelector("#navHome").textContent = i18next.t('index.pagetitle');
    document.querySelector("#sessionDropdown").textContent = i18next.t('navbar.sessions');
    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    sessionDropdownLinks[0].textContent = i18next.t('navbar.newsession');
    sessionDropdownLinks[1].textContent = i18next.t('navbar.allsession');

    document.querySelector("#productDropdown").textContent = i18next.t('navbar.products');
    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    productDropdownLinks[0].textContent = i18next.t('navbar.showallproducts');
    productDropdownLinks[1].textContent = i18next.t('navbar.addproduct');
    productDropdownLinks[2].textContent = i18next.t('navbar.showstocksoverview');
    productDropdownLinks[3].textContent = i18next.t('navbar.showmovementlog');
    productDropdownLinks[4].textContent = i18next.t('navbar.addmovementlog');

    document.querySelector("#navSettings").textContent = i18next.t('navbar.settings');
    document.querySelector("#LanguageDropdown").textContent = i18next.t('navbar.language');

    // Body section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item")
    breadcrumbs[0].querySelector('a').textContent = i18next.t('index.pagetitle');
    breadcrumbs[1].querySelector('a').textContent = i18next.t('listproducts.pagetitle');
    breadcrumbs[2].textContent = i18next.t('addproducts.pagetitle');

    var inputlabels = document.querySelectorAll("#newProductForm label")
    var inputs = document.querySelectorAll("#newProductForm input")
    for (let i = 0; i < inputlabels.length; i++) {
        inputlabels[i].textContent = i18next.t(`addproducts.inputlabel.${i}`)
    }
    for (let i = 0; i < inputs.length; i++) {
        inputs[i].placeholder = i18next.t(`addproducts.inputplaceholder.${i}`)
    }

    for (let i = 0; i < document.querySelectorAll("#inputUnit option").length - 1; i++) {
        document.querySelectorAll("#inputUnit option")[i + 1].value = i18next.t(`addproducts.unitSelections.${i}.0`)
        document.querySelectorAll("#inputUnit option")[i + 1].textContent = i18next.t(`addproducts.unitSelections.${i}.1`)
    }

    document.querySelectorAll("#inputExpire option")[0].value = i18next.t(`addproducts.expireSelection.0.0`)
    document.querySelectorAll("#inputExpire option")[1].value = i18next.t(`addproducts.expireSelection.1.0`)
    document.querySelectorAll("#inputExpire option")[0].textContent = i18next.t(`addproducts.expireSelection.0.1`)
    document.querySelectorAll("#inputExpire option")[1].textContent = i18next.t(`addproducts.expireSelection.1.1`)
}

window.onload = () => {
    // initialize the date pickers
    document.getElementById('newProductForm').addEventListener('submit', (e) => {
        e.preventDefault();

        let data = {
            description: document.querySelector("#inputDescription").value,
            itemcode: document.querySelector("#inputCode").value,
            labelname: document.querySelector("#inputLabelName").value,
            palletqty: document.querySelector("#inputQuantity").value,
            productUnit: document.querySelector("#inputUnit").value,
            vendorCode: document.querySelector("#inputVendorCode").value,
            weight: document.querySelector("#inputWeight").value,
            withBestbefore: document.querySelector("#inputBestbefore").value,
            loggingTime: moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:MM:ss')
        }
        console.log("Run Submit Form", data)

        insertOneData(data).then((result) => {
            alert("Data Insert Successfully")
            console.log("[MongoDB] InsertOne:" + result)
        }).finally(() => {
            window.location.replace("../index.html");
        })
    });
}

async function insertOneData(data) {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db(credentials.mongodb_db).collection("products")
            .insertOne(data, (err, res) => {
                if (err) {
                    console.error('Failed to insert document', err);
                    return;
                }
                return res
            });
    } finally {
        client.close();
    }
}
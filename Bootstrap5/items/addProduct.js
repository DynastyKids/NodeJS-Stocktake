const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId} = require('mongodb');
const path = require('path');

const Storage = require("electron-store");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

i18next.use(Backend).init({
    lng: (newStorage.get('language') ? newStorage.get('language') : 'en'), backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar();
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar();
        i18n_bodyContents();
        newStorage.set("language",e.target.value)
    });
});
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
    document.title = `${i18next.t('addproducts.pagetitle')} - Warehouse Electron`
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

document.addEventListener("DOMContentLoaded",async (ev) => {
    let urlParams = new URLSearchParams(window.location.search)
    try {
        if (urlParams.get("mode") === "edit" && urlParams.get("id")) {
            let result = await retrieveOneData(urlParams.get("id"))
            if (result.length > 0){
                result = result[0]
                document.querySelector("#inputDescription").value = (result.description ? result.description : "");
                document.querySelector("#inputCode").value = (result.productCode ? result.productCode :"");
                document.querySelector("#inputLabelName").value = (result.labelname ? result.labelname : "");
                document.querySelector("#inputQtyPallet").value = (result.palletQty ? result.palletQty : "");
                document.querySelector("#inputQtyCarton").value = (result.cartonQty ? result.cartonQty : "");
                document.querySelector("#inputUnit").value = (result.unit ? result.unit : "");
                document.querySelector("#inputLength").value = (result.sizeLength ? result.sizeLength : 0);
                document.querySelector("#inputWidth").value = (result.sizeWidth ? result.sizeWidth : 0);
                document.querySelector("#inputHeight").value = (result.sizeHeight ? result.sizeHeight : 0);
                document.querySelector("#inputVendorCode").value = (result.vendorCode ? result.vendorCode : "");
                document.querySelector("#inputWeight").value = (result.weight ? result.weight : 0);
                document.querySelector("#inputExpire").selectedIndex = (result.withBestbefore ? result.withBestbefore : 0);
            }
        }
    } catch (e) {
        console.error("Failed to load edit page.",e)
    }


    document.getElementById('newProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        let data = {
            description: (document.querySelector("#inputDescription").value ? document.querySelector("#inputDescription").value : ""),
            itemcode: (document.querySelector("#inputCode").value ? document.querySelector("#inputCode").value : ""),
            labelname: (document.querySelector("#inputLabelName").value ? document.querySelector("#inputLabelName").value : ""),
            palletQty: (document.querySelector("#inputQtyPallet").value ? document.querySelector("#inputQtyCarton").value : null),
            cartonQty: (document.querySelector("#inputQtyCarton").value ? document.querySelector("#inputQtyCarton").value : null),
            unit: (document.querySelector("#inputUnit").value),
            vendorCode: (document.querySelector("#inputVendorCode").value ? document.querySelector("#inputVendorCode").value : ""),
            weight: document.querySelector("#inputWeight").value ? document.querySelector("#inputWeight").value : 0,
            sizeLength: document.querySelector("#sizeLength").value ? document.querySelector("#sizeLength").value : 0,
            sizeWidth: document.querySelector("#sizeWidth").value ? document.querySelector("#sizeWidth").value : 0,
            sizeHeight: document.querySelector("#sizeHeight").value ? document.querySelector("#sizeHeight").value : 0,
            withBestbefore: document.querySelector("#inputExpire").value ? document.querySelector("#inputExpire").value : 0,
            lastupdate: new Date(),
            inuse: 1
        }
        let filterCondition = {itemcode: data.itemcode}
        if (data.vendorCode){
            filterCondition.vendorCode = data.vendorCode
        }
        if (urlParams.get("mode") === "edit") {
            await updateOneData(filterCondition, data, false).then(response =>{
                console.log(response,data)
                if (response.acknowledged){
                    alert(`${response.modifiedCount} records for item ${data.itemcode} has been updated successfully`)
                }
            })
        } else {
            await updateOneData(filterCondition, data, true). then(response =>{
                console.log(response,data)
                if (response.acknowledged){
                    alert(`${data.itemcode} has found ${response.matchedCount} records,  ${response.upsertedCount} record has been inserted, ${response.modifiedCount} record has been updated`)
                }
            })
        }
        // window.location.replace("../index.html");
    });
})

async function updateOneData(filter,data, upsertOption){
    let results;
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        let updateObject = {$set:data}
        let session = await client.db(targetDB).collection("products")
        results = await session.updateOne(filter, updateObject,{upsert: upsertOption});
    } catch (e) {
        console.error("Data upsert:",e)
    }finally {
        await client.close();
    }
    return results
}

async function retrieveOneData(id){
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let options = {$sort: {itemcode: 1}, projection: {"_id" : 0}}
    let result = []
    let query = {_id:new ObjectId(id)}
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        result = await client.db(targetDB).collection("products").find(query, options).toArray()
        console.log(result)
    } catch (e) {
        console.error("MongoDB find error:", e)
    } finally {
        await client.close();
    }
    return result
}
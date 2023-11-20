const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId} = require('mongodb');
const path = require('path');
const Moment = require('moment-timezone');

const Storage = require("electron-store");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

document.querySelector("#act_reset").addEventListener("click",(ev)=>{
    document.querySelectorAll("#div_datatable input").forEach(eachinput=>{
        eachinput.value= ""
        if (eachinput.getAttribute("type") === "text"){
            eachinput.className = "form-control"
        }
    })
})

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


    document.querySelector('#form_product').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        document.querySelector("#form_product button").setAttribute("disabled","disabled")
        document.querySelector("#form_product button").textContent = "Processing..."
        let data = {
            description: (document.querySelector("#inpt_prodDesc").value ? document.querySelector("#inpt_prodDesc").value : ""),
            itemcode: (document.querySelector("#input_prodCode").value ? document.querySelector("#input_prodCode").value : ""),
            labelname: (document.querySelector("#inpt_prodName").value ? document.querySelector("#inpt_prodName").value : ""),
            palletQty: (document.querySelector("#inpt_prodPltQty").value ? document.querySelector("#inpt_prodPltQty").value : null),
            cartonQty: (document.querySelector("#inpt_prodCtnQty").value ? document.querySelector("#inpt_prodCtnQty").value : null),
            unit: (document.querySelector("#inpt_unit").value ? document.querySelector("#inpt_unit").value : null),
            vendorCode: (document.querySelector("#inpt_vendorcode").value ? document.querySelector("#inpt_vendorcode").value : ""),
            weight: document.querySelector("#inpt_weight").value ? document.querySelector("#inpt_weight").value : 0,
            sizeLength: document.querySelector("#inpt_length").value ? document.querySelector("#inpt_length").value : 0,
            sizeWidth: document.querySelector("#inpt_width").value ? document.querySelector("#inpt_width").value : 0,
            sizeHeight: document.querySelector("#inpt_height").value ? document.querySelector("#inpt_height").value : 0,
            withBestbefore: document.querySelector("#inpt_expire").value ? document.querySelector("#inpt_expire").value : 0,
            active: 1,
            lastupdate: Moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:MM:ss'),
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
                    document.querySelector("#div_alertblock").style.display = "block"
                    document.querySelector("#div_alertblock span").textContent = `${response.modifiedCount} records for item ${data.itemcode} has been updated successfully`
                    setTimeout(function(){
                        window.location.href = "../products/index.html"
                    },3000)
                }
            })
        } else {
            await updateOneData(filterCondition, data, true). then(response =>{
                console.log(response,data)
                if (response.acknowledged){
                    document.querySelector("#div_alertblock").style.display = "block"
                    document.querySelector("#div_alertblock span").textContent = `${data.itemcode} has found ${response.matchedCount} records,  ${response.upsertedCount} record has been inserted`
                    setTimeout(function(){
                        const bsAlert = new bootstrap.Alert(document.querySelector("#div_alertblock"));
                        bsAlert.close();
                        window.location.href = "../products/index.html"
                    },3000)
                }
            })
        }
    });
})

document.querySelector("#input_prodCode").addEventListener("input",async (ev) => {
    document.querySelector("#form_product .invalid-feedback").textContent =""
    document.querySelector("#form_product button").setAttribute("disabled","disabled")
    if (document.querySelector("#input_prodCode").value && document.querySelector("#input_prodCode").value.length >= 3) {
        let result = await checkProductCode(document.querySelector("#input_prodCode").value)
        if (!result){
            document.querySelector("#form_product #input_prodCode").className = "form-control is-valid"
            document.querySelector("#form_product button").removeAttribute("disabled")
        } else {
            document.querySelector("#form_product #input_prodCode").className = "form-control is-invalid"
            document.querySelector("#form_product button").setAttribute("disabled","disabled")
            document.querySelector("#form_product .invalid-feedback").textContent = `Product code is duplicate with existing one in database`
        }
    } else {
        document.querySelector("#form_product .invalid-feedback").textContent = `Product code must contain at lease 3 characters`
    }
})

async function checkProductCode(inputCode){
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    let returnVal = false
    try {
        await client.connect();
        let session = await client.db(targetDB).collection("products")
        let results = await session.find({productCode:inputCode}).toArray();
        console.log(results)
        if (results.length > 0){
            returnVal = true;
        }
    } catch (e) {
        console.error("Data upsert:",e)
    } finally {
        await client.close();
    }
    return returnVal;
}

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


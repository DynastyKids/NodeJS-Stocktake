const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId, Decimal128} = require('mongodb');
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
            let originalProduct = await retrieveOneData(urlParams.get("id"))
            if (originalProduct.length > 0){
                originalProduct = originalProduct[0]
                document.querySelector("#inpt_prodDesc").value = (originalProduct.description ? originalProduct.description : "");
                document.querySelector("#input_prodCode").value = (originalProduct.productCode ? originalProduct.productCode :"");
                document.querySelector("#inpt_prodName").value = (originalProduct.labelname ? originalProduct.labelname : "");
                document.querySelector("#inpt_prodPltQty").value = (originalProduct.palletQty ? originalProduct.palletQty : "");
                document.querySelector("#inpt_prodCtnQty").value = (originalProduct.cartonQty ? originalProduct.cartonQty : "");
                document.querySelector("#inpt_unit").value = (originalProduct.unit ? originalProduct.unit : "");
                document.querySelector("#inpt_length").value = (originalProduct.sizeLength ? originalProduct.sizeLength : 0);
                document.querySelector("#inpt_width").value = (originalProduct.sizeWidth ? originalProduct.sizeWidth : 0);
                document.querySelector("#inpt_height").value = (originalProduct.sizeHeight ? originalProduct.sizeHeight : 0);
                document.querySelector("#inpt_vendorcode").value = (originalProduct.vendorCode ? originalProduct.vendorCode : "");
                document.querySelector("#inpt_weight").value = (originalProduct.weight ? originalProduct.weight : 0);
                document.querySelector("#checkbox_expire").checked = (originalProduct.withBestbefore ? originalProduct.withBestbefore : 0);
                document.querySelector("#inpt_price").selectedIndex = (originalProduct.unitPrice ? originalProduct.unitPrice : "");
            }
        }
    } catch (e) {
        console.error("Failed to load edit page.",e)
    }
})

document.querySelector('#form_product').addEventListener('submit', async (ev) => {
    let urlParams = new URLSearchParams(window.location.search)
    // Submit时候可能是更新，也可能是添加，需要分配不同的处理办法
    // Add，搜索数据库内容，如果没有重复条件则按照给定表格添加产品信息
    // Edit，搜索数据库内容，如果有相同productcode
    ev.preventDefault();
    if (String(document.querySelector("#input_prodCode").value).length <= 0){
        createAlert("danger","No Product Code Provided");
    } else {
        document.querySelector("#form_product button").setAttribute("disabled", "disabled")
        document.querySelector("#form_product button").textContent = "Processing..."
        let data = {
            active: 1,
            inuse: 1,
            createTime: new Date(),
            lastupdate: new Date()
        }
        if (String(document.querySelector("#input_prodCode").value).length > 0) { data.productCode = document.querySelector("#input_prodCode").value }
        if (String(document.querySelector("#inpt_prodName").value).length > 0) { data.labelname = document.querySelector("#inpt_prodName").value }
        if (String(document.querySelector("#inpt_prodDesc").value).length > 0) { data.description = document.querySelector("#inpt_prodDesc").value }
        if (String(document.querySelector("#inpt_prodPltQty").value).length > 0) { data.palletQty = document.querySelector("#inpt_prodPltQty").value }
        if (String(document.querySelector("#inpt_prodCtnQty").value).length > 0) { data.cartonQty = document.querySelector("#inpt_prodCtnQty").value }
        if (String(document.querySelector("#inpt_unit").value).length > 0) { data.unit = document.querySelector("#inpt_unit").value }
        if (String(document.querySelector("#inpt_vendorcode").value).length > 0) { data.vendorCode = document.querySelector("#inpt_vendorcode").value }
        if (String(document.querySelector("#inpt_weight").value).length > 0) { data.weight = parseInt(document.querySelector("#inpt_weight").value) }
        if (String(document.querySelector("#inpt_length").value).length > 0) { data.sizeLength = parseInt(document.querySelector("#inpt_length").value) }
        if (String(document.querySelector("#inpt_width").value).length > 0) { data.sizeWidth = parseInt(document.querySelector("#inpt_width").value) }
        if (String(document.querySelector("#inpt_height").value).length > 0) { data.sizeHeight = parseInt(document.querySelector("#inpt_height").value) }
        if (String(document.querySelector("#inpt_price").value).length > 0) {
            data.sizeHeight = Decimal128.fromString(document.querySelector("#inpt_price").value)
        }
        if (document.querySelector("#checkbox_expire").checked) {
            data.withBestbefore = (document.querySelector("#checkbox_expire").checked ? 1 : 0)
        }

        let filterCondition = {productCode: data.productCode}
        if (data.vendorCode) {
            filterCondition.vendorCode = data.vendorCode
        }
        if (urlParams.get("mode") === "edit") {
            await updateOneData(filterCondition, data, false).then(response => {
                console.log(response, data)
                if (response.acknowledged) {
                    document.querySelector("#div_alertblock").style.display = "block"
                    document.querySelector("#div_alertblock span").textContent = `${response.modifiedCount} records for item ${data.productCode} has been updated successfully`
                    setTimeout(function () {
                        window.location.href = "../products/index.html"
                    }, 3000)
                }
            })
        } else {
            await updateOneData(filterCondition, data, true).then(response => {
                console.log(response, data)
                if (response.acknowledged) {
                    document.querySelector("#div_alertblock").style.display = "block"
                    document.querySelector("#div_alertblock span").textContent = `${data.productCode} has found ${response.matchedCount} records,  ${response.upsertedCount} record has been inserted`
                    setTimeout(function () {
                        const bsAlert = new bootstrap.Alert(document.querySelector("#div_alertblock"));
                        bsAlert.close();
                        window.location.href = "../products/index.html"
                    }, 3000)
                }
            })
        }
    }
});

document.querySelector("#input_prodCode").addEventListener("input",async (ev) => {
    document.querySelector("#form_product .invalid-feedback").textContent =""
    document.querySelector("#form_product button").setAttribute("disabled","disabled")
    if (document.querySelector("#input_prodCode").value && document.querySelector("#input_prodCode").value.length >= 3) {
        let result = await retrieveProductByCode(document.querySelector("#input_prodCode").value)
        console.log(result)
        if (result.length <= 0){
            document.querySelector("#form_product #input_prodCode").className = "form-control is-valid"
            document.querySelector("#form_product button").removeAttribute("disabled")
            document.querySelectorAll(".form-control").forEach(eachElement => {
                eachElement.removeAttribute("disabled")
                if (eachElement.id !== "input_prodCode" ){ eachElement.value = "" }
            })
        } else {
            document.querySelector("#form_product #input_prodCode").className = "form-control is-invalid"
            document.querySelector("#form_product button").setAttribute("disabled","disabled")
            document.querySelector("#form_product .invalid-feedback").textContent = `Product code is duplicate with existing one in database`

            document.querySelectorAll(".form-control").forEach(eachElement=>{
                eachElement.setAttribute("disabled","disabled")
            })
            document.querySelector("#input_prodCode").removeAttribute("disabled")
            document.querySelector("#input_prodCode").value = (result[0].productCode ? result[0].productCode :"");
            document.querySelector("#inpt_prodDesc").value = (result[0].description ? result[0].description : "");
            document.querySelector("#inpt_prodName").value = (result[0].labelname ? result[0].labelname : "");
            document.querySelector("#inpt_prodPltQty").value = (result[0].palletQty ? result[0].palletQty : "");
            document.querySelector("#inpt_prodCtnQty").value = (result[0].cartonQty ? result[0].cartonQty : "");
            document.querySelector("#inpt_unit").value = (result[0].unit ? result[0].unit : "");
            document.querySelector("#inpt_length").value = (result[0].sizeLength ? result[0].sizeLength : 0);
            document.querySelector("#inpt_width").value = (result[0].sizeWidth ? result[0].sizeWidth : 0);
            document.querySelector("#inpt_height").value = (result[0].sizeHeight ? result[0].sizeHeight : 0);
            document.querySelector("#inpt_vendorcode").value = (result[0].vendorCode ? result[0].vendorCode : "");
            document.querySelector("#inpt_weight").value = (result[0].weight ? result[0].weight : 0);
            document.querySelector("#checkbox_expire").checked = (result[0].withBestbefore ? result[0].withBestbefore : 0);
            document.querySelector("#inpt_price").selectedIndex = (result[0].unitPrice ? result[0].unitPrice : "");
            document.querySelector("#inpt_price").selectedIndex = (result[0].unitPrice ? result[0].unitPrice : "");
        }
    } else {
        document.querySelector("#form_product .invalid-feedback").textContent = `Product code must contain at lease 3 characters`
    }
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
    let options = {$sort: {productCode: 1}, projection: {"_id" : 0}}
    let result = []
    let query = {_id:new ObjectId(id)}
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        result = await client.db(targetDB).collection("products").find(query, options).toArray()
    } catch (e) {
        console.error("MongoDB find error:", e)
    } finally {
        await client.close();
    }
    return result
}

async function retrieveProductByCode(inputCode){
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    let results = []
    try {
        await client.connect();
        let session = await client.db(targetDB).collection("products")
        results = await session.find({productCode:inputCode}).toArray();
    } catch (e) {
        console.error("Data upsert:",e)
    } finally {
        await client.close();
    }
    return results;
}
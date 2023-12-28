const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId, Decimal128} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const jsQR = require("jsqr")

document.querySelector("#act_reset").addEventListener("click",(ev)=>{
    document.querySelectorAll("#div_datatable input").forEach(eachinput=>{
        eachinput.value= ""
        if (eachinput.getAttribute("type") === "text"){
            eachinput.className = "form-control"
        }
    })
})

document.addEventListener("DOMContentLoaded",async () => {
    let productList = await fetchProductList();
    let datalistElements = document.createElement("datalist")
    datalistElements.id = "productsList"
    if (Array.isArray(productList)){
        let newAlert = document.createElement("div");
        newAlert.className = "alert alert-success alert-dismissible bg-success text-white border-0 fade show";
        newAlert.role = "alert";
        var alertbutton = document.createElement("button");
        alertbutton.className = "btn-close btn-close-white";
        alertbutton.setAttribute("data-bs-dismiss","alert")
        alertbutton.setAttribute("aria-label","Close")
        var alertText = document.createElement("span");
        alertText.innerText = "Product List has successfully fetched";
        newAlert.append(alertbutton)
        newAlert.append(alertText)
        document.querySelector("#alertAnchor").append(newAlert)
        setTimeout(function(){
            const bsAlert = new bootstrap.Alert(newAlert);
            bsAlert.close();
        },3000)
        
        productList.forEach(eachElement =>{
            var newElement = document.createElement("option")
            if (eachElement.productCode){
                newElement.value = eachElement.productCode
                newElement.innerText = (eachElement.description ? eachElement.description : eachElement.productCode)

                datalistElements.append(newElement)
            }
        })

        document.querySelector("#inpt_prodCode").addEventListener("change",(ev) => {
            productList.forEach(eachElement =>{
                if (eachElement.productCode === ev.target.value){
                    document.querySelector("#inpt_prodName").value = (eachElement.labelname ? eachElement.labelname : "")
                    document.querySelector("#inpt_unit").value = (eachElement.unit ? eachElement.unit : "")
                    document.querySelector("#inpt_quantity").value = (eachElement.palletQty ? eachElement.palletQty : "")
                    document.querySelector("#inpt_unitprice").value = (eachElement.unitPrice ? eachElement.unitPrice : "")
                }
            })
        })
    }

    document.querySelector(".container-fluid").append(datalistElements)
    document.querySelector("#inpt_prodCode").setAttribute("list","productsList")
    document.querySelector("#btn_submit").removeAttribute("disabled")
})

document.querySelector("#check_manualTime").addEventListener("change", function (ev){
    if (document.querySelector("#check_manualTime").checked){//     当用户勾选时候允许用户自定义设置时间
        document.querySelector("#group_createTime").style = ""
        document.querySelector("#group_removeTime").style = (document.querySelector("#check_itemRemoved").checked ? "" : "display: none")
    } else { // 如果用户未勾选则隐藏，用户提交时候二次检查，如果未勾选，则修改时间值为默认值
        document.querySelector("#group_createTime").style = "display: none"
        document.querySelector("#group_removeTime").style = "display: none"
    }
})

document.querySelector("#inpt_shelflocation").addEventListener("change",(ev) =>{
    document.querySelector("#inpt_shelflocation").value =
        document.querySelector("#inpt_shelflocation").value ? String(document.querySelector("#inpt_shelflocation").value).toUpperCase() : ""
})

document.querySelector("#check_itemRemoved").addEventListener("change", (ev)=>{
    if (document.querySelector("#check_itemRemoved").checked && document.querySelector("#check_manualTime").checked){
        document.querySelector("#group_removeTime").style = ""
    } else {
        document.querySelector("#group_removeTime").style = "display: none"
    }
})

async function fetchProductList() {
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    let results = []
    try {
        await client.connect();
        let session = await client.db(targetDB).collection("products")
        results = await session.find().toArray();
    } catch (e) {
        console.error("Data upsert:", e)
    } finally {
        await client.close();
    }
    return results;
}

function createAlert(type = "info", context=""){
//     type: info, success, danger, warning
    let alertElement = document.createElement("div")
    alertElement.setAttribute("role","alert")
    if (type === "success"){
        alertElement.className = "alert alert-success alert-dismissible bg-success text-white border-0 fade show"
    } else if (type === "danger"){
        alertElement.className = "alert alert-info alert-dismissible bg-info text-red border-0 fade show"
    } else if (type === "warning"){
        alertElement.className = "alert alert-warning alert-dismissible bg-warning text-yellow border-0 fade show"
    } else {
        alertElement.className = "alert alert-info alert-dismissible bg-info text-black border-0 fade show"
    }
    alertElement.innerHTML = `<button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert" aria-label="Close"></button>`
    let alertText = document.createElement("span")
    alertText.innerText = context
    alertElement.append(alertText)

    return alertElement
}

document.querySelector("#form_product").addEventListener("submit",(ev)=>{
    ev.preventDefault()
    var infoAlert = createAlert("info","Processing Insert Data")
    document.querySelector("#alertAnchor").append(infoAlert)
    setTimeout(function(){
        infoAlert.style = "display: none"
    },3000)

    let object = {}
    object.labelBuild = 3
    object.locationRecords = []
    object.sessions = [(document.querySelector("#inpt_sessionid").value ? document.querySelector("#inpt_sessionid").value : "STOCKS")]
    if (String(document.querySelector("#inpt_prodCode").value).length > 0){ object.productCode = document.querySelector("#inpt_prodCode").value }
    if (String(document.querySelector("#inpt_prodName").value).length > 0){ object.productName = document.querySelector("#inpt_prodName").value }
    if (String(document.querySelector("#inpt_quantity").value).length > 0){ object.quantity = parseInt(document.querySelector("#inpt_quantity").value) }
    if (String(document.querySelector("#inpt_unit").value).length > 0){ object.quantityUnit = document.querySelector("#inpt_unit").value }
    if (String(document.querySelector("#inpt_purchaseorder").value).length > 0){ object.POnumber = document.querySelector("#inpt_purchaseorder").value }
    if (String(document.querySelector("#inpt_bestbefore").value).length > 0){ object.bestbefore = document.querySelector("#inpt_bestbefore").value }
    if (String(document.querySelector("#inpt_labelid").value).length > 0){ object.productLabel = document.querySelector("#inpt_labelid").value }
    if (String(document.querySelector("#inpt_unitprice").value).length > 0){
        object.unitPrice = Decimal128.fromString(document.querySelector("#inpt_unitprice").value)
    }
    object.loggingTime = new Date()
    object.createTime = new Date()
    if (document.querySelector("#check_itemRemoved").checked){
        object.removed = 1
        object.removeTime = (document.querySelector("#inpt_removeTime").value ? new Date(document.querySelector("#inpt_removeTime").value) : new Date())
    } else {
        object.removed = 0
    }
    object.createTime = (document.querySelector("#check_manualTime").checked && document.querySelector("#inpt_createTime").value ?
        new Date(document.querySelector("#inpt_createTime").value) : new Date())
    object.quarantine =  document.querySelector("#check_itemQuarantine").checked

    if (document.querySelector("#inpt_shelflocation").value){
        object.shelfLocation =  document.querySelector("#inpt_shelflocation").value
        object.locationRecords =  [{location:document.querySelector("#inpt_shelflocation").value, datetime: object.createTime}]
    }

    if (object.productLabel.length > 0){
        insertProductLog(object)
    }
})

async function insertProductLog(productObject, override = false) {
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    const sessions = client.db(targetDB).collection("pollinglog");
    let result = {acknowledged: false, resultSet: [], message: ""}
    let searchResult = []
    try {
        const options = {sort: {bestbefore: -1},}
        await client.connect();
        let findResult = await sessions.find({"productLabel": productObject.productLabel}).toArray()

        if (findResult.length > 0){
            var infoAlert = createAlert("warning","Found duplicate item in database, ")
            document.querySelector("#alertAnchor").append(infoAlert)
            setTimeout(function(){
                infoAlert.style = "display: none"
            },3000)
        } else { // Can insert
            result = await sessions.insertOne(productObject)
            var infoAlert = createAlert("success","Data insert successfully ")
            document.querySelector("#alertAnchor").append(infoAlert)
            setTimeout(function(){
                infoAlert.style = "display: none"
                window.location.replace(`./index.html`)
            },3000)
        }
    // 使用UpdateOne，如果数据存在则提示保留或覆盖，如果不存在则使用upsert插入
    } catch (err) {
        console.error(err)
        var infoAlert = createAlert("danger","Error when processing database request: ", err)
        document.querySelector("#alertAnchor").append(infoAlert)
        setTimeout(function(){
            infoAlert.style = "display: none"
        },3000)
        result['message'] = err
    } finally {
        await client.close()
    }
    return result
}

document.querySelector("#btn_scanqrcode").addEventListener("click",function (ev) {
    ev.preventDefault()
    document.querySelector("#videobox").style = "";
    navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}})
        .then(function (stream) {
            const video = document.querySelector('#video');
            video.srcObject = stream;
            video.setAttribute("playsinline", true);
            video.onloadedmetadata = () => {
                video.play();
                scanQRCode();
            };
        })
        .catch(err => console.error('Error accessing camera:', err));
})

function scanQRCode() {
    const video = document.querySelector('#video');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvasElement = document.createElement('canvas');
        const canvas = canvasElement.getContext('2d');

        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);

        const code = jsQR(imageData.data, imageData.width, imageData.height);
        // 打印二维码内容
        if (code) {
          document.querySelector("#videobox").style = "display:none"
          video.srcObject.getTracks().forEach(track => track.stop());  // 关闭摄像头
          cameraFillinblank(code.data)
        } else {
          requestAnimationFrame(scanQRCode); // 继续扫描
        }
    } else {
        requestAnimationFrame(scanQRCode); // 如果数据未准备好，继续等待
    }
}

async function cameraFillinblank(data) {
    console.log(data)
    let itemBase64 = data.search("item=") >= 0 ? data.substring(data.search("item=") + 5) : ""
    try {
        if (itemBase64.length > 0) {
            let decodedData = JSON.parse(atob(itemBase64))
            console.log(decodedData)
            document.querySelector("#inpt_prodCode").value = decodedData.productCode ? decodedData.productCode : ""

            let productBackupInfo = await fetchProductInfos(decodedData.productCode)
            document.querySelector("#inpt_prodName").value = decodedData.productName ? decodedData.productName :
                (productBackupInfo.length > 0 && productBackupInfo[0].labelname ? productBackupInfo[0].labelname : "");
            document.querySelector("#inpt_quantity").value = decodedData.quantity ? decodedData.quantity :
                (productBackupInfo.length > 0 && productBackupInfo[0].palletQty ? productBackupInfo[0].palletQty : "");
            document.querySelector("#inpt_unit").value = decodedData.quantityUnit ? unitAbbrvLookup(decodedData.quantityUnit) :
                (productBackupInfo.length > 0 && productBackupInfo[0].unit ? productBackupInfo[0].unit : "") ;
            document.querySelector("#inpt_purchaseorder").value = (decodedData.POnumber ? decodedData.POnumber : (decodedData.POIPnumber ? decodedData.POIPnumber : ""));
            document.querySelector("#inpt_bestbefore").value = decodedData.bestbefore ? decodedData.bestbefore : "";
            document.querySelector("#inpt_labelid").value = decodedData.productLabel ? decodedData.productLabel : "";
            document.querySelector("#inpt_sessionid").value = decodedData.session ? decodedData.session : "STOCKS";
            document.querySelector("#inpt_unitprice").value = decodedData.unitPrice ? decodedData.unitPrice :
                (productBackupInfo.length > 0 && productBackupInfo[0].unitPrice ? productBackupInfo[0].unitPrice : "");
            document.querySelector("#inpt_sessionid").value = decodedData.shelfLocation ? decodedData.shelfLocation : "";
        }
    } catch (e) {
        console.log("Decode Failed: ", e)
    }
}

async function fetchProductInfos(productCode){
    let client = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
    });
    let results = []
    try {
        await client.connect();
        let session = await client.db(targetDB).collection("products")
        if (productCode && productCode.length > 0){
            results = await session.find({"productCode": productCode}).toArray();
        }
    } catch (e) {
        console.error("Data upsert:", e)
    } finally {
        await client.close();
    }
    return results;
}

function unitAbbrvLookup(sourceText){
    let unit={
        btl: "bottle",
        ctn: "carton",
        ptl: "pallet",
        pcs: "pieces",
    }

    return (unit[sourceText] ? unit[sourceText]: sourceText)
}
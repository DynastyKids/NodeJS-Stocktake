const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId} = require('mongodb');
const path = require('path');
const Moment = require('moment-timezone');

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
                    document.querySelector("#inpt_prodName").value = eachElement.labelname
                    document.querySelector("#inpt_unit").value = eachElement.unit
                    document.querySelector("#inpt_quantity").value = (eachElement.palletQty ? eachElement.palletQty : "")
                }
            })
        })
    }
    
    console.log(productList)
    document.querySelector(".container-fluid").append(datalistElements)
    document.querySelector("#inpt_prodCode").setAttribute("list","productsList")
    document.querySelector("#btn_submit").removeAttribute("disabled")
})

document.querySelector("#check_manualTime").addEventListener("change", (ev)=>{
    console.log(ev.target.checked)
    if (ev.target.checked){//     当用户勾选时候允许用户自定义设置时间
        document.querySelector("#group_loggingTime").style = ""
        document.querySelector("#group_consumeTime").style = ""
    } else { // 如果用户未勾选则隐藏，用户提交时候二次检查，如果未勾选，则修改时间值为默认值
        document.querySelector("#group_loggingTime").style = "display: none"
        document.querySelector("#group_consumeTime").style = "display: none"
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

document.querySelector("#form_product").addEventListener("submit",(ev)=>{
    ev.preventDefault()
    console.log(ev.target)

    let object = {}
    object.labelBuild = 3
    object.productCode = document.querySelector("#inpt_prodCode").value ? document.querySelector("#inpt_prodCode").value : ``
    object.productName = document.querySelector("#inpt_prodName").value ? document.querySelector("#inpt_prodName").value : ``
    object.quantity = document.querySelector("#inpt_quantity").value ? document.querySelector("#inpt_quantity").value : ``
    object.quantityUnit = document.querySelector("#inpt_unit").value ? document.querySelector("#inpt_unit").value : ``
    object.POIPnumber = document.querySelector("#inpt_purchaseorder").value ? document.querySelector("#inpt_purchaseorder").value : ``
    object.bestbefore = document.querySelector("#inpt_bestbefore").value ? document.querySelector("#inpt_bestbefore").value : ``
    object.productLabel = document.querySelector("#inpt_labelid").value ? document.querySelector("#inpt_labelid").value : ``
    object.session =  document.querySelector("#inpt_sessionid").value ? document.querySelector("#inpt_sessionid").value : ``
    object.shelfLocation =  document.querySelector("#inpt_shelflocation").value ? document.querySelector("#inpt_shelflocation").value : ``
    object.unitPrice =  document.querySelector("#inpt_unitprice").value ? document.querySelector("#inpt_unitprice").value : ``
    object.createTime =  (document.querySelector("#check_manualTime").checked && document.querySelector("#inpt_createTime").value ?
        new Date(document.querySelector("#inpt_createTime").value) : new Date())
    object.loggingTime =  new Date()
    if (document.querySelector("#check_manualTime").checked && document.querySelector("#inpt_consumeTime").value){
        object.removed = 1;
        object.removeTime =  (document.querySelector("#inpt_consumeTime").value ? document.querySelector("#inpt_consumeTime").value : new Date())
    } else {
        object.removeTime = 0;
    }
})

document.querySelector("#btn_scanqrcode").addEventListener("click",function(){
    document.querySelector("#videobox").style = ""
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function(stream) {
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

function cameraFillinblank(data){
    console.log(data)
    let itemBase64 = data.search("item=") >=0 ? data.substring(data.search("item=")+5) : ""
    try {
        if (itemBase64.length > 0){
            let decodedData = JSON.parse(atob(itemBase64))
            console.log(decodedData)

            document.querySelector("#inpt_prodCode").value = decodedData.productCode ? decodedData.productCode : ""
            document.querySelector("#inpt_prodName").value = decodedData.productName ? decodedData.productName : ""
            document.querySelector("#inpt_quantity").value = decodedData.quantity ? decodedData.quantity : ""
            document.querySelector("#inpt_purchaseorder").value = decodedData.POIPnumber ? decodedData.POIPnumber : ""
            document.querySelector("#inpt_bestbefore").value = decodedData.bestbefore ? decodedData.bestbefore : ""
            document.querySelector("#inpt_labelid").value = decodedData.productLabel ? decodedData.productLabel : ""
            document.querySelector("#inpt_sessionid").value = decodedData.session ? decodedData.session : "STOCK"

            document.querySelector("#inpt_unit").value = decodedData.quantityUnit ? unitAbbrvLookup(decodedData.quantityUnit) : ""

        }
    } catch (e) {
        console.log("Decode Failed: ",e)
    }
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
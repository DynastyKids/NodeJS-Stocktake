let scanHistory = []
let productList = []

document.addEventListener("DOMContentLoaded", function (ev) {
    if (window.location.protocol === "http:") {
        let warningModal = new bootstrap.Modal(document.querySelector("#staticBackdropHTTPS"), {focus: true})
        warningModal.show()
    }
    document.querySelector("#warningModal_btnConfirm").addEventListener("click",(ev)=>{
        const redirectUrl = "https://" + window.location.hostname + ":3001" + window.location.pathname;
        window.location.replace(redirectUrl)
    })
})

$(document).ready(function () {
    fetchProducts()
    const video = document.querySelector('#qr-video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    let currentText = document.querySelector("#list_current")
    let scanInterval;
    navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}})
        .then(function (stream) {
            video.srcObject = stream;
            video.play();
            startScanning();
            // setTimeout(scanQRCode,1000)
        })
        .catch(function (error) {
            console.error("Cannot access the Camera", error);
            currentText.textContent = 'Error: Cannot access the camera';
        });

    function startScanning() {
        scanInterval = setInterval(scanQRCode, 300);
    }

    function stopScanning() {
        clearInterval(scanInterval);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            stopScanning();
        } else {
            startScanning();
        }
    });

    async function scanQRCode() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            currentText.textContent = 'Awaiting to scan';

            if (code && String(code.data).length > 0) {
                drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#00d73c");
                drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#00d73c");
                drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#00d73c");
                drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#00d73c");
                currentText.textContent = `${code.data}`;
                await createScanHistory(code.data)
            }
        }
        // requestAnimationFrame(scanQRCode);
    }

    function drawLine(begin, end, color) {
        ctx.beginPath();
        ctx.moveTo(begin.x, begin.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineWidth = 4;
        ctx.strokeStyle = color;
        ctx.stroke();
    }
});


async function createScanHistory(qrCodeData) {
    let results = {action: true}
    let historyList = document.querySelector("#list_history")
    if (qrCodeData.includes("?item=")) {
        //如果扫描到了带item关键字的，则查找过去stock是否有该条目，如果有则需要修正已经在框内的数据
        var decodedElement = decodeItemData(qrCodeData)
        let htmlBuildNode = await buildInnerlistContent(decodedElement)
        htmlBuildNode.setAttribute("data-bs-labelid", decodedElement.item.productLabel)
        // 每次添加前需要核验是否和上一个是Label，如果不是则允许添加，如果是则忽略
        let lastAddedCard = document.querySelector("#list_history .card")
        if (lastAddedCard !== null) {
            if (!lastAddedCard.hasAttribute("data-bs-labelid")) { // 如果上一个卡片没有labelid, 则默认添加
                historyList.insertAdjacentElement('afterbegin', htmlBuildNode)
                scanHistory.push(decodedElement.item)
            } else if (lastAddedCard.getAttribute("data-bs-labelid") !== decodedElement.item.productLabel) { // 如果上一卡片labelId不同则可以添加
                historyList.insertAdjacentElement('afterbegin', htmlBuildNode)
                scanHistory.push(decodedElement.item)
            }
        } else { // 如果上一个卡片不存在则可以添加
            historyList.insertAdjacentElement('afterbegin', htmlBuildNode)
            scanHistory.push(decodedElement.item)
        }
    } else {
        // historyList.insertAdjacentHTML('afterbegin', `<div class='col-12 card mt-1'><div class="card">QR Code Raw Data: ${qrCodeData}</div></div>`)
    }
    return results
}

async function findStockStatus(labelId) {
    let result = {add: false, update: false, remove: false, data: {preload:[],stock:[]}}
    let stockResults = await fetchStockBylabel(labelId)
    let preloadResults = await fetchPrefillByLabel(labelId)
    if (stockResults.acknowledged && stockResults.data.length > 0){
        if (stockResults.data.removed === 0){
            result.remove = true
            result.update = true
        }
        result.data.stock = stockResults.data
    }
    if (preloadResults.acknowledged && preloadResults.data.length > 0){
        result.add = true
        result.update = true
        result.data.preload = preloadResults.data
    }
    if (stockResults.acknowledged && preloadResults.acknowledged && stockResults.data.length === 0 && preloadResults.data.length === 0){
        result.add = true
        result.remove= false
    }
    return result
}

function fetchStockBylabel(labelid = "...") {
    return new Promise((resolve, reject) => {
        fetch(`/api/v1/stocks?&label=${labelid && labelid.length > 0 ? labelid : "..."}`,{timeout: 10000})
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(error => reject(error));
    })
}
function fetchPrefillByLabel(labelid="...") {
    return new Promise((resolve, reject) => {
        fetch(`/api/v1/preload?label=${labelid && labelid.length > 0 ? labelid : "..."}`,{timeout: 10000})
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(error => reject(error));
    })
}

function fetchProducts(forced = false){
    return new Promise((resolve, reject) =>{
        if (productList.length <= 0 || forced){
            fetch("/api/v1/products", {timeout: 10000})
                .then (response => response.json())
                .then(data=>{
                    console.log(data)
                    productList = data.data
                    resolve(data)
                })
                .catch(error=>{
                    console.error("Error when fetching Products List:",error)
                    createAlert("warning","Products list didn't fetched successfully", 3000)
                    reject(error)
                })
        }
    })
}

async function buildInnerlistContent(element) {
    let elementWrap = document.createElement("div")
    elementWrap.className = "col-12 card mb-1"
    let cardBody = document.createElement("div")
    cardBody.className = "card-body"
    let scanTimeElement = document.createElement("p")
    scanTimeElement.textContent = `Scan Time: ${new Date().toLocaleString()}`

    let productLabelElement = document.createElement("p")
    productLabelElement.textContent = `${element.item.hasOwnProperty("productLabel") ? "Product Label: " + element.item.productLabel : ""}`
    let productNameElement = document.createElement("p")
    productNameElement.textContent = `Product: ${element.item.hasOwnProperty("productCode") ? element.item.productCode + " - " : ""}${element.item.hasOwnProperty("productName") ? element.item.productName : ""}`
    let productQuantityElement = document.createElement("p")
    productQuantityElement.textContent = `${element.item.hasOwnProperty("quantity") ? "Quantity: " + element.item.quantity : ""} ${element.item.hasOwnProperty("quantityUnit") ? " " + element.item.quantityUnit : ""}`
    let buttonsDiv = document.createElement("div")
    buttonsDiv.className = "card-footer text-muted"
    let buttonsLeft = document.createElement("div")
    let buttonsRight = document.createElement("div")
    let divideLine = document.createElement("hr")

    let editButton = document.createElement("button")
    editButton.className = "btn btn-primary mx-1 btn_edit"
    editButton.innerHTML = `<i class="ti ti-edit"></i> Update`
    editButton.setAttribute("data-bs-toggle","modal")
    editButton.setAttribute("data-bs-target","#editModal")
    editButton.setAttribute("data-bs-labelid", element.item.productLabel)

    let removeButton = document.createElement("button")
    removeButton.className = "btn btn-danger mx-1 btn_delete"
    removeButton.innerHTML = `<i class="ti ti-trash"></i> Remove`
    removeButton.setAttribute("data-bs-labelid", element.item.productLabel)
    removeButton.setAttribute("data-bs-toggle","modal")
    removeButton.setAttribute("data-bs-target","#removeModal")
    buttonsLeft.append(editButton, removeButton)
    buttonsLeft.className = "cardLeftOptions"

    let rowdeleteButton = document.createElement("button")
    rowdeleteButton.className = "btn btn-warning mx-1"
    rowdeleteButton.innerHTML = `<i class="ti ti-minus"></i>`
    rowdeleteButton.addEventListener("click", function (ev) {
        elementWrap.remove()
    })
    buttonsRight.append(rowdeleteButton)

    buttonsDiv.append(buttonsLeft, buttonsRight)
    buttonsDiv.className = "d-flex justify-content-between"
    cardBody.append(scanTimeElement, productLabelElement, productNameElement, productQuantityElement, divideLine, buttonsDiv)

    let displayStatus = await findStockStatus(element.item.productLabel)
    if (!(displayStatus.add) && !(displayStatus.update) && !(displayStatus.remove)){
        let itemRemoved = document.createElement("p")
        itemRemoved.textContent = "Item has been REMOVED from stock."
        cardBody.append(itemRemoved)
    }

    elementWrap.append(cardBody)
    editButton.style = displayStatus.update || displayStatus.add ? "" : "display:none"
    removeButton.style = displayStatus.remove ? "" : "display:none"

    return elementWrap
}

function decodeItemData(qrCodeData) {
    let response = {item: {}, history: true}
    let itemString = qrCodeData.split("?item=")[1]
    try {
        let itemObject = JSON.parse(decodeBase64Text(itemString).result)
        if (typeof (itemObject) === "object") {
            response.item = itemObject
            for (const eachHistory of scanHistory) {
                if (eachHistory['productLabel'] === itemObject['productLabel']) {
                    response.history = true
                    break;
                }
            }
        }
    } catch (e) {
        console.error("Error occured when decode item datas: ", e)
    }
    return response
}

function decodeBase64Text(attemptText) {
    try {
        return {acknowledged: true, result: Base64.decode(attemptText)}
    } catch (e) {
        console.error("Base64 decode failed")
    }
    return {acknowledged: false}
}

let editModalObject = {}
let editModal = document.querySelector("#editModal")
// 当用户点击了editModal之后，则需要弹窗，清空内容，然后填充点击的内容，如果用户点击了保存并添加/保存，则做出对应数据库修改，如果点击删除则跳转删除Modal
document.querySelector("#editModal").addEventListener("show.bs.modal", (ev)=>{
    editModalObject = {}
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-labelid")
    document.querySelector("#editModal_submitBtn").disabled = false
    document.querySelector("#editModal_submitBtn").textContent = "Submit"
    document.querySelector("#editModal .modal-title").textContent = `Loading Product Information`
    for (const scanHistoryElement of scanHistory) {
        if (scanHistoryElement.hasOwnProperty("productLabel") && scanHistoryElement.productLabel === requestLabelId){
            // 优先使用本地数据填充表格
            fillModalEditByObject(scanHistoryElement)
            editModalObject = scanHistoryElement
            var foundFlag = false
            // 如果远端有数据，则覆盖相关field， stock > prefill > label
            fetchPrefillByLabel(requestLabelId)
                .then(response=>{
                    if (response.hasOwnProperty("data") && response.data.length > 0){
                        foundFlag = true
                        Object.keys(response.data[0].item).forEach(eachKey=>{
                            console.log(eachKey,":",response.data[0].item[eachKey])
                            let inputField = document.querySelector(`input[data-bs-targetField=${eachKey}]`)
                            if (inputField){
                                if (eachKey === "unitPrice" && typeof response.data[0].item[eachKey] === "object"){
                                    inputField.value = response.data[0].item[eachKey].$numberDecimal
                                }
                                inputField.value = response.data[0].item[eachKey]
                            }
                        })
                    }
                }).catch(err=>{
                console.error("Error when fetching stock information by label: ",err)
            })

            fetchStockBylabel(requestLabelId)
                .then(response=>{
                    foundFlag = true
                    if (response.hasOwnProperty("data") && response.data.length > 0){
                        Object.keys(response.data[0]).forEach(eachKey=>{
                            console.log(eachKey,":",response.data[0][eachKey])
                            let inputField = document.querySelector(`input[data-bs-targetField=${eachKey}]`)
                            if (inputField){
                                if (eachKey === "unitPrice" && typeof response.data[0][eachKey] === "object"){
                                    inputField.value = response.data[0][eachKey].$numberDecimal
                                }
                                inputField.value = response.data[0][eachKey]
                            }
                        })
                    }
                }).catch(err=>{
                console.error("Error when fetching stock information by label: ",err)
                })

            if (!foundFlag){
                document.querySelector("#editModalLabel").textContent = "Add new Stock"
            }
            break;
        }
    }
})

function fillModalEditByObject(elementObject){
    try{
        Object.keys(elementObject).forEach(eachKey =>{
            var selectedElement = document.querySelector(`input[data-bs-targetfield=${eachKey}]`)
            if (eachKey === "quarantine" && selectedElement && selectedElement.hasOwnProperty("checked") && selectedElement.checked){
                selectedElement.checked = true
            } else if(selectedElement){
                selectedElement.value = elementObject[eachKey]
            }
            if (eachKey === "productLabel"){
                if (!elementObject.hasOwnProperty("createTime") || !elementObject.createTime){
                    document.querySelector("#modelEditCreateTime").value = `${elementObject.productLabel.substring(0,4)}-${elementObject.productLabel.substring(4,6)}-${elementObject.productLabel.substring(6,8)} 12:00`
                }
            }
        })
    } catch (e) {
        console.error("Error when filling modal edit: ",e)
    }
}

// Submit使用stock/update
// 操作顺序，如果产品是已经在库内，则更新，对比差异，保存；如果在preload，则先提交，后删除preload原有条目，如果为新产品，则直接upsert保存
document.querySelector("#editModal_submitBtn").addEventListener("click", async (ev) => {
    console.log(editModalObject)
    let submittedItem = {}
    document.querySelectorAll("#input[data-bs-targetField]").forEach(eachInput =>{
        if (eachInput.type === "text" || eachInput.type === "number" || eachInput.type === "date"){
            console.log(eachInput.type, eachInput.value)
        }
        if (eachInput.type === "checkbox" && eachInput.checked){
            console.log(eachInput.type, eachInput.checked, eachInput.value, eachInput.getAttribute("name"))
        }
    })


    // let client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1,  useNewUrlParser: true,  useUnifiedTopology: true }});
    // const session = client.db(targetDB).collection("pollinglog");
    // document.querySelector("#editModal_submitBtn").disabled = true
    // document.querySelector("#editModal_submitBtn").textContent = "Updating"
    // // 当update时候，获取所有的输入框信息，并和原有的值对比，如果发生变化则添加到新系统中，并且添加个changelog

    // let setObject = {}
    // let changedObject = {datetime: new Date(), events:[]}
    // var originProperty = editModalObject.originProps
    // if (document.querySelector("#modalEditQuantity").value.toString().length > 0 ){
    //     setObject.quantity = parseInt(document.querySelector("#modalEditQuantity").value)
    //     if ((originProperty.hasOwnProperty("quantity") && originProperty.quantity !== document.querySelector("#modalEditQuantity").value)
    //         || !originProperty.hasOwnProperty("quantity")){
    //         changedObject.events.push({field:"quantity", before:parseInt(originProperty.quantity)})
    //     }
    // }
//
//     if (document.querySelector("#modalEditUnit").value.toString().length > 0){
//         setObject.quantityUnit = document.querySelector("#modalEditUnit").value
//         if ((originProperty.hasOwnProperty("quantityUnit") && originProperty.quantityUnit !== document.querySelector("#modalEditUnit").value)
//             || !originProperty.hasOwnProperty("quantityUnit") ){
//             changedObject.events.push({field:"quantityUnit", before:originProperty.quantityUnit})
//         }
//     }
//
//     if (document.querySelector("#modalEditBestbefore").value.toString().length > 0){
//         setObject.bestbefore = document.querySelector("#modalEditBestbefore").value
//         if ((originProperty.hasOwnProperty("bestbefore") && originProperty.bestbefore !== document.querySelector("#modalEditBestbefore").value)
//             || !originProperty.hasOwnProperty("bestbefore")){
//             changedObject.events.push({field:"bestbefore", before: originProperty.bestbefore})
//         }
//     }
//
//     if (document.querySelector("#modelEditLocation").value.toString().length > 0){
//         setObject.shelfLocation = document.querySelector("#modelEditLocation").value
//         if ((originProperty.hasOwnProperty("shelfLocation") && originProperty.shelfLocation !== document.querySelector("#modelEditLocation").value)
//             || !originProperty.hasOwnProperty("shelfLocation")){
//             changedObject.events.push({field:"shelfLocation", before: originProperty.shelfLocation})
//         }
//     }
//
//     if (document.querySelector("#modelEditPOnumber").value.toString().length > 0){
//         setObject.POnumber = document.querySelector("#modelEditPOnumber").value
//         if ((originProperty.hasOwnProperty("POnumber") && originProperty.POnumber !== document.querySelector("#modelEditPOnumber").value)
//             || !originProperty.hasOwnProperty("POnumber")){
//             changedObject.events.push({field:"POnumber", before: originProperty.POnumber})
//         }
//     }
//
//     if (document.querySelector("#modelEditUnitprice").value.toString().length > 0){
//         setObject.unitPrice = Decimal128.fromString(document.querySelector("#modelEditUnitprice").value)
//         if ((originProperty.hasOwnProperty("unitPrice") && originProperty.unitPrice !== document.querySelector("#modelEditUnitprice").value)
//             || !originProperty.hasOwnProperty("unitPrice")){
//             changedObject.events.push({field:"unitPrice", before: originProperty.unitPrice})
//         }
//     }
//
//     if (document.querySelector("#modelEditCreateTime").value.toString().length > 0){
//         setObject.createTime = new Date(document.querySelector("#modelEditCreateTime").value)
//         if ((originProperty.hasOwnProperty("createTime") && originProperty.createTime !== document.querySelector("#modelEditCreateTime").value)
//             || !originProperty.hasOwnProperty("createTime")){
//             changedObject.events.push({field:"createTime", before: originProperty.createTime})
//         }
//     }
//
//     if (!originProperty.hasOwnProperty("removed")) {
//         setObject.removed = parseInt("0")
//     } else if(originProperty.removed === 0 && document.querySelector("#modelEditCheckRemoved").checked){
//         setObject.removed = parseInt("1")
//         changedObject.events.push({field:"removed", before: 0})
//     } else if (originProperty.removed === 1 && !document.querySelector("#modelEditCheckRemoved").checked){
//         setObject.removed = parseInt("0")
//         changedObject.events.push({field:"removed", before: 1})
//     }
//
//     try{
//         if(document.querySelector("input[name='modalEdit_quarantineRatio']:checked").value){
//             setObject.quarantine = parseInt(document.querySelector("input[name='modalEdit_quarantineRatio']:checked").value)
//             changedObject.events.push({
//                 field:"quarantineRatio", before: (originProperty.hasOwnProperty("quarantine") ? parseInt(originProperty.quarantine) : null)
//             })
//         }
//     } catch (e) {
//         console.log("Original Property does not have quarantine Ratio")
//     }
//
//     if (String(document.querySelector("#modelEditComments").value).length > 0){
//         // Comments变动不做记录保存
//         setObject.comments = document.querySelector("#modelEditComments").value
//     }
//
//     // 位置发生变动，需要添加locationRecords
//     let pushObject = {}
//     if (originProperty.shelfLocation !== document.querySelector("#modelEditLocation").value) {
//         changedObject.events.push({field:"shelfLocation", before: originProperty.shelfLocation})
//         pushObject.locationRecords = {datetime: new Date(), location: document.querySelector("#modelEditLocation").value}
//     }
//     if (changedObject.events.length > 0){
//         pushObject.changelog = changedObject
//     }
//
//     let result = await session.updateOne({"_id": new ObjectId(editModalObject.labelId)}, {$set: setObject, $push: pushObject})
//     if (result.acknowledged){
//         setTimeout(function(){
//             bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
//             loadStockInfoToTable()
//         },3000)
//     } else {
//         document.querySelector("#editModal .modal-body p").textContent = "Error on Update"
//     }
})

function pushElementToStock(url = "/api/v1/stocks/update",stockObject){
    return new Promise((resolve, reject)=>{
        fetch(url, {
            method: "POST",
            mode: 'cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({item: stockObject})
        }).then(response => response.json())
            .then(data => {
                resolve({acknowledged: true, data: data})
            })
            .catch((error) => {
                console.error('Error:', error);
                reject({acknowledged: false, data: data})
            });
    })
}

let removeLabel = ""
let removeModal = document.querySelector("#removeModal")
removeModal.addEventListener("show.bs.modal", function (ev) {
    var itemId = ev.relatedTarget.getAttribute("data-bs-labelid")
    removeLabel = itemId
    removeModal.querySelector(".modal-body p").textContent = `Are you sure to remove ${itemId} from system?`
    removeModal.querySelector("#removeModal_btnConfirm").disabled = false
    removeModal.querySelector("#removeModal_btnConfirm").textContent = "Confirm"
})

removeModal.querySelector("#removeModal_btnConfirm").addEventListener("click", async function (ev) {
    removeModal.querySelector("#removeModal_text").textContent = "Processing stock..."
    if (removeLabel.length > 0) {
        let removeResult = await removeProduct(removeLabel)
        if (removeResult.hasOwnProperty("data") && removeResult.data.hasOwnProperty("acknowledged") && removeResult.data.acknowledged){
            removeModal.querySelector("#removeModal_text").textContent = "Ready"
            if (removeResult.data.modifiedCount > 0){
                createAlert("success", "Product has been successfully removed")
                document.querySelector(`#div[data-bs-labelid=${removeLabel}]`).querySelector(".cardLeftOptions").innerHTML=""
                bootstrap.Modal.getInstance(removeModal).hide()
            }
        }
    }
})

function removeProduct(productLabel = ""){
    return new Promise((resolve, reject)=>{
        fetch('/api/v1/stocks/remove', {
            method: "POST",
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({item: {productLabel: removeLabel}})
        })
            .then(response => response.json())
            .then(data => resolve(data))
            .catch((error) => reject(error));
    })
}


function createAlert(status, text, time = 5000){
    let alertAnchor = document.querySelector("#alertAnchor")
    let alertElement = document.createElement("div")
    alertElement.className= "alert alert-primary alert-dismissible bg-success text-white border-0 fade show";
    alertElement.role = "alert";
    let svgImage = document.createElement("svg")
    svgImage.className = "bi flex-shrink-0 me-2"
    svgImage.width = 24
    svgImage.height = 24
    svgImage.role = "img"
    svgImage.ariaLabel = "Info: "
    svgImage.innerHTML = `<use xlink:href="#info-fill"/>`

    let texts = document.createElement("span")
    texts.innerHTML = text ? text : ""
    if (status === "success"){
        alertElement.className= "alert alert-success alert-dismissible bg-success text-white border-0 fade show"
        svgImage.ariaLabel = "Success: "
        svgImage.innerHTML = `<use xlink:href="#check-circle-fill"/>`
    } else if (status === "danger"){
        alertElement.className= "alert alert-danger alert-dismissible bg-danger text-white border-0 fade show"
        svgImage.ariaLabel = "Danger: "
        svgImage.innerHTML = `<use xlink:href="#exclamation-triangle-fill"/>`
    } else if (status === "secondary"){
        alertElement.className= "alert alert-secondary alert-dismissible bg-secondary text-white border-0 fade show"
        svgImage.ariaLabel = "Info: "
        svgImage.innerHTML = `<use xlink:href="#info-fill"/>`
    }
    alertElement.append(svgImage)
    alertElement.append(text)
    alertAnchor.append(alertElement)
    setTimeout(function () {
        if (alertElement){
            alertElement.style.display = 'none'
        }
    }, isNaN(time) ? 3000 : time)
}
let scanHistory = []

$(document).ready(function () {
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
        var decodedElement = decodeItemData(qrCodeData)
        let htmlBuildNode = await buildInnerlistContent(decodedElement)
        htmlBuildNode.setAttribute("data-bs-labelid", decodedElement.item.productLabel)
        // 每次添加前需要核验是否和上一个是Label，如果不是则允许添加，如果是则忽略
        let lastAddedCard = document.querySelector("#list_history .card")
        if (lastAddedCard !== null) {
            if (!lastAddedCard.hasAttribute("data-bs-labelid")) {
                historyList.insertAdjacentElement('afterbegin', htmlBuildNode)
            } else if (lastAddedCard.getAttribute("data-bs-labelid") !== decodedElement.item.productLabel) {
                historyList.insertAdjacentElement('afterbegin', htmlBuildNode)
            }
        } else {
            historyList.insertAdjacentElement('afterbegin', htmlBuildNode)
        }
    } else {
        historyList.insertAdjacentHTML('afterbegin', `<div class='col-12 card mt-1'><div class="card">QR Code Raw Data: ${qrCodeData}</div></div>`)
    }
    return results
}

async function findStockStatus(labelId) {
    let result = {add: false, edit: false, remove: false}
    let stockResults = await fetchStockBylabel(labelId)
    let preloadResults = await fetchPrefillByLabel(labelId)
    console.log(stockResults, preloadResults)
    if (stockResults.acknowledged && stockResults.data.length > 0){
        result.remove = true
    }
    if (preloadResults.acknowledged && preloadResults.data.length > 0){
        result.add = true
    }
    if (stockResults.acknowledged && preloadResults.acknowledged && stockResults.data.length === 0 && preloadResults.data.length === 0){
        result.add = true
    }

//     根据给予的标签号信息， 查找
//     Pollinglog中是否已经有该产品信息，则保留edit,remove，
//     如果没有，则：
//        Prefill中是否已经有该产品信息，则保留add,edit
//        如果两个表中均没有该产品信息，则保留add
    return result
}

function fetchStockBylabel(labelid = "...") {
    let url = "/api/v1/stocks"
    return new Promise((resolve, reject) => {
        fetch(`${url}?label=${labelid.length > 0 ? labelid : "..."}`)
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(error => reject(error));
    })
}
function fetchPrefillByLabel(labelid="...") {
    let url = "/api/v1/preload"
    return new Promise((resolve, reject) => {
        fetch(`${url}?label=${labelid.length > 0 ? labelid : "..."}`)
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(error => reject(error));
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
    let addButton = document.createElement("button")
    addButton.className = "btn btn-info mx-1"
    addButton.innerHTML = `<i class="ti ti-plus"></i> Add`
    let editButton = document.createElement("button")
    editButton.className = "btn btn-secondary mx-1"
    editButton.innerHTML = `<i class="ti ti-edit"></i> Edit`
    let removeButton = document.createElement("button")
    removeButton.className = "btn btn-danger mx-1"
    removeButton.innerHTML = `<i class="ti ti-trash"></i> Remove`
    buttonsLeft.append(addButton, editButton, removeButton)

    addButton.addEventListener("click", function (ev) {
        console.log(`Add Clicked`)
        
    })
    editButton.addEventListener("click", function (ev) {
        console.log(`Edit Clicked`)

    })
    removeButton.addEventListener("click", function (ev) {
        console.log(`Remove Clicked`)
        
    })
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
    elementWrap.append(cardBody)
    let displayStatus = await findStockStatus(element.item.productLabel)
    console.log(displayStatus)
    addButton.style = displayStatus.add ? "" : "display:none"
    editButton.style = displayStatus.edit ? "" : "display:none"
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



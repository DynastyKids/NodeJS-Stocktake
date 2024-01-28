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

    function scanQRCode() {
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
                createScanHistory(code.data)
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


function createScanHistory(qrCodeData) {
    let results = {action: true}
    let historyList = document.querySelector("#list_history")

    if (qrCodeData.includes("?item=")) {
        var decodedElement = decodeItemData(qrCodeData)
        let htmlBuildNode = buildInnerlistContent(decodedElement)
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
    let result = {addToStock: false, edit: false, remove: false}
    let stockResults = await fetchStockBylabel(labelId)
    let preloadResults = await fetchPrefillByLabel(labelId)
    console.log(stockResults, preloadResults)
//     根据给予的标签号信息， 查找
//     Pollinglog中是否已经有该产品信息，如果有，则删除Add To Stock按钮，
//     如果没有，则：
//        Prefill中是否已经有该产品信息，如果有，则删除AddToStock按钮
//        如果两个表中均没有该产品信息，则
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

function buildInnerlistContent(element) {
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

    })
    removeButton.addEventListener("click", function (ev) {

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
    /*  后续需要添加按钮
    *   如果产品不在库存中，提供按钮，允许直接添加到Stock或者PreloadLog(默认5s内执行)
    *   如果产品已经在pollinglog
    *       如果产品未删除，则提示是否从库存中移除该产品（默认选项，如果5s内未操作也触发执行）
    *       如果产品已经删除，则提示已经移除，不提供其他操作
    *   所有扫描条目尾巴需要添加删除当前记录按钮
    * */
    findStockStatus(element.item.productLabel)

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



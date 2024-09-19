let scanHistory = []
let productList = []
document.addEventListener("DOMContentLoaded", function (ev) {
    if (window.location.protocol === "http:") {
        let warningModal = new bootstrap.Modal(document.querySelector("#staticBackdropHTTPS"), {focus: true})
        warningModal.show()
    }
    document.querySelector("#warningModal_btnConfirm").addEventListener("click", (ev) => {
        const redirectUrl = "https://" + window.location.hostname + ":3001" + window.location.pathname;
        window.location.replace(redirectUrl)
    })
})

$(document).ready(async function () {
    await fetchProducts()
    const video = document.querySelector('#qr-video');
    const canvasElement = document.createElement('canvas');
    const canvas = canvasElement.getContext('2d', {willReadFrequently: true});
    let currentText = document.querySelector("#list_current")
    let animationFrameId;

    function drawLine(begin, end, color) {
        canvas.beginPath();
        canvas.moveTo(begin.x, begin.y);
        canvas.lineTo(end.x, end.y);
        canvas.lineWidth = 4;
        canvas.strokeStyle = color;
        canvas.stroke();
    }

    navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}})
        .then(function (stream) {
            video.srcObject = stream;
            video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
            video.play();
            animationFrameId = requestAnimationFrame(scanQRCode)
        })
        .catch(function (error) {
            console.error("Cannot access the Camera", error);
            currentText.textContent = 'Error: Cannot access the camera';
        });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            window.cancelAnimationFrame(animationFrameId);
        } else {
            animationFrameId = requestAnimationFrame(scanQRCode)
        }
    });

    async function scanQRCode() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvasElement.height = video.videoHeight;
            canvasElement.width = video.videoWidth;
            canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
            const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            currentText.textContent = 'Awaiting to scan';

            if (code) {
                drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#00D73C");
                drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#00D73C");
                drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#00D73C");
                drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#00D73C");
                currentText.textContent = `${code.data}`;
                await createScanHistory(code.data)
            }
        }
        animationFrameId = requestAnimationFrame(scanQRCode);
    }
});

async function createScanHistory(qrCodeData) {
    let results = {action: true}
    let historyList = document.querySelector("#list_history")
    if (qrCodeData.includes("?item=")) {
        //如果扫描到了带item关键字的，则查找过去stock是否有该条目，如果有则需要修正已经在框内的数据
        var decodedElement = decodeItemData(qrCodeData)
        let htmlBuildNode = await historyItem_createcard(decodedElement)
        htmlBuildNode.setAttribute("data-bs-labelid", decodedElement.item.productLabel)
        let listOfCards = historyList.querySelectorAll(".card")
        try {
            if (listOfCards.length > 0) {
                /*  当有新扫描的卡片：
                *   卡片已经扫描过（商品存在于数据库内）
                *       View:给操作选项
                *       Delete Ignore：如果商品已经被删除，则不再操作，给出secondary按钮可以更新删除时间
                *       Delete Override：如果商品已经被删除，则更新删除时间，给出按钮可以取消此动作
                *   卡片未扫描过（商品不在数据库内）
                *       View：仅查看商品内容，给用户选择是否添加/移除
                *       Delete: 添加后并更新删除时间
                * */
                var foundItem = false
                for (let i = 0; i < listOfCards.length; i++) {
                    try {
                        var cardNode = listOfCards[i]
                        if (cardNode.dataset['bsLabelid'] === decodedElement['item']['productLabel']) { // 历史记录里面找到了这张卡，将该节点删除，然后按照新扫描流程再来一次
                            foundItem = true // 如果是第0个则不添加
                            if (i >= 1) {
                                cardNode.parentNode.removeChild(cardNode)
                                foundItem = false
                            }
                        }
                    } catch (e) {
                        console.error("Error when processing card information:", e)
                    }
                }
                if (!foundItem) {
                    historyList.insertAdjacentElement('afterbegin', htmlBuildNode)
                    scanHistory.push(decodedElement.item)
                    scanAction(decodedElement.item.productLabel)
                }
            } else {  //历史列表为空
                historyList.insertAdjacentElement('afterbegin', htmlBuildNode)
                scanHistory.push(decodedElement.item)
                scanAction(decodedElement.item.productLabel)
            }
        } catch (e) {
            console.error("Scan Action: Element does not have label. ", e)
        }
    }
    return results
}

function scanAction(stockLabelId = "") {
    var action = "view"
    document.querySelectorAll("input[name='defaultActionRadio']").forEach(eachInput => {
        if (eachInput.checked) {
            action = eachInput.value
        }
    })
    try {
        if (stockLabelId.length > 0 && action === "delete") { //     当动作核实为delete且label存在后
            let result = fetchStockBylabel_lazy(stockLabelId)
            let targetElement = document.querySelector(`div[data-bs-labelid="${stockLabelId}"]`)
            let autoRemoveDiv = document.createElement("div")
            autoRemoveDiv.innerHTML = "Default delete action: <span class='historyItem_countdown'></span>"
            targetElement.querySelector(".historyItem_bodyDiv").append(autoRemoveDiv)
            actionCountdown(autoRemoveDiv.querySelector(".historyItem_countdown"))
        }
    } catch (e) {
        console.error("Error when processing on scan action")
    }
}

function actionCountdown(displayElement, duration = 5) {
    // Action Countdown 仅通过扫码后对应的Action自动触发
    //     如果该label存在于系统中
    //          这是第一次移除，则update removed = 1 & removeTime
    //          如果label已经removed = 1且有remove Time (打断计时器)
    //              倒计时10s，默认不做任何操作
    //              如果用户需要更新移除时间，点击按钮后自动更新状态，则update removed = 1 & removeTime
    //     如果该label不存在，则需要upsert添加，设置全参数
    //     给对应的remove按钮添加倒计时，如果倒计时内没有点击取消，则执行remove操作
    let cancelButton = document.createElement("a")
    cancelButton.textContent = "Cancel"
    cancelButton.href = "#"
    displayElement.append(cancelButton)
    cancelButton.addEventListener('click', () => {
        clearInterval(countdownInterval);
        displayElement.textContent = 'Cancelled';
        cancelButton.remove();
    });

    let timer = duration
    let countdownInterval = setInterval(() => {
        displayElement.textContent = `${parseInt(timer % 60, 10)} seconds`;
        displayElement.append(cancelButton)

        if (--timer < 0) {
            try {
                clearInterval(countdownInterval);
                let originalCard = displayElement.parentNode.parentNode
                let elementTarget = {}
                var foundInPrefill = false
                // QR Station Auto remove
                removeObjectKeys.forEach(eachKey => {
                    if (originalCard.querySelector(`td[data-targetfield="${eachKey}"]`)) {
                        elementTarget[eachKey] = originalCard.querySelector(`td[data-targetfield='${eachKey}']`).textContent
                    }
                })
                fetchPrefillByLabel(elementTarget.productLabel).then(prefillResult => {
                    if (prefillResult.data.length >= 0) { //     不在现有产品列表和prefill中，
                        foundInPrefill = true
                        removePreloadByLabel(elementTarget.productLabel).then(preloadResult => {
                            if (preloadResult.acknowledged && preloadResult.matchedCount === 1 && preloadResult.modifiedCount === 1) {
                                createAlert("success", "Product has been successfully removed")
                            }
                        })
                    }
                })
                fetchStockBylabel(elementTarget.productLabel).then(async stockResult => {
                    if (stockResult.data.length <= 0 && !foundInPrefill) {//     不在现有产品列表中
                        let result = async () => {
                            updateStockByLabel(elementTarget)
                        }
                        await result()
                    }
                    removeStockByLabel(elementTarget.productLabel).then(stockResult => {
                        if (stockResult.acknowledged && stockResult.matchedCount === 1 && stockResult.modifiedCount === 1) {
                            createAlert("success", "Product has been successfully removed")
                        }
                    })
                })
                // QR Station Auto remove
                displayElement.textContent = 'Item removed';
                // 如果倒计时结束，移除取消按钮，设置Remove按钮为disabled
                if (displayElement.nextSibling) {
                    displayElement.parentNode.removeChild(displayElement.nextSibling);
                }
                displayElement.parentNode.parentNode.querySelector(".historyItem_actionDelete").disabled = true
            } catch (e) {
                console.error("Error occured when actions taken after countdown:", e)
            }
        }
    }, 1000)
}

function fetchStockBylabel(labelid = "") {
    return new Promise((resolve, reject) => {
        fetch(`/api/v1/stocks?&label=${labelid && labelid.length > 0 ? labelid : "..."}`, {timeout: 10000})
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(error => reject(error));
    })
}

function fetchPrefillByLabel(labelid = "") {
    return new Promise((resolve, reject) => {
        fetch(`/api/v1/preload?label=${labelid && labelid.length > 0 ? labelid : "..."}`, {timeout: 10000})
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(error => reject(error));
    })
}

let lastRequest = {
    pollinglog: {requestLabelId: "", requestTime: "", replyObject: {}},
    prefill: {requestLabelId: "", requestTime: "", replyObject: {}}
}
let fetchFrequency = 3000  //针对同一label的重新请求的CD时间

document.querySelector("#fetch-frequency input").addEventListener("change", (ev) => {
    fetchFrequency = parseInt(ev.target.value)
    document.querySelector("#fetch-frequency span").textContent = `${(ev.target.value / 1000)} second`
})

document.querySelector('#camerazoom-div input').addEventListener('change', (ev) => {
    document.querySelector("#qr-video").style.transform = `scale(${ev.target.value})`;
    document.querySelector("#camerazoom-div span").textContent = `${(ev.target.value)}x`
})

function fetchStockBylabel_lazy(labelId) { // 如果上一次和本次的时间相差不超过3s，(避免DDOS)
    let currentTime = new Date().getTime()
    if (labelId === lastRequest.pollinglog.requestLabelId && Math.abs(currentTime - lastRequest.pollinglog.requestTime) <= fetchFrequency) {
        return lastRequest.pollinglog.replyObject
    }
    lastRequest.pollinglog.requestLabelId = labelId
    lastRequest.pollinglog.requestTime = new Date().getTime()
    lastRequest.pollinglog.replyObject = fetchStockBylabel(labelId)
    return lastRequest.pollinglog.replyObject
}

function fetchPrefillByLabel_lazy(labelId) {
    let currentTime = new Date().getTime()
    if (labelId === lastRequest.prefill.requestLabelId && Math.abs(currentTime - lastRequest.prefill.requestTime) <= fetchFrequency) {
        return lastRequest.prefill.replyObject
    }
    lastRequest.prefill.requestLabelId = labelId
    lastRequest.prefill.requestTime = new Date().getTime()
    lastRequest.prefill.replyObject = fetchPrefillByLabel(labelId)
    return lastRequest.prefill.replyObject
}

function fetchProducts(forced = false) {
    if (forced || productList.length <= 0) {
        return new Promise((resolve, reject) => {
            fetch("/api/v1/products?removed=1", {timeout: 10000})
                .then(response => response.json())
                .then(data => {
                    productList = data.data
                    resolve(data)
                })
                .catch(error => {
                    console.error("Error when fetching Products List:", error)
                    createAlert("warning", "Products list didn't fetched successfully", 3000)
                    reject(error)
                })

        })
    }
    return productList
}

async function historyItem_createcard(element) {
    let elementWrap = document.createElement("div")
    elementWrap.className = "col-12 card mb-1 historyItem_mainDiv"
    let cardBody = document.createElement("div")
    cardBody.className = "card-body historyItem_bodyDiv"
    let textarea = document.createElement("table")
    textarea.className = "table historyItem_bodyTable"
    let scanTimeElement = document.createElement("tr")
    scanTimeElement.innerHTML = `<td>Scan Time:</td><td>${new Date().toLocaleString()}</td>`
    textarea.append(scanTimeElement)
    let insertKeys = [
        {key: "productLabel", name: "Product Label"},
        {key: "productCode", name: "Product Code"},
        {key: "productName", name: "Product Name"},
        {key: "quantity", name: "Quantity"},
        {key: "quantityUnit", name: "Unit"},
        {key: "bestbefore", name: "Best before"},
        {key: "POnumber", name: "Purchase order Ref"},
        {key: "seq", name: "Sequence"},
    ]
    for (const eachElement of insertKeys) {
        let insertElement = document.createElement("tr")
        insertElement.className = "historyItem_RowElement"
        if (element.item[eachElement.key]) {
            let titleCell = document.createElement("td")
            titleCell.className = `historyItem_cell_${eachElement.key}`
            titleCell.textContent = `${eachElement.name}:`
            let valueCell = document.createElement("td")
            valueCell.className = `historyItem_value_${eachElement.key}`
            valueCell.setAttribute("data-targetfield", eachElement.key)
            valueCell.textContent = `${element.item[`${eachElement.key}`]}`

            insertElement.append(titleCell, valueCell)
            textarea.append(insertElement)
        }
    }

    let buttonsDiv = document.createElement("div")
    buttonsDiv.className = "card-footer text-muted historyItem_buttonDiv"
    let divideLine = document.createElement("hr")

    let buttonsRight = document.createElement("div")
    let rowdeleteButton = document.createElement("button")
    rowdeleteButton.className = "btn btn-warning mx-1 historyItem_actionRowDelete"
    rowdeleteButton.innerHTML = `<i class="ti ti-minus"></i>`
    rowdeleteButton.addEventListener("click", function (ev) {
        elementWrap.remove()
    })
    buttonsRight.append(rowdeleteButton)

    let buttonsLeft = document.createElement("div")
    let editButton = document.createElement("button")
    editButton.className = "btn btn-primary mx-1 btn_edit historyItem_actionEdit"
    editButton.innerHTML = `<i class="ti ti-edit"></i> Update`
    editButton.setAttribute("data-bs-toggle", "modal")
    editButton.setAttribute("data-bs-target", "#editModal")
    editButton.setAttribute("data-bs-labelid", element.item.productLabel)

    let removeButton = document.createElement("button")
    removeButton.className = "btn btn-danger mx-1 btn_delete historyItem_actionDelete"
    removeButton.innerHTML = `<i class="ti ti-trash"></i> Remove`
    removeButton.setAttribute("data-bs-labelid", element.item.productLabel)
    removeButton.setAttribute("data-bs-toggle", "modal")
    removeButton.setAttribute("data-bs-target", "#removeModal")
    buttonsLeft.className = "cardLeftOptions"

    findStockStatus(element.item.productLabel).then((displayStatus) => {
        try {  //检查产品是否已经被核销 (data.stock>0 且removed为1)：如果已经核销则不再处理(给出更新时间按钮)，并给出提示文本
            buttonsLeft.innerHTML = ""
            // 无论任何情况下，均提供EditButton选项，
            buttonsLeft.append(editButton)
            if (displayStatus.stock.length > 0 && displayStatus.stock[0].removed === 1) { // 产品已经不在库内，仅提供文字解释
                buttonsLeft.innerHTML += `<small>Removed since ${new Date(displayStatus.stock[0].removeTime).toLocaleDateString()}</small>`
                //     后续考虑增加revert功能
            } else { //如果产品没被删除，均可以添加Remove Btn（未添加产品按照直接添加后删除处理）
                buttonsLeft.append(removeButton)
            }
        } catch (e) {
            console.error("Error occurred when processing stock status for:", element.item.productLabel, e)
        }
    })

    buttonsDiv.append(buttonsLeft, buttonsRight)
    buttonsDiv.className = "d-flex justify-content-between historyItem_actionDiv"
    cardBody.append(textarea, divideLine, buttonsDiv)

    elementWrap.append(cardBody)
    return elementWrap
}

function findStockStatus(labelId) { // Modified with lazy load method Mar24
    return new Promise((resolve, reject) => {
        try {
            let result = {preload: [], stock: []}
            fetchStockBylabel_lazy(labelId).then((stockResults) => {
                if (stockResults.acknowledged && stockResults.data.length > 0) {
                    result.stock = stockResults.data
                }
                fetchPrefillByLabel_lazy(labelId).then((preloadResults) => {
                    if (preloadResults.acknowledged && preloadResults.data.length > 0) {
                        result.preload = preloadResults.data
                    }
                    resolve(result)
                }).catch((e) => {
                    console.error("Error when finding preloads: ", e)
                    reject(e)
                })
            }).catch((e) => {
                console.error("Error when finding Stocks: ", e)
                reject(e)
            })
        } catch (e) {
            reject(e)
        }
    })
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
document.querySelector("#editModal").addEventListener("show.bs.modal", (ev) => {
    editModalObject = {}
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-labelid")
    editModal.querySelector("#editModal_submitBtn").disabled = true
    editModal.querySelector("#editModal_submitBtn").textContent = "Submit"
    editModal.querySelector("#editModal .modal-title").textContent = `Loading Product Information`
    editModal.querySelector("#modelEditCheckRemoved").checked = false
    editModal.querySelector("#group_removeTime").setAttribute("style", "display: none")
    editModal.querySelectorAll("input").forEach(eachInput => {
        if (["text", "number", "date", "datetime-local"].includes(eachInput.type)) {
            eachInput.value = ""
        }
        if (eachInput.type === "checkbox") {
            eachInput.checked = false
        }
        eachInput.disabled = true
    })
    editModal.querySelector("textarea").value = ""
    try {  // Part 1: 使用既有数据填充(从标签读取到的)
        for (const scanHistoryElement of scanHistory) {
            if (scanHistoryElement["productLabel"] === requestLabelId) {
                for (const elementKey in scanHistoryElement) {
                    try {
                        editModal.querySelector(`input[data-bs-targetfield="${elementKey}"]`).value = scanHistoryElement[elementKey]
                        if (["grossPrice", "unitPrice"].includes(elementKey)) {
                            editModal.querySelector(`input[data-bs-targetfield="${elementKey}"]`).value = scanHistoryElement[elementKey]['$numberDecimal']
                        }
                        if (["calcTurnover", "displayFIFO", "removed"].includes(elementKey)) {
                            editModal.querySelector(`input[data-bs-targetfield="${elementKey}"]`).checked = scanHistoryElement[elementKey] === 1
                        }
                    } catch (e) {  //     Field Does not exist, skipped
                        console.warn(`Input field ${elementKey} not found. `, e)
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error when filling table info to Modal:", e)
    }

    try {      // Step 2: 获取产品通用信息(unitPrice, GrossPrice计算，获取FIFO和Turnover开关标签)
        for (const productListElement of productList) {
            if (productListElement['productCode'] === editModal.querySelector(`input[data-bs-targetfield="productCode"]`).value) {
                for (const elementKey of ["calcTurnover", "displayFIFO"]) {
                    if (productListElement.hasOwnProperty(elementKey)) {
                        editModal.querySelector(`input[data-bs-targetfield="${elementKey}"]`).checked = productListElement[elementKey] === 1
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error when fetching product information: ", e)
    }

    try {  // Step 3: 使用线上数据填充(从数据库获取到的，如果数据有变化，优先使用线上数据)
        fetchStockBylabel(requestLabelId).then(response => {
            if (response.data.length > 0) {
                let stockInfo = response.data[0]
                editModal.querySelector("#editModalLabel").textContent = `Edit Stock Information - ${stockInfo["productCode"]}: ${stockInfo["productLabel"].slice(-7).toUpperCase()}`
                for (const elementKey in stockInfo) {
                    try {
                        if (elementKey === "comments") {
                            editModal.querySelector("textarea").value = stockInfo[elementKey]
                        }
                        if (["calcTurnover", "displayFIFO", "removed"].includes(elementKey)) {
                            editModal.querySelector(`input[data-bs-targetfield="${elementKey}"]`).checked = stockInfo[elementKey] === 1
                        } else {
                            editModal.querySelector(`input[data-bs-targetfield="${elementKey}"]`).value = stockInfo[elementKey]
                        }
                    } catch (e) {                            //     Field Does not exist, skipped
                        console.warn(`Input field ${elementKey} not found. `, e)
                    }
                }
            }
        }).catch(err => {
            console.error("Error when fetching stock information by label: ", err)
        })
    } catch (e) {
        console.warn(`Error when attempting loading database stock info for: ${requestLabelId}. Error:`, e)
    }

    // Step 4: 解除所有Disabled field
    editModal.querySelectorAll("input").forEach(eachInput => {
        eachInput.disabled = false
    })
    editModal.querySelector("#editModal_submitBtn").disabled = false
})

document.querySelector("#modelEditCheckRemoved").addEventListener("change", (ev) => {
    if (ev.target.checked) {
        document.querySelector("#group_removeTime").removeAttribute("style")
    } else {
        document.querySelector("#group_removeTime").setAttribute("style", "display: none")
    }
})

function fillModalEditByObject(elementObject) {
    try {
        Object.keys(elementObject).forEach(eachKey => {
            var selectedElement = document.querySelector(`input[data-bs-targetfield=${eachKey}]`)
            if (eachKey === "quarantine" && selectedElement && selectedElement.hasOwnProperty("checked") && selectedElement.checked) {
                selectedElement.checked = true
            } else if (selectedElement) {
                selectedElement.value = elementObject[eachKey]
            }
            if (eachKey === "productLabel") {
                if (!elementObject.hasOwnProperty("createTime") || !elementObject.createTime) {
                    document.querySelector("#modelEditCreateTime").value = `${elementObject.productLabel.substring(0, 4)}-${elementObject.productLabel.substring(4, 6)}-${elementObject.productLabel.substring(6, 8)} 12:00`
                }
            }
        })
    } catch (e) {
        console.error("Error when filling modal edit: ", e)
    }
}

// Submit使用stock/update
// 操作顺序，如果产品是已经在库内，则更新，对比差异，保存；如果在preload，则先提交，后删除preload原有条目，如果为新产品，则直接upsert保存
editModal.querySelector("#editModal_submitBtn").addEventListener("click", async function () {
    let submitItem = editModalObject
    editModal.querySelectorAll("input[data-bs-targetfield]").forEach(eachInput => {
        if (eachInput.type === "text" || eachInput.type === "number" || eachInput.type === "date" || eachInput.type === "datetime-local") {
            if (eachInput.type === "number") {
                submitItem[eachInput.getAttribute("data-bs-targetfield")] = eachInput.value ? parseInt(eachInput.value) : null
            } else if (eachInput.type === "datetime-local" || eachInput.type === "date") {
                submitItem[eachInput.getAttribute("data-bs-targetfield")] = eachInput.value ? new Date(eachInput.value) : null
            } else {
                submitItem[eachInput.getAttribute("data-bs-targetfield")] = eachInput.value ? String(eachInput.value) : null
            }
        }
        if (eachInput.type === "checkbox" && eachInput.checked) {
            submitItem.removed = editModal.querySelector("#modelEditCheckRemoved").checked ? 1 : 0
            if (submitItem.removed !== 1) {
                submitItem.removeAttribute("removeTime")
            }
        }
        if (eachInput.type === "radio" && eachInput.checked) {
            submitItem.quarantine = parseInt(editModal.querySelector('input[name="modalEdit_quarantineRatio"]:checked').value)
        }
    })
    if (editModal.querySelector("textarea").value.length > 0) {
        submitItem.comments = editModal.querySelector("textarea").value
    }
    for (const [submitItemKey, value] of Object.entries(submitItem)) {
        if (value === null) {
            delete submitItem[submitItemKey]
        }
    }

    pushElementToStock(submitItem).then((results) => {
        createAlert("success", "Product has been successfully updated")
        bootstrap.Modal.getInstance(editModal).hide()
        var element = editModal.querySelector(`div[data-bs-labelid='${submitItem.productLabel}']`)
        if (element && element.parentNode) {
            element.parentNode.removeChild(element)
        }
    }).catch((e) => {
        console.error("Error occurred when pushing element to stock:",e)
    })
})

function pushElementToStock(stockObject) {
    return new Promise((resolve, reject) => {
        fetch("/api/v1/stocks/update", {
            method: "POST",
            mode: 'cors',
            cache: 'no-cache',
            headers: {'Content-Type': 'application/json'},
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

let removeModal = document.querySelector("#removeModal")
let removeModalRelatedBtn = null;
let removeObject = {}
var removeObjectKeys = ["productCode", "productName", "productLabel", "quantity", "quantityUnit", "bestbefore", "POnumber"]
removeModal.addEventListener("show.bs.modal", function (ev) {
    removeModalRelatedBtn = ev.relatedTarget
    removeModal.querySelector(".modal-body p").textContent = `Fetching item Information, please wait...`
    removeModal.querySelector("#removeModal_text").textContent = "Ready"
    try {
        var itemId = ev.relatedTarget.getAttribute("data-bs-labelid")
        removeObject = {}
        removeLabel = itemId
        removeModal.querySelector(".modal-body p").textContent = `Are you sure to remove ${itemId} from system?`
        fetchStockBylabel(itemId).then((result) => {
            if (result.data.length > 0) {
                removeObject = result.data[0]
                removeModal.querySelector(".modal-body p").innerHTML = `Are you sure to remove ${removeObject.productCode ? removeObject.productCode : ""} : ${removeObject.productName ? removeObject.productName : ""} from stocks?<hr>` +
                    `<p>${removeObject.productCode ? "Product: " + removeObject.productCode : ""} ${removeObject.productName ? removeObject.productName : ""}</p>` +
                    `<p>${removeObject.productLabel ? "Label: " + removeObject.productLabel : ""}</p>` +
                    `<p>${removeObject.quantity ? "Quantity: " + removeObject.quantity + " " + removeObject.quantityUnit : ""}</p>` +
                    `<p>${removeObject.bestbefore ? "Best Before: " + new Date(removeObject.bestbefore).toLocaleDateString() : ""}</p>` +
                    `<p>${removeObject.POnumber ? "Purchase Ref: " + removeObject.POnumber : ""}</p>`
                removeModal.querySelector("#removeModal_btnConfirm").disabled = false
                removeModal.querySelector("#removeModal_btnConfirm").textContent = "Confirm"
            } else {
                fetchPrefillByLabel(itemId).then((prefillResult) => {
                    if (prefillResult.data.length > 0) {
                        removeObject = prefillResult.data[0]
                        removeModal.querySelector(".modal-body p").innerHTML = `Are you sure to remove ${removeObject.productCode ? removeObject.productCode : ""} : ${removeObject.productName ? removeObject.productName : ""} from stocks?<hr>` +
                            `<p>${removeObject.productCode ? "Product: " + removeObject.productCode : ""} ${removeObject.productName ? removeObject.productName : ""}</p>` +
                            `<p>${removeObject.productLabel ? "Label: " + removeObject.productLabel : ""}</p>` +
                            `<p>${removeObject.quantity ? "Quantity: " + removeObject.quantity + " " + removeObject.quantityUnit : ""}</p>` +
                            `<p>${removeObject.bestbefore ? "Best Before: " + new Date(removeObject.bestbefore).toLocaleDateString() : ""}</p>` +
                            `<p>${removeObject.POnumber ? "Purchase Ref: " + removeObject.POnumber : ""}</p>`
                        removeModal.querySelector("#removeModal_btnConfirm").disabled = false
                        removeModal.querySelector("#removeModal_btnConfirm").textContent = "Confirm"
                    } else { //     不存在于Stock,Prefill，则尝试直接使用上次解析的文本
                        let originalCard = ev.relatedTarget.parentNode.parentNode.parentNode
                        removeObject = {}
                        removeObjectKeys.forEach(eachKey => {
                            if (originalCard.querySelector(`td[data-targetfield="${eachKey}"]`)) {
                                removeObject[eachKey] = originalCard.querySelector(`td[data-targetfield='${eachKey}']`).textContent
                            }
                        })
                        removeModal.querySelector(".modal-body p").innerHTML = `Are you sure to remove ${removeObject.productCode ? removeObject.productCode : ""} : ${removeObject.productName ? removeObject.productName : ""} from stocks?<hr>` +
                            `<p>${removeObject.productCode ? "Product: " + removeObject.productCode : ""} ${removeObject.productName ? removeObject.productName : ""}</p>` +
                            `<p>${removeObject.productLabel ? "Label: " + removeObject.productLabel : ""}</p>` +
                            `<p>${removeObject.quantity ? "Quantity: " + removeObject.quantity + " " + removeObject.quantityUnit : ""}</p>` +
                            `<p>${removeObject.bestbefore ? "Best Before: " + new Date(removeObject.bestbefore).toLocaleDateString() : ""}</p>` +
                            `<p>${removeObject.POnumber ? "Purchase Ref: " + removeObject.POnumber : ""}</p>`
                        removeModal.querySelector("#removeModal_btnConfirm").disabled = false
                        removeModal.querySelector("#removeModal_btnConfirm").textContent = "Confirm"
                    }
                })
            }
        })
    } catch (e) {
        removeModal.querySelector(".modal-body p").textContent = `Fetching item information failed. Check console for more info.`
        console.error(`Error when fetching information for ${itemId}:`,e)
    }
})

removeModal.querySelector("#removeModal_btnConfirm").addEventListener("click", async function (ev) {
    if (removeObject.hasOwnProperty("productLabel")) {
        removeModal.querySelector("#removeModal_text").textContent = "Processing request..."
        removeModal.querySelector("#removeModal_btnConfirm").disabled = true
        removeModal.querySelector("#removeModal_btnConfirm").textContent = "Processing"
        try {
            var foundInPrefill = false
            fetchPrefillByLabel(removeObject.productLabel).then(prefillResult => {
                if (prefillResult.data.length >= 0) { //     不在现有产品列表和prefill中，
                    foundInPrefill = true
                    removePreloadByLabel(removeObject.productLabel).then(preloadResult => {
                        removeModal.querySelector("#removeModal_text").textContent = "Ready"
                        if (preloadResult.acknowledged && preloadResult.matchedCount === 1 && preloadResult.modifiedCount === 1) {
                            createAlert("success", "Product has been successfully removed")
                            // document.querySelector(`div[data-bs-labelid="${removeObject.productLabel}"] .cardLeftOptions`).innerHTML=""
                            removeModalRelatedBtn.textContent = `Removed`
                            removeModalRelatedBtn.disabled = true
                        }
                    })
                }
            })

            fetchStockBylabel(removeObject.productLabel).then(async stockResult => {
                if (stockResult.data.length <= 0 && !foundInPrefill) {//     不在现有产品列表中
                    let result = async () => {
                        updateStockByLabel(removeObject)
                    }
                    await result()
                }

                removeStockByLabel(removeObject.productLabel).then(stockResult => {
                    removeModal.querySelector("#removeModal_text").textContent = "Ready"
                    if (stockResult.acknowledged && stockResult.matchedCount === 1 && stockResult.modifiedCount === 1) {
                        createAlert("success", "Product has been successfully removed")
                        // document.querySelector(`div[data-bs-labelid="${removeObject.productLabel}"] .cardLeftOptions`).innerHTML=""
                        removeModalRelatedBtn.textContent = `Removed`
                        removeModalRelatedBtn.disabled = true
                    }
                })
            })
        } catch (e) {
            console.error("Error occured when attempting to remove stock:", e)
        } finally {
            bootstrap.Modal.getInstance(removeModal).hide()
        }
    } else {
        removeModal.querySelector("#removeModal_text").textContent = "Error, not found label information"
    }
})

function updateStockByLabel(item = {}) {
    return new Promise((resolve, reject) => {
        fetch('/api/v1/stocks/update', {
            method: "POST",
            cache: 'no-cache',
            headers: {'Content-Type': 'application/json'},
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({"item": item})
        })
            .then(response => response.json())
            .then(data => resolve(data))
            .catch((error) => reject(error));
    })
}

function removeStockByLabel(productLabel = "") {
    return new Promise((resolve, reject) => {
        fetch('/api/v1/stocks/remove', {
            method: "POST",
            cache: 'no-cache',
            headers: {'Content-Type': 'application/json'},
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({item: {productLabel: productLabel}})
        })
            .then(response => response.json())
            .then(data => resolve(data))
            .catch((error) => reject(error));
    })
}

function removePreloadByLabel(productLabel = "") {
    return new Promise((resolve, reject) => {
        fetch('/api/v1/preload/remove', {
            method: "POST",
            cache: 'no-cache',
            headers: {'Content-Type': 'application/json'},
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({"productLabel": productLabel})
        })
            .then(response => response.json())
            .then(data => resolve(data))
            .catch((error) => reject(error));
    })
}

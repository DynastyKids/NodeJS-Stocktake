let currentStocktable = new DataTable('#currentStockTable', {
    responsive: true,
    bPaginate: false,
    searching: false,
    iDisplayLength: -1,
    order: [[2, 'asc']],
    columnDefs: [
        {
            target: 2,
            visible: false,
            searchable: false
        },
    ],
    scrollX: true
});
let historyStockTable = new DataTable('#historyStockTable', {
    responsive: true,
    pageLength: 10,
    lengthMenu: [[10, 15, 25, 50, 100, -1], [10, 15, 25, 50, 100, 'All']],
    iDisplayLength: -1,
    order: [[2, 'asc']],
    columnDefs: [
        {
            target: 2,
            visible: false,
            searchable: false
        },
    ],
    scrollX: true
});

let stockInformations={current:[],history:[]}

document.addEventListener("DOMContentLoaded", function () {
    const params = new URLSearchParams(window.location.search);
    const location = params.get('location');

        if (!location) {
            createAlert("info","Location parameter does not exist, redirecting to stock homepage.", 5000)
            setTimeout(function() {
                window.location.href = 'stocks.html';
            }, 5000);
        } else {
            console.log(`Location is ${location}`);
            document.querySelector("h1").textContent = `Stock Information for [${location.toUpperCase()}]`
            document.querySelector("#loadingAnimation").style = "display: flex"
        fetchStocksFromAPI(location).then((result)=>{
            console.log(result)
            if (result.acknowledged && result.data.length > 0){
                result.data.forEach(eachRow=>{
                    if (eachRow.removed === 0){
                        stockInformations.current.push(eachRow)
                    } else {
                        stockInformations.history.push(eachRow)
                    }
                })
                fetchStocksList()
            }
        }).catch((e)=>{
            console.error("Error when fetching data: ",e)
        })
    }
});

function fetchStocksFromAPI(location = ""){
    return new Promise((resolve, reject) =>{
        fetch(`/api/v1/stocks?location=${location}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok ' + response.statusText);
                }
                return response.json();
            })
            .then(data => resolve(data))
            .catch(error => reject(error));
    })
}

function fetchStocksList() {
    currentStocktable.clear().draw()
    stockInformations.current.forEach(eachRow=>{
        currentStocktable.row.add([
            `<a href="#" data-bs-ponumber="${(eachRow.productCode ? eachRow.productCode : "")}">${(eachRow.productCode ? eachRow.productCode : "")}</a>`
            + `${eachRow.productName ? '<br>' + eachRow.productName : ''}`,
            `${eachRow.quantity ? eachRow.quantity + (eachRow.quantityUnit ? ' ' + eachRow.quantityUnit : '') : ''}` + `${eachRow.shelfLocation ? '<br>' + eachRow.shelfLocation : ''}`,
            `${eachRow.shelfLocation ? eachRow.shelfLocation : ''}`,
            `${eachRow.bestbefore ? eachRow.bestbefore : ''}`,
            `${eachRow.productLabel ? eachRow.productLabel : ''}` + `<br>` +
            `<a href="#" data-bs-ponumber="${(eachRow.POnumber ? eachRow.POnumber : "")}">${(eachRow.POnumber ? eachRow.POnumber : "")}</a>`,
            `<a href="#" class="table_actions editModal" data-bs-toggle="modal" data-bs-target="#editModal" data-bs-labelId="${eachRow.productLabel}">View/Edit</a>` + `<br>` +
            `<a href="#" class="table_actions removeModal" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-labelId="${eachRow.productLabel}">Remove</a>`,
        ]).draw(false)
    })

    historyStockTable.clear().draw()
    stockInformations.history.forEach(eachRow=>{
        historyStockTable.row.add([
            `<a href="#" data-bs-ponumber="${(eachRow.productCode ? eachRow.productCode : "")}">${(eachRow.productCode ? eachRow.productCode : "")}</a>`
            + `${eachRow.productName ? '<br>' + eachRow.productName : ''}`,
            `${eachRow.quantity ? eachRow.quantity + (eachRow.quantityUnit ? ' ' + eachRow.quantityUnit : '') : ''}` + `${eachRow.shelfLocation ? '<br>' + eachRow.shelfLocation : ''}`,
            `${eachRow.shelfLocation ? eachRow.shelfLocation : ''}`,
            `${eachRow.bestbefore ? eachRow.bestbefore : ''}`,
            `${eachRow.productLabel ? eachRow.productLabel : ''}` + `<br>` +
            `<a href="#" data-bs-ponumber="${(eachRow.POnumber ? eachRow.POnumber : "")}">${(eachRow.POnumber ? eachRow.POnumber : "")}</a>`,
            ``,
        ]).draw(false)
    })
    
    document.querySelector("#loadingAnimation").style = "display: none"
}

let currentEditModalItem = {}
let editModal = document.querySelector("#editModal")
editModal.addEventListener("show.bs.modal", async function (ev) {
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-labelId")
    editModal.querySelector("#editModal_labelId").value = requestLabelId
    editModal.querySelector("#editModal_btnSubmit").textContent = "Submit"
    editModal.querySelector(".modal-title").textContent = `Loading Product Information`
    editModal.querySelector("#editModal_btnDelete").setAttribute("data-bs-labelId", requestLabelId)
    let stocksResponse =  await fetchStockByLabelid(requestLabelId)
    if (stocksResponse.acknowledged && stocksResponse.data.length>=0){
        let stockInfo = stocksResponse.data
        if (Array.isArray(stockInfo) && stockInfo.length > 0) {
            currentEditModalItem = stockInfo[0]
            writeModalEdit(stockInfo[0])
            editModal.querySelector("#editModal_btnSubmit").disabled = false
        }
    }
})
editModal.querySelector("#editModal_btnSubmit").addEventListener("click", async (ev) => {
    editModal.querySelector("#editModal_btnSubmit").disabled = true
    editModal.querySelector("#editModal_btnSubmit").textContent = "Updating"
    let updateElement = readModalEdit()
    updateElement.productLabel = currentEditModalItem.productLabel
    updateElement.loggingTime = new Date()

    // 2024 JAN update: 如果数据发生了变化，需要添加记录到Changelog中，原有的locationRecords不再使用, 更新时候交由update方法更新内容
    // let changelogs = compareChangesOfElement(currentEditModalItem, updateElement)

    let submissionResult = await submitStockEditResult(updateElement)
    if (submissionResult.acknowledged) {
        bootstrap.Modal.getInstance(editModal).hide()
        createAlert("success", "Changes has been successfully saved, refreshing list.")
        fetchStocksList(true)
    } else {
        editModal.querySelector(".modal-body p").textContent = "Error on Update, check console for more info"
    }
})

function compareChangesOfElement(originInfo, newInfo) {
    let changelog = {datetime: new Date(), events: []}
    let setObjects = {}
    for (const eachKey of Object.keys(newInfo)) {
        if (eachKey === "_id" || eachKey === "productLabel" || eachKey === "changelog") {
            continue;
        }
        if (originInfo.hasOwnProperty(eachKey)) {
            if (eachKey === "unitPrice") {
                if (originInfo.unitPrice.hasOwnProperty("$numberDecimal")) { //如果均为Decimal128，则对比值
                    if (originInfo.unitPrice['$numberDecimal'] !== newInfo.unitPrice['$numberDecimal']) {
                        changelog.events.push({field: eachKey, before: (newInfo.unitPrice ? newInfo.unitPrice : null)})
                    }
                } else { //如果值不是Decimal128,则转换值数据
                    changelog.events.push({field: eachKey, before: (newInfo.unitPrice ? newInfo.unitPrice : null)})
                }
                setObjects.unitPrice = {$numberDecimal: String(newInfo.unitPrice)}
            }
            if (originInfo[eachKey] !== newInfo[eachKey]) {
                changelog.events.push({field: eachKey, before: originInfo[eachKey]})
                setObjects[eachKey] = newInfo[eachKey]
            }
        } else {
            changelog.events.push({field: eachKey, before: null})
            setObjects[eachKey] = newInfo[eachKey]
        }
    }
    return changelog
}

document.querySelector("#editModal_removeCheck").addEventListener("change", (ev) => {
    if (ev.target.checked) {
        document.querySelector("#group_removeTime").style = ""
    } else {
        document.querySelector("#group_removeTime").style = "display:none"
        document.querySelector("#inpt_removeTime").value = ""
    }
})

function writeModalEdit(element) {
    document.querySelector("#editModal .modal-title").textContent = `Edit Stock: ${element.productName}`
    document.querySelector("#editModal .modal-body #productInfoText").textContent = `${element.productCode} - ${element.productName}`
    document.querySelector("#editModal .modal-body #labelIDText").textContent = `${element.productLabel}`
    document.querySelector("#editModal_quantity").value = element.quantity ? element.quantity : ""
    document.querySelector("#editModal_unit").value = element.quantityUnit ? element.quantityUnit : ""
    document.querySelector("#editModal_bestbefore").value = element.bestbefore ? element.bestbefore : ""
    document.querySelector("#editModal_location").value = element.shelfLocation ? element.shelfLocation : ""

    if (typeof element.unitPrice === 'object') { // Unit Price需要额外判定是否为Object (Decimal 128)
        document.querySelector("#editModal_unitPrice").value = element.unitPrice.$numberDecimal
    } else if (typeof element.unitPrice === 'number') {
        document.querySelector("#editModal_unitPrice").value = element.unitPrice ? element.unitPrice : ""
    }
    document.querySelector("#editModal_ponumber").value = element.POnumber ? element.POnumber : ""
    document.querySelector("#inpt_removeTime").value = element.removeTime ? element.removeTime : ""
    if (element.hasOwnProperty("quarantine") && element.quarantine === 1) {
        document.querySelector("#editModal_quarantineYes").checked = true
    }
    if (element.hasOwnProperty("quarantine") && element.quarantine === 0) {
        document.querySelector("#editModal_quarantineNo").checked = true
    }
    if (element.hasOwnProperty("quarantine") && element.quarantine === -1) {
        document.querySelector("#editModal_quarantineFinished").checked = true
    }
    document.querySelector("#editModal_btnSubmit").disabled = false
}

function readModalEdit() {
// Read Elements from input forms, if null input then ignore
    let updateElement = {}
    if (document.querySelector("#editModal_quantity") && String(document.querySelector("#editModal_quantity").value).length > 0) {
        updateElement.quantity = parseInt(document.querySelector("#editModal_quantity").value)
    }
    if (document.querySelector("#editModal_unit") && String(document.querySelector("#editModal_unit").value).length > 0) {
        updateElement.quantityUnit = document.querySelector("#editModal_unit").value
    }
    if (document.querySelector("#editModal_bestbefore") && String(document.querySelector("#editModal_bestbefore").value).length > 0) {
        updateElement.bestbefore = document.querySelector("#editModal_bestbefore").value
    }
    if (document.querySelector("#editModal_location") && String(document.querySelector("#editModal_location").value).length > 0) {
        updateElement.shelfLocation = document.querySelector("#editModal_location").value
    }
    if (document.querySelector("#editModal_unitPrice") && String(document.querySelector("#editModal_unitPrice").value).length > 0) {
        updateElement.unitPrice = document.querySelector("#editModal_unitPrice").value
    }
    if (document.querySelector("#editModal_ponumber") && String(document.querySelector("#editModal_ponumber").value).length > 0) {
        updateElement.POnumber = document.querySelector("#editModal_ponumber").value
    }
    if (document.querySelector("#editModal_removeCheck") && document.querySelector("#editModal_removeCheck").checked) {
        updateElement.removed = 1
        updateElement.removeTime = (document.querySelector("#inpt_removeTime") && String(document.querySelector("#inpt_removeTime").value).length > 0 ?
            document.querySelector("#inpt_removeTime").value : new Date())
    } else {
        updateElement.removed = 0
    }

    return updateElement
}

function fetchStockByLabelid(labelId){
    return new Promise((resolve, reject) => {
        fetch(`/api/v1/stocks?label=${labelId}`)
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(error => reject(error));
    })
}

function submitStockEditResult(changedObject) {
    return new Promise((resolve, reject) => {
        let xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText))
                } else {
                    reject({acknowledged: false, message: xhr.responseText})
                }
            }
        }

        xhr.open("POST", "/api/v1/stocks/update?upsert=false", true)
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify({item: changedObject}))
    });
}

let removeModalTarget = {}
let remvoeModal = document.querySelector("#removeModal")
remvoeModal.addEventListener("show.bs.modal", function (ev) {
    var lableID = ev.relatedTarget.getAttribute("data-bs-labelId")
    let hiddenInput = removeModal.querySelector("#removeModal_labelid")
    hiddenInput.value = lableID
    remvoeModal.querySelector("#removeModalYes").disabled = false
    remvoeModal.querySelector("#removeModalYes").textContent = "Confirm"

    remvoeModal.querySelector("#removeModal_check").addEventListener("change", (ev) => {
        if (ev.target.checked) {
            remvoeModal.querySelector("#removeModal_time").style = ""
            remvoeModal.querySelector("#removeModal_datetime").value = new Date()
            let maxDate = (new Date()).setDate((new Date()).getDate() + 1)
            remvoeModal.querySelector("#removeModal_datetime").setAttribute("max", new Date(maxDate).toISOString().substring(0, 16))
        } else {
            remvoeModal.querySelector("#removeModal_time").style = "display:none"
        }
    })
})

document.querySelector("#removeModalYes").addEventListener("click", async function (ev) {
    // 收到用户的确认请求，触发API移除该库存
    ev.preventDefault()
    let labelId = removeModal.querySelector("#removeModal_labelid").value
    remvoeModal.querySelector("#removeModalYes").disabled = true
    remvoeModal.querySelector("#removeModalYes").textContent = "Updating"

    let localTime = new Date();

    if (remvoeModal.querySelector("#removeModal_check").checked) { // 检查用户是否自定义了时间
        try {
            localTime = remvoeModal.querySelector("#removeModal_datetime").value ? new Date(remvoeModal.querySelector("#removeModal_datetime").value) : new Date()
        } catch (e) {
            // Fall back of using current system time
            localTime = new Date()
        }
    }
    let result = await removeProductById({productLabel: labelId, removeTime: new Date(localTime)})

    if (result.acknowledged) {
        bootstrap.Modal.getInstance(remvoeModal).hide()
        createAlert("success", "Item has been successfully removed, refreshing list.")
        fetchStocksList(true)
    } else {
        remvoeModal.querySelector("#editModal .modal-body p").textContent = "Error on Update, check console for more info"
    }
})

let deleteModal = document.querySelector("#deleteModal")
deleteModal.addEventListener("show.bs.modal", (ev) => {
    var itemId = ev.relatedTarget.getAttribute("data-bs-itemId")
    deleteModal.querySelector("#deleteModal_btnReturn").setAttribute("data-bs-itemId", itemId)
})

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

function removeProductById(itemObject) {
    if (!itemObject.hasOwnProperty("productLabel")) {
        return {acknowledged: false, message: "Missing Product Label Field"}
    }
    if (!itemObject.hasOwnProperty("removeTime")) {
        itemObject.removeTime = new Date()
    }
    return new Promise((resolve, reject) => {
        let xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText))
                } else {
                    reject({acknowledged: false, message: xhr.responseText})
                }
            }
        }

        xhr.open("POST", "/api/v1/stocks/remove", true)
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify({item: itemObject}))
    });
}
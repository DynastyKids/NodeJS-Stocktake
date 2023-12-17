let table = new DataTable('#table', {
    responsive: true,
    pageLength: 25,
    lengthMenu: [10, 15, 25, 50, 100],
    order: [[2, 'asc']],
    columnDefs: [
        {
            target: 2,
            visible: false,
            searchable: false
        },
    ]
});

document.addEventListener("DOMContentLoaded", function () {
    fetch("/api/v1/stocks")
        .then(respsonse => {
            if (!respsonse.ok) {
                throw new Error("API Request failed")
            }
            return respsonse.json()
        }).then(data => {
        if (Array.isArray(data)) {
            table.clear().draw()
            data.forEach(eachRow => {
                table.row.add([
                    `${eachRow.productCode ? eachRow.productCode : ''}${eachRow.productCode && eachRow.productName ? ' - ' : ''}${eachRow.productName ? eachRow.productName : ''}`,
                    `${eachRow.quantity ? eachRow.quantity + (eachRow.quantityUnit ? ' ' + eachRow.quantityUnit : '') : ''}`,
                    `${eachRow.bestbefore ? eachRow.bestbefore : ''}`,
                    `${eachRow.bestbefore ? new Date(eachRow.bestbefore).toLocaleDateString('en-AU') : ''}`,
                    `${eachRow.shelfLocation ? eachRow.shelfLocation : ''}`,
                    `${eachRow.productLabel ? eachRow.productLabel : ''}`,
                    `<a href="#" class="table_actions editModal" data-bs-toggle="modal" data-bs-target="#editModal" data-bs-label="${eachRow.productLabel}">Edit</a>` +
                    `<a href="#" class="table_actions removeModal" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-label="${eachRow.productLabel}">Remove</a>`,
                ]).draw(false)
            })
        }
    }).catch(err => {
        console.error("Error after fetching data: ", err)
    })
});

document.querySelector("#editModal").addEventListener("show.bs.modal", async function (ev) {
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-label")
    document.querySelector("#modalEditLabelid").value = requestLabelId
    document.querySelector("#editModalSubmitBtn").disabled = true
    document.querySelector("#editModalSubmitBtn").textContent = "Submit"
    document.querySelector("#editModal .modal-title").textContent = `Loading Product Information`

    let stockInfo = await fetchStockByLabelid(requestLabelId)
    if (Array.isArray(stockInfo) && stockInfo.length > 0) {
        writeModalEdit(stockInfo[0])
    }

    document.querySelector("#editModalSubmitBtn").addEventListener("click", async (ev) => {
        document.querySelector("#editModalSubmitBtn").disabled = true
        document.querySelector("#editModalSubmitBtn").textContent = "Updating"
        console.log(stockInfo[0])
        let updateElement = readModalEdit()
        updateElement.productLabel = stockInfo[0].productLabel
        // 2023 DEC update: 添加了过往location的记录，当新记录的位置不同时候，除了修改位置还要添加修改位置记录
        if (stockInfo[0].shelfLocation !== updateElement.shelfLocation) {
        //     位置发生了变化，需要重写locationRecords
            if (stockInfo[0].hasOwnProperty("locationRecords") && Array.isArray(stockInfo[0].locationRecords)){
                updateElement.locationRecords = stockInfo[0].locationRecords
                updateElement.locationRecords.forEach(eachElement=>{ // 前序时间转换为时间对象
                    if (eachElement.hasOwnProperty("datetime")){
                        eachElement.datetime = new Date(eachElement.datetime)
                    }
                })
                updateElement.locationRecords.push({datetime: new Date(), location: updateElement.shelfLocation})
            } else { //如果原数据没有locationRecords，则需要补充记录
                updateElement.locationRecords = []
                updateElement.locationRecords.push({datetime: new Date(stockInfo[0].loggingTime), location: stockInfo[0].shelfLocation}) //填充原有数据
                updateElement.locationRecords.push({datetime: new Date(), location: updateElement.shelfLocation}) // 补充本次新数据
            }
        }
        updateElement.loggingTime = new Date()
        let submissionResult = await submitStockEditResult(updateElement)
        console.log(submissionResult)

        if (submissionResult.acknowledged){
            setTimeout(function(){
                bootstrap.Modal.getInstance(document.querySelector("#editModal")).hide()
                window.location.reload()
            },2500)
        } else {
            document.querySelector("#editModal .modal-body p").textContent = "Error on Update, check console for more info"
        }
    })
})

document.querySelector("#modelCheckboxRemoved").addEventListener("change",(ev)=>{
    if (ev.target.checked){
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
    document.querySelector("#modalEditQuantity").value = (element.quantity ? element.quantity : "")
    document.querySelector("#modalEditUnit").value = (element.quantityUnit ? element.quantityUnit : "")
    document.querySelector("#modalEditBestbefore").value = (element.bestbefore ? element.bestbefore : "")
    document.querySelector("#modelEditLocation").value = (element.shelfLocation ? element.shelfLocation : "")
    document.querySelector("#modelCheckboxRemoved").checked = (element.removed === 1)
    document.querySelector("#inpt_removeTime").value = (element.removeTime ? element.removeTime : "")
    document.querySelector("#editModalSubmitBtn").disabled = false
}

function readModalEdit() {
// Read Elements from input forms, if null input then ignore
    let updateElement = {}
    if (document.querySelector("#modalEditQuantity") && String(document.querySelector("#modalEditQuantity").value).length > 0){
        updateElement.quantity = parseInt(document.querySelector("#modalEditQuantity").value)
    }
    if (document.querySelector("#modalEditUnit") && String(document.querySelector("#modalEditUnit").value).length > 0){
        updateElement.quantityUnit = document.querySelector("#modalEditUnit").value
    }
    if (document.querySelector("#modalEditBestbefore") && String(document.querySelector("#modalEditBestbefore").value).length > 0){
        updateElement.bestbefore = document.querySelector("#modalEditBestbefore").value
    }
    if (document.querySelector("#modelEditLocation") && String(document.querySelector("#modelEditLocation").value).length > 0){
        updateElement.shelfLocation = document.querySelector("#modelEditLocation").value
    }
    if (document.querySelector("#modelCheckboxRemoved") && document.querySelector("#modelCheckboxRemoved").checked){
        updateElement.removed = 1
        updateElement.removeTime = (document.querySelector("#inpt_removeTime") && String(document.querySelector("#inpt_removeTime").value).length > 0 ?
            document.querySelector("#inpt_removeTime").value : new Date())
    } else {
        updateElement.removed = 0
    }

    return updateElement
}

function fetchStockByLabelid(labelId) {
    return new Promise((resolve, reject) => {
        let xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText))
                } else {
                    reject({acknowledged: false, message: xhr.statusText})
                }
            }
        }

        xhr.open("GET", "/api/v1/stocks?label=" + labelId, true)
        xhr.send()
    });
}

function submitStockEditResult(changedObject){
    console.log(changedObject)
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
        xhr.send(JSON.stringify({item:changedObject}))
    });
}
let table = new DataTable('#table', {
    responsive: true,
    pageLength: 25,
    lengthMenu: [[10, 15, 25, 50, 100, -1],[10, 15, 25, 50, 100, 'All']],
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
let fetchedPreloadData = []
document.addEventListener("DOMContentLoaded", function () {
    var idleTime = 30 * 1000;
    var idleTimer;
    fetchPrefillList(true)

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(fetchPrefillList, idleTime);
    }
    document.addEventListener('mousemove', resetIdleTimer, false);
    document.addEventListener('keydown', resetIdleTimer, false);
    resetIdleTimer();
});

document.querySelector("#act_refreshList").addEventListener("click",(ev)=>{
    ev.preventDefault()
    fetchPrefillList(true)
})

function fetchPrefillList(forced = false) {
    document.querySelector("#loadingAnimation").style = "display: flex"
    if (forced || fetchedPreloadData.length <= 0){
        fetch("/api/v1/preload")
            .then(response => {
                if (!response.ok) {
                    throw new Error("API Request failed")
                }
                return response.json()
            }).then(responseBody => {
            if (Array.isArray(responseBody.data)) {
                redrawDataTable(responseBody.data)
                fetchedPreloadData = responseBody.data
            }
            document.querySelector("#loadingAnimation").style = "display: none"
        }).then(function () {
            document.querySelectorAll(".table_action_search").forEach(eachElement => {
                eachElement.addEventListener("click", function (ev) {
                    ev.preventDefault()
                    table.search(eachElement.getAttribute("data-bs-ponumber")).draw()
                })
            })
        }).catch(err => {
            console.error("Error after fetching data: ", err)
        })
    } else {
        redrawDataTable(fetchedPreloadData)
        document.querySelector("#loadingAnimation").style = "display: none"
    }
}

function redrawDataTable(tableData =[]){
    table.clear().draw()
    tableData.forEach(eachRow => {
        try{
            let stockElement = eachRow.hasOwnProperty("item") ? eachRow.item : {}
            table.row.add([
                `<a href="#" data-bs-ponumber="${(stockElement.hasOwnProperty('productCode') && stockElement.productCode ? stockElement.productCode : '')}" class="table_action_search">`+
                `${(stockElement.hasOwnProperty("productCode") ? stockElement.productCode : "")}</a>`+
                `${stockElement.hasOwnProperty("productName") ? '<br>'+stockElement.productName : ''}`,
                `${stockElement.hasOwnProperty("quantity") && stockElement.quantity ? stockElement.quantity + (stockElement.hasOwnProperty("quantityUnit") ? ' ' + stockElement.quantityUnit : '') : ''}`+`${stockElement.hasOwnProperty("shelfLocation") ? '<br>'+stockElement.shelfLocation : ''}`,
                `${stockElement.hasOwnProperty("bestbefore") && stockElement.bestbefore ? stockElement.bestbefore : '2999-12-31'}`, // Product without Exp Date, use max
                `${stockElement.hasOwnProperty("bestbefore") && stockElement.bestbefore ? stockElement.bestbefore : '9 - No Expire'}`,
                `<a href="#" data-bs-ponumber="${(stockElement.hasOwnProperty("POnumber") && stockElement.POnumber ? stockElement.POnumber : "")}" class="table_action_search">${(stockElement.hasOwnProperty("POnumber") ? stockElement.POnumber : "")}</a>`+
                `${stockElement.hasOwnProperty("seq") ? "."+stockElement.seq: ""}`+
                `<br>${stockElement.hasOwnProperty("productLabel") && stockElement.productLabel ? stockElement.productLabel.substring(0,15) : ''}`,
                `<a href="#" class="table_actions editModal" data-bs-toggle="modal" data-bs-target="#editModal" data-bs-labelId="${stockElement.productLabel}">Patch / Edit</a>`+`<br>`+
                `<a href="#" class="table_actions deleteModal" data-bs-toggle="modal" data-bs-target="#deleteModal" data-bs-labelId="${stockElement.productLabel}">Delete</a>`,
            ]).draw(false)
        } catch (e) {
            console.error("Error when processing data:",eachRow,";;With Error",e)
        }
    })
}

function fetchStockInfoByLabelId(labelId) {
    let result = {}
    if (labelId.length >0){
        for (let i = 0; i < fetchedPreloadData.length; i++) {
            if (fetchedPreloadData[i].hasOwnProperty("item") && fetchedPreloadData[i].item.hasOwnProperty("productLabel")){
                if (fetchedPreloadData[i].item.productLabel === labelId){
                    result = fetchedPreloadData[i]
                    break;
                }
            }
        }
    }
    return result
}

let editModalTarget = {}
let editModal = document.querySelector("#editModal")
editModal.addEventListener("show.bs.modal", async function (ev) {
    let requestLabelId = ev.relatedTarget.getAttribute("data-bs-labelId")
    editModal.querySelector("#editModal_labelId").value = requestLabelId           
    editModal.querySelector("#editModal_btnSubmit").disabled = true
    editModal.querySelector("#editModal_btnSubmit").textContent = "Push to Stock"
    editModal.querySelector("#editModal .modal-title").textContent = `Loading stock Information`
    editModal.querySelector("#editModal_statusText").textContent = `Loading Stock Information...`
    let stockInfo = fetchStockInfoByLabelId(requestLabelId)
    try{
        if (Object.keys(stockInfo).length > 0){
            editModal.querySelector("#editModal .modal-title").textContent =
                `Patching for ${stockInfo.item.productCode ? stockInfo.item.productCode : ""} - ${stockInfo.item.productName ? stockInfo.item.productName : ""}  `+
                `ID:${stockInfo.item.productLabel ? stockInfo.item.productLabel.slice(-7) : ""}`
            editModal.querySelector("#productInfoText").textContent = `${stockInfo.item.productCode ? stockInfo.item.productCode : ""} ${stockInfo.item.productName ? stockInfo.item.productName : ""}`
            editModal.querySelector("#labelIDText").textContent = `${stockInfo.item.productLabel ? stockInfo.item.productLabel : ""}`
            editModal.querySelectorAll("input").forEach(eachInputField=>{
                if (eachInputField.hasAttribute("data-bs-targetField")){
                    var targetField = eachInputField.getAttribute("data-bs-targetField")
                    if (stockInfo.item.hasOwnProperty(targetField) && stockInfo.item[targetField]){
                        eachInputField.value = stockInfo.item[targetField]
                    }
                }
            })
            editModalTarget = stockInfo
        }
        editModal.querySelector("#editModal_btnSubmit").disabled = false
        editModal.querySelector("#editModal_statusText").textContent = `Ready`
    } catch (e) {
        editModal.querySelector("#editModal_statusText").textContent = `Write back fetched info error, check console for more info.`
        console.error("Write back edit modal error:", e)
    }
})
editModal.querySelector("#editModal_removeCheck").addEventListener("change",(ev)=>{
    editModal.querySelector("#group_removeTime").style = `display: ${editModal.querySelector("#editModal_removeCheck").checked ? "block" : "none"}`
})
editModal.querySelector("#editModal_btnSave").addEventListener("click",function(){
    readModalEdit()
    updatePreloadRequest("/api/v1/preload/update", editModalTarget).then(result=>{
        if (result.acknowledged){
            createAlert("success", `${editModalTarget.item.productLabel ? "Prefill stock '" +editModalTarget.item.productLabel+"'" : ""} changes has successfully saved.`)
        } else {
            createAlert("danger",`${editModalTarget.item.productLabel ? "Prefill stock '" +editModalTarget.item.productLabel+"'" : ""} changes did not save correctly`)
        }
    })
    fetchPrefillList(true)
    bootstrap.Modal.getInstance(editModal).hide()
})
editModal.querySelector("#editModal_btnSubmit").addEventListener("click", async function () {
    editModal.querySelector("#editModal_statusText").textContent = `Processing on pushing to stock`
    readModalEdit()
    let result = {step1: {acknowledged: false}, step2: {acknowledged: false}}
    try {
        var pushToStock = await pushElementToStock("/api/v1/stocks/update", editModalTarget.item)
        var deletePreload = await removePreloadRequest("/api/v1/preload/remove", editModalTarget.item.productLabel)
        result.step1 = pushToStock
        if (pushToStock.hasOwnProperty("acknowledged") && pushToStock.acknowledged) {
            result.step2 = deletePreload
        }
    } catch (e) {
        console.error("Error occured when processing: ", e)
    }

    if (result.step1.acknowledged && result.step2.acknowledged) {
        editModal.querySelector("#editModal_statusText").textContent = `Ready`
    } else {
        console.error(`editModal; (1)Push to Stock:${result.step1.acknowledged}; (2) Delete from preload: ${result.step2.acknowledged}`)
        editModal.querySelector("#editModal_statusText").textContent = `Error occurred, check console for more info.`
    }
    fetchPrefillList(true)
    bootstrap.Modal.getInstance(editModal).hide()
})

function readModalEdit(){
    editModal.querySelectorAll("input").forEach(eachInput => {
        let targetField = eachInput.getAttribute("data-bs-targetField")
        if (eachInput.value.length > 0) {
            if (targetField === "removed") {
                editModalTarget.item.removed = eachInput.checked ? 1 : 0
            } else if (targetField === "removeTime") {
                if (editModal.querySelector("#editModal_removeCheck").checked) {
                    editModalTarget.item.removeTime === eachInput.value ? eachInput.value : getDateTimeString()
                }
            } else if (targetField === "quarantine") {
                if (eachInput.checked) {
                    editModalTarget.item.quarantine = eachInput.value
                }
            } else {
                editModalTarget.item[targetField] = eachInput.value
            }
        }
    })
}


function getDateTimeString(date = new Date()){
    try{
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
    } catch (e) {
        date = new Date()
        console.error("Input date object is incorrect, use default current date")
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
    }
}

let removeModalTarget = {}
let removeModal = document.querySelector("#removeModal")
removeModal.addEventListener("show.bs.modal", function (ev) {
    var lableID = ev.relatedTarget.getAttribute("data-bs-labelId")
    let hiddenInput = removeModal.querySelector("#removeModal_labelid")
    hiddenInput.value = lableID
    removeModal.querySelector("#removeModalYes").disabled = false
    removeModal.querySelector("#removeModalYes").textContent = "Confirm"

    removeModal.querySelector("#removeModal_check").addEventListener("change", (ev) => {
        if (ev.target.checked) {
            removeModal.querySelector("#removeModal_time").style = ""
            removeModal.querySelector("#removeModal_datetime").value = new Date()
            let maxDate = (new Date()).setDate((new Date()).getDate() + 1)
            removeModal.querySelector("#removeModal_datetime").setAttribute("max", new Date(maxDate).toISOString().substring(0, 16))
        } else {
            removeModal.querySelector("#removeModal_time").style = "display:none"
        }
    })
})
removeModal.querySelector("#removeModalYes").addEventListener("click", async function (ev) {
    let labelId = removeModal.querySelector("#removeModal_labelid").value
    removeModal.querySelector("#removeModalYes").disabled = true
    removeModal.querySelector("#removeModalYes").textContent = "Updating"
    if (removeModal.querySelector("#removeModal_check").checked) { // 检查用户是否自定义了时间
        try {
            localTime = removeModal.querySelector("#removeModal_datetime").value ? new Date(removeModal.querySelector("#removeModal_datetime").value) : new Date()
        } catch (e) {
            // Fall back of using current system time
            localTime = new Date()
        }
    }
    let result = await removePreloadRequest("/api/v1/preload/remove",labelId)
    if (result.acknowledged) {
        fetchPrefillList(true)
        createAlert("success","Item has been successfully removed. Reloading page")
        bootstrap.Modal.getInstance(removeModal).hide()
    } else {
        removeModal.querySelector("#editModal .modal-body p").textContent = "Error on Update, check console for more info"
    }
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

function removePreloadRequest(url="/api/v1/preload/remove", preloadLabel = ""){
    return new Promise((resolve, reject)=> {
        fetch(url, {
            method: "POST",
            mode: 'cors',
            cache: 'no-cache',
            headers: {'Content-Type': 'application/json'},
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify({productLabel: preloadLabel})
        }).then(response => response.json())
            .then(data => {
                console.log('Success:', data);
                resolve({acknowledged: true, data: data})
            })
            .catch((error) => {
                console.error('Error:', error);
                reject({acknowledged: false, data: data})
            });
    })
}

function updatePreloadRequest(url = "/api/v1/preload/update", data={}){
    return new Promise((resolve, reject) =>{
        fetch(url, {
            method: "POST",
            mode: 'cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            body: JSON.stringify(data)
        })
            .then(response => response.json()) // 解析JSON响应
            .then(data => {
                resolve({acknowledged: true, data: data});

            })
            .catch((error) => {
                console.error('Error:', error);
                reject({acknowledged: false, data: data})
            });
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
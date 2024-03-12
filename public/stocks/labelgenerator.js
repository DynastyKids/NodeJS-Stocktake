let rowNumber = 1
let productsData = [] //在生成Label时候也可以使用
document.addEventListener("DOMContentLoaded", function (ev) {
    let idleTimer;

    if (window.location.protocol === "http:") {
        const redirectUrl = "https://" + window.location.hostname + ":3001"+window.location.pathname;
        window.location.replace(redirectUrl)
    }

    fetchProducts().then(response=>{
        console.log(response.data)
        if (response.data.acknowledged) {
            createAlert("success","Product list has fetched successfully", 3000)
            if (Array.isArray(response.data.data)) {
                productsData = response.data.data
                response.data.data.forEach(eachItem => {
                    // document.querySelector("#productSuggestions").append(`<option value="${eachItem.productCode}" label="${eachItem.description}"></option>`);
                    $("#productSuggestions").append(`<option value="${eachItem.description}" data-code="${eachItem.productCode}" data-qty="${eachItem.palletQty}" data-unit="${eachItem.unit}"></option>`);
                });
            }
        }
        document.querySelector("#loadingAnimation").style = "display: none"
    })
    
    function resetTimer() {
        // 清除现有的计时器
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            window.location.reload();
        }, 1000*300);
    }

    window.addEventListener('mousemove', resetTimer, false);
    window.addEventListener('keypress', resetTimer, false);
    resetTimer();
});

async function fetchProducts(forced = false){
    if (forced=== false && productsData.length > 0){
        return {acknowledged: true, data:productsData}
    } else {
        try {
            let response = await axios.get('/api/v1/products', true)
            return (response ? response : {acknowledged: false, data:[]})
        } catch (e) {
            createAlert("warning", "Error(s) encountered when fetching products lists", 5000)
            return (response ? response : {acknowledged: false, data:[]})
            console.error("Error when fetching Products List:",e)
        }
    }
}

document.querySelector("#table_addRow").addEventListener("click", function (ev) {
    let newRow = document.createElement("tr")
    newRow.className = "rowRecords"

    var rowNumberElement = document.createElement("td")
    rowNumberElement.className = "rowid d-none d-sm-table-cell"
    rowNumberElement.textContent = rowNumber
    newRow.append(rowNumberElement)

    var productNametd = document.createElement("td")
    productNametd.className = "d-inline-block d-sm-table-cell"
    var productNameInput = document.createElement("input")
    productNameInput.type="text"
    productNameInput.className="rowInput form-control inputProdname"
    productNameInput.placeholder="Select a product or type in your custom name"
    productNameInput.setAttribute("list","productSuggestions")
    productNameInput.addEventListener("change",(ev)=>{
        if (productsData.length > 0){
            for (let i = 0; i < productNameInput.list.options.length; i++) {
                if (productNameInput.list.options[i].value === productNameInput.value){
                    try{
                       let targetOption = productNameInput.list.options[i]
                        if (targetOption.getAttribute("data-qty") !== null && newRow.querySelector(".qtyInput").value.toString().length <= 0){
                            newRow.querySelector(".qtyInput").value = targetOption.getAttribute("data-qty")
                        }
                        if(targetOption.getAttribute("data-unit") !== null && newRow.querySelector(".unitInput").value.toString().length <= 0){
                            newRow.querySelector(".unitInput").value = targetOption.getAttribute("data-unit")
                        }
                    } catch (e) {
                        console.log("Item does not have qty and unit properties.")
                    }
                    break;
                }
            }
        }
    })
    productNametd.append(productNameInput)
    newRow.append(productNametd)

    var productQuantitytd = document.createElement("td")
    productQuantitytd.className = "d-inline-block d-sm-table-cell"
    var productQuantityInput = document.createElement("input")
    productQuantityInput.type = "number"
    productQuantityInput.className = "rowInput form-control qtyInput"
    productQuantityInput.min = "0"
    productQuantityInput.step = "1"
    productQuantityInput.placeholder = "Quantity of product"
    productQuantitytd.append(productQuantityInput)
    newRow.append(productQuantitytd)

    var productUnittd = document.createElement("td")
    productUnittd.className = "d-inline-block d-sm-table-cell"
    var productUnitInput = document.createElement("input")
    productUnitInput.type = "text"
    productUnitInput.size = "10"
    productUnitInput.setAttribute("list","unitSuggestions")
    productUnitInput.className = "rowInput form-control unitInput"
    productUnitInput.placeholder = "Unit"
    productUnittd.append(productUnitInput)
    newRow.append(productUnittd)

    var productBestbeforetd = document.createElement("td")
    productBestbeforetd.className = "d-inline-block d-sm-table-cell"
    var productBestbeforeInput = document.createElement("input")
    productBestbeforeInput.type = "date"
    productBestbeforeInput.className = "rowInput form-control"
    productBestbeforetd.append(productBestbeforeInput)
    newRow.append(productBestbeforetd)

    var productCopiestd = document.createElement("td")
    productCopiestd.className = "d-inline-block d-sm-table-cell"
    var productCopiesInput = document.createElement("input")
    productCopiesInput.type = "number"
    productCopiesInput.className = "rowInput form-control"
    productCopiesInput.placeholder = "Copies"
    productCopiesInput.min = "1"
    productCopiesInput.step = "1"
    productCopiesInput.value = "1"
    productCopiestd.append(productCopiesInput)
    newRow.append(productCopiestd)

    var productButtontd = document.createElement("td")
    productButtontd.className = "d-inline-block d-sm-table-cell"
    var productButtonInput = document.createElement("button")
    productButtonInput.className = "btn btn-danger deleteRow"
    productButtonInput.innerHTML = `<i class="ti ti-trash"></i>`
    productButtontd.append(productButtonInput)
    newRow.append(productButtontd)

    rowNumber += 1;
    $('table tbody').append(newRow);
})

$('table tbody').on('click', '.deleteRow', function () {
    rowNumber -= 1;
    let currentRow = 1;
    $(this).closest('tr').remove();

    document.querySelectorAll(".rowid").forEach(eachRow => {
        eachRow.innerText = currentRow;
        currentRow += 1;
    })
});

document.querySelector("#table_reset").addEventListener("click", function (ev) {
    rowNumber = 1
    document.querySelector("table tbody").innerHTML = ""
})

document.querySelector("#table_submit").addEventListener("click", function (ev) {
    //     Submit部分需要引用Chrome插件项目中的JSPDF，生成PDF后在新窗口回弹给用户，以便用户打印label
    //     新增部分：同时给予用户选择是否添加到数据库，如果选是则提交时候触发API写入数据库（PDF创1页写1条）
    let doc = new jspdf.jsPDF({orientation: 'landscape', unit: 'px', format: 'a4', compress: true });
    // console.log(doc.internal.pageSize.width,doc.internal.pageSize.height) // Line Height在A4横向下总高度约为210
    let prefillArray = []
    let productLists = document.querySelectorAll(".rowRecords")
    let sequence = 0;
    for (let i = 0; i < productLists.length; i++) {
        let rowInput = productLists[i].querySelectorAll("input")
        for (let copy = 0; copy < rowInput[4].value; copy++) { // Looping when require multiple copies
            sequence++
            var stockInfo = {
                POnumber: "",
                productCode: "",
                productName: "",
                quantity: 1,
                quantityUnit: "",
                bestbefore: "",
                productLabel: (new Date()).toISOString().replaceAll("-", "").split("T")[0],
                seq: sequence,
                removed: 0,
                loggingTime: new Date(),
                createTime: new Date()
            }

            if (String(stockInfo.POnumber).length <= 0){
                stockInfo.loggingTime = new Date()
            }

            // 验证输入的productName是否在库中, 替换rowInput[0].value中的名称为产品Code，通过搜索原datalist的列表
            document.querySelectorAll("#productSuggestions option").forEach(eachItem =>{
                if (eachItem.value === rowInput[0].value){
                    rowInput[0].value = eachItem.getAttribute("data-code")
                }
            })
            let units = {bag:"bags",bottle:"btls",box:"boxes",carton:"ctns",piece:"pcs",roll:"rolls",unit:"units",pallet:"plts",skid:"skids"}

            stockInfo.productCode = rowInput[0].value
            stockInfo.productName = checkProductNameInDatabase(productsData,rowInput[0].value) ?
                checkProductNameInDatabase(productsData,rowInput[0].value) :rowInput[0].value
            stockInfo.quantity = rowInput[1].value // Quantity
            stockInfo.quantityUnit = rowInput[2].value.toLowerCase() //
            if (units[rowInput[2].value.toLowerCase()]){
                stockInfo.quantityUnit = units[rowInput[2].value.toLowerCase()]
            }
            stockInfo.bestbefore = rowInput[3].value
            stockInfo.POnumber = document.querySelector("#input_purchaseorder").value ? document.querySelector("#input_purchaseorder").value : ""

            var initTextSize = 110
            doc.setFontSize(initTextSize).setFont("Helvetica", 'normal')
            var part1Text = stockInfo.productName.slice(0,30);
            while (doc.getTextDimensions(part1Text).w > doc.internal.pageSize.getWidth() - 20) {
                initTextSize -= 5;
                doc.setFontSize(initTextSize).setFont("Helvetica", 'normal')
            }

            if (stockInfo.productName.length <= 30) {
                while (doc.getTextDimensions(part1Text).w > doc.internal.pageSize.getWidth() - 40) {
                    initTextSize -= 5;
                    doc.setFontSize(initTextSize).setFont("Helvetica", 'normal')
                }
                doc.text(stockInfo.productName, doc.internal.pageSize.getWidth() / 2, 100, {lineHeightFactor: 0.9, align: "center"})
            } else {
                while (doc.getTextDimensions(part1Text).w > doc.internal.pageSize.getWidth() - 40) {
                    initTextSize -= 5;
                    doc.setFontSize(initTextSize).setFont("Helvetica", 'normal')
                }
                doc.text(`${stockInfo.productCode} - ${stockInfo.productName.slice(0, 40)}...`, 15, 80,
                    {lineHeightFactor: 1.1, align: "left", maxWidth: doc.internal.pageSize.width - 30})
                stockInfo.productName = `${stockInfo.productCode} - ${stockInfo.productName.slice(0, 40)}...`
            }
            // 新增内容，如果字段过长，拆分成2行，每行限制30字符，至多60字符，两行使用相同配置，左对齐

            let labelHash = generateProductHashString(stockInfo)
            stockInfo.productLabel = (new Date()).toISOString().replaceAll("-", "").split("T")[0] + labelHash.substring(0,7)

            doc.setFontSize(90).setFont("Helvetica", 'normal');
            doc.text(stockInfo.quantity + "  " + stockInfo.quantityUnit, 45, doc.internal.pageSize.getHeight() - 190, {lineHeightFactor: 0.9});

            doc.setFontSize(90).setFont("Helvetica", 'normal')
            doc.text(stockInfo.bestbefore, 15, doc.internal.pageSize.getHeight() - 115, {lineHeightFactor: 0.9});

            doc.addImage(QRCodeObjectGenerateV3(stockInfo), "PNG", doc.internal.pageSize.getWidth() - 255, doc.internal.pageSize.getHeight() - 255, 250, 250)

            //新增右上角标签号标记
            doc.setFontSize(72).setFont("courier", 'bold')
            doc.text(`${stockInfo.productLabel.toUpperCase().slice(-7)}`, 15, doc.internal.pageSize.getHeight() - 55, {lineHeightFactor: 0.85});

            doc.setFontSize(36).setFont("courier", 'bold')
            doc.text(`${stockInfo.POnumber.toString().length > 1 ? stockInfo.POnumber + " /" : ""} ${stockInfo.productLabel.toUpperCase().slice(-7)}`, doc.internal.pageSize.getWidth() - 20, 25, {lineHeightFactor: 0.75, align: "right"});

            doc.setFontSize(72).setFont("Helvetica", 'bold')
            doc.text(`${sequence.toString()}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 20, {lineHeightFactor: 0.9, align: "center"})

            doc.setFontSize(12).setFont("Helvetica", 'normal')
            let bottomVerfiyText = ["V3_Electron", "P:"+stockInfo.POnumber,
                "C:"+stockInfo.productCode, "Q:"+stockInfo.quantity + stockInfo.quantityUnit,
                "E:" + (stockInfo.bestbefore ? stockInfo.bestbefore.replaceAll("-", "") : "*")]
            doc.text(bottomVerfiyText.toString(), 20, doc.internal.pageSize.getHeight() - 30, {lineHeightFactor: 0.8});

            let bottomTextPart2 = ["L:"+stockInfo.productLabel.toUpperCase(),"Seq:"+sequence.toString()]
            doc.text(bottomTextPart2.toString(), 20, doc.internal.pageSize.getHeight() - 20, {lineHeightFactor: 0.8});

            if (document.querySelector("#preloadCheckbox").checked) {
                prefillItem({item: stockInfo})
            }
            prefillArray.push(stockInfo);
            doc.addPage("a4","landscape");
        }
    }
    console.log(prefillArray)

    doc.deletePage(doc.internal.getNumberOfPages()); // Delete last empty page
    doc.setProperties({title: `PrintoutLabel${new Date().toJSON().slice(0, 19).replaceAll("-", "").replaceAll(":", "").replaceAll("T", "")}`});
    // doc.output('dataurlnewwindow'); // Using non-HTTPs link, only available to pop in new window

    window.open(URL.createObjectURL(doc.output('blob')))
    doc.save(`PrintoutLabel${new Date().toJSON().slice(0,19).replaceAll("-","").replaceAll(":","").replaceAll("T","")}.pdf`);
})

function prefillItem(preloadBodyContent){
    return fetch("/api/v1/preload/update", {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(preloadBodyContent)
    })
        .then(response => response.json())
        .then(data => {
            console.log(data)
            return {acknowledged: true, data: data}
        })
        .catch(error => {
            console.error(error)
            return {acknowledged: false, data: {error:error}}
        })
}

function checkProductNameInDatabase(productsData, productCode){
    for (let j = 0; j < productsData.length; j++) {
        if (productsData[j].productCode === productCode) {
            // console.log(productsData[j])
            return productsData[j].labelname
        }
    }
    return false;
}

// 2024-01-01预更新
/* 从2024.1.1开始，产品编号不在使用随机数，将改成使用SHA1信息摘要， 根据传入的数组生成对应的HASH值
* 为了避免信息重复，由收货单传入的值要有PTL#板位号，或者箱数编号范围x-xxx~x-xxx，，手动生成的多个label用自编号1~100...
* */
function generateProductHashString(qrObject){
    let targetObject = qrObject
    delete targetObject.productLabel
    return sha1(JSON.stringify(targetObject))
}

function QRCodeObjectGenerateV3(qrObject){
    let remoteServerAddress = "http://192.168.0.254:3000/qrstock?item="
    try {
        var qrText = remoteServerAddress + btoa(JSON.stringify(qrObject))
        var qrcode = new QRious({level: "L", size: 300, value: qrText, padding: 5});
        return qrcode.toDataURL("image/png")
    } catch (e) {
        return null
    }
}

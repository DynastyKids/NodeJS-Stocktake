// import axios from "axios";

let rowNumber = 1
let productsData = [] //在生成Label时候也可以使用
let toast = document.querySelector("#toastDiv")
document.addEventListener("DOMContentLoaded", function (ev) {
    if (window.location.protocol === "http:") {
        const redirectUrl = "https://" + window.location.hostname + ":3001"+window.location.pathname;
        window.location.replace(redirectUrl)
    }

    axios.get('/api/v1/products', true)
        .then(function (response) {
            document.querySelector("#toastDiv .toast-body").innerText = "Product list has fetched successfully"
            document.querySelector("#toastDiv").classList.add("bg-success");
            document.querySelector("#toastDiv").classList.remove("bg-warning");
            if (Array.isArray(response.data.data)) {
                productsData = response.data.data
                response.data.data.forEach(eachItem => {
                    // document.querySelector("#productSuggestions").append(`<option value="${eachItem.productCode}" label="${eachItem.description}"></option>`);
                    $("#productSuggestions").append(`<option value="${eachItem.description}" data-code="${eachItem.productCode}" data-qty="${eachItem.palletQty}" data-unit="${eachItem.unit}"></option>`);
                });
                (new bootstrap.Toast(toast)).show();
            }
        })
        .catch(function (response) {
            document.querySelector("#toastDiv .toast-body").innerText = "There are some problem encountered when fetching products lists"
            document.querySelector("#toastDiv").classList.add("bg-warning");
            document.querySelector("#toastDiv").classList.remove("bg-success");
            (new bootstrap.Toast(toast)).show();
            console.error(response);
        })
});

document.querySelector("#table_addRow").addEventListener("click", function (ev) {
    var newRow = `
        <tr class="rowRecords">
            <td class="rowid d-none d-sm-table-cell">${rowNumber}</td>
            <td class="d-inline-block d-sm-table-cell">
                <input type="text" list="productSuggestions" class="form-control inputProdname" placeholder="Product name">
            </td>
            <td class="d-inline-block d-sm-table-cell">
                <input type="number" min="0" class="form-control" placeholder="quantity">
            </td>
            <td class="d-inline-block d-sm-table-cell">
                <input type="text" size="10" list="unitSuggestions" class="form-control" placeholder="unit">
            </td>
            <td class="d-inline-block d-sm-table-cell">
                <input type="date" class="form-control" placeholder="Bestbefore">
            </td>
            <td class="d-inline-block d-sm-table-cell">
                <input type="number" class="form-control" min="1" step="1" value="1">
            </td>
            <td class="d-inline-block d-sm-table-cell">
                <button class="btn btn-danger deleteRow"><i class="ti ti-trash"></i></button>
            </td>
        </tr>
        `
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
    for (let i = 0; i < productLists.length; i++) {
        let rowInput = productLists[i].querySelectorAll("input")
        for (let copy = 0; copy < rowInput[4].value; copy++) { // Looping when require multiple copies
            var qrCodeInfos = {
                POIPnumber: "",
                productCode: "",
                productName: "",
                quantity: 1,
                quantityUnit: "",
                bestbefore: "",
                productLabel: (new Date()).toISOString().replaceAll("-", "").split("T")[0] + getRandomXHexdigits(7),
                removed: 0
            }
            
            // 验证输入的productName是否在库中, 替换rowInput[0].value中的名称为产品Code，通过搜索原datalist的列表
            document.querySelectorAll("#productSuggestions option").forEach(eachItem =>{
                if (eachItem.value === rowInput[0].value){
                    rowInput[0].value = eachItem.getAttribute("data-code")
                }
            })
            let units = {bag:"bags",bottle:"btls",box:"boxes",carton:"ctns",piece:"pcs",roll:"rolls",unit:"units",pallet:"plts",skid:"skids"}

            qrCodeInfos.productCode = rowInput[0].value
            qrCodeInfos.productName = checkProductNameInDatabase(productsData,rowInput[0].value) ?
                checkProductNameInDatabase(productsData,rowInput[0].value) :rowInput[0].value
            qrCodeInfos.quantity = rowInput[1].value // Quantity
            qrCodeInfos.quantityUnit = rowInput[2].value.toLowerCase() //
            if (units[rowInput[2].value.toLowerCase()]){
                qrCodeInfos.quantityUnit = units[rowInput[2].value.toLowerCase()]
            }
            qrCodeInfos.bestbefore = rowInput[3].value
            qrCodeInfos.POIPnumber = document.querySelector("#input_purchaseorder").value ? document.querySelector("#input_purchaseorder").value : ""

            var initTextSize = 120
            doc.setFontSize(initTextSize).setFont(undefined, 'normal')
            var part1Text = qrCodeInfos.productName.slice(0,30);
            while (doc.getTextDimensions(part1Text).w > doc.internal.pageSize.getWidth() - 20) {
                initTextSize -= 5;
                doc.setFontSize(initTextSize).setFont(undefined, 'normal')
            }
            doc.text((qrCodeInfos.productName.length<=50 ? qrCodeInfos.productName : qrCodeInfos.productName.slice(0,50)+"..."),
                (qrCodeInfos.productName.length<=25 ? doc.internal.pageSize.getWidth()/2 : 15),
                (qrCodeInfos.productName.length<=25 ? 110 : 70), {
                    lineHeightFactor: 1.1,
                    align: (qrCodeInfos.productName.length<=25 ? "center" : 'left'),
                    maxWidth: doc.internal.pageSize.width-30});
            // 新增内容，如果字段过长，拆分成2行，每行限制30字符，至多60字符，两行使用相同配置，左对齐

            doc.setFontSize(90).setFont(undefined, 'normal'); //Quantity Text
            doc.text(qrCodeInfos.quantity + "  " + qrCodeInfos.quantityUnit, 25, doc.internal.pageSize.getHeight() - 190, {lineHeightFactor: 0.8});

            doc.setFontSize(90).setFont(undefined, 'normal'); // bestbefore Text
            doc.text(qrCodeInfos.bestbefore, 20, doc.internal.pageSize.getHeight() - 75, {lineHeightFactor: 0.8});

            doc.addImage(qrCodeGenerateV3(qrCodeInfos.POIPnumber, qrCodeInfos.productCode, qrCodeInfos.productName,
                    qrCodeInfos.quantity, qrCodeInfos.quantityUnit, qrCodeInfos.bestbefore, qrCodeInfos.productLabel)
                , "PNG", doc.internal.pageSize.getWidth() - 255, doc.internal.pageSize.getHeight() - 255, 250, 250)

            //新增右上角标签号标记
            doc.setFontSize(28).setFont(undefined, 'normal')
            doc.text(qrCodeInfos.productLabel.slice(-7), doc.internal.pageSize.getWidth()-20, 32, {lineHeightFactor: 0.75, align: "right"});

            doc.setFontSize(10).setFont(undefined, 'normal')
            let bottomVerfiyText = ["V3", qrCodeInfos.productLabel, qrCodeInfos.POIPnumber, qrCodeInfos.productCode,
                qrCodeInfos.quantity + qrCodeInfos.quantityUnit, (qrCodeInfos.bestbefore ? "Exp:" + qrCodeInfos.bestbefore : "*")]
            doc.text(bottomVerfiyText.toString(), 20, doc.internal.pageSize.getHeight() - 30, {lineHeightFactor: 0.6});
            prefillArray.push(qrCodeInfos);
            doc.addPage("a4","landscape");
        }
    }
    // console.log(prefillArray)
    if (document.querySelector("#preloadCheckbox").checked){
        axios.post('/api/v1/preload',{body: prefillArray},{headers:{
                'Content-Type': 'application/json'
            }})
            .then(response=>{
                // console.log(response)
                if (response.data.acknowledged){
                    document.querySelector("#toastDiv .toast-body").innerText = "Label prefill successfully"
                    document.querySelector("#toastDiv").classList.add("bg-success");
                    document.querySelector("#toastDiv").classList.remove("bg-warning");
                    (new bootstrap.Toast(toast)).show();
                }else {
                    document.querySelector("#toastDiv .toast-body").innerText = "There are some problem encountered when prefilling labels"
                    document.querySelector("#toastDiv").classList.add("bg-warning");
                    document.querySelector("#toastDiv").classList.remove("bg-success");
                    (new bootstrap.Toast(toast)).show();
                }
            })
            .catch(error=>{
                console.error("Error occured when prefill label:",error)
                document.querySelector("#toastDiv .toast-body").innerText = "There are some problem encountered when prefilling labels"
                document.querySelector("#toastDiv").classList.add("bg-warning");
                document.querySelector("#toastDiv").classList.remove("bg-success");
                (new bootstrap.Toast(toast)).show();
            })
    }
    doc.deletePage(doc.internal.getNumberOfPages()); // Delete last empty page
    doc.setProperties({title: `PrintoutLabel${new Date().toJSON().slice(0, 19).replaceAll("-", "").replaceAll(":", "").replaceAll("T", "")}`});
    // doc.output('dataurlnewwindow'); // Using non-HTTPs link, only available to pop in new window

    window.open(URL.createObjectURL(doc.output('blob')))
    doc.save(`PrintoutLabel${new Date().toJSON().slice(0,19).replaceAll("-","").replaceAll(":","").replaceAll("T","")}.pdf`);
})

function checkProductNameInDatabase(productsData, productCode){
    for (let j = 0; j < productsData.length; j++) {
        if (productsData[j].productCode === productCode) {
            // console.log(productsData[j])
            return productsData[j].labelname
        }
    }
    return false;
}

function getRandomXHexdigits(bit) {
    return (Math.random() * 0xfffffffff * 1000000000).toString(16).slice(0, bit)
}

// QR代码生成部分沿用Chrome EXT项目中的方法，默认使用V3，等后续按照产品需要引入V5
function qrCodeGenerateV3(purchaseNo = "", productCode = "", productName = "", quantity = 1, unit = "", bestbefore = "", labelId = "") {
    var qrText = "https://yourAddress.local/?item=" + btoa(
        JSON.stringify({
            Build: 3,
            POIPnumber: purchaseNo, //Purchase Order Reference
            productCode: productCode,
            productName: productName,
            quantity: quantity,
            quantityUnit: unit,
            bestbefore: (bestbefore !== null ? bestbefore : ""), // bestbefore by YYYYMMDD
            productLabel: labelId
        })
    );
    var qrcode = new QRious({level: "M", size: 300, value: qrText, padding: 3});
    return qrcode.toDataURL("image/png")
}

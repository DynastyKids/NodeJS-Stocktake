// Screensaver - Next Dispatch
try{
    const {MongoClient, ServerApiVersion} = require("mongodb");
    const Storage = require("electron-store");
} finally {
// Nothing happens
}
const newStorage2 = new Storage();
let dburi = newStorage2.get("mongoURI") ? newStorage2.get("mongoURI") : "mongodb://localhost:27017"
let dbtargetDB = newStorage2.get("mongoDB") ? newStorage2.get("mongoDB") : "production"
let productsDisplay = []

let inactiveModal = document.createElement("div")
inactiveModal.className = "modal fade"
inactiveModal.id = "screenSaverModal"
inactiveModal.role = "dialog"
inactiveModal.setAttribute("tabindex","-1")
inactiveModal.setAttribute("aria-hidden","true")

let inactiveModalDialog = document.createElement("div")
inactiveModalDialog.className = "modal-dialog modal-fullscreen"

let inactiveModalContent = document.createElement("div")
inactiveModalContent.className = "modal-content"

let inactiveModalHeader = document.createElement("div")
inactiveModalHeader.className = "modal-header"
inactiveModalHeader.innerHTML = `<h5 class="modal-title" id="exampleModalToggleLabel2">Screensaver - Next Dispatch</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>`

let inactiveModalBody = document.createElement("div")
inactiveModalBody.className = "modal-body"
inactiveModalBody.innerHTML = `
<div class="container-fluid">
    <div id="fill-div">
        <table id="table-header">
            <thead style="font-size: x-large; text-align: center">
            <tr>
                <td scope="col" style="width:35%" rowspan="2">Product</td>
                <td scope="col" style="width:25%">1st<br>Location / Date</td>
                <td scope="col" style="width:20%">2nd<br>Location / Date</td>
                <td scope="col" style="width:20%">3rd<br>Location / Date</td>
            </tr>
            </thead>
        </table>
        <div id="table-body-container">
            <table id="table-body">
                <tr>
<!--                    <td class="tableItemName">Loading Product</td>-->
<!--                    <td class="tableNext1">Location 1<br>Exp Date 1</td>-->
<!--                    <td class="tableNext2">Location 2<br>Exp Date 2</td>-->
<!--                    <td class="tableNext2">Location 3<br>Exp Date 3</td>-->
                </tr>
            </table>
        </div>
    </div>
</div>`

let inactiveModalFooter = document.createElement("div")
inactiveModalFooter.className = "modal-footer"
inactiveModalFooter.innerHTML = `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`

inactiveModalContent.append(inactiveModalHeader)
inactiveModalContent.append(inactiveModalBody)
inactiveModalContent.append(inactiveModalFooter)
inactiveModalDialog.append(inactiveModalContent)
inactiveModal.append(inactiveModalDialog)

document.querySelector("body").append(inactiveModal)

let style = document.createElement("style")
style.textContent = `
    #screenSaverModal #fill-div {
        overflow: hidden;
        /*position: relative;*/
    }

    #screenSaverModal 
    #table-header, #scrolling-tbody {
        width: 100%;
    }

    #screenSaverModal #table-body-container {
        overflow: hidden;
        /*position: absolute;*/
        /*position: relative;*/
        top: 0;
        left: 0;
        width: 100%;
    }

    #screenSaverModal .dataTable thead tr {
        font-size: x-large;
    }

    #screenSaverModal .dataTable tbody {
        font-size: xxx-large;
    }

    #screenSaverModal #dataTableBody {
        overflow: hidden;
        position: absolute;
        top: 0;
        left: 0;
    }

    #screenSaverModal .tableItemName {
        text-align: left;
        font-size: xx-large;
        vertical-align: center;
        width: 35%;
        font-weight: bold;
    }

    #screenSaverModal .tableNext1 {
        font-family: 'Courier New', Courier, monospace;
        text-align: center;
        font-size: xxx-large;
        font-stretch: expanded;
        width: 25%;
        font-weight: bold;
    }

    #screenSaverModal .tableNext2 {
        font-family: 'Courier New', Courier, monospace;
        text-align: center;
        font-size: xxx-large;
        width: 20%;
        font-weight: bold;
    }

    #screenSaverModal table {
        width: 100%;
        border: 2px solid black;
    }

    #screenSaverModal tr {
        border: 1px solid black;
        border-collapse: collapse;
    }

    #screenSaverModal td, th {
        border: 1px dashed grey;
        padding: 3px;
    }
`

document.head.appendChild(style)

let inactivityTime = function (setTime = 60) {  // Set default screensaver start idle time
    let time2Open, time2Close;
    window.onload = resetTimer;
    // DOM Events
    document.onmousemove = resetTimer;
    document.onkeypress = resetTimer;

    function openModal() {
        inactive_fetchProducts()
        setTimeout(function () {
            let tableBodyContainer = document.querySelector('#table-body-container');
            let tableBody = document.querySelector('#table-body');

            let clonedBody = tableBody.cloneNode(true);
            tableBody.appendChild(clonedBody.querySelector('tbody'));

            const step = 1;

            function scrollTable() {
                let currentTop = parseInt(getComputedStyle(tableBody).marginTop) || 0;
                if (Math.abs(currentTop) >= tableBody.offsetHeight / 2) {
                    tableBody.style.marginTop = '0px'; // 滚动位置=原始表格体的高度时重置到0
                } else {
                    tableBody.style.marginTop = (currentTop - step) + 'px';
                }
                requestAnimationFrame(scrollTable); // 递归持续滚动
            }
            scrollTable();
        }, 2500); // 2.5s滚动冷却时间
        
        $('#screenSaverModal').modal('show');
    }

    function closeModal() {
        $('#screenSaverModal').modal('hide');
    }

    function resetTimer() {
        clearTimeout(time2Open);
        time2Close = setTimeout(closeModal, 250);
        time2Open = setTimeout(openModal, 1000 * setTime);
        // closeModal();
    }
};

document.addEventListener("DOMContentLoaded", function(){
    inactivityTime()
})

// Using Code from Nextdisp2.js
async function inactive_fetchProducts() {
    let dbclient = new MongoClient(dburi, {
        serverApi: {version: ServerApiVersion.v1, strict: true, deprecationErrors: true,
            useNewUrlParser: true, useUnifiedTopology: true}
    });

    try {
        await dbclient.connect();
        const sessions = dbclient.db(dbtargetDB).collection("pollinglog");
        const query = {removed: 0};
        const options = {'productCode': 1, 'bestbefore': 1, 'productLabel': 1};
        const cursor = sessions.find(query).sort(options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        const seenProducts = new Set();
        await cursor.forEach(product => {
            if (product.removed === 0) {
                seenProducts.add(product);
            }
        });
        productsDisplay = inactive_buildProductArr(seenProducts)
    } catch (e) {
        console.error(e)
    } finally {
        await dbclient.close()
        let htmlContent = '';
        productsDisplay.forEach(item => {
            if (item.bestbeforeArray.length > 0 && item.LocationArray.length > 0 && item.bestbeforeArray[0]) {
                console.log(item)
                let tableRow = document.createElement("tr")
                let productCol = document.createElement("td")
                let column1 = document.createElement("td")
                let column2 = document.createElement("td")
                let column3 = document.createElement("td")
                productCol.className = "tableItemName"
                productCol.textContent = `${(item.productCode ? item.productCode : "")} - ${item.productName}`
                column1.className = "tableNext1"
                column1.innerHTML = `${item.LocationArray[0]} ${item.hasOwnProperty("quanartineArray") && item.quanartineArray[0] === 1 ? '<span style="color: orange"><i class="ti ti-zoom-question"></i></span>': ""}<br>${new Date(item.bestbeforeArray[0]).toLocaleDateString()}`
                if (item.bestbeforeArray.length > 1 && item.LocationArray.length > 1){
                    column2.className = "tableNext2"
                    column2.innerHTML =  `${item.LocationArray[1]} ${item.hasOwnProperty("quanartineArray") && item.quanartineArray[1] === 1 ? '<span style="color: orange"><i class="ti ti-zoom-question"></i></span>': ""}<br>${new Date(item.bestbeforeArray[1]).toLocaleDateString()}`
                }
                if (item.bestbeforeArray.length > 2 && item.LocationArray.length > 2) {
                    column3.className = "tableNext2"
                    column3.innerHTML = `${item.LocationArray[2]} ${item.hasOwnProperty("quanartineArray") && item.quanartineArray[2] === 1 ? '<span style="color: orange"><i class="ti ti-zoom-question"></i></span>' : ""}<br>${new Date(item.bestbeforeArray[2]).toLocaleDateString()}`
                }
                tableRow.append(productCol, column1, column2, column3)
                document.querySelector("#table-body").append(tableRow)
            }
        })
    }
}
function inactive_buildProductArr(productList) {
    let productArray = []
    productList.forEach(item => {
        if (productArray.length > 0 && item.productCode !== "") {
            if (productArray[productArray.length - 1].productCode === item.productCode) {
                productArray[productArray.length - 1]["bestbeforeArray"].push(item.bestbefore ? item.bestbefore: "")
                productArray[productArray.length - 1]["LocationArray"].push(item.shelfLocation ? item.shelfLocation : "")
                productArray[productArray.length - 1]["quanartineArray"].push(item.hasOwnProperty("quanartine") ? parseInt(item.quanartine) : 0)
            } else {
                productArray.push(item)
                productArray[productArray.length - 1]["bestbeforeArray"] = [item.bestbefore ? item.bestbefore: ""]
                productArray[productArray.length - 1]["LocationArray"] = [item.shelfLocation ? item.shelfLocation : ""]
                productArray[productArray.length - 1]["quanartineArray"] = [item.hasOwnProperty("quanartine") ? parseInt(item.quanartine) : 0]
                delete productArray[productArray.length - 1].session;
                delete productArray[productArray.length - 1]._id;
                delete productArray[productArray.length - 1].POIPnumber;
                delete productArray[productArray.length - 1].removed;
                delete productArray[productArray.length - 1].loggingTime;
            }
        } else {
            productArray.push(item)
            productArray[productArray.length - 1]["bestbeforeArray"] = [item.bestbefore ? item.bestbefore: ""]
            productArray[productArray.length - 1]["LocationArray"] = [item.shelfLocation ? item.shelfLocation : ""]
            productArray[productArray.length - 1]["quanartineArray"] = [item.hasOwnProperty("quanartine") ? parseInt(item.quanartine) : 0]
            delete productArray[productArray.length - 1].session;
            delete productArray[productArray.length - 1]._id;
            delete productArray[productArray.length - 1].POIPnumber;
            delete productArray[productArray.length - 1].removed;
            delete productArray[productArray.length - 1].loggingTime;
        }
    })
    return productArray
}
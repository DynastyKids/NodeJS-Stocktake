const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion, ObjectId} = require('mongodb');
const path = require('path');

const Storage = require("electron-store");
const newStorage = new Storage();

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"
const sha1 = require('sha1')
var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);
let table = new DataTable('#table', {
    responsive: true,
    pageLength: 10,
    lengthMenu:[10,15,25,50,100],
    order: [[3, 'desc']]
});

let sessionList = []

document.addEventListener("DOMContentLoaded", async (event) => {
    await buildSessionListTable()
});

document.querySelector("#act_reloadTable").addEventListener("click",async function (ev) {
    await buildSessionListTable(true)
})

document.querySelector("#check_hiddenSessions").addEventListener("change", async (ev) => {
    // When Check button changes, buildSessionListTable will be called
    await buildSessionListTable(true)
})

document.querySelector("#addSessionModal").addEventListener("show.bs.modal", async function (ev) {
    //默认加载时候的操作
    document.querySelector("#addModal_sessioncode").value = await validateSessionCode()
    document.querySelector("#addModal_snapshotTime").value = getLocalISODateTime()
    document.querySelector("#addSessionModal_btnSubmit").removeAttribute("disabled")

    document.querySelector("#addSessionModal_btnSubmit").addEventListener("click",async (ev) => {
        let newSessionCode = document.querySelector("#addModal_sessioncode").value
        let newSessionTime = new Date(document.querySelector("#addModal_snapshotTime").value)
        document.querySelector("#addSessionModal_btnCancel").setAttribute("disabled","disabled")
        document.querySelector("#addSessionModal_btnSubmit").setAttribute("disabled","disabled")
        document.querySelector("#addSessionModal_btnSubmit").textContent = "Updating"
        let addSessionResult = await addNewSession(newSessionCode, newSessionTime)
        if (addSessionResult.acknowledged){ // Session Code添加成功，为每个产品添加SessionID
            createAlert("info","Processing Transactions to all related datas.")
            let addingLogResults = await addSessionCodeToStocks(newSessionCode, newSessionTime)
            let addLogFailed = false
            addingLogResults.forEach(eachResult =>{ if (!eachResult.acknowledged){ addLogFailed = true} })
            createAlert((addLogFailed ? "warning" : "success"),(addLogFailed ? "Some stocks were failed to add session record, Check Console for outputs": "All stocks are successfully marked"))
        } else{
            createAlert("danger","Failed to add new session. Please try again.")
        }
        bootstrap.Modal.getInstance(document.querySelector("#addSessionModal")).hide()
        await buildSessionListTable(true)
    })
})

document.querySelector("#removeModal").addEventListener("show.bs.modal", function (ev) {
    var dataID = ev.relatedTarget.getAttribute("data-bs-dataId")
    var sessionID = ev.relatedTarget.getAttribute("data-bs-sessionId")
    var operation = ev.relatedTarget.getAttribute("data-bs-operation")
    document.querySelector("#removeModal_dataId").value = dataID
    document.querySelector("#removeModal_sessionCode").value = sessionID
    if (operation === "delete"){
        document.querySelector("#removeModal_mainText").innerHTML = `Are you sure to Delete session ${sessionID} from database PERMANENTLY?<br><br><strong>This action is NOT revertable</strong>`
    } else if(operation === "hide"){
        document.querySelector("#removeModal_mainText").innerHTML = `Are you sure to hide session ${sessionID} from view?<br><br>Session can be found by turn on switch on action section`
    }

    document.querySelector("#removeModal_btnConfirm").disabled = false
    document.querySelector("#removeModal_btnConfirm").textContent = "Confirm"
    document.querySelector("#removeModal_btnConfirm").addEventListener("click", async function (ev) {
        document.querySelector("#removeModal_statusText").textContent = "Processing..."
        if (operation === "hide") { // 用户确认了隐藏，remove = -1
            await changeSessionHideStatus(sessionID)
        } else if (operation === "delete") { // 用户确认了删除，删除Stock记录，并添加changelog
            await deleteSession(sessionID)
        }
        await buildSessionListTable(true)
        bootstrap.Modal.getInstance(document.querySelector("#removeModal")).hide()
    })
})

async function fetchAllSession(forced = false){
    if (sessionList.length <= 0 || forced) {
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        const options = {};
        const sessions = client.db(targetDB).collection("pollingsession");
        const condition = !(document.querySelector("#check_hiddenSessions").checked) ? {$or: [{exist: 1}, {exist: {$exists: false}}]}: {$or:[{exist: {$ne:0}}]}
        let result;
        try {
            await client.connect();
            result = await sessions.find(condition, options).toArray();
        } finally {
            await client.close();
        }
        return result;
    } else {
        return sessionList
    }
}

async function buildSessionListTable(forced = false) {
    document.querySelector("#loadingStatus").style = ""
    let sessionList = await fetchAllSession(forced)
    table.clear().draw()
    sessionList.forEach(eachItem => {
        table.row.add([
            `${(eachItem.hasOwnProperty("session") ? eachItem.session : "")}`,
            `${(eachItem.hasOwnProperty("sessionTime") ? new Date(eachItem.sessionTime).toLocaleString('en-AU') : "")}`,
            `${(eachItem.hasOwnProperty("stockInfo") ? eachItem.stockInfo.value : "")}`,
            `<a href="../sessions/view.html?session=${eachItem.session}" class="actions" data-bs-dataId="${eachItem._id}" data-bs-sessionId="${eachItem.session}">View</a>` +
            `<a href="#" class="actions removeModal" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-operation="hide" data-bs-dataId="${eachItem._id}" data-bs-sessionId="${eachItem.session}">${(eachItem.exist === 1 || !eachItem.hasOwnProperty("exist")? "Hide" : "Show")}</a>`+
            `<a href="#" class="actions removeModal" data-bs-toggle="modal" data-bs-target="#removeModal" data-bs-operation="delete" data-bs-dataId="${eachItem._id}" data-bs-sessionId="${eachItem.session}">Delete</a>`
        ]).draw(false);
    })
    document.querySelector("#loadingStatus").style = "display:none"
}

async function validateSessionCode(){
//     On User Submit / Create, confirm this session code has not been used yet
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1,  useNewUrlParser: true,  useUnifiedTopology: true }
    });
    let setSessionCode = `${getLocalISODateTime().substring(2,10).replaceAll("-","")}A${hexGenerator(4).substring(0,5)}`
    const sessions = client.db(targetDB).collection("pollingsession");
    let result;
    try {
        await client.connect();
        result = await sessions.find({session:setSessionCode}).toArray();
        while (result.length > 0){
            setSessionCode = `${getLocalISODateTime().substring(2,10).replaceAll("-","")}A${hexGenerator(4).substring(0,5)}`
            result = await sessions.find({session:setSessionCode}).toArray();
        }
    } finally {
        await client.close();
    }
    return setSessionCode;
}

function hexGenerator(bit = 7){
    var randomHex = Math.floor(Math.random() * 16777215).toString(16);
    while (randomHex.length < bit) {
        randomHex = '0'+randomHex;
    }
    randomHex = randomHex.toUpperCase();
    return randomHex;
}

function getLocalISODateTime(){
    let dateString = `${new Date().getFullYear()}-${(new Date().getMonth()+1).toString().padStart(2,"0")}-${new Date().getDate().toString().padStart(2,"0")}`
    let timeString = `${new Date().getHours().toString().padStart(2,"0")}:${new Date().getMinutes().toString().padStart(2,"0")}:${new Date().getSeconds().toString().padStart(2,"0")}`
    return `${dateString}T${timeString}`
}

async function addNewSession(sessionCode = "", sessionTime = new Date()){
//     On User Submit / Create, confirm this session code has not been used yet
    let response = {acknowledged: false}
    if (sessionCode.length > 0){
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        const sessions = client.db(targetDB).collection("pollingsession");
        try {
            await client.connect();
            let session = await sessions.find({session:sessionCode}).toArray();
            if (session.length <= 0){
                response = await sessions.insertOne({
                    session: sessionCode,
                    sessionTime: sessionTime,
                    loggingInfo: {loggingTime:new Date()},
                    stockInfo: {},
                    exist: 1
                })
            }
        } catch (e) {
            console.log("Errors while processing session add on:",sessionCode)
        } finally {
            await client.close()
        }
    }
    return response
}

async function addSessionCodeToStocks(sessionCode, dateTime = new Date()) {
    let response = []
    if (sessionCode.length >= 10 && dateTime instanceof Date) {
        let client = new MongoClient(uri, {
            serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}
        });
        const sessions = client.db(targetDB).collection("pollinglog");
        try {
            await client.connect();
            let results = await sessions.find({removed: 0}).toArray();
            for (let i = 0; i < results.length; i++) {
            //     要求时间小于等于当前时间，则添加changelog到当前记录
                document.querySelector("#addModal_statusText").textContent = `Processing ${i} out of ${results.length} items`
                let beforeSessions = results[i].hasOwnProperty("sessions") ? results[i].sessions: []
                if (results[i].hasOwnProperty("createTime") && results[i].createTime.getTime() <= dateTime.getTime()){
                    response.push( await sessions.updateMany({_id: new ObjectId(results[i]._id)}, {
                        $addToSet: {
                            sessions: sessionCode,
                            changelog:{
                                datetime: new Date(),
                                events:{field: "sessions", before: beforeSessions}
                            }
                        }
                    }, {upsert: false}))
                } else if (results[i].hasOwnProperty("loggingTime") && results[i].loggingTime.getTime() <= dateTime.getTime()){
                //     If stock does not have CreateTime property, using loggingTime instead
                    response.push(await sessions.updateMany({_id: new ObjectId(results[i]._id)}, {
                        $addToSet: {
                            sessions: sessionCode,
                            changelog:{
                                datetime: new Date(),
                                events:{field: "sessions", before: beforeSessions}
                            }
                        }
                    }, {upsert: false}))
                }
            }
        } catch (e) {
            console.log("Errors while processing session add on:", sessionCode)
        } finally {
            await client.close()
        }
    }
    return response
}

async function changeSessionHideStatus(sessionCode= ""){
    let response = {acknowledged: false}
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1,  useNewUrlParser: true,  useUnifiedTopology: true }
    });
    const sessions = client.db(targetDB).collection("pollingsession");
    if (sessionCode.length > 0) {
        try{
            await client.connect();
            let sessionData = await sessions.find({session:sessionCode}).toArray()
            if (sessionData.length > 0){
                response = await sessions.updateMany({_id: new ObjectId(sessionData[0]._id)}, {
                    $set:{ exist: (sessionData[0].hasOwnProperty("exist") ? parseInt(sessionData[0].exist) * -1: -1)},
                    $push: {changelog: {datetime: new Date(), events: [{action:"hide"}]} }
                });
            }
        } catch (e) {
            console.error("Changing Session Status to/from hide failed: ",e)
        } finally {
            await client.close();
        }
    }
    return response;
}

async function deleteSession(sessionCode= ""){
    let response = {acknowledged: false}
    let client = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1,  useNewUrlParser: true,  useUnifiedTopology: true }
    });
    const sessions = client.db(targetDB).collection("pollingsession");
    const stocks = client.db(targetDB).collection("pollinglog");
    if (sessionCode.length > 0) {
        try{
            await client.connect();
            let targetSession = await sessions.find({session:sessionCode}).toArray()
            if (targetSession.length > 0){
                response = await sessions.updateMany({_id: new ObjectId(targetSession[0]._id)},{
                    $set: {exist: 0, changelog:{datetime: new Date(), events: [{action:"delete"}]}}
                });
                var stockToChange = await stocks.find({session: sessionCode}).toArray()
                for (let i = 0; i < stockToChange.length; i++) {
                    document.querySelector("#removeModal_statusText").textContent = `Deleting match data, processing ${i} of ${stockToChange.length} records.`
                    await stocks.updateMany({_id: new ObjectId(stockToChange[i]._id)},{
                        $push: {
                            changelog: {
                                datetime: new Date(),
                                events: [{field:"sessions", before: stockToChange[i].sessions}]
                            }
                        },
                        $pull: {sessions: sessionCode}
                    })
                }
            }
        } catch (e) {
            console.error("Changing Session Status to/from hide failed: ",e)
        } finally {
            await client.close();
        }
    }
    return response;
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
    } else if (status === "warning") {
        alertElement.className= "alert alert-secondary alert-dismissible bg-warning text-white border-0 fade show"
        svgImage.ariaLabel = "Warning: "
        svgImage.innerHTML = `<use xlink:href="#info-fill"/>`
    } else {
        alertElement.className= "alert alert-secondary alert-dismissible bg-info text-white border-0 fade show"
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
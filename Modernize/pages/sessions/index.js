const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const path = require('path');

const Storage = require("electron-store");
const newStorage = new Storage();
const moment = require('moment-timezone')
moment.locale("en-AU")

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

var $ = require('jquery');
var DataTable = require('datatables.net-responsive-bs5')(window, $);
let table = new DataTable('#table', {
    responsive: true,
    pageLength: 10,
    lengthMenu:[10,15,25,50,100],
    order: [[3, 'desc']]
});
document.addEventListener("DOMContentLoaded", async (event) => {
    let sessionList = await getAllSession()

    table.clear().draw()
    console.log(sessionList)
    sessionList.forEach(eachItem =>{
        table.row.add([
            `${eachItem.session}`,
            `${moment(eachItem.startDate).format("lll")}`,
            `${moment(eachItem.endDate).format("lll")}`,
            `${eachItem.logTime}`,
            ``
        ]).draw(false);
    })
    document.querySelector("#loadingStatus").style = "display:none"
    let sessionCode = validateSessionCode()
    console.log(validateSessionCode())
});

async function getAllSession(){
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    const options = {sort: { startDate: -1 },};
    const sessions = client.db(targetDB).collection("pollingsession");
    let result;
    let htmlContent=""
    try {
        await client.connect();
        result = await sessions.find({}, options).toArray();
    } finally {
        await client.close();
    }
    return result;
}

async function validateSessionCode(sessionCode = null){
//     On User Submit / Create, confirm this session code has not been used yet
    let client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let setSessionCode = sessionCode ? sessionCode : hexGenerator(6)
    const sessions = client.db(targetDB).collection("pollingsession");
    let result;
    try {
        await client.connect();
        result = await sessions.find({session:setSessionCode}).toArray();
        while (result.length > 0){
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

document.querySelector("#act_addSession").addEventListener("click",async (ev) => {
    ev.preventDefault()
})

document.querySelector("#addSessionModal").addEventListener("show.bs.modal", async function (ev) {
    document.querySelector("#addModal_sessioncode").value = await validateSessionCode()
    document.querySelector("#addModal_sessionStart").value = moment().format("YYYY-MM-DD HH:mm:ss")
    document.querySelector("#addModal_sessionEnd").value = moment().format("YYYY-MM-DD HH:mm:ss")

    document.querySelector("#addSessionModal_btnsubmit").removeAttribute("disabled")
})

document.querySelector("#addSessionModal_btnsubmit").addEventListener("click",(ev)=>{
//     用户确认创建一个新Session
//     Session创建后，添加Snapshot字段，获取当前pollinglog的产品ID，以便映射相关产品
//     另外允许用户创建
})

document.querySelector("#")
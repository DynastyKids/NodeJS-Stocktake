const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const fs=require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')
let lastSession=""
const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true}});

document.addEventListener("DOMContentLoaded", (event) => {
    getSessions()
});

async function getSessions(){
    const options = {sort: { startDate: -1 },};
    const sessions = client.db(credentials.mongodb_db).collection("pollingsession");
    let cursor;
    let htmlContent=""
    try {
        await client.connect();
        cursor = await sessions.find({}, options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        let first=true
        for await (const x of cursor) {
            console.log(x)
            htmlContent += `<option value="${x.session}">${x.startDate.substring(0,10)} > ${x.session}</option>`
            if(first){
                htmlContent = `<option value="${x.session}" selected>${x.startDate.substring(0,10)} > ${x.session} (latest)</option>`
                await getAllItemsFromSession(x.session)
                lastSession=x.session
                first=false
            }
        }

        if (htmlContent.length > 0){
            document.querySelector("#sessionSelector").innerHTML = htmlContent
        }
    } catch(err){
        console.error(err)
    }

    return htmlContent;
}

document.querySelector("#sessionSelector").addEventListener("change",()=>{
    document.querySelector("#activeTBody").innerHTML = ""
    getAllItemsFromSession(document.querySelector("#sessionSelector").value)
})

async function getAllItemsFromSession(sessionCode){
    let nowTime= moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')
    const tomorrow = (new Date('today')).setDate(new Date('today').getDate()+1)
    const options = {sort: { startDate: -1 },};
    const sessions = client.db(credentials.mongodb_db).collection("pollinglog");
    let cursor;
    let htmlContent=""
    if(sessionCode == ""){
        sessionCode = lastSession
    }
    try {
        await client.connect();
        cursor = sessions.find({session: sessionCode});
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
            document.querySelector("#activeTBody").innerHTML = "<tr><td colspan=5>No item found in this session available</td></tr>"
        } 

        for await (const x of cursor) {
            htmlContent+=`<tr>
                <td><small>${x.productLabel}</small></td>
                <td><small>${x.productCode} - ${x.productName}</small></td>
                <td><small>${x.quantity} ${x.quantityUnit}</small></td>
                <td>${x.bestbefore}</td>
                <td><a href="#">Consumed</a></td></tr>`
        }

        document.querySelector("#activeTBody").innerHTML = htmlContent
    } catch(err){
        console.error(err)
        htmlContent = "<tr><td colspan=5>No item found in this session available</td></tr>"
        document.querySelector("#activeTBody").innerHTML = htmlContent
    // } finally {
        // client.close();
    }

    return htmlContent;
}
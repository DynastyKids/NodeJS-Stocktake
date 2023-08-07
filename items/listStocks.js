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

var $ = require('jquery');
var DataTable = require('datatables.net')(window, $);
require('datatables.net-responsive');



document.addEventListener("DOMContentLoaded", (event) => {
    getAllStockItems().then(result=>{
        let dataArray=[]
        if(result.acknowledged){
                result.resultSet.forEach(element => {
                    dataArray.push([element.productLabel,`${element.productCode} - ${element.productName}`,`${element.quantity} ${element.quantityUnit}`, element.bestbefore, element.shelfLocation, `<a href="#" data-bs-toggle="modal" data-bs-target="#consumeModal" data-bs-stockid="${element.productLabel}">Consume</a>`])
                })
        }
        let table = new DataTable('#stockTable', {
            responsive: true,
            data: dataArray
        });
    })
});

async function getAllStockItems(){
    let nowTime = moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss")
    const sessions = client.db(credentials.mongodb_db).collection("pollinglog");
    let cursor;
    let result = {acknowledged: false, resultSet: [], message:""}

    try {
        const query = {consumed: 0}
        const options = {sort:{bestbefore: -1}}
        await client.connect();
        cursor = await sessions.find(query,options)
        if ((await sessions.countDocuments(query)) > 0) {
            result.acknowledged = true
            result.resultSet = await cursor.toArray()
        }
    } catch (err) {
        console.error(err)
        result['message'] = err
    }

    return result
}


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
        cursor = sessions.find({$or: [{session:""},{session:sessionCode}]});
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
                <td>${x.shelfLocation}</td>
                <td class="action">
                    <a href="#" data-bs-toggle="modal" data-bs-target="#consumeModal" data-bs-stockid="${x.productLabel}">Consume</a>
                    <a href="#" data-bs-toggle="modal" data-bs-target="#stockEditModal" data-bs-stockid="${x.productLabel}">Edit</a>
                </td></tr>`
        }

        document.querySelector("#activeTBody").innerHTML = htmlContent
    } catch(err){
        console.error(err)
        htmlContent = "<tr><td colspan=5>No item found in this session available</td></tr>"
        document.querySelector("#activeTBody").innerHTML = htmlContent
    }

    return htmlContent;
}
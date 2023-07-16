const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const path = require('path');
const credentials = require(path.resolve( __dirname, "../credentials.js" ))
const moment = require('moment-timezone')

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

async function getSessionInfo(sessionCode){
    const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
    const options = {sort: { loggingTime: -1 }};
    const sessions = client.db("chatestsyd").collection("pollingsession");
    let cursor;
    let htmlContent=""
    try {
        await client.connect();
        cursor = sessions.find({session:sessionCode});
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const x of cursor) {
            htmlContent = `Session Time: ${x.startDate} => ${x.endDate}`
        }

        if (htmlContent.length > 0){
            document.querySelector("#sessionTimeText").innerHTML = htmlContent
        }
    } finally {
        client.close();
    }
    return htmlContent;
}

async function getSessionItems(sessionCode){
    const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
    const options = {sort: { startDate: -1 },};
    const sessions = client.db("chatestsyd").collection("pollinglog");
    let cursor;
    let htmlContent=""
    try {
        await client.connect();
        cursor = sessions.find({session:sessionCode});
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const x of cursor) {
            htmlContent += `<tr><td>${x.productCode} - ${x.productName}</td><td>${x.productLabel.substring(8)}</small></td><td>${x.shelfLocation}</td><td>${x.quantity}</td><td>${x.quantityUnit}</td><td>${x.bestbefore}</td><td><a href="#">Edit</a></td></tr>`
        }

        if (htmlContent.length > 0){
            document.querySelector("#activeTBody").innerHTML = htmlContent
        }
    } finally {
        client.close();
    }
    return htmlContent;
}

window.onload = () => {
    const QueryString = require('querystring')
    let query = QueryString.parse(global.location.search)
    let sessionId = query['?id']
    document.querySelector('#sessionTitle').innerText = `Session ${sessionId}`
    getSessionInfo(sessionId)
    getSessionItems(sessionId)
    setInterval(function () {
        console.log("database Refreshed")
        getSessionItems(sessionId)
    }, 10000);

    
}
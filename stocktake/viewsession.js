const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const path = require('path');
const fs=require('fs');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../localsettings.json')));
const moment = require('moment-timezone')

const { ipcRenderer } = require('electron');

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

    ipcRenderer.on('server-info', (event, { address, port }) => {
        document.querySelector("#sessionConfigText").innerText = `Server Address: ${address}\t\t\tPort: ${port}`;
    });

    setInterval(function(){qrv2patch()},120000) // 120秒更新一次V2的数据信息
}

async function qrv2patch(){
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	const logsessions = client.db("chatestsyd").collection("pollinglog");
	const productsessions = client.db("chatestsyd").collection("products");
	var productList = productsessions.find({})
	for await (const x of productList) {
		var whereCondition = {productCode: x.labelname}
		var updateInfo = {
			$set:{productCode:x.itemcode, productName:x.labelname}
		}
		var updateResult = await logsessions.updateMany(whereCondition,updateInfo)
	}

	var logLists = logsessions.find({})
	for await(const x of logLists){
		if (x.productCode.includes("TP") || x.productCode.includes("SP") || x.productCode=="IG001") {
			if (x.quantityUnit == "" && x.quantity<50) {
				logsessions.updateOne({_id:x._id},{$set:{quantityUnit:"carton"}})
			} else if (x.quantityUnit == "" && x.quantity>=50) {
				logsessions.updateOne({_id:x._id},{$set:{quantityUnit:"bottles"}})
			}
		}
		
	}
}
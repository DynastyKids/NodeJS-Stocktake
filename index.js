const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const path = require('path');
const fs=require('fs');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/localsettings.json')));
const moment = require('moment-timezone')

const { ipcRenderer } = require('electron');

ipcRenderer.on('server-info', (event, { address, port }) => {
	document.querySelector("#serverAddressText").innerText = `Server running at http://${address}:${port}`;
});

ipcMain.on('get-user-data-path', (event) => {
	event.returnValue = app.getPath('userData')
})

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

async function getCurrentSession(){
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	const options = {sort: { startDate: 1 },};
	const sessions = client.db("chatestsyd").collection("pollingsession");
	let localTime = moment(new Date()).tz("Australia/Sydney")
	let findingQuery = {endDate:{$gte: localTime.format('YYYY-MM-DD HH:mm:ss')}}
	let cursor;
	let htmlContent=""
    try {
        await client.connect();
		cursor = sessions.find(findingQuery, options);
		console.log(JSON.stringify(findingQuery))
		if ((await sessions.countDocuments(findingQuery)) === 0) {
			console.log("[MongoDB] Nothing Found");
		}

		for await (const  x of cursor) {
			htmlContent += `<tr><td>${x.session}</td><td>${x.startDate}</td><td>${x.endDate}</td><td><a href="stocktake/viewsession.html?id=${x.session}">View</a></td></tr>`
		}

		if (htmlContent.length > 0){
			document.querySelector("#activeSessionTBody").innerHTML = htmlContent
		}
		// console.log(cursor);
    } finally {
        client.close();
    }

	return [cursor,htmlContent];
}

window.onload = () => {
	console.log(getCurrentSession().catch(console.log));
	qrv2patch()
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
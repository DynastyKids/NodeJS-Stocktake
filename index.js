const { Autocomplete } = require("@tarekraafat/autocomplete.js")
const { ipcRenderer, ipcMain } = require("electron");
const MongoClient = require('mongodb').MongoClient;
const { ServerApiVersion } = require('mongodb');
const path = require('path');
const fs = require('fs');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/localsettings.json')));
const moment = require('moment-timezone')

ipcRenderer.on('server-info', (event, { address, port, addressSet }) => {
	let addressHTML = ""
	if (addressSet.length > 0){
		addressSet.forEach(eachadd =>{
			addressHTML += eachadd + "<br>"
		})
		document.querySelector("#serverAddressText").innerHTML = addressHTML;
	} else {
		document.querySelector("#serverAddressText").innerHTML = address;
	}
	document.querySelector("#serverPortText").innerText = port;
});

const uri = encodeURI(credentials.mongodb_protocol + "://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true } });


async function getCurrentSession() {
	let localTime = moment(new Date()).tz("Australia/Sydney")
	const options = { sort: { startDate: 1 }, };
	const sessions = client.db(credentials.mongodb_db).collection("pollingsession");
	let findingQuery = { endDate: { $gte: localTime.format('YYYY-MM-DD HH:mm:ss') } }
	let cursor;
	let htmlContent = ""
	try {
		await client.connect();
		cursor = sessions.find(findingQuery, options);
		if ((await sessions.countDocuments(findingQuery)) === 0) {
			console.log("[MongoDB] Nothing Found");
		}

		for await (const x of cursor) {
			htmlContent += `<tr><td>${x.session}</td><td>${x.startDate}</td><td>${x.endDate}</td><td><a href="stocktake/viewsession.html?id=${x.session}">View</a></td></tr>`
		}

		if (htmlContent.length > 0) {
			document.querySelector("#activeSessionTBody").innerHTML = htmlContent
		}
	} catch (err) {
		console.error(err)
	}

	return [cursor, htmlContent];
}

window.onload = () => {
	console.log(getCurrentSession().catch(console.log));
	qrv2patch()
}

async function qrv2patch() {
	const logsessions = client.db(credentials.mongodb_db).collection("pollinglog");
	const productsessions = client.db(credentials.mongodb_db).collection("products");
	var productList = productsessions.find({})
	for await (const x of productList) {
		var whereCondition = { productCode: x.labelname }
		var updateInfo = {
			$set: { productCode: x.itemcode, productName: x.labelname }
		}
		var updateResult = await logsessions.updateMany(whereCondition, updateInfo)
	}

	var logLists = logsessions.find({})
	for await (const x of logLists) {
		if (String(x.productCode).includes("TP") || String(x.productCode).includes("SP") || String(x.productCode) == "IG001") {
			if (x.quantityUnit == "" && x.quantity < 50) {
				logsessions.updateOne({ _id: x._id }, { $set: { quantityUnit: "carton" } })
			} else if (x.quantityUnit == "" && x.quantity >= 50) {
				logsessions.updateOne({ _id: x._id }, { $set: { quantityUnit: "bottles" } })
			}
		}
	}
}

document.querySelector("#formSelectAction").addEventListener("change", function(e){
	if (this.value === 'consume') {
		document.querySelector("#inputNewLocation").value = ""
		document.querySelector("#inputNewLocation").setAttribute("disabled","")
	} else if (this.value === 'move') {
		document.querySelector("#inputNewLocation").value= ""
		document.querySelector("#inputNewLocation").removeAttribute("disabled")
	}
})

document.querySelector("#inputShelfLocation").addEventListener("input", async function (e) {
	if (this.value.length >= 3) {
		// 当用户输入库位信息后,转换为大写,然后开始搜索是否有符合的信息,如果没有则无反应
		const regex = /[A-Za-z]{2}[0-9]/
		if(regex.test(String(this.value))){
			let resultOne = await inputSearchShelf(String(this.value).toUpperCase());
			if(resultOne !== null) {
				document.querySelector("#inputProductLabel").value = (resultOne.productLabel ? resultOne.productLabel : "")
				//disabled section text
				document.querySelector("#inputProductName").value = (resultOne.productName ? resultOne.productName : "")
				document.querySelector("#inputQuantity").value = `${(resultOne.quantity ? resultOne.quantity : "")} ${(resultOne.quantityUnit ? resultOne.quantityUnit : "")}`
				document.querySelector("#inputBestBefore").value = (resultOne.bestbefore ? resultOne.bestbefore : "")
			}
		}
	}
});

document.querySelector("#addMovementForm").addEventListener("submit", async function(e){
	e.preventDefault();
	var formAction = document.querySelector("#formSelectAction").value
	var result = {acknowledged: false}
	var regexLabel = /[0-9]{8}[A-Fa-f0-9]{7}/
	if(regexLabel.test(document.querySelector("#inputProductLabel").value)){
		//用户提交表单,修改loggingTime,如果是move则更新shelfLocation,如果是consumed则修改consumed为1
		var productInfo={productLabel: document.querySelector("#inputProductLabel").value}
		const session = client.db(credentials.mongodb_db).collection("pollinglog");
		if(formAction === "consume"){
			result = await session.updateMany(productInfo,{consumed :1, loggingTime: moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')}, {upsert:false})
		}
		if(formAction === "move"){
			var newLocation = document.querySelector("#inputNewLocation").value
			const regex = /[A-Za-z]{2}[0-9]/
			if(regex.test(String(newLocation))){
				result = await session.updateMany(productInfo,{shelfLocation: newLocation, loggingTime: moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')}, {upsert:false})
			}
		}
	}
	console.log(result)
})

async function inputSearchLabel(labelid) {
	// 通过label搜索在库物品，需要确认：物品未被使用，使用findOne，按照loggingTime -1排序
	let result={}
	try {
		const logsessions = client.db(credentials.mongodb_db).collection("pollinglog");
		const query = { productLabel: labelid, consumed: 0 }
		const options = {
			sort: { loggingTime: -1 },
			projection: { _id: 1, productCode: 1, quantity: 1, quantityUnit: 1, shelfLocation: 1, productName: 1, productLabel: 1, bestbefore: 1 }
		}
		let productInfo = await logsessions.findOne(query, options)
		console.log(productInfo)
		result = productInfo
	} catch (err) {
		console.error(err)
	}

	return result
}

async function inputSearchShelf(shelfString) {
	// 通过库位在库物品，需要确认：物品未被使用，使用loggingTime -1，只取一个findOne
	let result={}
	try {
		const logsessions = client.db(credentials.mongodb_db).collection("pollinglog");
		const query = { shelfLocation: shelfString, consumed: 0 }
		const options = {
			sort: { loggingTime: -1 },
			projection: { _id: 0, productCode: 1, quantity: 1, quantityUnit: 1, shelfLocation: 1, productName: 1, productLabel: 1, bestbefore: 1 }
		}
		let productInfo = await logsessions.findOne(query, options)
		console.log(productInfo)
		result = productInfo
	} catch (err) {
		console.error(err)
	}

	return result
}
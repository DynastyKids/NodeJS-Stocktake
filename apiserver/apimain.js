const express = require('express')
const bodyParser = require('body-parser')
const expressApp = express()
const port = 3000
const router = express.Router()
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
// const credentials = JSON.parse(require("../credentials.js" ))
const fs=require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone');
const { session } = require('electron');

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

router.get('/api/v1/sessions', async (req, res) => { // 获取所有当前可用的session
	const options = {sort: { startDate: 1 },};
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	const sessions = client.db("chatestsyd").collection("pollingsession");
	let localTime = moment(new Date()).tz("Australia/Sydney")
	let findingQuery = {endDate:{$gte: localTime.format('YYYY-MM-DD HH:mm:ss')},startDate:{$lte: localTime.format('YYYY-MM-DD HH:mm:ss')}}
	let cursor;
    let sessionResults = []

    try {
        await client.connect();
		cursor = sessions.find(findingQuery, options);
		console.log(JSON.stringify(findingQuery))
		if ((await sessions.countDocuments(findingQuery)) === 0) {
			console.log("[MongoDB] Nothing Found");
		}

		for await (const  x of cursor) {
			sessionResults.push({session:x.session,startDate:x.startDate,endDate:x.endDate})
		}
        res.json(sessionResults)
    } catch(err){
        res.status(500).json(JSON.stringify(err))
    }finally {
        client.close();
    }
})

router.post('/api/v1/sessions/join', async (req, res) => { //检查当前session是否可用，如果可用返回session信息
	const sessioncode = req.body.session;

	const options = {sort: { startDate: 1 },};
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	const sessions = client.db("chatestsyd").collection("pollingsession");
	let localTime = moment(new Date()).tz("Australia/Sydney")
	// let findingQuery = {session:sessioncode,endDate:{$gte: localTime.format('YYYY-MM-DD HH:mm:ss')},startDate:{$lte: localTime.format('YYYY-MM-DD HH:mm:ss')}}
	let findingQuery = {session:sessioncode,endDate:{$gte: localTime.format('YYYY-MM-DD HH:mm:ss')}}
	let cursor;
    let sessionResults = []

    try {
        await client.connect();
		cursor = sessions.find(findingQuery, options);
		console.log(JSON.stringify(findingQuery))
		if ((await sessions.countDocuments(findingQuery)) === 0) {
			console.log("[MongoDB] Nothing Found");
		}

		for await (const x of cursor) {
			sessionResults.push({session:x.session,startDate:x.startDate,endDate:x.endDate})
		}
        res.json(sessionResults)
    } catch(err){
        res.status(500).json(JSON.stringify(err))
    }finally {
        client.close();
    }
})

router.get('/api/v1/sessionlog', async (req, res) => {
    // 获取所有当前session的产品盘点信息，使用labelid去重
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	const sessions = client.db("chatestsyd").collection("pollinglog");
	let localTime = moment(new Date()).tz("Australia/Sydney")
	let findingQuery = {session:req.query.session}
	let cursor;
    let sessionResults = []
    try {
        await client.connect();
		cursor = sessions.find(findingQuery, {sort: { productCode: 1 ,loggingTime: -1 }});
		// console.log(JSON.stringify(findingQuery))
		if ((await sessions.countDocuments(findingQuery)) === 0) {
			console.log("[MongoDB] Nothing Found");
		}

		for await (const  x of cursor) {
			sessionResults.push(x)
		}
        res.json(sessionResults)
    } catch(err){
        res.status(500).json(JSON.stringify(err))
    }finally {
        client.close();
    }
})

router.get('/api/v1/products', async (req, res) => {
    // 获取所有当前session的产品盘点信息，使用labelid去重
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	const sessions = client.db("chatestsyd").collection("products");
	let cursor;
    let products = []
    try {
        await client.connect();
		cursor = await sessions.find({}, {sort: { itemcode: 1 }});
		// console.log(JSON.stringify(findingQuery))
		if (cursor < 1) {
			console.log("[MongoDB] Nothing Found");
		}
		for await (const  x of cursor) {
			products.push(x)
		}
        res.json(products)
    } catch(err){
        res.status(500).json(JSON.stringify(err))
    }finally {
        client.close();
    }
})

router.post('/api/v1/sessionlog/add',async (req,res) => {
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	const session = req.body.session;
	const iteminfo = req.body.item;
	let localTime = moment(new Date()).tz("Australia/Sydney")

	console.log(session,iteminfo)
	var mongodata = {}
	if (isBase64String(iteminfo)) {
		var productInfo = JSON.parse(atob(iteminfo))
		console.log(productInfo)
		mongodata={ // Default data assembled by V1 code
			session: req.body.session,
			productCode: productInfo.Code,
			quantity: productInfo.Qty,
			quantityUnit: "",
			shelfLocation: "",
			POIPnumber: "",
			productName: "",
			bestbefore: "",
			productLabel: productInfo.LabelId,
			labelBuild: 1,
		}
		if(productInfo.POIP){ // V2 code or higher
			console.log("itemadd:V2")
			mongodata.POIPnumber = productInfo.POIP;
			// Hardcode for V2
			// V2版本中productname在code中，则需要从表中重新提取
			if(productInfo.Prod == "" && productInfo.Code.length > 5){
				mongodata.productName = productInfo.Prod;
			}
			if (Number.isInteger(productInfo.Unit)) {
				mongodata.quantity = productInfo.Unit
			}
			mongodata.productName = productInfo.Prod;
			mongodata.labelBuild = 2;
		}
		if(productInfo.Build){ // V3 or later, using all info provided
			console.log("itemadd:V3")
			mongodata.quantityUnit = productInfo.Unit.toLowerCase().replace("ctns","carton").replace("btls","bottle");
			mongodata.POIPnumber = productInfo.POIP;
			mongodata.productName = productInfo.Prod;
			mongodata.bestbefore = productInfo.Bestbefore;
			mongodata.labelBuild = 3;
		}
	}
	// console.log("Before insert",mongodata)
	// InsertOne unsuccessful => undefined,
	// InsertOne success => object 
	let insertData = await insertOneToLog(mongodata)
	if((await insertData).message == "success"){
		// console.log("JSONreturn",insertData)
		res.json(insertData)
	}
})


router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerDocument));

module.exports = router

async function insertOneToLog(insertData){
	const inserterClient = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

	console.log("On Async InsertONE")
	try {
		await inserterClient.connect()
		const session = inserterClient.db("chatestsyd").collection("pollinglog");
		var result = await session.findOne({session: insertData.session, productCode: insertData.productCode,productLabel:insertData.productLabel})
		var returnData;
		console.log("findone",result)
		if (result == null) {
			result = await session.insertOne(insertData)
			console.log("insertone",result)
			returnData = {message:"success", method:"insertOne",result: result}
		} else {
			returnData = {message:"success", method:"findOne",result: result}
		} 
		return returnData
	} catch (err) {
		console.log(err)
		return {message:"error", method:null ,result: err.toString}
	} finally {
		await inserterClient.close()
	}
}

async function isValidSession(sessioncode) {
	const sessionClient = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	let findingQuery = {session:sessioncode,endDate:{$gte: localTime.format('YYYY-MM-DD HH:mm:ss')},startDate:{$lte: localTime.format('YYYY-MM-DD HH:mm:ss')}}
	try {
		await sessionClient.connect()
		const session = sessionClient.db("chatestsyd").collection("pollingsession");
		const result = await session.find(findingQuery).count()
		if(result > 0){
			return true;
		} else {
			return false;
		}
	} catch (err) {
		console.log(err)
		return false;
	} finally {
		await sessionClient.close()
	}
}

function isJsonString(text) {
    try {
        JSON.parse(text);
    } catch (e) {
        return false;
    }
    return true;
}

function isBase64String(text){
	try {
		atob(text)
	} catch (e) {
		return false;
	}
	return true;
}

function base64product(text){
	try{
		var productInfo = atob(text)
		if(productInfo.Build !== undefined){ // V3 or later, using all info provided

		} else if(productInfo.POIP !== undefined){ // V2 code or higher

		} else { // V1 Code, direct read

		}
	} catch(e){
		return ""
	} 
}
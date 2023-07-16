const express = require('express')
const app = express()
const port = 3000
const router = express.Router()

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const credentials = require("../credentials.js" )
const moment = require('moment-timezone');
const { session } = require('electron');

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

router.get('/api/v1/sessions', async (req, res) => {
    // 微信局域网检查会话代码，本地客户端获取后在盘点逻辑中使用
	const options = {sort: { startDate: 1 },};
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});
	const sessions = client.db("chatestsyd").collection("pollingsession");
	let localTime = moment(new Date()).tz("Australia/Sydney")
	let findingQuery = {endDate:{$gte: localTime.format('YYYY-MM-DD HH:mm:ss')}}
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

router.post('/api/v1/sessionlogs/itemadd',async (req,res) => {
	const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

	const session = req.query.session;
	const item = req.query.item;

	try {
		await client.connect()
		const session = client.db("chatestsyd").collection("pollinglog");
		const result = session.insertOne(Buffer.from(session,'base64').toString())

		res.json(result)
	} catch (err) {
		console.log(err)
		res.status(500).json({err:err.toString})
	} finally {
		await client.close()
	}
})


router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerDocument));

module.exports = router

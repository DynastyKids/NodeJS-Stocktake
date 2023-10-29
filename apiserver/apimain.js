const express = require("express");
const bodyParser = require("body-parser");
const expressApp = express();
const router = express.Router();
router.use(bodyParser.urlencoded({extended: true}));
router.use(bodyParser.json());

const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json");

const MongoClient = require("mongodb").MongoClient;
const {ServerApiVersion} = require("mongodb");

const cors=require("cors")
const moment = require("moment-timezone");

const Storage = require("electron-store");
const {unset} = require("lodash");
const newStorage = new Storage();
const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

let sessionClient = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        useNewUrlParser: true,
        useUnifiedTopology: true,
    },
});

/*
* Session
* Session中至少包括,GET所有session，POST加入一个Session，get某个Session的stocklist，post添加一个log记录到xxx Session
*/
/* 
 * SESSION
 * Getsession 获取所有当前可用的Session
 * 默认仅获取当前可用的Session，如果添加了?all=1则给出所有的Session List
 */
router.get("/v1/sessions", async (req, res) => {
    let sessionResults = {acknowledged: false, data: [], message: ""};
    try {
        let dbclient = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true,
            },
        });
        let options = { sort: {"startDate" : 1},  projection: {"_id" : 0} };
        await dbclient.connect();
        let session = dbclient.db(targetDB).collection("pollingsession");
        let resultArray = await session.find({}, options).toArray();
        sessionResults.acknowledged = true
        sessionResults.data = resultArray
    } catch (e) {
        console.error("Error on /v1/sessions:",e)
        sessionResults.message = e.toString()
    } finally {
        await sessionClient.close()
    }

    if (!(req.query && req.query.all && req.query.all === '1')){
        //修正data为返回当前有效的Sessions
        let localMoment = moment(new Date()).tz("Australia/Sydney");
        let localTime = (new Date(localMoment.format("YYYY-MM-DD HH:mm:ss"))).getTime()
        let inEffectSessions = []
        for (const eachSession of sessionResults.data) {
            var startDateint = (new Date(eachSession.startDate)).getTime()
            var endDateint = (new Date(eachSession.endDate)).getTime()
            if (startDateint <= localTime && endDateint >= localTime){
                inEffectSessions.push(eachSession)
            }
        }
        sessionResults.data = inEffectSessions
    }
    res.json(sessionResults);
});

/* 
 * SESSION
 * 验证当前Session是否有效
 * 用户需要以Post请求方式发起，GET请求回弹报错
 */
router.post("/v1/sessions/join", async (req, res) => {
    let response =  {acknowledged: false, data: [], message: ""};
    let localMoment = moment(new Date()).tz("Australia/Sydney");
    let localTime = (new Date(localMoment.format("YYYY-MM-DD HH:mm:ss"))).getTime()
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    if(req.body && req.body.session){
        const sessionCode = req.body.session;
        await dbclient.connect();
        const sessions = dbclient.db(targetDB).collection("pollingsession");
        let options = { sort: {"startDate" : 1},  projection: {"_id" : 0} };
        try{
            let result = await sessions.find({session: sessionCode}, options).toArray()
            for (const eachSession of result) {
                let startDate = (new Date(eachSession.startDate)).getTime()
                let endDate = (new Date(eachSession.endDate)).getTime()
                if (startDate <= localTime && endDate >= localTime){
                    //当用户发起加入session请求时，需要确认session是否可用，如果可用则继续返回true，
                    response.acknowledged = true
                }
            }

            if (!response.acknowledged){
                response.message = `The session '${sessionCode}' has expired or session code is incorrect.`
            }
        }catch (e) {
            console.error("Error on /v1/sessions/join:",e)
            response.message = "Missing body parameter of SESSION Code"
        }
    } else {
        response.message = "Missing body parameter of SESSION Code"
    }
    res.json(response);
});

/*
 * SESSION
 * ADD POST方法
 * 允许用户通过客户端直接新建一个盘点会话，而无需通过服务端执行
 */
router.post("/v1/sessions/add",async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let localMoment = moment(new Date()).tz("Australia/Sydney");
    let localTime = localMoment.format("YYYY-MM-DD HH:mm:ss")
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    const sessionCode = req.body.session;
    await dbclient.connect();
    const session = dbclient.db(targetDB).collection("pollingsession");
    try {
        while (true){
            var purposedSessionCode = randomHexGenerator().substring(1)
            let result = await session.find({session: sessionCode}).toArray()
            if (result.length <= 0){ //核对没有重复的Session Code， 然后插入到DB中
                const insertTarget = {
                    session: purposedSessionCode,
                    startDate: localMoment.format("YYYY-MM-DD HH:mm:ss"),
                    endDate: `${localMoment.format("YYYY-MM-DD")} 23:59:59`,
                    logTime: localMoment.format("YYYY-MM-DD HH:mm:ss"),
                }
                result = await session.insertOne(insertTarget);
                response.acknowledged=true
                response.data.push(insertTarget)
                break;
            }
        }
    } catch (e) {
        console.error("Error on /v1/sessions/join:", e)
        response.message = "Missing Parameter of SESSION Code"
    } finally {
        await dbclient.close()
    }
    res.json(response)
})

function randomHexGenerator(){
    return (Math.floor(Math.random() * (0xFFFFFFFF + 1))).toString(16).toUpperCase().padStart(8, '0')
}

/*
 * SESSION
 * session/logs GET方法
 * 替换了原有的sessionlog，用来查看某个盘点会话中已经扫描的产品，必须要传入SessionCode作为参数，可以查看所有历史的会话
 * 在MongoDB中每件产品可能被扫描多次，给出结果前在JS中去重
 */
router.get("/v1/session/logs",async (req, res) =>{
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    if (req.query && req.query.session){
        const sessionCode = String(req.query.session);
        console.log(sessionCode)
        try {
            await dbclient.connect()
            const session = dbclient.db(targetDB).collection("pollinglog");
            // let options = { sort: {"productCode": 1,"productLabel" : 1},  projection: {"_id" : 0} };
            let options = { sort: {"productLabel" : 1},  projection: {"_id" : 0} };
            let result = await session.find({session: sessionCode}, options).toArray()
            console.log(result)
            response.data = result
            response.acknowledged = true
        } catch (e) {
            response.message = `Error on /v1/session/logs: ${e}`
        } finally {
            await dbclient.close()
        }
    } else {
        response.message = "Missing Parameter of SESSION Code"
    }
    res.json(response)
});

/*
 * SESSION
 * session/addlog POST方法 (旧)
 */
router.post("/v1/sessionlog/add", async (req, res) => {
    const sessioncode = (req.body.session ? req.body.session : "");
    const iteminfo = req.body.item;
    let localTime = moment(new Date()).tz("Australia/Sydney");
    var mongodata = {};
    let purposedRes = {acknowledged: false};
    if (isBase64String(iteminfo)) {
        mongodata = createLogObject(sessioncode, iteminfo);
        if (mongodata !== {}) {
            purposedRes.acknowledged = true
            mongodata.loggingTime = moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss");
            let insertData = await insertOneToLog(mongodata);
            if ((await insertData).acknowledged) {
                purposedRes = insertData;
            }
        }
    }
    res.json(purposedRes);
});

/*
 * SESSION
 * session/addlog POST方法 （新）
 * 替换了原有的sessionlog/add，须至少传入产品base64信息
 * 1. 会话ID （如果不提供则默认使用STOCK）
 * 2. 产品对象信息，可以直接使用Base64解码后的结果，如果期望传入base64，可以使用老接口/sessionlogs/itemadd
 */
router.post("/v1/session/addlog", async (req, res) => {
    const sessioncode = (req.body.session ? req.body.session : "STOCKS");
    let response = {acknowledged: false, data: [], message: ""};
    let localMoment = moment(new Date()).tz("Australia/Sydney");
    let localTime = localMoment.format("YYYY-MM-DD HH:mm:ss")
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    if (req.body.item){
        try{
            await dbclient.connect();
            let session = dbclient.db(targetDB).collection("pollinglog");
                const filter = {
                    session: req.body.session,
                    productCode: req.body.item.productCode,
                    productLabel: req.body.item.productLabel,
                }
                let updateField = {
                    $set: req.body.item
                }
                let result = await session.updateOne(filter,updateField,{upsert: true})
                response.acknowledged = true
                if (result.upsertedCount > 0){
                    response.message = `Insert a new document, id: ${result.upsertedId._id}`
                } else {
                    response.message = `Update on existing document.`
                }
        } catch (e) {
            response.message = `Error on /v1/session/addlog: ${e}`
        } finally {
          await dbclient.close()
        }
    } else {
        response.message = "Missing Body parameter of base64(item)"
    }

    res.json(response);
});
/*
* PRODUCTS
* products GET方法
* 用来查看目前所有产品的信息
*/
router.get("/v1/products", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    try{
        await dbclient.connect()
        let session = dbclient.db(targetDB).collection("products");
        let options = { sort: {"productLabel" : 1},  projection: {"_id" : 0} };
        let result = await session.find({}, options).toArray()
        response.data = result
        if (req.query.query && (req.query.query).length>0){//     如果客户端添加了query字段则根据需要定制搜索结果,字符串化之后搜索文本内容
            let filteredResult=[]
            result.forEach(eachObject =>{
                for (const eachKey in eachObject) {
                    console.log("searching:",eachKey)

                    if(eachObject[eachKey] && eachObject[eachKey].toLowerCase().includes((req.query.query).toLowerCase())){
                        filteredResult.push(eachObject)
                        continue;
                    }
                }
            })
            response.data = filteredResult
        }
        response.acknowledged = true
    } catch (e) {
        response.message = `Error on /v1/products: ${e}`
    } finally {
        await dbclient.close()
    }
    res.json(response)
});

/*
* PRODUCTS
* product POST方法， 新
* 允许用户通过客户端添加，更新产品信息
*/
router.post("/v1/products", async (req, res) =>{
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    try {
        let session = dbclient.db(targetDB).collection("products");
        await dbclient.connect()

        if(req.body && req.body.action && req.body.item){
            let options = {upsert: false}
            let filter = {}
            if (req.body.action === "add" || req.body.action === "update"){
                if(req.body.action === "add") { options = {upsert: true } } //添加操作
                if (req.body.item && req.body.item.itemcode){
                    filter = {itemcode: req.body.item.itemcode}
                    if(req.body.item.vendorCode) {
                        filter = {itemcode: req.body.item.itemcode, vendorCode: req.body.item.vendorCode}
                    }

                    const result = await session.updateOne(filter, {$set: req.body.item}, options);
                    if(result.matchedCount === result.modifiedCount || result.upsertedCount > 0){
                        response.acknowledged = true
                        if(result.upsertedCount > 0){
                            response.data = {"upsertId": result.upsertedId}
                        }
                    }
                } else {
                    response.message = `Missing mandatory field {itemcode} on update action`
                }
            } else {
                response.message = `Action parameter incorrect`
            }
        } else {
            response.message = `Missing parameter(s)`
        }
    } catch (e) {
        response.message = `Error on /v1/products: ${e}`
    } finally {
        await dbclient.close()
    }

    res.json(response)
})

/*
 *  STOCKS
 *  GET 方法
 *
 *  获取所有产品库存信息，使用productCode+labelID去重
 *  允许用户从label, productCode, location和session四个维度自行筛选过滤数据
 */
router.get("/v1/stocks", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    try {
        await dbclient.connect()
        const session = dbclient.db(targetDB).collection("pollinglog");
        const options = {$sort: {productCode: 1, bestbefore: -1, productLabel: -1}, projection: {"_id" : 0}}
        let result = await session.find({}, options).toArray()
        response.data = result
        response.acknowledged = true
    //     去掉相同的重复条目
        let filteredResult = filterDuplicate(['productLabel','productCode'],result)
        response.data = filteredResult

        // 根据Query筛选
        if (req.query.consumed){
            //
        } else {
            response.data.forEach(eachitem =>{
                if (eachitem.consumed === 0){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        if (req.query.session && req.query.session.length >= 3){ // Session
            console.log("session in")
            filteredResult.forEach(eachitem =>{
                if (eachitem.session.toLowerCase().includes(String(req.query.session).toLowerCase())){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        if(req.query && req.query.product && req.query.product.length >= 3) { //Product
            let filteredResult = []
            response.data.forEach(eachitem =>{
                if (eachitem.productCode.toLowerCase().includes(String(req.query.product).toLowerCase())){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        if(req.query && req.query.location && req.query.location.length >= 2){ // Location
            let filteredResult = []
            response.data.forEach(eachitem =>{
                if (eachitem.shelfLocation.toLowerCase().includes(String(req.query.location).toLowerCase())){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        if (req.query && req.query.label && req.query.label.length >= 3){ // Label
            let filteredResult = []
            response.data.forEach(eachitem =>{
                if (eachitem.productLabel.toLowerCase().includes(String(req.query.label).toLowerCase())){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        console.log(`GetStocks: Result length: ${result.length}; Filtered Length:${response.length}`)
    } catch (e) {
        response.message = e
    } finally {
        await dbclient.close()
    }
    res.json(response)
});

function filterDuplicate(fields, data) {
    const seen = new Set();
    return data.filter(item => {
        const key = fields.map(field => item[field]).join('|');
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/*
 * STOCKS
 * POST方法
 * 重写后的STOCKS方法， 重整了关于返回值和传入值的问题
 *
 * 可接受的操作依旧保持为库存信息的添加，更新和删除，均使用updateOne完成，仅添加使用upsert方法
 *
 */
router.post("/v1/stocks", async (req, res)=>{
    let localMoment = moment(new Date()).tz("Australia/Sydney");
    let localTime = localMoment.format("YYYY-MM-DD HH:mm:ss");
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });


    let actionsAllowed = ['add','update','remove',"move","consume"]
    if(!req.body || !req.body.action){
        response.message = "Missing action"
    } else if (!req.body || !req.body.item){
        response.message = "Missing item informations"
    } else if(req.body && req.body.action && actionsAllowed.indexOf(req.body.action) >=0) {
        let filter = {}
        let updateObject = {$set:{}}
        let options = {upsert: false}
        if(req.body.item.productLabel){
            filter={productLabel: req.body.item.productLabel}
            updateObject = {$set:req.body.item}
            if (actionsAllowed[actionsAllowed.indexOf(req.body.action)] === "remove" ||
                actionsAllowed[actionsAllowed.indexOf(req.body.action)] === "consume" ){
                updateObject = {$set: {consumed: 1, loggingTime: localTime}} // 仅标注使用字段
            }
            if (actionsAllowed[actionsAllowed.indexOf(req.body.action)] === "add"){
                options.upsert = true;
                // 检查各种字段中是否由需要的对应参数，如果没有则补齐
                // 每当切换新版本后，均需要按照新版本参数补齐
                let updateItems = req.body.item
                updateItems.consumed = 0
                updateItems.loggingTime = localTime;
                updateObject = {$set: updateItems}
            }

            try {
                await dbclient.connect()
                const session = dbclient.db(targetDB).collection("pollinglog");

                let result = await session.updateOne(filter, updateObject, options)
                if (result.acknowledged){
                    response.acknowledged = true
                    response.data = result
                }
            } catch (e) {
                response.message = e
            } finally {
                await dbclient.close()
            }
        } else {
            response.message = "Missing product key information's "
        }

    } else {
        response.message = "Action is not allowed "
    }
    res.json(response)
})

/*
 *  Preload  GET 方法
 *
 *  获取所有产品预填充信息
 *  允许用户从label, productCode或 location自行筛选过滤数据
 */
router.get("/v1/preload", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    try {
        await dbclient.connect()
        const session = dbclient.db(targetDB).collection("preloadlog");
        const options = {$sort: {productCode: 1, bestbefore: -1, productLabel: -1}, projection: {"_id" : 0}}
        let result = await session.find({}, options).toArray()
        response.data = result
        response.acknowledged = true
        //     去掉相同的重复条目
        let filteredResult = filterDuplicate(['productLabel','productCode'],result)
        response.data = filteredResult

        // 根据Query筛选
        if (req.query.consumed){
            //
        } else {
            response.data.forEach(eachitem =>{
                if (eachitem.consumed === 0){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        if(req.query && req.query.product && req.query.product.length >= 3) { //Product
            let filteredResult = []
            response.data.forEach(eachitem =>{
                if (eachitem.productCode.toLowerCase().includes(String(req.query.product).toLowerCase())){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        if(req.query && req.query.location && req.query.location.length >= 2){ // Location
            let filteredResult = []
            response.data.forEach(eachitem =>{
                if (eachitem.shelfLocation.toLowerCase().includes(String(req.query.location).toLowerCase())){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        if (req.query && req.query.label && req.query.label.length >= 3){ // Label
            let filteredResult = []
            response.data.forEach(eachitem =>{
                if (eachitem.productLabel.toLowerCase().includes(String(req.query.label).toLowerCase())){
                    filteredResult.push(eachitem)
                }
            })
            response.data = filteredResult
        }

        console.log(`Get Prefill: Result length: ${result.length}; Filtered Length:${response.length}`)
    } catch (e) {
        response.message = e
    } finally {
        await dbclient.close()
    }
    res.json(response)
});

/*
 * Preload - POST方法
 *
 * 允许用户预填充产品信息（由Chrome 插件或者WarehouseElectron前端）
 */
router.post("/v1/preload", async (req, res)=>{
    let localMoment = moment(new Date()).tz("Australia/Sydney");
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true},
    });
    let bodyContent = req.body.body
    if(Array.isArray(bodyContent)){
        // 检查各种字段中是否由需要的对应参数，如果没有则补齐
        // 每当切换新版本后，均需要按照新版本参数补齐
        bodyContent.forEach(eachItem=>{
            eachItem.consumed = 0
            eachItem.loggingTime = localMoment.format("YYYY-MM-DD HH:mm:ss");
            eachItem.createTime = new Date(); // MongoDB Time Series
        })
        try {
            await dbclient.connect()
            const session = dbclient.db(targetDB).collection("preloadlog");
            let result = await session.insertMany(bodyContent)
            if (result.acknowledged){
                response.acknowledged = true
                response.data = result
            }
        } catch (e) { response.message = e }
        finally { await dbclient.close() }
    } else {
        response.message = "Missing product information's "
    }
    res.json(response)
})

function createLogObject(sessioncode, iteminfo) {
    var mongodata = {
        session: sessioncode,
        productCode: "",
        quantity: 0,
        quantityUnit: "",
        shelfLocation: "",
        POIPnumber: "",
        productName: "",
        bestbefore: "",
        productLabel: "",
        productName: "",
        labelBuild: 2,
        consumed: 0,
        loggingTime: moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss")
    }
    try {
        if (isBase64String(iteminfo)) {
            var productInfo = JSON.parse(atob(iteminfo));
            if (productInfo.hasOwnProperty("Code")) {
                mongodata.productCode = productInfo.Code
            }
            if (productInfo.hasOwnProperty("Qty")) {
                mongodata.quantity = parseInt(productInfo.Qty)
            }
            if (productInfo.hasOwnProperty("LabelId")) {
                mongodata.productLabel = productInfo.LabelId
            }
            if (productInfo.hasOwnProperty("Prod")) {
                mongodata.productName = productInfo.Prod
                if (String(productInfo.Prod).toLowerCase().includes("jelly") || String(productInfo.Prod).toLowerCase().includes("popping")
                    || String(productInfo.Prod).toLowerCase().includes("syrup")) {
                    mongodata.quantityUnit = "carton"
                }
            }
            if (productInfo.hasOwnProperty("POIP")) {
                mongodata.POIPnumber = productInfo.POIP;
            }
            // V2 and before end at here
            if (productInfo.hasOwnProperty("Build") && productInfo.Build == 3) {
                mongodata.labelBuild = 3;
                // V3 or later, using all info provided
                console.log("Item label is V3");
            }

            if (productInfo.hasOwnProperty("Unit") && typeof (productInfo.Unit) == "string") {
                mongodata.quantityUnit = String(productInfo.Unit).toLowerCase().replace("ctns", "carton")
                    .replace("btls", "bottle");
            }
            if (productInfo.hasOwnProperty("Bestbefore")) {
                mongodata.bestbefore = productInfo.Bestbefore;
            }
            if (productInfo.hasOwnProperty("shelfLocation")) {
                mongodata.shelfLocation = productInfo.shelfLocation;
            }
        }
    } catch (error) {
        console.error(error);
    }
    return mongodata;
}
//
// /*
//  * 更新商品存放的库位信息，需要LabelID，新库位
//  * 注：新库位上如果已经有其他东西存在，默认不会覆盖，而会选择并存
//  */
// async function editStockShelfLocation(labelId, location) {
//     let returnResult = {acknowledged: false}
//     try {
//         await sessionClient.connect()
//         const session = sessionClient.db(targetDB).collection("pollinglog")
//         var result = await session.updateMany({
//             productLabel: labelId,
//             consumed: 0
//         }, {$set: {shelfLocation: location}}, {upsert: false})
//         if (result !== null) {
//             returnResult = result
//         }
//         if (result.hasOwnProperty("matchedCount") && result.hasOwnProperty("modifiedCount")) {
//             returnResult.acknowledged = true
//         }
//     } catch (err) {
//         console.error(err)
//     }
//     return returnResult
// }

/*
 * Stock中的fetch方法，用来获取产品的在某个位置上的库存信息
 * 需要传入参数：Location 或 label
 * 返回参数：Array[ProductInfo]
 */
router.get("/v1/stocks/get", async (req, res) => {
    let productLocation = req.query.shelf
    let productLabel = req.query.label
    let response = {acknowledged: false, results: [], info: null}
    await sessionClient.connect()
    const sessions = sessionClient.db(targetDB).collection("pollinglog");

    try {
        let findingQuery = {}
        if (productLabel && productLabel.length > 0) {
            findingQuery = {itemcode: productLabel, consumed: 0}
        } else if (productLocation && productLocation.length > 0) {
            findingQuery = {shelfLocation: productLocation, consumed: 0}
        }
        let result = await sessions.find(findingQuery, {projection: {"_id":0}})
        if ((await sessions.countDocuments({})) >= 0) {
            response.acknowledged = true
            for await (const x of result) {
                response.results.push(x);
            }
        }
    } catch (err) {
        console.error(err)
        response.info = err
    }
    res.json(response)
})

/*
 * Stock中的fetch方法，用来获取产品的在某个位置上的库存信息
 * 需要传入参数：Location 或 label
 * 返回参数：Array[ProductInfo]
 */
router.post("/v1/stocks/get", async (req, res) => {
    const contents = req.body
    let response = {acknowledged: false, results: [], info: null}
    await sessionClient.connect()
    const sessions = sessionClient.db(targetDB).collection("pollinglog");
    const queryOptions = {projection: {"_id":0}}
    let result;
    let findingQuery = {}
    try {
        if (contents.input){
            var object = JSON.parse(contents.input)
            console.log(contents.input)
            if (object.itemcode){
                findingQuery = {itemcode: productLabel, consumed: 0}
                result = await sessions.find(findingQuery,queryOptions)
                if ((await sessions.countDocuments({})) >= 0) {
                    response.acknowledged = true
                    for await (const x of result) {
                        response.results.push(x);
                    }
                }
            } else{
                // 如果itemcode为空则？？？
            }
        } else {
            response.info = "Content is missing from the body"
        }
    } catch (err) {
        console.error(err)
        response.info = err
    }
    res.json(response)
})

/*
 * Stock中的consume方法，当某个板位被使用后需要标注所有的该id信息为consumed
 */
router.get("/v1/stocks/consume", async (req, res) => {
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let response = {acknowledged: false}
    const productLabel = req.query.label
    const productLocation = req.query.shelf
    if (productLabel && productLabel.length > 0) {
        try {
            let result = await findAndUpdateLogs({itemcode: productLabel, consumed: 0}, {
                consumed: 1,
                consumedTime: localTime.format("YYYY-MM-DD HH:mm:ss")
            })
            if (result.modifiedCount > 0 && result.matchedCount == result.modifiedCount) {
                response.acknowledged = true
            }
        } catch (err) {
            console.error(err)
            res.status(500).json(err)
        }
    } else if (productLocation && productLocation.length > 0) {
        try {
            let result = await findAndUpdateLogs({shelfLocation: productLocation, consumed: 0}, {
                consumed: 1,
                consumedTime: localTime.format("YYYY-MM-DD HH:mm:ss")
            })
            if (result.modifiedCount > 0 && result.matchedCount == result.modifiedCount) {
                response.acknowledged = true
            }
        } catch (err) {
            console.error(err)
            res.status(500).json(err)
        }
    }
    res.json(response)
})

router.post("api/v1/stocks/consume", async (req, res) => {
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let response = {acknowledged: false}
    const {productLabel} = req.body
    if (productLabel !== undefined && productLabel.length > 0) {
        try {
            let result = await findAndUpdateLogs({itemcode: productLabel, consumed: 0}, {
                consumed: 1,
                consumedTime: localTime.format("YYYY-MM-DD HH:mm:ss")
            })
            if (result.modifiedCount > 0 && result.matchedCount > 0) {
                response.acknowledged = true
            }
        } catch (err) {
            console.error(err)
            res.status(500).json(err)
        }
    }
    res.json(response)
})

async function findAndUpdateLogs(findCondition, updateQuery) {
    let returnResult = {}
    try {
        await sessionClient.connect()
        const session = sessionClient.db(targetDB).collection("pollinglog");
        var result = await session.updateMany(findCondition, {$set: updateQuery}, {upsert: false})
        if (result !== null) {
            returnResult = result
        }
    } catch (e) {
        console.error(e)
    }
    return returnResult
}

router.use("/", swaggerUi.serve);
router.get("/", swaggerUi.setup(swaggerDocument));
router.get("/v1", swaggerUi.setup(swaggerDocument));
router.get('/test', (req, res) => {
    res.json({message: 'Hello from server!'})
})
module.exports = router;

async function insertOneToLog(insertData) {
    try {
        await sessionClient.connect();
        const session = sessionClient.db(targetDB).collection("pollinglog");
        var result = await session.findOne({
            session: insertData.session,
            productCode: insertData.productCode,
            productLabel: insertData.productLabel,
        });
        var returnData;
        if (result == null) {
            result = await session.insertOne(insertData);
            returnData = {acknowledged: true, method: "insertOne", result: result};
        } else {
            returnData = {acknowledged: true, method: "findOne", result: result};
        }
        return returnData;
    } catch (err) {
        console.error(err);
        return {acknowledged: false, method: null, result: err.toString};
    }
}

async function findLastPollionglog(labelId) {
    try {
        await sessionClient.connect()
        const session = sessionClient.db(targetDB).collection("pollinglog")
        const projection = {
            _id: 0,
            session: 1,
            loggingTime: 1,
            productCode: 1,
            quantity: 1,
            quantityUnit: 1,
            shelfLocation: 1,
            consumed: 1,
            POIPnumber: 1,
            productName: 1,
            bestbefore: 1,
            productLabel: 1,
            labelBuild: 1
        }
        const result = await session.findOne({productLabel: labelId}, {projection: projection})
        if (!result) {
            console.log("[MongoDB] Nothing Found");
            return {}
        } else {
            return await result
        }
    } catch (err) {
        console.error(err)
    }
}

async function insertOneLot(productInformationObject) {
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let returnResult = {acknowledged: false}
    try {
        if (productInformationObject.hasOwnProperty("productCode") && productInformationObject.hasOwnProperty("quantity") && productInformationObject.hasOwnProperty("quantityUnit") && productInformationObject.hasOwnProperty("shelfLocation") && productInformationObject.hasOwnProperty("productName") && productInformationObject.hasOwnProperty("productLabel")) {
            await sessionClient.connect()
            const session = sessionClient.db(targetDB).collection("pollinglog")
            const result = await session.insertOne(productInformationObject)
            returnResult.acknowledged = true
        }
    } catch (err) {
        console.error(err)
    }
    return returnResult;
}

async function updateOneLotByLabel(productLabelId, updateinfoObject) {
    let localTime = moment(new Date()).tz("Australia/Sydney");
    var updateObject = updateinfoObject
    updateObject['loggingTime'] = localTime.format("YYYY-MM-DD HH:mm:ss")
    let returnResult = {acknowledged: false}
    try {
        await sessionClient.connect()
        const session = sessionClient.db(targetDB).collection("pollinglog")
        const result = await session.updateOne({productLabel: productLabelId}, {$set: updateObject}) //更新信息后也更新最后记录时间
        if (result.matchedCount === result.modifiedCount, result.modifiedCount > 0) {
            returnResult.acknowledged = true
            returnResult['message'] = `${result.matchedCount} document(s) matched the filter, updated ${result.modifiedCount} document(s)`
        }
    } catch (err) {
        console.error(err)
        returnResult['message'] = err.toString()
    }
    return returnResult
}

function isJsonString(text) {
    try {
        JSON.parse(text);
    } catch (e) {
        return false;
    }
    return true;
}

function isBase64String(text) {
    try {
        atob(text);
    } catch (e) {
        return false;
    }
    return true;
}
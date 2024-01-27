const express = require("express");
const bodyParser = require("body-parser");
const expressApp = express();
const router = express.Router();
router.use(bodyParser.urlencoded({extended: true}));
router.use(bodyParser.json());

const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json");

const MongoClient = require("mongodb").MongoClient;
const {ServerApiVersion, Decimal128} = require("mongodb");

const cors = require("cors")

const Storage = require("electron-store");
const {isNumber, isObject} = require("lodash");

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
        let options = {sort: {"startDate": 1}, projection: {"_id": 0}};
        await dbclient.connect();
        let session = dbclient.db(targetDB).collection("pollingsession");
        let resultArray = await session.find({}, options).toArray();
        sessionResults.acknowledged = true
        sessionResults.data = resultArray
    } catch (e) {
        console.error("Error on /v1/sessions:", e)
        sessionResults.message = e.toString()
    } finally {
        await sessionClient.close()
    }

    if (!(req.query && req.query.all && req.query.all === '1')) {
        //修正data为返回当前有效的Sessions
        let localTime = (new Date()).getTime()
        let inEffectSessions = []
        for (const eachSession of sessionResults.data) {
            var startDateint = (new Date(eachSession.startDate)).getTime()
            var endDateint = (new Date(eachSession.endDate)).getTime()
            if (startDateint <= localTime && endDateint >= localTime) {
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
    let response = {acknowledged: false, data: [], message: ""};
    let localTime = (new Date()).getTime()
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    if (req.body && req.body.session) {
        const sessionCode = req.body.session;
        await dbclient.connect();
        const sessions = dbclient.db(targetDB).collection("pollingsession");
        let options = {sort: {"startDate": 1}, projection: {"_id": 0}};
        try {
            let result = await sessions.find({session: sessionCode}, options).toArray()
            for (const eachSession of result) {
                let startDate = (new Date(eachSession.startDate)).getTime()
                let endDate = (new Date(eachSession.endDate)).getTime()
                if (startDate <= localTime && endDate >= localTime) {
                    //当用户发起加入session请求时，需要确认session是否可用，如果可用则继续返回true，
                    response.acknowledged = true
                }
            }

            if (!response.acknowledged) {
                response.message = `The session '${sessionCode}' has expired or session code is incorrect.`
            }
        } catch (e) {
            console.error("Error on /v1/sessions/join:", e)
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
router.post("/v1/sessions/add", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let localMoment = new Date();
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
        while (true) {
            var purposedSessionCode = randomHexGenerator().substring(1)
            let result = await session.find({session: sessionCode}).toArray()
            if (result.length <= 0) { //核对没有重复的Session Code， 然后插入到DB中
                const insertTarget = {
                    session: purposedSessionCode,
                    startDate: localMoment.format("YYYY-MM-DD HH:mm:ss"),
                    endDate: `${localMoment.format("YYYY-MM-DD")} 23:59:59`,
                    logTime: localMoment.format("YYYY-MM-DD HH:mm:ss"),
                }
                result = await session.insertOne(insertTarget);
                response.acknowledged = true
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

function randomHexGenerator() {
    return (Math.floor(Math.random() * (0xFFFFFFFF + 1))).toString(16).toUpperCase().padStart(8, '0')
}

/*
 * SESSION
 * session/logs GET方法
 * 替换了原有的sessionlog，用来查看某个盘点会话中已经扫描的产品，必须要传入SessionCode作为参数，可以查看所有历史的会话
 * 在MongoDB中每件产品可能被扫描多次，给出结果前在JS中去重
 */
router.get("/v1/session/logs", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    if (req.query && req.query.session) {
        const sessionCode = String(req.query.session);
        console.log(sessionCode)
        try {
            await dbclient.connect()
            const session = dbclient.db(targetDB).collection("pollinglog");
            // let options = { sort: {"productCode": 1,"productLabel" : 1},  projection: {"_id" : 0} };
            let options = {sort: {"productLabel": 1}, projection: {"_id": 0}};
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
    let localTime = new Date();
    var mongodata = {};
    let purposedRes = {acknowledged: false};
    if (isBase64String(iteminfo)) {
        mongodata = createLogObject(sessioncode, iteminfo);
        if (mongodata !== {}) {
            purposedRes.acknowledged = true
            mongodata.loggingTime = new Date()
            mongodata.createTime = new Date()
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
 * 2. 
 */
router.post("/v1/session/addlog", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    if (req.body.hasOwnProperty("session") && req.body.hasOwnProperty("item")) {
        try {
            await dbclient.connect();
            let session = dbclient.db(targetDB).collection("pollinglog");
            const filter = {
                productLabel: req.body.item.productLabel,
            }
            let updateField = {
                $push: {"sessions": req.body.session},
            }
            let result = await session.updateOne(filter, updateField)
            if (result.matchedCount > 0) {
                response.acknowledged = true
                response.message = `${result.matchedCount} has matched, ${result.modifiedCount} has been updated`
            } else {
                response.message = `No has matched, no updates has been taken`
            }
        } catch (e) {
            response.message = `Error on /v1/session/addlog: ${e}`
        } finally {
            await dbclient.close()
        }
    } else {
        response.message = "Missing parameters, confirm you have body.session and body.item, refer to API document for correction"
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

    try {
        await dbclient.connect()
        let session = dbclient.db(targetDB).collection("products");
        let options = {sort: {"productLabel": 1}, projection: {"_id": 0}};
        let result = await session.find({}, options).toArray()
        response.data = result
        if (req.query.query && (req.query.query).length > 0) {//     如果客户端添加了query字段则根据需要定制搜索结果,字符串化之后搜索文本内容
            let filteredResult = []
            result.forEach(eachObject => {
                for (const eachKey in eachObject) {
                    console.log("searching:", eachKey)

                    if (eachObject[eachKey] && eachObject[eachKey].toLowerCase().includes((req.query.query).toLowerCase())) {
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
* product/add POST方法， 新
* 允许用户通过第三方渠道添加新产品
*/
router.post("/v1/product/add", async (req, res) => {
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

        if (req.hasOwnProperty("body") && req.body.hasOwnProperty("item") && req.body.item.hasOwnProperty("productCode")) {
            let filter = {productCode: req.body.item.productCode}
            if (req.body.item.vendorCode) {
                filter = {productCode: req.body.item.productCode, vendorCode: req.body.item.vendorCode}
            }

            const result = await session.updateOne(filter, {$set: req.body.item}, {upsert: true});
            if (result.upsertedCount > 0) {
                response.acknowledged = true
                if (result.upsertedCount > 0) {
                    response.data = {"upsertId": result.upsertedId}
                }
            }
        } else {
            response.message = `Missing body parameter(s), and productCode is a mandatory field`
        }
    } catch (e) {
        response.message = `Error on /v1/products: ${e}`
    } finally {
        await dbclient.close()
    }

    res.json(response)
})

router.post("/v1/products/update", async (req, res) => {
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

        if (req.hasOwnProperty("body") && req.body.hasOwnProperty("item") && req.body.item.hasOwnProperty("productCode")) {
            let filter = {productCode: req.body.item.productCode}
            if (req.body.item.vendorCode) {
                filter = {productCode: req.body.item.productCode, vendorCode: req.body.item.vendorCode}
            }

            const result = await session.updateOne(filter, {$set: req.body.item}, {upsert: false});
            if (result.matchedCount === result.modifiedCount) {
                response.acknowledged = true
            }
        } else {
            response.message = `Missing parameter, body.item.productCode is mandatory field`
        }
    } catch (e) {
        response.message = `Error on /v1/products: ${e}`
    } finally {
        await dbclient.close()
    }

    res.json(response)
})

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
 * STOCKS - POST方法
 * 重写后的STOCKS方法，适合用于Add/Edit/Update操作，该方法默认启用Upsert
 *
 */
router.post("/v1/stocks/update", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    let upsertFlag = (req.query.hasOwnProperty("upsert") && req.query.upsert)

    if (!req.body || !req.body.item) {
        response.message = "Missing item informations"
    } else if (req.body && req.body.item) {
        let filter = {}
        let updateObject = {$set: {}}
        if (req.body.item.productLabel) {
            filter = {productLabel: req.body.item.productLabel}
            // 检查各种字段中是否由需要的对应参数，如果没有则补齐
            // 默认使用字段时间并转换为时间对象，如果字段未提供默认使用当前时间
            let updateItems = req.body.item
            try {
                if (upsertFlag){  // 新插入数据需要检查时间戳是否齐全，既有数据则跳过
                    updateItems.createTime = updateItems.hasOwnProperty("createTime") ? new Date(updateItems.createTime) : new Date()
                }
                // 强制更新loggingTime为当前最后更改的时间
                updateItems.loggingTime = updateItems.hasOwnProperty("loggingTime") ? new Date(updateItems.loggingTime) : new Date()
                updateItems.removed = updateItems.hasOwnProperty("removed") ? updateItems.removed : 0 // 默认设定为未使用
                if (updateItems.hasOwnProperty("removed") && parseInt(updateItems.removed) === 1) {
                    updateItems.removeTime = updateItems.hasOwnProperty("removeTime") ? new Date(updateItems.removeTime) : new Date()
                }
                if (updateItems.hasOwnProperty("unitPrice")){
                    updateItems.unitPrice = Decimal128.fromString(updateItems.unitPrice)
                }

                if (updateItems.hasOwnProperty("productLabel")){
                    delete updateItems.productLabel
                }
                if (updateItems.hasOwnProperty("_id")) {
                    delete updateItems._id
                }

                await dbclient.connect()
                const session = dbclient.db(targetDB).collection("pollinglog");

                let originData = await session.find(filter).toArray()
                let originElement = await session.find(filter).toArray()
                let result = await session.updateOne(filter, {$set: updateItems}, {upsert: true})
                if (originElement.length === 1){
                    await session.updateOne(filter,{$push: {changelog: compareChanges(originElement[0],updateItems)}})
                }
                
                if (result.acknowledged) {
                    response.acknowledged = true
                    response.data = result
                }
            } catch (e) {
                response.message = e
            } finally {
                await dbclient.close()
            }
        } else {
            response.message = "Missing products key information's "
        }
    } else {
        response.message = "Action is not allowed "
    }
    res.json(response)
})

function compareChanges(oldObject, newObject){
    let changelog =  {datetime: new Date(), events:[]}
    if (isObject(oldObject) && isObject(newObject)){
        for (let eachKey of Object.keys(newObject)) {
            if (newObject.hasOwnProperty("eachKey")){
                if (oldObject[eachKey] !== newObject[eachKey]){
                    changelog.events.push({field: eachKey, before: oldObject[eachKey]})
                }
            } else {
                changelog.events.push({field: eachKey, before: null})
            }
        }
    }
    return changelog
}

/*
 * STOCKS
 * 移动的Move方法
 * 保持使用/v1/stocks的方法，但只使用记录中的productLabel和shelfLocation记录，同时用户需要传入newLocation参数
 */
router.post("/v1/stocks/move", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    if (req.body && req.body.hasOwnProperty("item") && req.body.hasOwnProperty("newLocation") && req.body.item.hasOwnProperty("productLabel")) {
        // 用户提供了以上信息
        let movementRecordsString = ''
        if (req.body.item.hasOwnProperty("movementRecords")) {
            //     如果有过往移动记录，则append到字段尾部，字段中间使用;分割，字段格式：T<时间戳>@位置;T<时间戳>@位置;
            movementRecordsString = `T${Date.now()}@${req.body.item.hasOwnProperty("shelfLocation") ? req.body.item.shelfLocation : ""};` + movementRecordsString
        }

        let filter = {productLabel: req.body.item.productLabel}
        let updateObject = {$set: {shelfLocation: req.body.newLocation, moveRecords: movementRecordsString}}
        try {
            await dbclient.connect()
            const session = dbclient.db(targetDB).collection("pollinglog");

            let result = await session.updateOne(filter, updateObject, {upsert: false})
            if (result.acknowledged) {
                response.acknowledged = true
                response.data = result
            }
        } catch (e) {
            console.error("Error occurred when attempting to provide move action. ", e)
        }
    } else {
        response.message = "Required key information of 'Label ID' and/or 'Location' does not exist"
    }

    res.json(response)
})

router.post("/v1/stocks/remove", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    if (req.body && req.body.hasOwnProperty("item") && req.body.item.hasOwnProperty("productLabel")) {
        let filter = {productLabel: req.body.item.productLabel}
        let updateTime = req.body.item.hasOwnProperty("removeTime") ? new Date(req.body.item.removeTime) : new Date()
        let updateObject = {$set: {removed: 1, removeTime: updateTime}}
        try {
            await dbclient.connect()
            const session = dbclient.db(targetDB).collection("pollinglog");

            let result = await session.updateOne(filter, updateObject, {upsert: false})
            if (result.acknowledged) {
                response.acknowledged = true
                response.data = result
            }
        } catch (e) {
            console.error("Error occurred when attempting to provide move action. ", e)
        }
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

        let result = await session.find({}).toArray()
        response.data = result
        response.acknowledged = true

        if (req.query){ // 如果用户提供了筛选条件，则筛选符合条件的内容**不区分大小写
            let originResult = result
            if (req.query.product && req.query.product.length >= 3) { //Product
                let filteredResult = []
                originResult.forEach(eachitem => {
                    if (eachitem.productCode.toLowerCase().includes(String(req.query.product).toLowerCase())) {
                        filteredResult.push(eachitem)
                    }
                })
                originResult = filteredResult
            }

            if (req.query.location && req.query.location.length >= 2) { // Location
                let filteredResult = []
                originResult.forEach(eachitem => {
                    if (eachitem.shelfLocation.toLowerCase().includes(String(req.query.location).toLowerCase())) {
                        filteredResult.push(eachitem)
                    }
                })
                originResult = filteredResult
            }

            if (req.query.label && req.query.label.length >= 3) { // Label
                let filteredResult = []
                originResult.forEach(eachitem => {
                    if (eachitem.productLabel.toLowerCase().includes(String(req.query.label).toLowerCase())) {
                        filteredResult.push(eachitem)
                    }
                })
                originResult = filteredResult
            }
            response.data = originResult
        }
    } catch (e) {
        console.error("Error when fetching preload Data:", e)
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
 * Update方法更新为删除旧数据后重新添加新数据，因为TimeSeries不支持直接update
 */
router.post("/v1/preload/update", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true},
    });
    let receiveItem = req.body
    if (typeof (req.body) === "string"){
        receiveItem = JSON.parse(req.body)
    }
    receiveItem =  req.body.hasOwnProperty("item") ? req.body.item : {}

    if (receiveItem.hasOwnProperty("_id")){
        delete receiveItem._id
    }
    if (receiveItem.hasOwnProperty("productLabel")){
        try {
            let itemContent = {
                removed: 0,
                createTime: receiveItem.hasOwnProperty("createTime") ? new Date(req.body.item.createTime) : new Date(),
                loggingTime: new Date(),
                labelBuild: 3,
            }

            if (receiveItem && typeof receiveItem === "object") {
                if (Object.keys(receiveItem).length > 0) {
                    Object.keys(receiveItem).forEach(eachKey => {
                        if (eachKey === "quantity" || eachKey === "removed" || eachKey === "seq" || eachKey === "labelBuild") {
                            itemContent[eachKey] = parseInt(receiveItem[eachKey])
                        } else if (eachKey === "unitPrice") {
                            itemContent[eachKey] === Decimal128.fromString(receiveItem.unitPrice)
                        } else if (eachKey === "createTime" || eachKey === "loggingTime" || eachKey === "removeTime") {
                            itemContent[eachKey] = new Date(receiveItem[eachKey])
                        } else {
                            itemContent[eachKey] = receiveItem[eachKey]
                        }
                    })
                }
            }

            //     Insert to database
            await dbclient.connect()
            const session = dbclient.db(targetDB).collection("preloadlog");
            let currentResult = await session.find({"item.productLabel": itemContent.productLabel}).toArray()
            response = {
                step1: await session.deleteMany({"item.productLabel": itemContent.productLabel}),
                step2: await session.insertOne({loggingTime: new Date(), item: itemContent})
            }
        } catch (e) {
            console.error("Error when running /api/v1/preload/update: ", e)
            response.message = `Error when running /api/v1/preload/update: ${e}`
        } finally {
            await dbclient.close()
        }
    } else {
        response.message = `Missing productLabel informations`
    }
    res.json(response)
})

router.post("/v1/preload/remove", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true},
    });
    let bodyContent = req.body.body
    if (Array.isArray(bodyContent) && req.body.hasOwnProperty("productLabel")) {
        // 如果用户提供了时间，按照用户提供的时间填写removeTime，否则默认为当前时间
        let removeTime = req.body.hasOwnProperty("removeTime") ? new Date(req.body.removeTime) : new Date()
        try {
            await dbclient.connect()
            const session = dbclient.db(targetDB).collection("preloadlog");
            let result = await session.deleteOne({"item.productLabel": req.body.productLabel})
            if (result.acknowledged) {
                response = result
            }
        } catch (e) {
            response.message = e
        } finally {
            await dbclient.close()
        }
    } else {
        response.message = "Missing Label information's "
    }
    res.json(response)
})

function createLogObject(sessioncode, iteminfo) {
    var mongodata = {
        sessions: [sessioncode],
        quantity: 0,
        productLabel: "",
        labelBuild: 3,
        removed: 0,
        quarantine: 0,
        loggingTime: new Date(),
        createTime: new Date(),
    }
    try {
        if (isBase64String(iteminfo)) {
            var productInfo = JSON.parse(atob(iteminfo));
            // Create元素时候全数填充
            Object.keys(productInfo).forEach(eachKey =>{
                if (eachKey === "Code"){
                    mongodata.productCode = productInfo.Code
                } else if(eachKey === "Qty"){
                    mongodata.quantity = parseInt(productInfo.Qty)
                } else if (eachKey === "LabelId"){
                    mongodata.productLabel = productInfo.LabelId
                } else if (eachKey === "Prod"){
                    mongodata.productName = productInfo.Prod
                } else if( eachKey === "POnumber"){
                    mongodata.POnumber = productInfo.POnumber;
                } else if(eachKey === "Bestbefore"){
                    mongodata.bestbefore = productInfo.Bestbefore
                } else if(eachKey === "Unit"){
                    mongodata.quantityUnit = String(productInfo.Unit).toLowerCase()
                } else if(eachKey === "Build"){
                    mongodata.labelBuild = parseInt(productInfo.Build);
                } else {
                    mongodata[eachKey] = productInfo[eachKey]
                }
            })
        }
    } catch (error) {
        console.error(error);
    }
    return mongodata;
}

/*
 * STOCKS Get Method
 *
 * Using Regex to filter the result on database selection
 * Allow user to select data via session, location, label, product and removed parameters
 */
router.get("/v1/stocks", async (req, res) => {
    let stockLocation = req.query.shelf && String(req.query.shelf).length >= 2 ? req.query.shelf : ""
    let stockLabel = req.query.label && String(req.query.label).length > 2 ? req.query.label : ""
    let stockSession = req.query.session && String(req.query.session).length > 2 ? req.query.session : ""
    let stockProduct = req.query.product && String(req.query.product).length > 2 ? req.query.product : ""
    let response = {acknowledged: false, results: [], info: null}
    await sessionClient.connect()
    const sessions = sessionClient.db(targetDB).collection("pollinglog");

    try {
        let findingQuery = {removed: (req.query.removed && parseInt(req.query.label) === 1 ? 1 : 0)}
        if (stockLabel && stockLabel.length > 0) {
            findingQuery.productLabel = {$regex: new RegExp(stockLabel),$options: "i"}
        }
        if (stockLocation && stockLocation.length > 0) {
            findingQuery.shelfLocation = {$regex: new RegExp(stockLocation),$options: "i"}
        }
        if (stockSession && stockSession.length > 0) {
            findingQuery.sessions = {$regex: new RegExp(stockSession),$options: "i"}
        }
        if (stockProduct && stockProduct.length > 0) {
            findingQuery.productCode = {$regex: new RegExp(stockProduct),$options: "i"}
        }

        response = await sessions.find(findingQuery, {projection: {"_id": 0}}).toArray()
        res.status(200)
    } catch (err) {
        console.error(err)
        response.info = err
        res.status(500)
    }
    res.json(response)
})

// Delete Method, will erase the record from database, this action cannot be un-done, carefully use.
// Stage 2: Require add user verify
router.delete("/v1/stocks/delete", async (req, res) => {
    let response = {acknowledged: false}
    const productLabel = req.query.label
    if (productLabel && productLabel.length > 0) {
        try {
            await sessionClient.connect()
            const session = sessionClient.db(targetDB).collection("pollinglog");
            response = await session.deleteMany({productLabel: productLabel})
            response.message = `${response.deletedCount} Records has been deleted`
        } catch (err) {
            console.error(err)
            res.status(500).json(err)
        }
    }
    return response
})

router.get("/v1/ping", (req, res) => {
    return {acknowledged: true, message: "Connection OK"}
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
            createTime: 1,
            productCode: 1,
            quantity: 1,
            quantityUnit: 1,
            shelfLocation: 1,
            removed: 1,
            POIPnumber: [],
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
    var updateObject = updateinfoObject
    updateObject['loggingTime'] = new Date()
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
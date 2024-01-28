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
    if(req.hasOwnProperty("body") && req.body.hasOwnProperty("item")){
        response = await upsertProduct(req.body.item, true)
    }
    res.json(response)
})
router.post("/v1/products/update", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    if(req.hasOwnProperty("body") && req.body.hasOwnProperty("item")){
        response = await upsertProduct(req.body.item, req.query.upsert)
    }
    res.json(response)
})

/* Product/update和Product/add合并了
* 传入为req.body.item，然后剩余部分交由upsertProduct方法处理
* */
async function upsertProduct(itemContent, upsert = true) {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    if (!itemContent.hasOwnProperty("productCode")){
        response.message = "Missing product code information"
        return response
    }

    // 如果产品带有vendorCode，则可以联合vendorCode一起使用
    let filter = {productCode: itemContent.productCode}
    if (itemContent.hasOwnProperty("vendorCode") && String(itemContent.vendorCode).length >0) {
        filter.vendorCode = itemContent.vendorCode
    }
    try {
        let session = dbclient.db(targetDB).collection("products");
        await dbclient.connect()
        const result = await session.updateOne(filter, {$set: itemContent}, {upsert: true});
        if (result.matchedCount === result.modifiedCount) {
            response.acknowledged = true
        }
    } catch (e) {
        response.message = `Error on product upserts: ${e}`
    } finally {
        await dbclient.close()
    }
    return response
}

/*
 * STOCKS - POST方法
 * 重写后的STOCKS方法，适合用于Add/Edit/Update操作，该方法关闭Upsert
 *
 *  01JAN重写部分，update时候，需要检查数据库内是否已有条目
 *  有：需要检查更新数据前后对比，并添加changelog
 *  无：按照新添加方式处理
 */
router.post("/v1/stocks/update", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let filter = {}
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });

    try{
        let upsertFlag = (req.hasOwnProperty("query") && req.query.hasOwnProperty("upsert") && req.query.upsert)
        let updateItems = req.hasOwnProperty("body") && req.body.hasOwnProperty("item") ? req.body.item: {}
        if (Object.keys(updateItems).length <= 0){
            throw "Update item fetched a empty object"
        }
        if (!updateItems.hasOwnProperty("productLabel") || String(updateItems.productLabel).length <= 0){
            throw "Product Label is missing"
        }
        filter = {productLabel: req.body.item.productLabel}

        for (var eachKey of Object.keys(updateItems)) {
            if (eachKey === "session"){ continue;}
            if (["removed", "quantity", "labelBuild"].indexOf(eachKey) > -1){
                updateItems[eachKey] = parseInt(updateItems[eachKey].toString())
            }else if(["removedTime", "createTime"].indexOf(eachKey) > -1){
                updateItems[eachKey] = new Date(updateItems[eachKey])
            } else if (["unitPrice", "grossPrice"].indexOf(eachKey) > -1){
                updateItems[eachKey] = Decimal128.fromString(String(updateItems[eachKey]))
            } else {
                updateItems[eachKey] = String(updateItems[eachKey])
            }
        }
        // Forced update flags
        updateItems["loggingTime"] = new Date()
        if ([0,1].indexOf(updateItems["removed"])< 0){ updateItems["removed"] = 0 }

        await dbclient.connect()
        const session = dbclient.db(targetDB).collection("pollinglog");
        let originElement = await session.find(filter).toArray()
        if (originElement.length <= 0){ //现有记录内没有相同的记录，执行添加操作，根据用户指定的upsertFlag处理
            response = await session.updateOne(filter, {$set: updateItems}, {upsert: upsertFlag})
        } else {  // 现有记录内有相同的记录，执行更新操作，需要一并修改changelog
            let changelogElement = compareChanges(originElement[0], updateItems)
            response = await session.updateOne(filter, {$set: updateItems}, {upsert: upsertFlag})
            response.upsert = await session.updateOne(filter, {$push: {changelog: changelogElement}})
        }
    } catch (e) {
        console.error("Error when processing stock updates: ",e)
    } finally {
        await dbclient.close()
    }
    res.json(response)
})

function compareChanges(oldObject, newObject) {
    let changelog = {datetime: new Date(), events: []}
    if (typeof (oldObject) === 'object' && typeof (newObject) === 'object') {
        for (let eachKey of Object.keys(newObject)) {
            if (eachKey === "_id" || eachKey === "productLabel"){
                continue;
            }
            if (newObject.hasOwnProperty(eachKey)) {
                if (oldObject[eachKey] !== newObject[eachKey]) {
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

    try {
        if (!req.hasOwnProperty("body") || !req.body.hasOwnProperty("item") || !req.body.item.hasOwnProperty("productLabel") || String(req.body.item.productLabel) <=0){
            throw "Missing product key informations."
        }
        let filter = {productLabel: req.body.item.productLabel}
        let updateObject = {$set:{shelfLocation:""}}
        if (req.body.item.hasOwnProperty("shelfLocation") && String(req.body.item.shelfLocation).length >0 ){
            updateObject = {$set:{shelfLocation:req.body.item.shelfLocation}}
        } else if (req.body.hasOwnProperty("newLocation") && String(req.body.newLocation).length > 0){
            updateObject = {$set:{shelfLocation:req.body.newLocation}}
        } else {
            throw "Missing of new shelfLocation. Either use item.shelfLocation or newLocation as parameter to identify new location."
        }

        await dbclient.connect()
        const session = dbclient.db(targetDB).collection("pollinglog");

        let oldRecords = await session.find(filter).toArray()
        let oldLocation = ""
        if (oldRecords.length >=0){
            oldLocation = (oldRecords[0].hasOwnProperty("shelfLocation") && String(oldRecords[0].shelfLocation).length > 0) ? oldRecords[0].shelfLocation : ""
        }
        updateObject["$push"] = {changelog:{datetime: new Date()},events:[{field: "productLabel", before: oldLocation}]}
        response = await session.updateOne(filter, updateObject, {upsert: false})
    } catch (e){
        console.error("Error when processing stock move: ",e)
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
        response.acknowledged = true
        response.data = result

        for (let i = 0; i < response.data; i++) {
            if (response.data[i].hasOwnProperty("unitPrice") && String(response.data[i].unitPrice).length >0){
                response.data[i].unitPrice = response.data[i].unitPrice.toString()
            }
            if (response.data[i].hasOwnProperty("grossPrice") && String(response.data[i].grossPrice).length >0){
                response.data[i].grossPrice = response.data[i].grossPrice.toString()
            }
        }
        if (req.query){
            if (req.query.hasOwnProperty("label") && String(req.query.label).length > 3){
                let newResultSet = []
                response.data.forEach(eachResult => {
                    if(eachResult.hasOwnProperty("item") && eachResult.item.hasOwnProperty("productLabel") && eachResult.item.productLabel === req.query.label) {
                        newResultSet.push(eachResult)
                    }
                })
                response.data = newResultSet
            }
            if (req.query.hasOwnProperty("product") && String(req.query.product).length > 3){
                let newResultSet = []
                response.data.forEach(eachResult => {
                    if(eachResult.hasOwnProperty("item") &&eachResult.item.hasOwnProperty("productCode") && eachResult.item.productCode === req.query.product) {
                        newResultSet.push(eachResult)
                    }
                })
                response.data = newResultSet
            }
            if (req.query.hasOwnProperty("productName") && String(req.query.productName).length > 3){
                let newResultSet = []
                response.data.forEach(eachResult => {
                    if(eachResult.hasOwnProperty("item") &&eachResult.item.hasOwnProperty("productName") && eachResult.item.productName === req.query.productName) {
                        newResultSet.push(eachResult)
                    }
                })
                response.data = newResultSet
            }
            if (req.query.hasOwnProperty("location") && String(req.query.location).length > 2){
                let newResultSet = []
                response.data.forEach(eachResult => {
                    if(eachResult.hasOwnProperty("item") &&eachResult.item.hasOwnProperty("shelfLocation") && eachResult.item.shelfLocation === req.query.location) {
                        newResultSet.push(eachResult)
                    }
                })
                response.data = newResultSet
            }
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
    try {
        let receiveItem = typeof (req.body) === "string" ? JSON.parse(req.body) : req.body;
        receiveItem = req.body.hasOwnProperty("item") ? req.body.item : {}
        if (receiveItem.hasOwnProperty("_id")) {
            delete receiveItem._id
        }

        if (!receiveItem.hasOwnProperty("productLabel")) {
            throw "received item does not have property of 'productLabel'"
        }

        let itemContent = {
            removed: 0,
            createTime: new Date(),
            loggingTime: new Date(),
            labelBuild: 3,
        }
        if (receiveItem && typeof receiveItem === "object") {
            Object.keys(receiveItem).forEach(eachKey => {
                if (["quantity", "removed", "seq", "labelBuild", "quarantine"].indexOf(eachKey) > -1) {
                    itemContent[eachKey] = parseInt(receiveItem[eachKey])
                } else if (eachKey === "unitPrice") {
                    itemContent[eachKey] = Decimal128.fromString(receiveItem[eachKey])
                } else if (["createTime", "loggingTime", "removeTime"].indexOf(eachKey) > -1) {
                    itemContent[eachKey] = new Date(receiveItem[eachKey])
                } else {
                    itemContent[eachKey] = receiveItem[eachKey]
                }
            })
        }

        try {
            await dbclient.connect()
            const session = dbclient.db(targetDB).collection("preloadlog");
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
    } catch (e) {
        console.error("Error when processing updates of Preload:", e)
    }
    res.json(response)
})

router.post("/v1/preload/remove", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {version: ServerApiVersion.v1, useNewUrlParser: true, useUnifiedTopology: true},
    });
    try {
        let bodyContent = typeof (req.body) === 'string' ? JSON.parse(req.body): req.body
        if (!req.body.hasOwnProperty("productLabel")){
            throw "Missing key parameters: 'productLabel'"
        }
        await dbclient.connect()
        const session = dbclient.db(targetDB).collection("preloadlog");
        let result = await session.deleteMany({"item.productLabel": req.body.productLabel})
        if (result.acknowledged) {
            response = result
        }
    } catch (e){
        console.error("Error when API removing product: ",e)
    } finally {
        await dbclient.close()
    }
    res.json(response)
})

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
    let response = {acknowledged: false, data: [], message: ""}
    await sessionClient.connect()
    const sessions = sessionClient.db(targetDB).collection("pollinglog");

    try {
        let findingQuery = {removed: (req.query.removed && parseInt(req.query.label) === 1 ? 1 : 0)}
        if (stockLabel && stockLabel.length > 0) {
            findingQuery.productLabel = {$regex: new RegExp(stockLabel), $options: "i"}
        }
        if (stockLocation && stockLocation.length > 0) {
            findingQuery.shelfLocation = {$regex: new RegExp(stockLocation), $options: "i"}
        }
        if (stockSession && stockSession.length > 0) {
            findingQuery.sessions = {$regex: new RegExp(stockSession), $options: "i"}
        }
        if (stockProduct && stockProduct.length > 0) {
            findingQuery.productCode = {$regex: new RegExp(stockProduct), $options: "i"}
        }

        response.data = await sessions.find(findingQuery, {projection: {"_id": 0}}).toArray()

        for (let i = 0; i < response.data; i++) {
            if (response.data[i].hasOwnProperty("unitPrice") && String(response.data[i].unitPrice).length >0){
                response.data[i].unitPrice = response.data[i].unitPrice.toString()
            }
            if (response.data[i].hasOwnProperty("grossPrice") && String(response.data[i].grossPrice).length >0){
                response.data[i].grossPrice = response.data[i].grossPrice.toString()
            }
        }

        response.acknowledged = true
    } catch (err) {
        console.error(err)
        response.message = err
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

router.use("/", swaggerUi.serve);
router.get("/", swaggerUi.setup(swaggerDocument));
router.get("/v1", swaggerUi.setup(swaggerDocument));
router.get('/test', (req, res) => {
    res.json({message: 'Hello from server!'})
})
module.exports = router;

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

/*
*  Sessions -> Snapshots
* Sessions已经弃用，转换为snapshots
*
* Snapshots包括
* GET: /sessions: 获取所有的盘点记录
* GET: /sessions/logs: 通过用户传入query，获取某次盘点的记录，用户需要指定单个session code
* POST: /sessions/add: 添加一次snapshot，用户可以指定货品的范围时间，超出时间的不计在内，允许用户自定义一个不重复的sessionCode
* DELETE: /sessions/delete: 删除一个snapshot，用户需要指定session Code
* */

router.get("/v1/snapshots", async (req, res) => {
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

    res.json(sessionResults);
});

router.post("/v1/snapshots/add", async (req, res) => {
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

router.get("/v1/snapshots/logs", async (req, res) => {
    let response = {acknowledged: false, data: [], message: ""};
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    try {
        if(!req.hasOwnProperty("query") || !req.query.hasOwnProperty("session")){
            throw "Missing Query / target Session Code"
        }
        const sessionCode = String(req.query.session);
        await dbclient.connect()
        const session = dbclient.db(targetDB).collection("pollinglog");
        var filter = {session: {$elemMatch : {$eq: sessionCode}}}
        var options = {sort: {"productLabel": 1}, projection: {"_id": 0}};
        var result = await session.find(filter, options).toArray()
        response = {acknowledged: true, data: result}
    } catch (e) {
        response.message = e
    } finally {
        await dbclient.close()
        res.json(response)
    }
});

router.delete("/v1/stocks/delete", async (req, res) => {
    let response = {acknowledged: false, deleteCount: 0}
    let dbclient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    try{
        if(!req.hasOwnProperty("query") || !req.query.hasOwnProperty("session")){
            throw "Missing Query / target Session Code"
        }
        const sessionCode = req.query.session
        await dbclient.connect()
        const session = dbclient.db(targetDB).collection("pollingsession");
        response = await session.deleteMany({session: sessionCode})
    } catch (e) {
        console.error("Error when deleting session: ", e)
    } finally {
        await dbclient.close()
        res.json(response)
    }
})

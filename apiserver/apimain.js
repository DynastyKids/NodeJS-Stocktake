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
 *  01JAN重写部分，update时候，需要检查数据库内是否已有条目
 *  有：需要检查更新数据前后对比，并添加changelog
 *  无：按照新添加方式处理
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
    if (req.body && req.body.item) {
        try {
            let filter = {}
            let updateObject = {$set: {}}
            if (!req.body.item.hasOwnProperty("productLabel") && !req.body.item.productLabel) {
                response.message = "Missing property of 'productLabel'"
                throw "Missing property of 'productLabel'"
            }
            filter = {productLabel: req.body.item.productLabel}
            // 检查各种字段中是否由需要的对应参数，如果没有则补齐
            // 默认使用字段时间并转换为时间对象，如果字段未提供默认使用当前时间
            let updateItems = req.body.item
            try {
                if (updateItems.hasOwnProperty("productLabel")) {
                    delete updateItems.productLabel
                }
                if (updateItems.hasOwnProperty("_id")) {
                    delete updateItems._id
                }
                updateItems.createTime = updateItems.hasOwnProperty("createTime") ? new Date(updateItems.createTime) : new Date()
                updateItems.loggingTime = new Date()
                updateItems.removed = updateItems.hasOwnProperty("removed") ? updateItems.removed : 0 // 默认设定为未使用
                if (updateItems.hasOwnProperty("removed") && parseInt(updateItems.removed) === 1) {
                    updateItems.removeTime = updateItems.hasOwnProperty("removeTime") ? new Date(updateItems.removeTime) : new Date()
                }
                if (updateItems.hasOwnProperty("unitPrice")) {
                    updateItems.unitPrice = Decimal128.fromString(updateItems.unitPrice)
                }
                await dbclient.connect()
                const session = dbclient.db(targetDB).collection("pollinglog");

                let originData = await session.find(filter).toArray()
                let originElement = await session.find(filter).toArray()
                let result = await session.updateOne(filter, {$set: updateItems}, {upsert: true})
                if (originElement.length === 1) {
                    await session.updateOne(filter, {$push: {changelog: compareChanges(originElement[0], updateItems)}})
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
        } catch (e) {
            console.error("Error when processing stocks update: ", e)
        }
    } else {
        response.message = "Missing item informations"
    }
    res.json(response)
})

function compareChanges(oldObject, newObject) {
    let changelog = {datetime: new Date(), events: []}
    if (typeof (oldObject) === 'object' && typeof (newObject) === 'object') {
        for (let eachKey of Object.keys(newObject)) {
            if (newObject.hasOwnProperty("eachKey")) {
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
        response.acknowledged = true
        response.data = result
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
                    console.log("unitPriceFound", Decimal128.fromString(receiveItem[eachKey]))
                    itemContent[eachKey] = Decimal128.fromString(receiveItem[eachKey])
                } else if (["createTime", "loggingTime", "removeTime"].indexOf(eachKey) > -1) {
                    itemContent[eachKey] = new Date(receiveItem[eachKey])
                } else {
                    console.log("unitPriceGeneral", receiveItem[eachKey])
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
        console.log("Error when processing updates of Preload:", e)
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

function createLogObject(sessioncode, iteminfo) {
    var mongodata = {
        sessions: [sessioncode],
        labelBuild: 3,
        removed: 0,
        quarantine: 0,
        loggingTime: new Date(),
    }
    try {
        if (isBase64String(iteminfo)) {
            var productInfo = JSON.parse(atob(iteminfo));
            Object.keys(productInfo).forEach(eachKey => {
                if (["quantity","labelBuild","removed", "quarantine"].indexOf(eachKey) > -1){
                    mongodata[eachKey] = parseInt(productInfo[eachKey])
                } else if(["unitPrice","grossPrice"].indexOf(eachKey) > -1){
                    try{
                        mongodata[eachKey] = Decimal128.fromString(productInfo[eachKey])
                    } catch (e){
                        console.error(`Error when processing ${eachKey}: `, e)
                    }

                } else if(["loggingTime","createTime","removedTime"].indexOf(eachKey) > -1){
                    try {
                        mongodata[eachKey] = new Date(productInfo[eachKey])
                    } catch (e) {
                        mongodata[eachKey] = new Date()
                        console.error(`Error when processing ${eachKey}: `, e,"Using default time instead")
                    }
                } else {
                    mongodata[eachKey] = String(productInfo[eachKey])
                }
            })
        }
    } catch (e) {
        console.error("Error occurred when attempting to process data:", e);
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

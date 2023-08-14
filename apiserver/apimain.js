const express = require("express");
const bodyParser = require("body-parser");
const expressApp = express();
const port = 3000;
const router = express.Router();
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json");

const MongoClient = require("mongodb").MongoClient;
const { ServerApiVersion } = require("mongodb");
// const credentials = JSON.parse(require("../credentials.js" ))
const fs = require("fs");
const path = require("path");
const credentials = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config/localsettings.json"))
);
const moment = require("moment-timezone");
const { session } = require("electron");
const uri = encodeURI(`${credentials.mongodb_protocol}://${credentials.mongodb_username}:${credentials.mongodb_password}@${credentials.mongodb_server}/?retryWrites=true&w=majority`);

const sessionClient = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        useNewUrlParser: true,
        useUnifiedTopology: true,
    },
});

router.get("/", async (req, res) => {
    res.json({ ping: true, acknowledged: true, message: "For API documentation, visit '/api' " });
});

/* 
 * 获取所有当前可用的Session
 */
router.get("/api/v1/sessions", async (req, res) => {
    let results = await getSessionLists()
    res.json(results.data);
});

/* 
 * 验证当前Session是否有效
 */
router.post("/api/v1/sessions/join", async (req, res) => {
    const sessioncode = req.body.session;
    var sessionResults = await checkSession(sessioncode)
    res.json(sessionResults.data);
});

/* 
 * GET方法，Sessionlog用来查看某个会话的所有产品；Query:sessioncode
 * 获取所有当前session的产品盘点信息，使用labelid去重
 */ 
router.get("/api/v1/sessionlog", async (req, res) => {
    const sessions = sessionClient.db(credentials.mongodb_db).collection("pollinglog");
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let findingQuery = { session: req.query.session };
    let options = { sort: { productCode: 1, loggingTime: -1 } }
    let cursor;
    let sessionResults = [];
    try {
        await sessionClient.connect();
        cursor = sessions.find(findingQuery, options);
        if ((await sessions.countDocuments(findingQuery)) === 0) {
            console.log("[MongoDB] Nothing Found");
        } else {
            for await (const x of cursor) {
                sessionResults.push(x);
            }
        }
    } catch (err) {
        console.error(err)
        sessionResults = JSON.stringify(err)
    }
    res.json(sessionResults);
});

/* 
 * 扫描信息按照sessioncode进入系统
 */
router.post("/api/v1/sessionlog/add", async (req, res) => {
    const sessioncode = (req.body.session ? req.body.session : "");
    const iteminfo = req.body.item;
    let localTime = moment(new Date()).tz("Australia/Sydney");
    var mongodata = {};
    let purposedRes = { acknowledged: false };
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
 * 默认使用最后一个开启的session号码来添加库存信息
 * 如果没有session可用，则返回失败，如果添加成功则返回成功信息
 */
router.post("/api/v1/sessionlog/autoadd",async(req, res)=>{
    let sessionResults = await getSessionLists();

})

async function getSessionLists(){
    const options = { sort: { startDate: 1 } };
    const sessions = sessionClient.db(credentials.mongodb_db).collection("pollingsession");
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let findingQuery = {
        $and: [
            { endDate: { $gte: localTime.format("YYYY-MM-DD HH:mm:ss") } },
            { startDate: { $lte: localTime.format("YYYY-MM-DD HH:mm:ss") } },
        ]
    };
    let cursor;
    let sessionResults = {acknowledged:false, data:[], message:""};

    try {
        await sessionClient.connect();
        cursor = sessions.find(findingQuery, options);
        if ((await sessions.countDocuments(findingQuery)) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const x of cursor) {
            sessionResults.data.push({
                session: x.session,
                startDate: x.startDate,
                endDate: x.endDate,
                logTime: x.logTime
            });
        }
        sessionResults.acknowledged = true
    } catch (err) {
        console.error(err)
        sessionResults.message = JSON.stringify(err)
    }
    
    return sessionResults;
}

async function checkSession(sessionId){
    let sessionResults = {acknowledged:false, data:[], message:""};
    const sessions = sessionClient.db(credentials.mongodb_db).collection("pollingsession");
    let findingQuery = {
        $and: [
            { endDate: { $gte: localTime.format("YYYY-MM-DD HH:mm:ss") } },
            { startDate: { $lte: localTime.format("YYYY-MM-DD HH:mm:ss") } },
            { session: sessionId}
        ]
    };
    try {
        await sessionClient.connect();
        let result = await sessions.find(findingQuery)
        if ((await sessions.countDocuments(findingQuery)) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const x of result) {
            sessionResults.data.push({
                session: x.session,
                startDate: x.startDate,
                endDate: x.endDate,
                logTime: x.logTime
            });
        }
        sessionResults.acknowledged = true
    } catch (err) {
        console.error(err)
    }
    return sessionResults
}

// 查看目前库存中所有的产品信息
router.get("/api/v1/products", async (req, res) => {
    const sessions = sessionClient.db(credentials.mongodb_db).collection("products");
    let cursor;
    let products = [];
    try {
        await sessionClient.connect();
        cursor = await sessions.find({}, { sort: { itemcode: 1 } });
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        } else {
            for await (const x of cursor) {
                products.push(x);
            }
        }
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json(JSON.stringify(err));
    }
});

/*
 * GET Stock，获取当前的库存信息和下一板位位置
 * 获取所有当前session的产品盘点信息，使用labelid去重，并且剔除所有consumed的商品, 每次pull限5000条
 */
router.get("/api/v1/stocks", async (req, res) => {
    const sessions = sessionClient.db(credentials.mongodb_db).collection("pollinglog");
    const product = req.query.prod
    try {
        await sessionClient.connect();
        let pipeline = [{ $sort: { bestbefore: -1, productLabel: -1 } },
        {
            $group: {
                _id: { productLabel: "$productLabel" },
                session: { $first: "$session" },
                productLabel: { $first: "$productLabel" },
                productCode: { $first: "$productCode" },
                quantity: { $first: "$quantity" },
                quantityUnit: { $first: "$quantityUnit" },
                shelfLocation: { $first: "$shelfLocation" },
                consumed: { $first: "$consumed" },
                POIPnumber: { $first: "$POIPnumber" },
                productName: { $first: "$productName" },
                bestbefore: { $first: "$bestbefore" },
                labelBuild: { $first: "$labelBuild" },
            }
        },
        {
            $project: {
                session: 1,
                // loggingTime: 0,
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
        },
        { $match: { consumed: 0 } }
        ]

        if (product) {
            pipeline.push({ $match: { productCode: product } })
        }
        if (req.query.limit && parseInt(req.query.limit) < 5000) {
            pipeline.push({ $limit: parseInt(req.query.limit) })
        } else {
            pipeline.push({ $limit: 5000 })
        }
        let cursor2 = await sessions.aggregate(pipeline).toArray();
        let resultArray = []
        for (let index = 0; index < cursor2.length; index++) {
            if (cursor2[index].productLabel === "") {
                continue;
            }
            cursor2[index].quantity = parseInt(cursor2[index].quantity)
            resultArray.push(cursor2[index])
        };
        res.status(200).json(resultArray.length > 0 ? resultArray : []);
    } catch (err) {
        console.error(err)
        res.status(500).json(err);
    }
});

/*
 * POST Stock请求为商品添加、库位移动
 * 需要传入参数
 * Consume 使用api/v1/stocks/consume
 */
router.post("/api/v1/stocks", async (req, res) => {
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let response = { acknowledged: false }
    try {
        const { action, content, shelf } = req.body // Action: move / add / consume
        if (action && action == "consume" && content.labelId) {
            // content: {labelid: xxxxxx}
            let updateObject = { consumed: 1, loggingTime: localTime.format("YYYY-MM-DD HH:mm:ss") }
            response = await updateOneLotByLabel(content.labelId, updateObject)
        } else if (action && action == "move" && content.labelId && content.newShelf) {
            // content: {labelid: xxxxxx, newShelf: XXX}
            let updateObject = { shelfLocation: content.newShelf, loggingTime: localTime.format("YYYY-MM-DD HH:mm:ss") }
            response = await updateOneLotByLabel(content.labelId, updateObject)
        } else if (action && action == "add" && content) {
            response = await insertOneLot(content)
        }
        if (shelf) {
            editStockShelfLocation(content.labelId, shelf)
        }
    } catch (err) {
        console.error(err)
        res.status(500).json(err)
    }
    res.status(200).json(response)
});

function createLogObject(sessioncode, iteminfo) {
    var mongodata = { session: sessioncode , productCode: "" , quantity: 0 , quantityUnit: "" , shelfLocation: "" , POIPnumber: "" , productName: "" , bestbefore: "" , productLabel: "" , productName: "" , labelBuild: 2 , consumed: 0 , loggingTime: moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss") }
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
        }
    } catch (error) {
        console.error(error);
    }
    return mongodata;
}

async function editStockShelfLocation(labelId, location){
    let returnResult = {acknowledged:false}
    try {
        await session.connect()
        const session = sessionClient.db(credentials.mongodb_db)
        var result = await session.updateMany({productLabel: labelId, consumed: 0}, {$set: {}},{upsert: false})
        if (result !== null) {
            returnResult = result
        }
    } catch (err) {
        console.error(err)
    }
    return returnResult
}

/*
 * Stock中的consume方法，当某个板位被使用后需要标注所有的该id信息为consumed
 */
router.get("/api/v1/stocks/consume", async (req, res) => {
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let response = { acknowledged: false }
    const productLabel = req.query.label
    if (productLabel !== undefined && productLabel.length > 0) {
        try {
            let result = await findAndUpdateLogs({ itemcode: productLabel, consumed: 0 }, { consumed: 1, consumedTime: localTime.format("YYYY-MM-DD HH:mm:ss")})
            if (result.modifiedCount > 0 && result.matchedCount > 0) {
                response.acknowledged = true
            }
        } catch (err) {
            console.error(err)
            res.status(500).json(err)
        }
    }

    if (req.header("Referer")) {
        res.redirect(req.header("Referer"))
    } else {
        res.redirect("/")
    }
    res.status(200).response
})
router.post("api/v1/stocks/consume", async(req,res) =>{
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let response = { acknowledged: false }
    const { productLabel }= req.body
    if (productLabel !== undefined && productLabel.length > 0) {
        try {
            let result = await findAndUpdateLogs({ itemcode: productLabel, consumed: 0 }, { consumed: 1, consumedTime: localTime.format("YYYY-MM-DD HH:mm:ss")})
            if (result.modifiedCount > 0 && result.matchedCount > 0) {
                response.acknowledged = true
            }
        } catch (err) {
            console.error(err)
            res.status(500).json(err)
        }
    }
    if (req.header("Referer")) {
        res.redirect(req.header("Referer"))
    } else {
        res.redirect("/")
    }
    res.status(200).response
})

async function findAndUpdateLogs(findCondition, updateQuery) {
    let returnResult = {}
    try {
        await sessionClient.connect()
        const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog");
        var result = await session.updateMany(findCondition, { $set: updateQuery }, { upsert: false })
        if (result !== null) {
            returnResult = result
        }
    } catch (e) {
        console.error(e)
    }
    return returnResult
}

async function getProductInfo(productCode) {
    let returnResult = {}
    try {
        await sessionClient.connect()
        const session = sessionClient.db(credentials.mongodb_db).collection("products");
        const query = { itemcode: productCode }
        const options = {
            projection: {
                description: 1,
                itemcode: 1,
                labelname: 1,
                unitsInbox: 1,
                productUnit: 1,
                vendorCode: 1,
                weight: 1,
                withBestbefore: 1
            }
        }
        var result = await session.findOne(query, {})
        if (result !== null) {
            returnResult = result
        }
    } catch (e) {
        console.error(e)
    }

    return returnResult
}

router.use("/api", swaggerUi.serve);
router.get("/api", swaggerUi.setup(swaggerDocument));

module.exports = router;

async function insertOneToLog(insertData) {
    try {
        await sessionClient.connect();
        const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog");
        var result = await session.findOne({
            session: insertData.session,
            productCode: insertData.productCode,
            productLabel: insertData.productLabel,
        });
        var returnData;
        if (result == null) {
            result = await session.insertOne(insertData);
            returnData = { acknowledged: true, method: "insertOne", result: result };
        } else {
            returnData = { acknowledged: true, method: "findOne", result: result };
        }
        return returnData;
    } catch (err) {
        console.error(err);
        return { acknowledged: false, method: null, result: err.toString };
    }
}

async function findLastPollionglog(labelId) {
    try {
        await sessionClient.connect()
        const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog")
        const projection = { _id: 0, session: 1, loggingTime: 1, productCode: 1, quantity: 1, quantityUnit: 1, shelfLocation: 1, consumed: 1, POIPnumber: 1, productName: 1, bestbefore: 1, productLabel: 1, labelBuild: 1 }
        const result = await session.findOne({ productLabel: labelId }, { projection: projection })
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
    let returnResult = { acknowledged: false }
    try {
        if (productInformationObject.hasOwnProperty("productCode") && productInformationObject.hasOwnProperty("quantity") && productInformationObject.hasOwnProperty("quantityUnit") && productInformationObject.hasOwnProperty("shelfLocation") && productInformationObject.hasOwnProperty("productName") && productInformationObject.hasOwnProperty("productLabel")) {
            await sessionClient.connect()
            const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog")
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
    let returnResult = { acknowledged: false }
    try {
        await sessionClient.connect()
        const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog")
        const result = await session.updateOne({ productLabel: productLabelId }, { $set: updateObject }) //更新信息后也更新最后记录时间
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
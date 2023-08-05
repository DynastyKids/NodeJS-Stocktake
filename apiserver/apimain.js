const express = require("express");
const bodyParser = require("body-parser");
const expressApp = express();
const port = 3000;
const router = express.Router();
router.use(bodyParser.urlencoded({extended: true}));
router.use(bodyParser.json());

const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json");

const MongoClient = require("mongodb").MongoClient;
const {ServerApiVersion} = require("mongodb");
// const credentials = JSON.parse(require("../credentials.js" ))
const fs = require("fs");
const path = require("path");
const credentials = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config/localsettings.json"))
);
const moment = require("moment-timezone");
const {session} = require("electron");
const uri = encodeURI(`${credentials.mongodb_protocol}://${credentials.mongodb_username}:${credentials.mongodb_password}@${credentials.mongodb_server}/?retryWrites=true&w=majority`);

const sessionClient = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        useNewUrlParser: true,
        useUnifiedTopology: true,
    },
});

router.get("/", async (req, res) => {
    res.json({ping:true,acknowledged:true,message:"For API documentation, visit '/api' "});
});

// 所有会话相关
router.get("/api/v1/sessions", async (req, res) => {
    // 获取所有当前可用的session
    const options = {sort: {startDate: 1}};
    const sessions = sessionClient.db(credentials.mongodb_db).collection("pollingsession");
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let findingQuery = {
        $and: [
            {endDate: {$gte: localTime.format("YYYY-MM-DD HH:mm:ss")}},
            {startDate: {$lte: localTime.format("YYYY-MM-DD HH:mm:ss")}},
        ]
    };
    console.log(findingQuery)
    let cursor;
    let sessionResults = [];

    try {
        await sessionClient.connect();
        cursor = sessions.find(findingQuery, options);
        if ((await sessions.countDocuments(findingQuery)) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const x of cursor) {
            sessionResults.push({
                session: x.session,
                startDate: x.startDate,
                endDate: x.endDate,
            });
        }
        res.json(sessionResults);
    } catch (err) {
        console.error(err)
        res.status(500).json(JSON.stringify(err));
    }
});

router.post("/api/v1/sessions/join", async (req, res) => {
    //检查当前session是否可用，如果可用返回session信息
    const sessioncode = req.body.session;
    const options = {sort: {startDate: 1}, projection: {_id: 0, session: 1, startDate: 1, endDate: 1, logTime: 1}};
    const sessions = sessionClient.db(credentials.mongodb_db).collection("pollingsession");
    let localTime = moment(new Date()).tz("Australia/Sydney");
    // let findingQuery = {session:sessioncode,endDate:{$gte: localTime.format('YYYY-MM-DD HH:mm:ss')},startDate:{$lte: localTime.format('YYYY-MM-DD HH:mm:ss')}}
    let findingQuery = {
        session: sessioncode,
        endDate: {$gte: localTime.format("YYYY-MM-DD HH:mm:ss")},
    };
    let cursor;
    let sessionResults = [];

    try {
        await client.connect();
        cursor = sessions.find(findingQuery, options);
        if ((await sessions.countDocuments(findingQuery)) === 0) {
            console.log("[MongoDB] Nothing Found");
        }
        for await (const x of cursor) {
            console.log(x)
            sessionResults.push({session: x.session, startDate: x.startDate, endDate: x.endDate,});
        }
        res.status(200).json(sessionResults);
    } catch (err) {
        sessionResults = JSON.stringify(err)
        res.status(400).json(sessionResults);
    }
});

router.get("/api/v1/sessionlog", async (req, res) => {
    // 获取所有当前session的产品盘点信息，使用labelid去重
    const sessions = sessionClient.db(credentials.mongodb_db).collection("pollinglog");
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let findingQuery = {session: req.query.session};
    let options = {sort: {productCode: 1, loggingTime: -1}}
    let cursor;
    let sessionResults = [];
    try {
        await sessionClient.connect();
        cursor = sessions.find(findingQuery, options);
        if ((await sessions.countDocuments(findingQuery)) === 0) {
            console.log("[MongoDB] Nothing Found");
        } else {
            for await (const x of cursor) {
                console.log(x)
                sessionResults.push(x);
            }
        }
    } catch (err) {
        console.error(err)
        sessionResults = JSON.stringify(err)
    }
    res.json(sessionResults);
});

router.post("/api/v1/sessionlog/add", async (req, res) => {
    //扫描信息入
    const sessioncode = (req.body.session ? req.body.session : "");
    const iteminfo = req.body.item;
    let localTime = moment(new Date()).tz("Australia/Sydney");

    console.log(session, iteminfo);
    var mongodata = {};
    let purposedRes = {acknowledged: false};
    if (isBase64String(iteminfo)) {
        mongodata = createLogObject(sessioncode, iteminfo);
        if (mongodata !== {}) {
            purposedRes.acknowledged = true
            mongodata.loggingTime = moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss");
            insertData = await insertOneToLog(mongodata);
            if ((await insertData).acknowledged) {
                purposedRes = insertData;
            }
        }
    }
    res.json(purposedRes);
});

router.get("/api/v1/products", async (req, res) => {
    // 获取所有当前session的产品盘点信息，使用labelid去重
    const sessions = sessionClient.db(credentials.mongodb_db).collection("products");
    let cursor;
    let products = [];
    try {
        await sessionClient.connect();
        cursor = await sessions.find({}, {sort: {itemcode: 1}});
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

// Stock分为GET请求和POST请求
// 其中GET请求为无条件获取当前可用库存信息，可选参数为session code
// 其中POST请求为商品添加、库位移动
router.get("/api/v1/stocks", async (req, res) => {
    // 获取所有当前session的产品盘点信息，使用labelid去重，并且剔除所有consumed的商品
    const sessions = sessionClient.db(credentials.mongodb_db).collection("pollinglog");
    try {
        await sessionClient.connect();
        // let cursor = await sessions.find(query, options);
        // let cursor2 = await sessions.distinct("productLabel",query, options);
        let cursor2 = await sessions.aggregate([
            { $sort: { productLabel: 1 } },
            { 
                $group:{
                    _id: {productLabel: "$productLabel"},
                    session: {$first: "$session"},
                    productLabel: {$first: "$productLabel"},
                    productCode: { $first: "$productCode"},
                    quantity: { $first: "$quantity"},
                    quantityUnit: { $first: "$quantityUnit"},
                    shelfLocation: { $first: "$shelfLocation"},
                    consumed: { $first: "$consumed"},
                    POIPnumber: { $first: "$POIPnumber"},
                    productName: { $first: "$productName"},
                    bestbefore: { $first: "$bestbefore"},
                    labelBuild: { $first: "$labelBuild"},
                }
            },
            {
                $project:{
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
            }
        ]).toArray();
        let resultArray = []
        for (let index = 0; index < cursor2.length; index++) {
            if (cursor2[index].productLabel === "") {
                continue;
            }
            element.quantity = parseInt(element.quantity)
            resultArray.push(element)
        };
        res.status(200).json(resultArray.length>0 ? resultArray : []);
    } catch (err) {
        console.error(err)
        res.status(500).json(err);
    }
});

router.post("/api/v1/stocks", async (req, res) => {
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let response = {acknowledged: false}
    try {
        const { action , content } = req.body // Action: move / add / consume
        console.log("API Stock",action, content, req.body)
        if (action && action == "consume" && content.labelId) {
            // content: {labelid: xxxxxx}
            let updateObject = {consumed: 1, loggingTime: localTime.format("YYYY-MM-DD HH:mm:ss")}
            response = await updateOneLotByLabel(content.labelId, updateObject)
            console.log(response)
        } else if(action && action == "move" && content.labelId && content.newShelf){
            // content: {labelid: xxxxxx, newShelf: XXX}
            let updateObject = {shelfLocation: content.newShelf, loggingTime: localTime.format("YYYY-MM-DD HH:mm:ss")}
            response = await updateOneLotByLabel(content.labelId, updateObject)
        } else if(action && action == "add" && content){
            response = await insertOneLot(content)
        }
    } catch (err) {
        console.error(err)
        res.status(500).json(err)
    }
    res.status(200).json(response)
});

function createLogObject(sessioncode, iteminfo) {
    var mongodata = {};
    try {
        if (isBase64String(iteminfo)) {
            var productInfo = JSON.parse(atob(iteminfo));
            console.log(getProductInfo(productInfo.Code))
            console.log("itemadd:V2");
            mongodata = {
                // Default data assembled by V1 code
                session: sessioncode,
                productCode: productInfo.Code,
                quantity: parseInt(productInfo.Qty),
                quantityUnit: (String(productInfo.Prod).toLowerCase().includes("jelly") || String(productInfo.Prod).toLowerCase().includes("popping")
                || String(productInfo.Prod).toLowerCase().includes("syrup") ? "carton" : ""),
                shelfLocation: "",
                POIPnumber: "",
                productName: "",
                bestbefore: "",
                productLabel: productInfo.LabelId,
                labelBuild: 1,
                POIPnumber: productInfo.POIP,
                // V2版本中productname在code中，则需要从表中重新提取
                quantity: ((Number.isInteger(productInfo.Unit)) ? mongodata.quantity = productInfo.Unit : ""),
                productName: productInfo.Prod,
                labelBuild: 2,
                // 新增标签信息如下
                loggingTime: moment(new Date()).tz("Australia/Sydney").format("YYYY-MM-DD HH:mm:ss"),
                consumed: 0,
            }
            if (productInfo.Build) {
                // V3 or later, using all info provided
                console.log("itemadd:V3");
                if ((productInfo.Unit.toLowerCase().includes("ctns") || productInfo.Unit.toLowerCase().includes("carton")
                    || productInfo.Unit.toLowerCase().includes("box")) && productInfo.hasOwnProperty("unitsInbox")) {
                    //所有Topping, Jelly, 茶叶， 粉按照最小数量单元计算
                    productInfo.quantity = productInfo.quantity * productInfo.unitsInbox
                    productInfo.quantityUnit = ((productInfo.productName).toLowerCase().includes("jelly") || (productInfo.productName).toLowerCase().includes("popping") || (productInfo.productName).toLowerCase().includes("syrup") ? "btls" : ((productInfo.productCode).toUpperCase().includes("TC") || (productInfo.productCode).toUpperCase().includes("PW")) ? "bag" : "")
                } else {
                    mongodata.quantityUnit = productInfo.Unit.toLowerCase()
                        .replace("ctns", "carton")
                        .replace("btls", "bottle");
                }
                mongodata.POIPnumber = productInfo.POIP;
                mongodata.productName = productInfo.Prod;
                mongodata.bestbefore = productInfo.Bestbefore;
                mongodata.labelBuild = 3;
            }
        }
    } catch (error) {
        console.error(error);
    }

    return mongodata;
}

async function getProductInfo(productCode) {
    let returnResult = {}
    try {
        await sessionClient.connect()
        const session = sessionClient.db(credentials.mongodb_db).collection("products");
        const query = {itemcode: productCode}
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
        console.log(result)
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
    console.log("On Async InsertONE");
    try {
        await sessionClient.connect();
        const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog");
        var result = await session.findOne({
            session: insertData.session,
            productCode: insertData.productCode,
            productLabel: insertData.productLabel,
        });
        var returnData;
        console.log("findone", result);
        if (result == null) {
            result = await session.insertOne(insertData);
            returnData = {acknowledged: true, method: "insertOne", result: result};
        } else {
            returnData = {acknowledged: true, method: "findOne", result: result};
        }
        return returnData;
    } catch (err) {
        console.log(err);
        return {acknowledged: false, method: null, result: err.toString};
    }
}

async function isValidSession(sessioncode) {
    let findQuery = {
        session: sessioncode,
        endDate: {$gte: localTime.format("YYYY-MM-DD HH:mm:ss")},
        startDate: {$lte: localTime.format("YYYY-MM-DD HH:mm:ss")},
    };
    try {
        await sessionClient.connect();
        const session = sessionClient.db(credentials.mongodb_db).collection("pollingsession");
        const result = await session.find(findQuery).count();
        if (result > 0) {
            return true;
        } else {
            return false;
        }
    } catch (err) {
        console.log(err);
        return false;
    }
}

async function findALot(labelId) {
    try {
        await sessionClient.connect()
        const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog")
        const projection = {_id: 0, session: 1, loggingTime: 1, productCode: 1, quantity: 1, quantityUnit: 1, shelfLocation: 1, consumed: 1, POIPnumber:1 ,productName: 1, bestbefore: 1, productLabel: 1, labelBuild: 1}
        const result = await session.findOne({productLabel: labelId},{projection:projection})
        console.log("find:", await result)
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

async function insertOneLot(productInformationObject){
    let localTime = moment(new Date()).tz("Australia/Sydney");
    let returnResult = {acknowledged: false}
    try {
        if(productInformationObject.hasOwnProperty("productCode") && productInformationObject.hasOwnProperty("quantity") && productInformationObject.hasOwnProperty("quantityUnit") && productInformationObject.hasOwnProperty("shelfLocation") && productInformationObject.hasOwnProperty("productName") && productInformationObject.hasOwnProperty("productLabel")){
            await sessionClient.connect()
            const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog")
            const result = await session.insertOne(productInformationObject)
            returnResult.acknowledged = true
            console.log(result)
        }
    } catch (err) {
        console.log(err)
    }
    return returnResult;
}

async function updateOneLotByLabel(productLabelId, updateinfoObject) {
    let localTime = moment(new Date()).tz("Australia/Sydney");
    var updateObject = updateinfoObject
    updateObject['loggingTime'] = localTime.format("YYYY-MM-DD HH:mm:ss")
    console.log("UpdateOne1:",updateObject)
    let returnResult = {acknowledged: false}
    try {
        await sessionClient.connect()
        const session = sessionClient.db(credentials.mongodb_db).collection("pollinglog")
        const result = await session.updateOne({productLabel: productLabelId}, { $set: updateObject}) //更新信息后也更新最后记录时间
        console.log("UpdateOne2:",result)
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

function base64product(text) {
    try {
        var productInfo = atob(text);
        if (productInfo.Build !== undefined) {
            // V3 or later, using all info provided
        } else if (productInfo.POIP !== undefined) {
            // V2 code or higher
        } else {
            // V1 Code, direct read
        }
    } catch (e) {
        return "";
    }
}

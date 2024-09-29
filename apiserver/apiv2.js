const express = require("express");
const bodyParser = require("body-parser");
const expressApp = express();
const router = express.Router();
router.use(bodyParser.urlencoded({extended: true}));
router.use(bodyParser.json());

const cors = require("cors")

const MongoClient = require("mongodb").MongoClient;
const Timestamp = require("mongodb").Timestamp
const {ServerApiVersion, Decimal128} = require("mongodb");

// router.use(bodyParser.urlencoded({extended: true}));
// router.use(bodyParser.json());

module.exports = router
router.post('/ping', async (req, res) => {
    let { mongoURI, dbName, collectionName} = req.body;
    if (!mongoURI || !dbName || !collectionName) {
        return res.status(400).json({
            acknowledged: false,
            message: "Please provide mongoURI, dbName, and collectionName."
        });
    }
    let client = new MongoClient(mongoURI, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        }
    });
    try {
        await client.connect();
        const collection = client.db(dbName).collection(collectionName);
        await client.db(dbName).command({ping: 1})
        res.json({acknowledged: true, message: "ping successful"});
    } catch (err) {
        res.status(500).json({
            acknowledged: false,
            message: err
        });
    } finally{
        await client.close()
    }
});

router.post('/find', async (req, res) => {
    let { mongoURI, dbName, collectionName, query, options} = req.body;
    if (!mongoURI || !dbName || !collectionName) {
        return res.status(400).json({
            acknowledged: false,
            message: "Please provide mongoURI, dbName, and collectionName." 
        });
    }
    try {
        let client = new MongoClient(mongoURI, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true,
            }
        });
        await client.connect();
        const collection = client.db(dbName).collection(collectionName);

        query = (query && typeof query === "object") ? query : {}
        options = (options && typeof options === "object") ? options : {}

        let data = await collection.find(query, options).toArray();
        await client.close()
        res.json({acknowledged: true,"results": data});
    } catch (err) {
        res.status(500).json({
            acknowledged: false,
            message: err
        });
    }
});

router.get('/find', (req, res) => {
    const example = {
        description: "Example request to find data from MongoDB. ",
        method: "POST",
        url: "/find",
        requestBody: {
            mongoURI: "mongodb://localhost:27017 [string, Mandatory]",
            dbName: "testDB [string, Mandatory]",
            collectionName: "testCollection [string, Mandatory]",
            query: {
                field: "values"
            },
            options:{
                field: "values"
            }
        }
    };
    res.json(example);
});

router.post('/insertTimeSeries', async (req, res) => {
    let { mongoURI, dbName, collectionName, timeField, documents, options } = req.body;
    if (!mongoURI || !dbName || !collectionName || !documents) {
        return res.status(400).json({
            acknowledged: false,
            message: "Please provide mongoURI, dbName, collectionName, timeField, documents and options(not mandatory)."
        });
    }
    console.log(documents)

    try {
        const client = new MongoClient(mongoURI, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true,
            }
        });

        await client.connect();
        const collection = client.db(dbName).collection(collectionName);

        documents[`${timeField.name}`] = new Date(timeField.val)
        console.log(documents)
        let result = await collection.insertOne(documents, options);

        await client.close();
        res.json({
            acknowledged: true,
            result: result
        });
    } catch (err) {
        console.error('Error inserting data:', err);
        res.status(500).json({
            acknowledged: false,
            status: 'Server error',
            message: err
        });
    }
});

router.post('/insert', async (req, res) => {
    let { mongoURI, dbName, collectionName, documents, options } = req.body;
    if (!mongoURI || !dbName || !collectionName || !documents) {
        return res.status(400).json({
            acknowledged: false,
            message: "Please provide mongoURI, dbName, collectionName, documents and options(not mandatory)."
        });
    }

    try {
        const client = new MongoClient(mongoURI, {
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true,
            }
        });

        await client.connect();
        const collection = client.db(dbName).collection(collectionName);

        let result;
        if (Array.isArray(documents)) {
            result = await collection.insertMany(documents, options);
        } else {
            result = await collection.insertOne(documents, options);
        }

        await client.close();
        res.json({
            acknowledged: true,
            result: result
        });
    } catch (err) {
        console.error('Error inserting data:', err);
        res.status(500).json({
            acknowledged: false,
            status: 'Server error',
            message: err
        });
    }
});

router.get('/insert', (req, res) => {
    const example = {
        description: "Example request to insert multiple data from MongoDB.",
        method: "POST",
        url: "/find",
        requestBody: {
            mongoURI: "mongodb://localhost:27017 [string, Mandatory]",
            dbName: "testDB [string, Mandatory]",
            collectionName: "testCollection [string, Mandatory]",
            documents: ["values"],
            options:{
                field: "values"
            }
        }
    };
    res.json(example);
});

// API to update data
router.post('/update', async (req, res) => {
    const { mongoURI, dbName, collectionName, query, update, upsert = false } = req.body;

    if (!mongoURI || !dbName || !collectionName || !query || !update) {
        return res.status(400).json({
            acknowledged: false,
            message: "Please provide mongoURI, dbName, collectionName, query, and update."
        });
    }

    try {
        const client = new MongoClient(mongoURI,{
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true,
            }
        });
        await client.connect();

        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        let result;

        if (multi) {
            result = await collection.updateMany(query, update, { upsert });
        } else {
            result = await collection.updateOne(query, update, { upsert });
        }
        await client.close()
        res.json({
            acknowledged: false,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount || 0,
            upsertedId: result.upsertedId || null,
            message: 'Update operation successful'
        });
    } catch (err) {
        res.status(500).json({
            acknowledged: false,
            message: err
        });
    }
});

// Example for update data API
router.get('/update', (req, res) => {
    const example = {
        description: "Example request to update data in MongoDB",
        method: "POST",
        url: "/update",
        requestBody: {
            mongoURI: "mongodb://your-mongo-uri",
            dbName: "your-database-name",
            collectionName: "your-collection-name",
            query: {
                field: "value"
            },
            update: {
                "$set": { "fieldToUpdate": "newValue" }
            },
            upsert: true,
            multi: false
        }
    };
    res.json(example);
});

// API to delete data
router.post('/delete', async (req, res) => {
    const { mongoURI, dbName, collectionName, query, multi = false } = req.body;

    if (!mongoURI || !dbName || !collectionName || !query) {
        return res.status(400).json({ message: "Please provide mongoURI, dbName, collectionName, and query." });
    }

    try {
        const client = new MongoClient(mongoURI,{
            serverApi: {
                version: ServerApiVersion.v1,
                useNewUrlParser: true,
                useUnifiedTopology: true,
            }
        });
        await client.connect();

        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        let result;

        if (multi) {
            result = await collection.deleteMany(query);
        } else {
            result = await collection.deleteOne(query);
        }
        await client.close()
        res.json({
            deletedCount: result.deletedCount,
            message: `Delete operation successful, deleted ${result.deletedCount} record(s)`
        });
    } catch (err) {
        res.status(500).json({
            status: 'Server error',
            message: err
        });
    }
});

// Example for delete data API
router.get('/delete', (req, res) => {
    const example = {
        description: "Example request to delete data from MongoDB",
        method: "POST",
        url: "/delete",
        requestBody: {
            mongoURI: "mongodb://your-mongo-uri",
            dbName: "your-database-name",
            collectionName: "your-collection-name",
            query: {
                field: "value"
            },
            multi: false
        }
    };
    res.json(example);
});
const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const path = require('path');
const fs=require('fs');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../localsettings.json')));
const moment = require('moment-timezone')

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

window.onload = () => {
    // initialize the date pickers
    startTimePicker = new flatpickr(document.getElementById("inputStartDate"), {
        dateFormat: "Y-m-d", minDate: "today", enableTime: true, time_24hr: true, defaultHour: 0, defaultMinute: 0
    })
    endTimePicker = new flatpickr(document.getElementById("inputEndDate"), {
        dateFormat: "Y-m-d", minDate: "today", enableTime: true, time_24hr: true, defaultHour: 23, defaultMinute: 59
    })

    document.getElementById("staticSessionCode").value = generateSessionHex()
    document.getElementById("inputStartDate").value = moment(new Date()).tz("Australia/Sydney")
        .format('YYYY-MM-DD') + " 00:00:00"
    document.getElementById("inputEndDate").value = moment(new Date()).tz("Australia/Sydney")
        .format('YYYY-MM-DD') + " 23:59:59"

    document.getElementById('newSessionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        let data = {
            session: document.getElementById("staticSessionCode").value,
            startDate: document.getElementById("inputStartDate").value,
            endDate: document.getElementById("inputEndDate").value,
            logTime: moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')
        }
        console.log("Run Submit Form",data)

        insertOneData(data).then((result) =>{
            console.log("[MongoDB] InsertOne:"+result)
        }).finally(()=>{
            window.location.replace("../index.html");
        })
    });

    document.getElementById("inputStartDate").addEventListener("input", () => {
        document.getElementById("inputEndDate").value = document.getElementById("inputStartDate").value.substring(0, 11) + "23:59:59"
        endTimePicker.minDate = document.getElementById("inputStartDate").value
    })
}

async function insertOneData(data){
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("chatestsyd").collection("pollingsession")
            .insertOne(data, (err, res) => {
            if (err) {
                console.error('Failed to insert document', err);
                return ;
            }
            return res
        });
    } finally {
        client.close();
    }
}

function generateSessionHex() {
    let sessioncode = Math.floor(Math.random() * 0x10000000).toString(16)
        .padStart(7, '0').toLocaleUpperCase()
    var findQuery = { session: sessioncode };

    client.db(credentials.mongodb_db).collection("pollingsession")
        .findOne(findQuery, (err, res) => {
        if (err) {
            console.error('Failed to insert document', err);
            return;
        }
        console.log('Document inserted', res);
        client.db(credentials.mongodb_db).close();
    });
    return sessioncode
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("chatestsyd").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        await client.close();
    }
}
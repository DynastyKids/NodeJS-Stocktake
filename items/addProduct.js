const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const path = require('path');
const fs=require('fs');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

window.onload = () => {
    // initialize the date pickers
    document.getElementById('newSessionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        let data = {
            description: document.querySelector("#inputDescription").value,
            itemcode: document.querySelector("#inputCode").value,
            labelname: document.querySelector("#inputLabelName").value,
            palletqty: document.querySelector("#inputQuantity").value,
            productUnit: document.querySelector("#inputUnit").value,
            vendorCode: document.querySelector("#inputVendorCode").value,
            weight: document.querySelector("#inputWeight").value,
            withBestbefore: document.querySelector("#inputBestbefore").value,
            loggingTime: moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:MM:ss')
        }
        console.log("Run Submit Form",data)

        insertOneData(data).then((result) =>{
            alert("Data Insert Successfully")
            console.log("[MongoDB] InsertOne:"+result)
        }).finally(()=>{
            window.location.replace("../index.html");
        })
    });
}

async function insertOneData(data){
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db(credentials.mongodb_db).collection("products")
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
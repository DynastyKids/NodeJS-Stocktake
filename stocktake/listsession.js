const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const fs=require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

document.addEventListener("DOMContentLoaded", (event) => {
    console.log(getAllSession())
});

async function getAllSession(){
    let nowTime= moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')
    const tomorrow = (new Date('today')).setDate(new Date('today').getDate()+1)
    const options = {sort: { startDate: -1 },};
    const sessions = client.db("chatestsyd").collection("pollingsession");
    let cursor;
    let htmlContent=""
    try {
        await client.connect();
        cursor = sessions.find({}, options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const  x of cursor) {
            htmlContent += `<tr><td>${x.session}</td><td>${x.startDate}</td><td>${x.endDate}</td><td>${x.logTime}` +
                `</td><td><a href="../stocktake/viewsession.html?id=${x.session}">View</a></td></tr>`
        }

        if (htmlContent.length > 0){
            document.querySelector("#activeTBody").innerHTML = htmlContent
        }
    } finally {
        client.close();
    }

    return htmlContent;
}

window.onload = () => {
    getCurrentSession()
    // console.log(getCurrentSession().catch(console.log));
}
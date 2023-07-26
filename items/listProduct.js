// 使用pollingsession的结果，distinct掉相同的labelid，然后删除所有在listproduct中标注
// 了已经使用的产品，再加入到productlist中展示出来，，页面每30s刷新一次

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
    const sessions = client.db("chatestsyd").collection("products");
    let cursor;
    let htmlContent=""
    try {
        await client.connect();
        cursor = sessions.find({}, options);
        if ((await sessions.countDocuments({})) === 0) {
            console.log("[MongoDB] Nothing Found");
        }

        for await (const  x of cursor) {
            htmlContent += `<tr><td>${x.itemcode}</td><td>${x.description.replace(x.itemcode+" - ","")}</td><td>${x.palletqty} ${x.productUnit}</td><td>${(x.withBestbefore>0 ? "√": "")}` +
                `</td><td><a href="editProduct.html?id=${x.itemcode}">Edit</a></td></tr>`
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
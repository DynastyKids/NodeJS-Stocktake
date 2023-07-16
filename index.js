const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const path = require('path');
const credentials = require(path.resolve( __dirname, "./credentials.js" ))
const moment = require('moment-timezone')

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

async function getCurrentSession(){
	let nowTime= moment(new Date()).tz("Australia/Sydney").format('YYYY-MM-DD HH:mm:ss')
	const tomorrow = (new Date('today')).setDate(new Date('today').getDate()+1)
	const options = {sort: { startDate: 1 },};
	const sessions = client.db("chatestsyd").collection("pollingsession");
	let localTime = moment(new Date()).tz("Australia/Sydney")
	let findingQuery = {endDate:{$gte: localTime.format('YYYY-MM-DD HH:mm:ss')}}
	let cursor;
	let htmlContent=""
    try {
        await client.connect();
		cursor = sessions.find(findingQuery, options);
		console.log(JSON.stringify(findingQuery))
		if ((await sessions.countDocuments(findingQuery)) === 0) {
			console.log("[MongoDB] Nothing Found");
		}

		for await (const  x of cursor) {
			console.log(x)
			htmlContent += `<tr><td>${x.session}</td><td>${x.startDate}</td><td>${x.endDate}</td><td><a href="stocktake/viewsession.html?id=${x.session}">View</a></td></tr>`
		}

		if (htmlContent.length > 0){
			document.querySelector("#activeSessionTBody").innerHTML = htmlContent
		}
		// console.log(cursor);
    } finally {
        client.close();
    }

	return [cursor,htmlContent];
}

window.onload = () => {
	console.log(getCurrentSession().catch(console.log));

}
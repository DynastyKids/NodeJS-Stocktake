const MongoClient = require('mongodb').MongoClient;
const {ipcRenderer} = require('electron')
const path = require('path')
const {ServerApiVersion} = require('mongodb');

const Storage = require("electron-store");
const newStorage = new Storage();

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

const Bootstrap = require("bootstrap")

document.querySelector('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    // 获取用户的输入
    const dbName = document.querySelector('#mongodb').value
    const dbUri = document.querySelector("#mongouri").value
    const regex = /^(mongodb(?:\+srv)?:\/\/[^\s]*$)/;
    if (regex.test(uri)) {
        let newUri = (dbUri && dbUri.length > 0 ? dbUri : newStorage.get("mongoURI"))
        let newDBName = (dbName && dbName.length > 0 ? dbName : newStorage.get("mongoDB"))
        if (await connectionVerify(newUri, newDBName)) {
            newStorage.set("mongoURI", newUri)
            newStorage.set("mongoDB", newDBName)
            createAlert("success", "All changes has been saved")
        }
    }
})

document.addEventListener("DOMContentLoaded", (event) => {
    if(newStorage.get('mongoURI')){
        document.querySelector("#mongouri").placeholder = "Current: "+hidePasswordFromMongoURI(newStorage.get('mongoURI'))
    }
    if(newStorage.get('mongoDB')){
        document.querySelector("#mongodb").placeholder = "Current: "+targetDB
    }
    console.log(newStorage.get('mongoURI'), newStorage.get('mongoDB'))
    if(newStorage.get('mongoURI')&& newStorage.get('mongoDB')){
        connectionVerify(newStorage.get('mongoURI'), newStorage.get('mongoDB'))
    }
});

function hidePasswordFromMongoURI(uri) {
    const regex = /^(mongodb(?:\+srv)?:\/\/)([^:@]+):([^@]+)@/;
    return uri.replace(regex, '$1$2:****@');
}
document.querySelectorAll('a.external-link').forEach(eachExtLink =>{
    eachExtLink.addEventListener('click', function (ev) {
        ev.preventDefault();
        let url = eachExtLink.getAttribute('href');
        window.openExternal(url);
        ipcRenderer.invoke('open-external', url);
    });
})

function createAlert(status, text, time = 5000){
    let alertAnchor = document.querySelector("#alertAnchor")
    let alertElement = document.createElement("div")
    alertElement.className= "alert alert-primary alert-dismissible bg-success text-white border-0 fade show";
    alertElement.role = "alert";
    let svgImage = document.createElement("svg")
    svgImage.className = "bi flex-shrink-0 me-2"
    svgImage.width = 24
    svgImage.height = 24
    svgImage.role = "img"
    svgImage.ariaLabel = "Info: "
    svgImage.innerHTML = `<use xlink:href="#info-fill"/>`

    let texts = document.createElement("span")
    texts.innerHTML = text ? text : ""
    if (status === "success"){
        alertElement.className= "alert alert-success alert-dismissible bg-success text-white border-0 fade show"
        svgImage.ariaLabel = "Success: "
        svgImage.innerHTML = `<use xlink:href="#check-circle-fill"/>`
    } else if (status === "danger"){
        alertElement.className= "alert alert-danger alert-dismissible bg-danger text-white border-0 fade show"
        svgImage.ariaLabel = "Danger: "
        svgImage.innerHTML = `<use xlink:href="#exclamation-triangle-fill"/>`
    } else if (status === "secondary"){
        alertElement.className= "alert alert-secondary alert-dismissible bg-secondary text-white border-0 fade show"
        svgImage.ariaLabel = "Info: "
        svgImage.innerHTML = `<use xlink:href="#info-fill"/>`
    }
    alertElement.append(svgImage)
    alertElement.append(text)
    alertAnchor.append(alertElement)
    setTimeout(function () {
        if (alertElement){
            alertElement.style.display = 'none'
        }
    }, isNaN(time) ? 3000 : time)
}

async function connectionVerify(dburi, dbname) {
    const client = new MongoClient(dburi, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    createAlert("secondary","connecting ... ")
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        const results = await client.db(dbname).command({ping: 1});
        // var resultSession = await client.db(credentials.mongodb_db).createCollection("pollingsession");
        // var resultLog = await client.db(credentials.mongodb_db).createCollection("pollinglog");
        // var resultProducts = await client.db(credentials.mongodb_db).createCollection("products");
        createAlert("success","Connection Successful");
        return true;
    }catch (e) {
        createAlert("danger","Connection Error: "+e)
        return false
    } finally {
        await client.close();
    }
}
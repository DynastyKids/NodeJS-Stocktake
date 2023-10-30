const MongoClient = require('mongodb').MongoClient;
const {ipcRenderer} = require('electron')
const path = require('path')
const {ServerApiVersion} = require('mongodb');

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

const Storage = require("electron-store");
const newStorage = new Storage();

const uri = newStorage.get("mongoURI") ? newStorage.get("mongoURI") : "mongodb://localhost:27017"
const targetDB = newStorage.get("mongoDB") ? newStorage.get("mongoDB") : "production"

let DBStatus=0

i18next.use(Backend).init({
    lng: (newStorage.get('language') ? newStorage.get('language') : 'en'), backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar()
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar()
        i18n_bodyContents();
        newStorage.set("language",e.target.value)
    });
});

function i18n_navbar() {
    // Navbar Section
    for (let i = 0; i < document.querySelectorAll(".nav-topitem").length; i++) {
        document.querySelectorAll(".nav-topitem")[i].innerHTML = i18next.t(`navbar.navitems.${i}`)
    }
    for (let i = 0; i < document.querySelectorAll("#sessionDropdownList a").length; i++) {
        document.querySelectorAll("#sessionDropdownList a")[i].innerHTML = i18next.t(`navbar.sessions_navitems.${i}`)
    }
    for (let i = 0; i < document.querySelectorAll("#productDropdownList a").length; i++) {
        document.querySelectorAll("#productDropdownList a")[i].innerHTML = i18next.t(`navbar.products_navitems.${i}`)
    }
}
function i18n_bodyContents()  {
    document.title = `${i18next.t('setting.pagetitle')} - Warehouse Electron`

    // Body Section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").textContent = i18next.t('index.pagetitle')
    breadcrumbs[1].textContent = i18next.t('setting.pagetitle')

    document.querySelector(".container h1").textContent = i18next.t('setting.pagetitle');
    var labels = document.querySelectorAll("#settings-form label")
    for (let i = 0; i < labels.length; i++) {
        labels[i].textContent = i18next.t(`setting.dbform_labels.${i}`)
    }

    document.querySelectorAll(".infotext h5")[0].textContent = i18next.t("setting.titleaboutdb")
    document.querySelectorAll(".infotext p")[0].textContent = i18next.t("setting.textaboutdb")
    document.querySelectorAll(".infotext h5")[1].textContent = i18next.t("setting.titlescheme")
    document.querySelectorAll(".infotext p")[1].textContent = i18next.t("setting.textscheme")
    document.querySelectorAll(".infotext h5")[2].textContent = i18next.t("setting.titleenvironment")

    document.querySelector("#database_status").innerText = i18next.t(`setting.dbstatusText.${DBStatus}`)
}

document.getElementById('settings-form').addEventListener('submit', (event) => {
    event.preventDefault()

    // 获取用户的输入
    const dbName = document.querySelector('#db-name').value
    const dbUri = document.querySelector("#db-uri").value
    const regex = /^(mongodb(?:\+srv)?:\/\/[^\s]*$)/;
    if(regex.test(uri)){
        connectionVerify(dbUri, dbName)
        newStorage.set("mongoURI",dbUri)
        newStorage.set("mongoDB",dbName)
        alert('Settings has been saved')
    }

    // JSON设置文件已经不再使用，默认存入本地的Electron Storage
})

document.addEventListener("DOMContentLoaded", async (ev) => {
    if (newStorage.get('mongoURI')) {
        // console.log(btoa(newStorage.get('mongoURI')))
        document.querySelector("#db-uri").placeholder = "Current URI: " + hidePasswordFromMongoURI(newStorage.get('mongoURI'))
    }
    if (newStorage.get('mongoDB')) {
        document.querySelector("#db-name").placeholder = "Current DB: " + targetDB
    }
//     当用户进入此页面时，检查用户当前的连接是否可用，如果不可用则给出对应提示
//     检查可用后，如果数据库内没有对应的collection，则也需要询问用户是否需要添加
    await CheckingDatabaseConnection()
});

async function CheckingDatabaseConnection() {
    document.querySelector("#database_status").classList = "alert alert-info"
    document.querySelector("#database_status").textContent = i18next.t(`setting.dbstatusText.${0}`)
    DBStatus = 0
    if (document.querySelector("#buttonPatch")) {
        document.querySelector("#buttonPatch").style = "display: none"
    }

    if (!await connectionVerify(newStorage.get('mongoURI'), newStorage.get('mongoDB'))) {
        //     假: 未能成功连接上数据库
        document.querySelector("#database_status").classList = "alert alert-danger"
        document.querySelector("#database_status").textContent = i18next.t(`setting.dbstatusText.${1}`)
        DBStatus = 1
    } else if (await checkCollections(newStorage.get('mongoURI'), newStorage.get('mongoDB'))) {
        //     真： 包括了需要的所有Collection
        document.querySelector("#database_status").classList = "alert alert-success"
        document.querySelector("#database_status").textContent = i18next.t(`setting.dbstatusText.${2}`)
        DBStatus = 2
    } else {
        //     假： 未包括需要的Collections，询问用户是否需要自动创建/补齐
        document.querySelector("#database_status").classList = "alert alert-warning"
        document.querySelector("#database_status").textContent = i18next.t(`setting.dbstatusText.${3}`)
        DBStatus = 3
        let button = document.createElement("button")
        button.id = "buttonPatch"
        button.classList = "btn btn-info"
        button.innerHTML = `<i class="ti ti-hammer"></i>`
        button.addEventListener("click",async (ev) => {
            document.querySelector("#database_status").classList = "alert alert-info"
            document.querySelector("#database_status").innerText = i18next.t(`setting.dbstatusText.${4}`)
            DBStatus = 4
            const client = new MongoClient(newStorage.get('mongoURI'), {
                serverApi: {
                    version: ServerApiVersion.v1,
                    strict: true,
                    deprecationErrors: true,
                    useNewUrlParser: true,
                    useUnifiedTopology: true
                }
            });
            try {
                // Connect the client to the server	(optional starting in v4.7)
                await client.connect();
                // Send a ping to confirm a successful connection
                let targetDB = await client.db(newStorage.get('mongoDB'));
                let collectionList = ['pollinglog', 'pollingsession', 'preloadlog', 'products', 'settings']
                for (const eachCollection of collectionList) {
                    response = await targetDB.listCollections({name: eachCollection}).toArray()
                    if (response.length === 0) {
                        if (eachCollection === "preloadlog"){
                            await targetDB.createCollection(eachCollection, {
                                timeseries: {timeField: "createTime"}
                            });
                        } else {
                            await targetDB.createCollection(eachCollection);
                        }
                    }
                }
            } catch (e) {
                console.error("Error on check Collections: ", e)
            } finally {
                await client.close();
                DBStatus = 5
                document.querySelector("#database_status").classList = "alert alert-success"
                document.querySelector("#database_status").innerText = i18next.t(`setting.dbstatusText.${5}`)
            }
        })

        document.querySelector("#database_status").appendChild(button)
    }
}

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
    let results = false
    try {
        await client.connect();
        results = await client.db(targetDB).command({ping: 1});
        if (results.ok){
            results = true
        }
    } finally {
        await client.close();
    }
    return results
}

async function checkCollections(dburi, dbname){
    const client = new MongoClient(dburi, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
            useNewUrlParser: true,
            useUnifiedTopology: true
        }
    });
    let results = false
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        let targetDB = await client.db(dbname);
        let response = targetDB.command({ping: 1})
        let collectionList = ['pollinglog', 'pollingsession', 'preloadlog', 'products', 'settings']
        let collectionResults = true
        for (const eachCollection of collectionList) {
            response = await targetDB.listCollections({name: eachCollection}).toArray()
            if (response.length === 0) {
                collectionResults = false
            }
            console.log(response.length)
        }
        results = collectionResults;
    } catch (e) {
        console.error("Error on check Collections: ",e)
    } finally {
        await client.close();
    }
    return results
}
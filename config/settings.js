const MongoClient = require('mongodb').MongoClient;
const {ipcRenderer} = require('electron')
const fs = require('fs')
const path = require('path')
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/localsettings.json')));
const {ServerApiVersion} = require('mongodb');
const uri = encodeURI(credentials.mongodb_protocol + "://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
});

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
i18next.use(Backend).init({
    lng: 'en', backend: {loadPath: 'i18nLocales/{{lng}}/translations.json'}
}).then(() => {
    updateTexts();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        updateTexts();
    });
});

function updateTexts() {
    document.title = `${i18next.t('setting.pagetitle')} - Warehouse Electron`
    // Navbar Section
    document.querySelector("#navHome").textContent = i18next.t('navbar.home');
    document.querySelector("#sessionDropdown").textContent = i18next.t('navbar.sessions');
    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    sessionDropdownLinks[0].textContent = i18next.t('navbar.newsession');
    sessionDropdownLinks[1].textContent = i18next.t('navbar.allsession');

    document.querySelector("#productDropdown").textContent = i18next.t('navbar.products');
    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    productDropdownLinks[0].textContent = i18next.t('navbar.showallproducts');
    productDropdownLinks[1].textContent = i18next.t('navbar.addproduct');
    productDropdownLinks[2].textContent = i18next.t('navbar.showstocksoverview');
    productDropdownLinks[3].textContent = i18next.t('navbar.showmovementlog');
    productDropdownLinks[4].textContent = i18next.t('navbar.addmovementlog');

    document.querySelector("#navSettings").textContent = i18next.t('navbar.settings');
    document.querySelector("#LanguageDropdown").textContent = i18next.t('navbar.language');

    // Body Section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").textContent = i18next.t('index.pagetitle')
    breadcrumbs[1].textContent = i18next.t('setting.pagetitle')

    document.querySelector(".container h1").textContent = i18next.t('setting.pagetitle');
    var labels = document.querySelectorAll("#settings-form label")
    for (let i = 0; i < labels.length; i++) {
        labels[i].textContent = i18next.t(`setting.dbform_labels.${i}`)
    }
    document.querySelector("#settings-form select option").textContent = i18next.t("setting.placeholderprotocol")
    var inputPlaceholders = document.querySelectorAll("#settings-form input")
    for (let i = 0; i < inputPlaceholders.length; i++) {
        inputPlaceholders[i].placeholder = i18next.t(`setting.dbform_placeholders.${i}`)
    }
    document.querySelectorAll(".infotext h5")[0].textContent = i18next.t("setting.titleaboutdb")
    document.querySelectorAll(".infotext p")[0].textContent = i18next.t("setting.textaboutdb")
    document.querySelectorAll(".infotext h5")[1].textContent = i18next.t("setting.titlescheme")
    document.querySelectorAll(".infotext p")[1].textContent = i18next.t("setting.textscheme")
    document.querySelectorAll(".infotext h5")[2].textContent = i18next.t("setting.titleenvironment")
}

document.getElementById('settings-form').addEventListener('submit', (event) => {
    event.preventDefault()

    // 获取用户的输入
    const dbScheme = document.querySelector('#db-scheme').value
    const dbAddress = document.querySelector('#db-address').value
    const dbUsername = document.querySelector('#db-username').value
    const dbPassword = document.querySelector('#db-password').value
    const dbName = document.querySelector('#db-name').value

    const settings = {
        mongodb_protocol: dbScheme,
        mongodb_server: dbAddress,
        mongodb_username: dbUsername,
        mongodb_password: dbPassword,
        mongodb_db: dbName
    }

    // 获取Electron应用的userData路径
    const userDataPath = ipcRenderer.sendSync('get-user-data-path')

    // 将设置保存到JSON文件中
    fs.writeFileSync(path.join(__dirname, 'config/localsettings.json'), JSON.stringify(settings))

    connectionVerify();
    alert('Settings has been saved')
})


async function connectionVerify() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        var resultSession = await client.db(credentials.mongodb_db).createCollection("pollingsession");
        var resultLog = await client.db(credentials.mongodb_db).createCollection("pollinglog");
        var resultProducts = await client.db(credentials.mongodb_db).createCollection("products");
    } finally {
        client.close();
    }
}
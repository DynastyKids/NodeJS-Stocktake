const MongoClient = require('mongodb').MongoClient;
const {ServerApiVersion} = require('mongodb');
const flatpickr = require("flatpickr");
const path = require('path');
const fs = require('fs');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const moment = require('moment-timezone')

const uriCompents = [credentials.mongodb_protocol, "://"]
if (credentials.mongodb_username && credentials.mongodb_password) {
    uriCompents.push(`${credentials.mongodb_username}:${credentials.mongodb_password}@`);
}
uriCompents.push(`${credentials.mongodb_server}/?retryWrites=true&w=majority`)
const uri = encodeURI(uriCompents.join(""))
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
const Storage = require("electron-store");
const newStorage = new Storage();
i18next.use(Backend).init({
    lng: (newStorage.get('language') ? newStorage.get('language') : 'en'), backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_bodyContents();
        newStorage.set("language",e.target.value)
    });
});
function i18n_navbar() {
    // Navbar Section
    var navlinks = document.querySelectorAll(".nav-topitem");
    for (let i = 0; i < navlinks.length; i++) {
        navlinks[i].innerHTML = i18next.t(`navbar.navitems.${i}`)
    }

    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    for (let i = 0; i < sessionDropdownLinks.length; i++) {
        sessionDropdownLinks[i].innerHTML = i18next.t(`navbar.sessions_navitems.${i}`)
    }

    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    for (let i = 0; i < productDropdownLinks.length; i++) {
        productDropdownLinks[i].innerHTML = i18next.t(`navbar.products_navitems.${i}`)
    }
}
function i18n_bodyContents() {
    document.title = `${i18next.t('newsession.pagetitle')} - Warehouse Electron`
    document.title = `${i18next.t('navbar.home')} - Warehouse Electron`

    // Content Section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").innerText = i18next.t('index.pagetitle');
    breadcrumbs[1].querySelector("a").innerText = i18next.t('session.pagetitle');
    breadcrumbs[2].innerText = i18next.t('newsession.pagetitle');

    var inputlabels = document.querySelectorAll(".container label");
    inputlabels[0].textContent = i18next.t("newsession.sessioncode");
    inputlabels[1].textContent = i18next.t("newsession.starttime");
    inputlabels[2].textContent = i18next.t("newsession.endtime");

    document.querySelector("#btnSubmit").value = i18next.t("newsession.submitbtn");
}

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
        console.log("Run Submit Form", data)

        insertOneData(data).then((result) => {
            console.log("[MongoDB] InsertOne:" + result)
        }).finally(() => {
            window.location.replace("../index.html");
        })
    });

    document.getElementById("inputStartDate").addEventListener("input", () => {
        document.getElementById("inputEndDate").value = document.getElementById("inputStartDate").value.substring(0, 11) + "23:59:59"
        endTimePicker.minDate = document.getElementById("inputStartDate").value
    })
}

async function insertOneData(data) {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db(credentials.mongodb_db).collection("pollingsession")
            .insertOne(data, (err, res) => {
                if (err) {
                    console.error('Failed to insert document', err);
                    return;
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
    var findQuery = {session: sessioncode};

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
        await client.db(credentials.mongodb_db).command({ping: 1});
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        await client.close();
    }
}
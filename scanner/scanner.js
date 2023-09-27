const MongoClient = require('mongodb').MongoClient;
const {ipcRenderer} = require('electron')
const fs = require('fs')
const path = require('path')
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/localsettings.json')));
const {ServerApiVersion} = require('mongodb');
const uri = encodeURI(credentials.mongodb_protocol + "://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

const axios = require('axios')
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
// const Keyboard = require('simple-keyboard').SimpleKeyboard;
const Keyboard = require('simple-keyboard').default;
i18next.use(Backend).init({
    lng: 'en', backend: {loadPath: path.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar();
    i18n_bodyContents();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value).then(() => {
        i18n_navbar();
        i18n_bodyContents();
    });
});

let timer = null
document.querySelector("#scannerinput").addEventListener("input", (ev) => {
    let inputValue = document.querySelector("#scannerinput").value
    const regex = /[?&]([^=#]+)=([^&#]*)/g;
    clearTimeout(timer);
    document.querySelector("#screenKeyboard").style.display = "none";
    timer = setTimeout(async () => {
        let inputFields = document.querySelectorAll("#inputRespond table tbody input");
        inputFields.forEach(eachInputField =>{ eachInputField.value = "" })
        try {
            if (inputValue.split("item=").length > 0) {
                let base64product = inputValue.split("item=")[1]
                base64product = JSON.parse(atob(base64product))
                var result = await fetchProduct(base64product)
                var inputfield = document.querySelectorAll("table tbody input")
                if (result.status && result.data.length > 0) {
                    inputfield[0].value = `${(result.data[0].productCode ? result.data[0].productCode + " - " : "")} ${(result.data[0].productName ? result.data[0].productName : "")}`
                    inputfield[1].value = `${result.data[0].quantity ? result.data[0].quantity (result.data[0].quantityUnit ? result.data[0].quantityUnit : ""): ""}`
                    inputfield[2].value = `${result.data[0].bestbefore ? result.data[0].bestbefore : ""}`
                    inputfield[3].value = `${result.data[0].productLabel ?result.data[0].productLabel : ""}`
                    inputfield[4].value = `${result.data[0].shelfLocation ? result.data[0].shelfLocation : ""}`
                    document.querySelector("#actionstd").innerHTML =`
                    <button id="btnconsume" class="btn btn-danger">Consume (5)</button>
                    <button id="btnloading" class="btn btn-info">Loading</button>
                    <button id="btn move" class="btn btn-warning">Move</button>`
                } else if (result.status) { //状态为真，代表商品未入库，则改成使用
                    inputfield[0].value = `${base64product.Code ? base64product.Code + " - " : ""} ${base64product.Prod}`
                    inputfield[1].value = `${base64product.Qty ? base64product.Qty +' '+ (base64product.Unit ? base64product.Unit : ""): ""}`
                    inputfield[2].value = `${base64product.Bestbefore?base64product.Bestbefore : ""}`
                    inputfield[3].value = `${base64product.LabelId?base64product.LabelId : ""}`
                    // inputfield[4].querySelector("input").style.display

                    document.querySelector("#screenKeyboard").style.display = "block";
                    document.querySelector("#actionstd").innerHTML = `<button id="btnloading" class="btn btn-info">Loading</button>`
                    document.querySelector("#btnloading").addEventListener("click",(ev)=>{

                    })
                }
            }
        } catch (e) {
            console.error("Error when decode", e)
        }
    }, 750);
})

async function fetchProduct(object) {
    const sessionClient = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    });
    let results = {status:false, data:null};

    if (!object['LabelId']){
        return results
    } else {
        try {
            await sessionClient.connect();
            const sessions = sessionClient.db(credentials.mongodb_db).collection("pollinglog");
            var findingQuery = {productLabel: object['LabelId']}
            var optionQuery = {projection: {"_id": 0}}
            results.status = true;
            results.data = await sessions.find(findingQuery,optionQuery).sort({loggingTime: -1}).toArray();
        } catch (err) {
            console.error("Error:",err)
        } finally {
            sessionClient.close()
        }
    }
    return results
}

const keyboard = new Keyboard({
    onChange: input => onChange(input),
    onKeyPress: button => onKeyPress(button),
    mergeDisplay: true,
    layoutName: "default",
    containerClassName: "simple-keyboard",
    physicalKeyboardHighlight: true,
    layout: {
        default: [
            "1 2 3 4 5 6 7 8 9 0",
            "q w e r t y u i o p",
            "a s d f g h j k l",
            "{shift} z x c v b n m {backspace}",
            "{space} {ent}"
        ],
        shift: [
            "! @ # $ % ^ & * ( )",
            "Q W E R T Y U I O P",
            "A S D F G H J K L",
            "{shift} Z X C V B N M {backspace}",
            "{space} {ent}"
        ],
    },
    display: {
        "{ent}": "return",
        "{escape}": "esc ⎋",
        "{backspace}": "⌫",
        "{shift}": "⇧",
    }
})
function onChange(input) {
    try {
        document.querySelector("#shelflocationInput").value = input;
    } catch (e) {
        console.error("Keyboard Error:",e)
    }
}
function onKeyPress(button) {
    console.log(`Screen Keyboard Pressed: ${button}`);
}

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
    document.title = `${i18next.t('scanner.pagetitle')} - Warehouse Electron`

    // Body Section
    var breadcrumbs = document.querySelectorAll(".breadcrumb-item");
    breadcrumbs[0].querySelector("a").textContent = i18next.t('index.pagetitle')
    breadcrumbs[1].textContent = i18next.t('scanner.pagetitle')

    document.querySelector("h1").textContent = i18next.t('scanner.pagetitle');
    var titleCols = document.querySelectorAll(".col-title");
    for (let i = 0; i < titleCols.length; i++) {
        titleCols[i].textContent = i18next.t(`scanner.resultTableTitle.${i}`)
    }
}

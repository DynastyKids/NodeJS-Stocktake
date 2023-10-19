const i18nextNav = require('i18next');
const Backend2 = require('i18next-fs-backend');
const path2 = require("path");
const StorageNav = require("electron-store");
const newStorageNav = new StorageNav();

// console.log(newStorageNav.get('language'))

i18nextNav.use(Backend2).init({
    lng: (newStorageNav.get('language') ? newStorageNav.get('language') : 'en'), backend: {loadPath: path2.join(__dirname, '../i18nLocales/{{lng}}/translations.json')}
}).then(() => {
    i18n_navbar();
});

document.getElementById('languageSelector').addEventListener('change', (e) => {
    i18nextNav.changeLanguage(e.target.value).then(() => {
        i18n_navbar();
        newStorageNav.set("language",e.target.value)
    });
});

function i18n_navbar() {
    // Navbar Section
    var navlinks = document.querySelectorAll(".nav-topitem");
    for (let i = 0; i < navlinks.length; i++) {
        navlinks[i].innerHTML = i18nextNav.t(`navbar.navitems.${i}`)
    }

    var sessionDropdownLinks = document.querySelectorAll("#sessionDropdownList a");
    for (let i = 0; i < sessionDropdownLinks.length; i++) {
        sessionDropdownLinks[i].innerHTML = i18nextNav.t(`navbar.sessions_navitems.${i}`)
    }

    var productDropdownLinks = document.querySelectorAll("#productDropdownList a");
    for (let i = 0; i < productDropdownLinks.length; i++) {
        productDropdownLinks[i].innerHTML = i18nextNav.t(`navbar.products_navitems.${i}`)
    }
}
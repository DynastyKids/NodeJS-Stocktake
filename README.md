# Electron Stocktake Local Server

This is an Electron application designed to serve as local server on Warehouse Stock assistant.
It's a roboust, scalable and user-friendly tool to manageing current stocks.

## Installation

### Dependency
1. MongoDB
    This application is rely on MongoDB as database server, if you didn't have one, you can either install locally from [MongoDB](https://mongodb.com) or using Cloud service from [MongoDB Atlas](https://www.mongodb.com/atlas/database)
### Direct running from pre-packed application
Application are not require installation, just run and go. 

If firewall prompted, allow all connections as it require accessability for online databases and listening for Local Network barcode scanner clients.

### Self-complie and run the server

If you wish to self-compile this application, you are require to download [NodeJS](https://nodejs.org), require minimum version 16. After installation, navigate to project folder and run `npm start`

## User Manual
### First Time using
1. On first time use, the setting page will pops up, you will need to set up your MongoDB server information and click `submit`, all your information are stored locally in plaintext. If you wish to migrate to another computer, you will require to setup with same process again.

2. You will need to import product information to MongoDB.

### Create / Start a stocktake session
1. On Electron application homepage, click `New Stocktake Session`
2. Confirm the Start Time and End Time details, and also remember Session Code as it will required when user needs to join the session
 - Note: There can have multiple sessions running at same time.

### Perform Stocktake
1. Open Android App / Wechat MiniProgram, input the Server's IP address and Session Code
    - IP address is available on Homepage / View session page
    - If you can't remember the Session Code, you can type Server Address only and click `Check Sessions`, then type in the session code you wish to join

2. Hold the phone to QR code, or manually input available on mobile screen


## Functions

This application is designed with following core functionalities.

1. **Warehouse Stocktake**: Ability to tracking stock levels in regular stock take process.
2. **Report**: Viewable real-time server showing stock and inventory value, also promise first-in-first-out function for FMCG industry.
3. **Barcode Scanning**: Integration with Wechat-MiniProgram to enable barcode scanning ability for faster and error-free entries.
    - WeChat Miniprogram is currently under beta testing
    - Android Application is currently under Alpha stage development

## Planning

This section contains some features that may involve in future developing with warehouse stocktake server.

**Product running log**: Allowing to utilise user's mobile phone to tracking product movement log

**Integration with Netsuite**: Seamless syncing of inventory levels with Oracle ERP system to streamline stock levels.

**Product log editor / bulk importer**: Allow user setting product catalogues within Electron Application

**Label Generator**: Currently generator are not available to public due to testing, will release sooner within later this year

**Languages Support**: Everyone could help the project by adding i18n locale files and help to translate the product to your own languages
## Issues

Application cannot start on windows due to listen EACCESS error
```
net stop winnat
net start winnat
```
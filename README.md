# Electron Stocktake Local Server

The Warehouse Manager Electron Application is an open-source tool designed to help users manage their warehouses efficiently. This document provides an overview of the application's features and instructions for configuring the MongoDB database, including MongoDB Atlas integration.

This is an Electron application designed to serve as local server on Warehouse Stock assistant.
It's a roboust, scalable and user-friendly tool to manageing current stocks.

## Features
- **Inventory Management**: Easily add, edit, and delete items in your warehouse inventory.
- **Search and Filtering**: Quickly find items using search and filter functionalities.
- **Export Data**: Export your inventory data for further analysis.

## Installation - Using package
1. Download from releases available on the right.
## Installation - From scratch

1. Clone this repository to your local machine:

   ```bash
   $ git clone https://github.com/yourusername/warehouse-manager.git
   ```

2. Install the project dependencies:

    ```bash
    $ cd warehouse-manager
    $ npm install
    ```

3. Start the application:
    ```bash
    $ npm start
    ```

## Database Configuration

This application uses MongoDB as its database. You can configure the database settings by after open the application and goes to settings page, or you can create your own ```config/localsettings.json``` file, and insert following
```json
{
  "mongodb_protocol": "mongodb",
  "mongodb_server": "your server address",
  "mongodb_username": "your username",
  "mongodb_password": "your password",
  "mongodb_db": "your database"
}
```

### MongoDB Atlas Integration
If you prefer to use MongoDB Atlas, follow these steps:

1. Sign up for a MongoDB Atlas account at https://www.mongodb.com/cloud/atlas.

2. Create a new cluster and set up your MongoDB database.

3. Obtain your MongoDB Atlas connection string.

4. Create your own ```config/localsettings.json``` file, and insert following
```json
{
  "mongodb_protocol": "mongodb+srv",
  "mongodb_server": "your server address",
  "mongodb_username": "your username",
  "mongodb_password": "your password",
  "mongodb_db": "your database"
}
```

## Contributing
We welcome contributions from the community! If you find any issues or have ideas for improvements, please open an issue or submit a pull request.

## User Manual
This section will giving out basic instruction of how to use this application
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
## Known Issues

### Running on windows having EACCESS related error

On Windows running with certain environment, it will have error due to port cannot be opened, this issue may be related to Hyper-V services has taken those port numbers.
refer this [post](https://hungyi.net/posts/wsl2-reserved-ports/) which stated detail of what could cause this.

In short, you may change preserved ports to this issue, i.e. changing port number start from 56789 and giving 8000 ports available to Hyper-V, the command as follows
```cmd
netsh int ipv4 set dynamicport tcp start=56789 num=8000
netsh int ipv6 set dynamicport tcp start=56789 num=8000
net stop winnat
net start winnat
```
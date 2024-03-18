# Warehouse Electron - An locally deployed warehouse management system

The Warehouse Manager Electron Application is an open-source tool designed to help users manage their warehouses efficiently. This document provides an overview of the application's features and instructions for configuring the MongoDB database, including MongoDB Atlas integration.

This is an Electron application designed to serve as local server on Warehouse Stock assistant.
It's a roboust, scalable and user-friendly tool to manageing current stocks.

## Features
- **Inventory Management**: Easily add, edit, and delete items in your warehouse inventory.
- **Search and Filtering**: Quickly find items using search and filter functionalities.
- **Export Data**: Export your inventory data for further analysis.
- **Label Generator**: Generating label in real-time when shipments inbound, allowing easier and clearer organize stocks.

## Installation - Using package
1. Download from releases available on the right.

## Installation - From scratch

This project is build based on Electron 25 & Node.js 18, which require similiar version of NPM (^9.8.3) & NodeJS (^18.16) installed
1. Clone this repository to your local machine:

   ```bash
   $ git clone https://github.com/DynastyKids/NodeJS-Stocktake
   ```

2. Install the project dependencies:

    ```bash
    $ cd NodeJS-Stocktake
    $ npm install
    ```

3. Start the application:
    ```bash
    $ npm start
    ```

4. Pack the Application & build an executable application (Optional)
   ```bash
   $ npm run make
   $ npm run packages
   ```
   
## Database Configuration

This application uses MongoDB by default as its database. 
You can configure the database settings by after open the application and goes to settings page.

Ensure you have MongoDB URI and an account with high-strength password to ensure security.

[Mongo Atlas](https://www.mongodb.com/atlas/database) is also supported.

## Contributing
We welcome contributions from the community! If you find any issues or have ideas for improvements, please open an issue or submit a pull request.

## User Manual

This section will soon be migrated to GitHub Wiki.

This section will be giving out basic instruction of how to use this application

### First Time using
1. On first time use, the setting page will pops up. Or navigate to left menu under 'Operations' section, then click "Settings"
2. In the settings page, click "Database Settings (MongoDB)"
3. In the Database settings page, filling the credentials retrieved for MongoDB, then click `save`.
4. When the successful alert pops up, you are good to go.

### Perform Stocktaking
1. Ensure you are using the same network / under same router with your application running machine.
2. Using your phone's camera to QR code on workstation, or open the browser type in http://<your-server-ip-address>:3000 
3. At homepage, click "Check All Stocks" so you will be able to see the full list of current stock items, ordered by Location. 

## Functions

This application is designed with following core functionalities.

1. **Warehouse Management**: 
   - Tracking stock levels in regular stock take process.
   - Knowing your stock movements in real-time.
   - Warehouse staff can generate & print labels within warehouse range, and able to help manage stocks quickly.
2. **Report**: 
   - Viewable real-time server showing stock and inventory value, promise first-in-first-out for your business stocks.
   - Supporting Cloud dashboard (Powered by MongoDB Charts)
3. **Barcode Scanning**: 
   - Integrated within the main application and mini-webserver for easier management of stock movement. 
   - On dedicate work station, it can be preset to manage stocks autonomously.
   - No need for special PDA, using standard mobile-phone with camera can cover most cases.

## Planning

This section contains some features that may involve in future developing with warehouse stocktake server.

**Product running log**: Allowing to utilise user's mobile phone to tracking product movement log

~~**Integration with Netsuite**: Seamless syncing of inventory levels with Oracle ERP system to streamline stock levels.~~

**Product log editor / bulk importer**: Allow user setting product catalogues within Electron Application

~~**Label Generator**: Currently generator are not available to public due to testing, will release sooner within later this year~~

**Languages Support**: Everyone could help the project by adding i18n locale files and help to translate the product to your own languages

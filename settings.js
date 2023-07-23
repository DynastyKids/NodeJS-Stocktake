// renderer.js
const { ipcRenderer } = require('electron')
const fs = require('fs')
const path = require('path')
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, 'localsettings.json')));

const uri = encodeURI(credentials.mongodb_protocol+"://" + credentials.mongodb_username + ":" + credentials.mongodb_password + "@" + credentials.mongodb_server + "/?retryWrites=true&w=majority");

const client = new MongoClient(uri, {serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true,useNewUrlParser: true, useUnifiedTopology: true}});

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
    mongodb_db: dbName }

  // 获取Electron应用的userData路径
  const userDataPath = ipcRenderer.sendSync('get-user-data-path')

  // 将设置保存到JSON文件中
  fs.writeFileSync(path.join(__dirname, 'localsettings.json'), JSON.stringify(settings))

  connectionVerify();
  alert('Settings has been saved')
})


async function connectionVerify(){
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    var resultSession = await client.db("chatestsyd").createCollection("pollingsession");
    var resultLog = await client.db("chatestsyd").createCollection("pollinglog");
    var resultProducts = await client.db("chatestsyd").createCollection("products");
  } finally {
      client.close();
  }
}
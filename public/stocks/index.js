function getJWTtoken(){
    return fetch("/jwt",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({"user":"test"})
    })
        .then(response=>response.json())
        .then(data=>{
            return data.token
        })
        .catch(e => {
            console.error("Error:",e)
            return null
        })
}

const ChartsEmbedSDK = window.ChartsEmbedSDK;
const sdk = new ChartsEmbedSDK({
    baseUrl: "https://charts.mongodb.com/charts-project-0-nzkxe",
    getUserToken: async()=>{
        return getJWTtoken()
    },
    height: "100%",
    width: "100%",
    position:"fixed"
});
const dashboard = sdk.createDashboard({
    dashboardId: '4e1998f0-d652-4de8-b061-9b8ef4b68a6d'
});

dashboard
    .render(document.querySelector("#dashboardMain"))
    .then(()=>{
        document.querySelector("#dashboardMain").querySelector("div").style.position = "fixed"
    })
    .catch(()=>{
        document.querySelector("#dashboardMain").textContent = "MongoDB Atlas failed to load"
    })
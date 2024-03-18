// Using Base styles from bootstrap 5, load before page scripts

function createAlert(status, text, time = 5000){
    try{
        let alertAnchor = document.querySelector("#alertAnchor")
        let alertElement = document.createElement("div")
        alertElement.className= "alert alert-primary alert-dismissible bg-success text-white border-0 fade show";
        alertElement.role = "alert";
        let svgImage = document.createElement("svg")
        svgImage.className = "bi flex-shrink-0 me-2"
        svgImage.width = 24
        svgImage.height = 24
        svgImage.role = "img"
        svgImage.ariaLabel = "Info: "
        svgImage.innerHTML = `<use xlink:href="#info-fill"/>`

        let texts = document.createElement("span")
        texts.innerHTML = text ? text : ""
        if (["primary","secondary","success","danger","warning","info","light","dark"].includes(status.toLowerCase())){
            alertElement.className = `alert alert-${status.toLowerCase()} alert-dismissible bg-${status.toLowerCase()} text-white border-0 fade show`
            svgImage.ariaLabel = `${status.charAt(0).toUpperCase() + status.toLowerCase().slice(1)}: `
            if (status === "success"){
                svgImage.innerHTML = `<use xlink:href="#check-circle-fill"/>`
            } else if (["danger","warning"].includes(status.toLowerCase())){
                svgImage.innerHTML = `<use xlink:href="#exclamation-triangle-fill"/>`
            } else {
                svgImage.innerHTML = `<use xlink:href="#info-fill"/>`
            }
        } else { // default using Info
            alertElement.className = `alert alert-info alert-dismissible bg-info border-0 fade show`
            svgImage.ariaLabel = `Info: `
            svgImage.innerHTML = `<use xlink:href="#info-fill"/>`
        }

        alertElement.append(svgImage)
        alertElement.append(text)
        alertAnchor.append(alertElement)
        setTimeout(function () {
            if (alertElement){
                alertElement.style.display = 'none'
            }
        }, isNaN(time) ? 3000 : time)
    } catch (e) {
        console.error("Error when attempting create alert box: ",e)
    }
}

function createToast(backgroundStatus, bodyText){
    try{
        let toastWrap = document.createElement("div")
        toastWrap.className = "toast align-items-center text-white bg-primary border-0"
        toastWrap.role = "alert"
        toastWrap.setAttribute("aria-live", "assertive")
        toastWrap.setAttribute("aria-atomic", "true")

        let toastBodyWrap = document.createElement("div")
        toastBodyWrap.className = "d-flex"

        let toastBody = document.createElement("div")
        toastBody.className = "toast-body"
        toastBody.textContent = bodyText

        let closeBtn = document.createElement("button")
        closeBtn.type = "button"
        closeBtn.className = "btn-close btn-close-white me-2 m-auto"
        closeBtn.setAttribute("data-bs-dismiss", "toast")
        closeBtn.setAttribute("aria-label", "close")

        toastBodyWrap.append(toastBody, closeBtn)
        toastWrap.append(toastBodyWrap)
        document.querySelector("#alertAnchor").append("toastWrap")
    } catch (e) {
        console.error("Error when create toast: ",e)
    }
}
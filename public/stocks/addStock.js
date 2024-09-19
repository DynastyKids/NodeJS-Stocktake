let scanHistory = []
let productList = []

document.addEventListener("DOMContentLoaded", async function (ev) {
    await fetchProducts()

    // ####################### jsQR Start #############################
    try {
        const video = document.querySelector('#qr-video');
        const canvasElement = document.createElement('canvas');
        const canvas = canvasElement.getContext('2d', {willReadFrequently: true});
        let currentText = document.querySelector("#qr-reader-results")
        let animationFrameId;

        function drawLine(begin, end, color) {
            canvas.beginPath();
            canvas.moveTo(begin.x, begin.y);
            canvas.lineTo(end.x, end.y);
            canvas.lineWidth = 4;
            canvas.strokeStyle = color;
            canvas.stroke();
        }

        navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}})
            .then(function (stream) {
                video.srcObject = stream;
                video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
                video.play();
                animationFrameId = requestAnimationFrame(scanQRCode)
            })
            .catch(function (error) {
                console.error("Camera Access unavailable via QRious: ", error);

            });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                window.cancelAnimationFrame(animationFrameId);
            } else {
                animationFrameId = requestAnimationFrame(scanQRCode)
            }
        });

        async function scanQRCode() {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvasElement.height = video.videoHeight;
                canvasElement.width = video.videoWidth;
                canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
                const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
                currentText.textContent = 'Awaiting Scan Result';

                if (code) {
                    drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#00D73C");
                    drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#00D73C");
                    drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#00D73C");
                    drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#00D73C");
                    currentText.textContent = `${code.data}`;
                }
            }
            animationFrameId = requestAnimationFrame(scanQRCode);
        }
    } catch (e) {
        console.warn("Video Feed is not available via QRious")
    }
    // ####################### jsQR End #############################

    // ####################### html5-qrcode Start #############################
    if (document.querySelector("#qr-reader")) {
        var html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", {fps: 10, qrbox: 250});
        html5QrcodeScanner.render(onScanSuccess);
    }
    // ####################### html5-qrcode End #############################
})

// ####################### html5-qrcode Start #############################

function onScanSuccess(decodedText, decodedResult) {
    if (decodedText !== lastResult) {
        ++countResults;
        lastResult = decodedText;
        // Handle on success condition with the decoded message.
        // document.querySelector('#qr-reader-results').innerHTML = decodedText
        updateScannerInput(decodedText)
        console.log(`Scan result ${decodedText}`, decodedResult);
    }
}

var lastResult, countResults = 0;

// ####################### html5-qrcode End #############################

let inputWaitTimer;
let inputWaitInterval = 1000;

function fetchProducts(forced = false) {
    if (forced || productList.length <= 0) {
        return new Promise((resolve, reject) => {
            fetch("/api/v1/products?removed=1", {timeout: 10000})
                .then(response => response.json())
                .then(data => {
                    productList = data.data
                    resolve(data)
                })
                .catch(error => {
                    console.error("Error when fetching Products List:", error)
                    createAlert("warning", "Products list didn't fetched successfully", 3000)
                    reject(error)
                })

        })
    }
    return productList
}


function updateScannerInput(readText) {
    try{
        document.querySelector('#qr-reader-results').innerHTML = "Read:<br>"+readText

    } catch (e) {
        console.error("Cannot Update Reading Result")
    }
}

document.querySelector("#input_scannerInput").addEventListener('change', () => {
    clearTimeout(inputWaitTimer)
    inputWaitTimer = setTimeout(() => {
        console.log("Finished Typing")
    }, inputWaitInterval)
})

function decodeScannerInput() {

}

function loadDecodeResult() {

}
document.addEventListener("DOMContentLoaded", function() {
    const navbar = `
<nav class="navbar navbar-expand-lg navbar-light bg-light">
    <div class="container-fluid">
        <a class="navbar-brand" href="/">Stock-take Electron</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarSupportedContent">
            <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                <li class="nav-item">
                    <a class="nav-link active" aria-current="page" href="/"><i class="ti ti-home"></i>Home</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="labelgenerator.html"><i class="ti ti-tags"></i>Generate Labels</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="#"><i class="ti ti-qrcode"></i>Scan QR Code</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="#"><i class="ti ti-keyboard"></i>Manual Input</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="/api"><i class="ti ti-keyboard"></i>Swagger Portal (OpenAPI)</a>
                </li>
            </ul>
        </div>
    </div>
</nav>
    `;

    document.querySelector(".container").insertAdjacentHTML('afterbegin', navbar);
});

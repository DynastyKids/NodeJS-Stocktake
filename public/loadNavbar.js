let NavbarHTML =
    `<nav class="navbar navbar-expand-lg navbar-light bg-light">
        <div class="container-fluid">
            <a class="navbar-brand" href="/index.html">Warehouse Electron Web</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent"
                    aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarSupportedContent">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                    <li class="nav-item">
                        <a class="nav-link active" aria-current="page" href="/index.html"><i class="ti ti-home"></i>Home</a>
                    </li>
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="ti ti-tools"></i>Features
                        </a>
                        <ul class="dropdown-menu" aria-labelledby="navbarDropdown">
                            <li><a class="dropdown-item" href="/stocks/labelgenerator.html">Generate Labels</a></li>
                            <li><a class="dropdown-item" href="/stocks/prefill.html">Check prefill labels</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item" href="/stocks/stocks.html">Stock Management</a></li>
                            <li><a class="dropdown-item" href="/stocks/nextDispatch.html">Next Dispatch (FIFO)</a></li>
<!--                            <li style="display: none"><a class="dropdown-item" href="/stocks/add.html">Add Stock (Unavailable)</a></li>-->
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item" href="/stocks/qrscan.html">Scan QR Code [*Beta]</a></li>
<!--                            <li><a class="dropdown-item" href="/stocks/qrstation.html">Station Scanner(Unavailable)</a></li>-->
                        </ul>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/api"><i class="ti ti-api"></i>Swagger Portal (OpenAPI)</a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>`

document.addEventListener("DOMContentLoaded", function(){
    document.querySelector(".container-fluid").insertAdjacentHTML('afterbegin',NavbarHTML)
})
window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const dependency of ['chrome', 'node', 'electron']) {
        replaceText(`${dependency}-version`, process.versions[dependency])
    }
})

const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld(
    "electron",
    {
        send: ipcRenderer.send,
        on: (channel, callback) => {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    }
);

window.addEventListener('resize', () => {
    const dimensions = {
        width: window.innerWidth,
        height: window.innerHeight
    };
    ipcRenderer.send('window-resize', dimensions);
});
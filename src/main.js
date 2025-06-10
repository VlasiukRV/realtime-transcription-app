const $serverSelection = $("#server-selection");
const $translationApp = $("#translation-app");

async function checkHttpConnection(host, port = 80) {
    const url = `http://${host}:${port}/`;

    try {

        const response = await fetch(url, {method: 'GET'});
        if (response.ok) {

            $("#statusMessage").text(`✅ Connection to ${url} was successful. Status: ${response.status}`);
            return true;

        } else {

            $("#statusMessage").text(`⚠️ Server responded with an error. Status: ${response.status}`);
            return false;

        }

    } catch (error) {

        $("#statusMessage").text(`❌ Failed to connect to ${url}: (${error.message})`);
        return false;

    }
}

async function makeHttpConnection(host, port = 80) {

    $("#statusMessage").text(`Connecting http://${host}:${port}/ ...`);

    if (await checkHttpConnection(host, port)) {

        localStorage.setItem("selectedServer", host);
        window.location.href = `http://${host}:${port}/`;
        $("#statusMessage").text(`Connected`);

    }

}

// On load: if server is already selected, go directly to app
$(document).ready(async () => {

    const server_url = localStorage.getItem("selectedServer");

    await makeHttpConnection(server_url, 8000);

    // Handle server selection and show translation UI
    $("#connect-btn").on("click", async () => {
        const server_url = $('#server-selector').val();

        await makeHttpConnection(server_url, 8000);

    });

});

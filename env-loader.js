// Loads environment variables from .env file and attaches them to window
(function () {
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '.env', false); // synchronous request to ensure variables are available
        xhr.send(null);
        if (xhr.status === 200) {
            xhr.responseText.split('\n').forEach(function (line) {
                var match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
                if (match) {
                    var key = match[1];
                    var value = match[2].replace(/^['"]|['"]$/g, '');
                    window[key] = value;
                }
            });
        }
    } catch (err) {
        console.warn('Could not load .env file', err);
    }
})();

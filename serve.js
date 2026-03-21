const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4173;
const API_URL = process.env.VITE_API_URL || 'https://workspaceapi-server-production-0e92.up.railway.app';
const DIST = path.join(__dirname, 'artifacts/flychat/dist/public');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  // Proxy /api/* requests to the API server
  if (req.url.startsWith('/api/')) {
    const apiUrl = new URL(req.url, API_URL);
    const options = {
      hostname: apiUrl.hostname,
      port: 443,
      path: apiUrl.pathname + apiUrl.search,
      method: req.method,
      headers: { ...req.headers, host: apiUrl.hostname },
    };

    const proxy = https.request(options, (apiRes) => {
      res.writeHead(apiRes.statusCode, apiRes.headers);
      apiRes.pipe(res);
    });

    proxy.on('error', (err) => {
      res.writeHead(502);
      res.end('API proxy error: ' + err.message);
    });

    req.pipe(proxy);
    return;
  }

  // Serve static files
  let urlPath = req.url.split('?')[0];
  let filePath = path.join(DIST, urlPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`FlyChat serving on port ${PORT}, proxying /api/* to ${API_URL}`);
});
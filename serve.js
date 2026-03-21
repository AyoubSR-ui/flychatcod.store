const handler = require('serve-handler');
const http = require('http');
const path = require('path');

const server = http.createServer((req, res) => {
  return handler(req, res, {
    public: path.join(__dirname, 'artifacts/flychat/dist'),
    rewrites: [{ source: '**', destination: '/index.html' }]
  });
});

server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log(`Running on port ${process.env.PORT || 3000}`);
});

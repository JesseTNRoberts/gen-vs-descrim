// Local stand-in for GitHub Pages + the Apps Script web app, for trying the whole thing on one machine.
//   node tests/dev-server.js [port]   → http://localhost:8790/index.html, /round2.html, …
// /exec runs the real apps-script/Code.gs against in-memory fakes (tests/fake-gas.js),
// and config.js is served pointing at it. Data lives only as long as the server runs.
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const { loadCodeGs } = require('./fake-gas');

const port = Number(process.argv[2]) || 8790;
const root = path.join(__dirname, '..');
const G = loadCodeGs();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname === '/exec') {
    const send = (out) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(out)); };
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => send(JSON.parse(G.ctx.doPost({ postData: { contents: body } }).text)));
    } else {
      send(JSON.parse(G.ctx.doGet({ parameter: u.query }).text));
    }
    return;
  }
  if (u.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end("window.GVD_CONFIG = { scriptUrl: 'http://localhost:" + port + "/exec', pollSeconds: 2 };");
    return;
  }
  const file = path.join(root, path.normalize(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log('dev server on http://localhost:' + port));

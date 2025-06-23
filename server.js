const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

let userCount = 0;
let userNames = new Map();

const server = http.createServer((req, res) => {
  // Serve uploads
  if (req.url.startsWith('/uploads/')) {
    const uploadPath = path.join(__dirname, req.url);
    if (!uploadPath.startsWith(path.join(__dirname, 'uploads'))) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.stat(uploadPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404);
        return res.end('Not found');
      }
      let ext = path.extname(uploadPath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      else if (ext === '.avif') contentType = 'image/avif';
      else if (ext === '.webp') contentType = 'image/webp';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(uploadPath).pipe(res);
    });
    return;
  }

  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);

  // Prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }

    // Set correct content type
    let ext = path.extname(filePath).toLowerCase();
    let contentType = 'text/plain';
    if (ext === '.html') contentType = 'text/html';
    else if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.css') contentType = 'text/css';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.ico') contentType = 'image/x-icon';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

const wss = new WebSocket.Server({ server });

function broadcastUserList() {
  const users = Array.from(userNames.values());
  const payload = JSON.stringify({ type: 'users', users });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  userCount++;
  const userName = `User${userCount}`;
  userNames.set(ws, userName);

  console.log(`${userName} connected`);

  // Send welcome message with your name
  ws.send(JSON.stringify({ type: 'welcome', name: userName }));

  // Broadcast updated user list
  broadcastUserList();

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch {
      // fallback to plain text
      data = { type: 'chat', message: message.toString() };
    }

    switch (data.type) {
      case 'chat':
      case 'text':
        broadcast({
          type: 'chat',
          name: userNames.get(ws),
          message: data.message
        });
        break;
      case 'voice':
        broadcast({
          type: 'voice',
          name: userNames.get(ws),
          audioData: data.audioData
        });
        break;
      case 'poll':
        // Add poll id and votes
        data.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        data.name = userNames.get(ws);
        data.votes = Array(data.options.length).fill(0);
        polls[data.id] = data;
        broadcast({
          type: 'poll',
          ...data
        });
        break;
      case 'vote':
        if (polls[data.pollId]) {
          polls[data.pollId].votes[data.optionIdx]++;
          broadcast({
            type: 'vote',
            pollId: data.pollId,
            votes: polls[data.pollId].votes
          });
        }
        break;
      case 'file':
        // Save file to uploads folder
        const ext = path.extname(data.filename) || '';
        const safeName = path.basename(data.filename, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const uniqueName = `${safeName}_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
        const filePath = path.join(__dirname, 'uploads', uniqueName);
        const buffer = Buffer.from(data.fileData, 'base64');
        fs.writeFile(filePath, buffer, (err) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'File upload failed.' }));
            return;
          }
          broadcast({
            type: 'file',
            name: userNames.get(ws),
            filename: data.filename,
            fileUrl: `/uploads/${uniqueName}`,
            fileSize: `${(buffer.length / 1024).toFixed(1)} KB`,
            mimeType: data.mimeType,
            fileIcon: '📎'
          });
        });
        break;
      default:
        // fallback for plain text
        broadcast({
          type: 'chat',
          name: userNames.get(ws),
          message: message.toString()
        });
    }
  });

  ws.on('close', () => {
    console.log(`${userNames.get(ws)} disconnected`);
    userNames.delete(ws);
    broadcastUserList();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
  console.log('For LAN access, use your local IP address instead of localhost');
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

const polls = {};


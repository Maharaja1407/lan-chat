const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

let userCount = 0;
let userNames = new Map();

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error('Error loading file:', err);
      res.writeHead(404);
      return res.end('Error loading file');
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
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
    const messageText = message.toString();
    console.log(`${userNames.get(ws)}: ${messageText}`);
    
    const payload = JSON.stringify({ 
      type: 'chat', 
      name: userNames.get(ws), 
      message: messageText 
    });
    
    // Broadcast to all clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
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
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

let mediaRecorder;
let audioChunks = [];

document.getElementById('voiceBtn').addEventListener('click', function() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        this.textContent = "🎤";
        this.title = "Record Voice";
    } else {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => {
                audioChunks.push(e.data);
            };
            mediaRecorder.onstop = e => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onload = function(evt) {
                    ws.send(JSON.stringify({
                        type: 'voice',
                        audioData: evt.target.result // base64
                    }));
                };
                reader.readAsDataURL(audioBlob);
            };
            mediaRecorder.start();
            document.getElementById('voiceBtn').textContent = "⏹️";
            document.getElementById('voiceBtn').title = "Stop Recording";
        }).catch(err => {
            showError("Microphone access denied.");
        });
    }
});

function addChatMessage(name, message, isOwn = false) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    const time = new Date().toLocaleTimeString();
    messageDiv.innerHTML = `
        <div class="message-header">${name} - ${time}</div>
        <div class="message-body">${message}</div>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addVoiceMessage(name, audioData, isOwn = false) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    const time = new Date().toLocaleTimeString();
    messageDiv.innerHTML = `
        <div class="message-header">${name} - ${time}</div>
        <audio controls src="${audioData}" style="width: 100%;"></audio>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addPollMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message other';
    const time = new Date().toLocaleTimeString();
    let pollHtml = `<div class="message-header">${data.name} - ${time}</div>
        <div class="message-content"><b>${escapeHtml(data.question)}</b></div>
        <div>`;
    data.options.forEach((opt, idx) => {
        pollHtml += `<button onclick="votePoll('${data.id}', ${idx})">${escapeHtml(opt)} (<span id="poll-${data.id}-${idx}">0</span>)</button> `;
    });
    pollHtml += `</div>`;
    messageDiv.innerHTML = pollHtml;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function votePoll(pollId, optionIdx) {
    ws.send(JSON.stringify({
        type: 'vote',
        pollId: pollId,
        optionIdx: optionIdx
    }));
}

function updatePollVotes(data) {
    data.votes.forEach((count, idx) => {
        const span = document.getElementById(`poll-${data.pollId}-${idx}`);
        if (span) span.textContent = count;
    });
}

switch (data.type) {
  case 'chat':
    addChatMessage(data.name, data.message, data.name === currentUser);
    break;
  case 'voice':
    addVoiceMessage(data.name, data.audioData, data.name === currentUser);
    break;
  case 'poll':
    addPollMessage(data);
    break;
  case 'vote':
    updatePollVotes(data);
    break;
}

document.getElementById('pollBtn').addEventListener('click', function() {
    const question = prompt("Enter poll question:");
    if (!question) return;
    const options = prompt("Enter poll options separated by commas:");
    if (!options) return;
    ws.send(JSON.stringify({
        type: 'poll',
        question: question,
        options: options.split(',').map(o => o.trim())
    }));
});
let mediaRecorder;
let audioChunks = [];
let ws;
let currentUser = '';

function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = function() {
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').style.color = '#28a745';
    };

    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'welcome':
                currentUser = data.name;
                document.getElementById('status').textContent = `Connected as ${currentUser}`;
                break;
            case 'users':
                updateUserList(data.users);
                break;
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
            case 'error':
                showError(data.message);
                break;
            case 'file':
                addFileMessage(data);
                break;
        }
    };

    ws.onclose = function() {
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('status').style.color = '#dc3545';
        setTimeout(connect, 3000);
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
        document.getElementById('status').textContent = 'Connection Error';
        document.getElementById('status').style.color = '#dc3545';
    };
}

function updateUserList(users) {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.textContent = user;
        if (user === currentUser) {
            userDiv.style.background = 'rgba(255, 255, 255, 0.2)';
        }
        userList.appendChild(userDiv);
    });
}

function addChatMessage(name, message, isOwn = false) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    const time = new Date().toLocaleTimeString();
    messageDiv.innerHTML = `
        <div class="message-header">${name} - ${time}</div>
        <div class="message-content">${escapeHtml(message)}</div>
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

function showError(message) {
    const messagesDiv = document.getElementById('messages');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'upload-progress';
    errorDiv.style.background = '#f8d7da';
    errorDiv.style.borderColor = '#f5c6cb';
    errorDiv.textContent = `Error: ${message}`;
    messagesDiv.appendChild(errorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Voice button event
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

function addFileMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.name === currentUser ? 'own' : 'other'}`;
    const time = new Date().toLocaleTimeString();
    let previewHtml = '';

    // Preview if mimeType is image/* or filename ends with image extension
    const isImage = (data.mimeType && data.mimeType.startsWith('image/')) ||
        /\.(png|jpe?g|gif|svg|avif|webp)$/i.test(data.filename);

    if (isImage) {
        previewHtml = `
            <div class="file-preview">
                <img src="${data.fileUrl}" alt="${data.filename}" style="max-width: 200px; max-height: 200px;" onclick="window.open('${data.fileUrl}', '_blank')">
            </div>
        `;
    }

    messageDiv.innerHTML = `
        <div class="message-header">${data.name} - ${time}</div>
        <div class="file-message">
            <div class="file-info">
                <span class="file-icon">📎</span>
                <div class="file-details">
                    <div class="file-name">${escapeHtml(data.filename)}</div>
                    <div class="file-size">${data.fileSize}</div>
                </div>
                <a href="${data.fileUrl}" download="${data.filename}" class="download-btn">Download</a>
            </div>
            ${previewHtml}
        </div>
    `;

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendFile(file) {
    if (!file || ws.readyState !== WebSocket.OPEN) return;

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showError('File size must be less than 10MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const fileData = e.target.result.split(',')[1]; // Remove data URL prefix

        ws.send(JSON.stringify({
            type: 'file',
            filename: file.name,
            fileData: fileData,
            mimeType: file.type
        }));
    };

    reader.readAsDataURL(file);
}

// Add event listeners for file input and button
document.getElementById('fileBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        sendFile(file);
    });
    e.target.value = ''; // Reset input
});

// Drag and drop support
const chatContainer = document.querySelector('.chat-container');
chatContainer.addEventListener('dragover', function(e) {
    e.preventDefault();
    chatContainer.style.border = '3px dashed #007bff';
});
chatContainer.addEventListener('dragleave', function(e) {
    e.preventDefault();
    chatContainer.style.border = 'none';
});
chatContainer.addEventListener('drop', function(e) {
    e.preventDefault();
    chatContainer.style.border = 'none';
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
        sendFile(file);
    });
});

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    if (message && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'text',
            message: message
        }));
        messageInput.value = '';
    }
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);

document.getElementById('messageInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Connect on page load
connect();
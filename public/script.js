let mediaRecorder;
let audioChunks = [];
let ws;
let currentUser = '';
let typingTimeout;

// Initialize floating particles
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    const binaryChars = ['0', '1', '01', '10', '001', '110', '101', '011'];
    
    setInterval(() => {
        if (particlesContainer.children.length < 20) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.textContent = binaryChars[Math.floor(Math.random() * binaryChars.length)];
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
            particle.style.opacity = Math.random() * 0.5 + 0.2;
            particlesContainer.appendChild(particle);
            
            // Remove particle after animation
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 20000);
        }
    }, 1000);
}

function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = function() {
        const statusEl = document.getElementById('status');
        statusEl.textContent = 'Connected to Grid';
        statusEl.className = 'status connected';
    };

    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'welcome':
                currentUser = data.name;
                document.getElementById('status').textContent = `Node: ${currentUser}`;
                break;
            case 'users':
                updateUserList(data.users);
                break;
            case 'chat':
                showTypingIndicator();
                setTimeout(() => {
                    hideTypingIndicator();
                    addChatMessage(data.name, data.message, data.name === currentUser);
                }, 1000);
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
        const statusEl = document.getElementById('status');
        statusEl.textContent = 'Connection Lost';
        statusEl.className = 'status disconnected';
        setTimeout(connect, 3000);
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
        const statusEl = document.getElementById('status');
        statusEl.textContent = 'Grid Error';
        statusEl.className = 'status disconnected';
    };
}

function showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    indicator.classList.add('active');
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    indicator.classList.remove('active');
}

function updateUserList(users) {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        if (user === currentUser) {
            userDiv.classList.add('current-user');
        }
        userDiv.innerHTML = `<span>${user}</span>`;
        userList.appendChild(userDiv);
    });
}

function addChatMessage(name, message, isOwn = false) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    const time = new Date().toLocaleTimeString();
    messageDiv.innerHTML = `
        <div class="message-header">${name} • ${time}</div>
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
        <div class="message-header">${name} • ${time}</div>
        <audio controls src="${audioData}" style="width: 100%; filter: hue-rotate(180deg);"></audio>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addPollMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message other';
    const time = new Date().toLocaleTimeString();
    let pollHtml = `<div class="message-header">${data.name} • ${time}</div>
        <div class="message-content"><strong>${escapeHtml(data.question)}</strong></div>
        <div style="margin-top: 15px; display: flex; flex-wrap: wrap; gap: 10px;">`;
    data.options.forEach((opt, idx) => {
        pollHtml += `<button onclick="votePoll('${data.id}', ${idx})" 
            style="background: var(--glass-bg); border: 1px solid var(--glass-border); 
            color: var(--text-primary); padding: 8px 16px; border-radius: 20px; 
            cursor: pointer; transition: all 0.3s ease; font-family: inherit;"
            onmouseover="this.style.background='rgba(0,212,255,0.2)'; this.style.borderColor='var(--neon-blue)'"
            onmouseout="this.style.background='var(--glass-bg)'; this.style.borderColor='var(--glass-border)'"
            >${escapeHtml(opt)} (<span id="poll-${data.id}-${idx}">0</span>)</button>`;
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
    errorDiv.className = 'error-message';
    errorDiv.textContent = `System Error: ${message}`;
    messagesDiv.appendChild(errorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Voice recording functionality
document.getElementById('voiceBtn').addEventListener('click', function() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        this.textContent = "🎤";
        this.title = "Record Voice";
        this.style.background = "linear-gradient(45deg, #ffc107, #fd7e14)";
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
                        audioData: evt.target.result
                    }));
                };
                reader.readAsDataURL(audioBlob);
            };
            mediaRecorder.start();
            this.textContent = "⏹️";
            this.title = "Stop Recording";
            this.style.background = "linear-gradient(45deg, #dc3545, #fd7e14)";
        }).catch(err => {
            showError("Microphone access denied.");
        });
    }
});

// Poll creation
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

    const isImage = (data.mimeType && data.mimeType.startsWith('image/')) ||
        /\.(png|jpe?g|gif|svg|avif|webp)$/i.test(data.filename);

    if (isImage) {
        previewHtml = `
            <div class="file-preview">
                <img src="${data.fileUrl}" alt="${data.filename}" onclick="window.open('${data.fileUrl}', '_blank')">
            </div>
        `;
    }

    messageDiv.innerHTML = `
        <div class="message-header">${data.name} • ${time}</div>
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

    if (file.size > 10 * 1024 * 1024) {
        showError('File size must be less than 10MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const fileData = e.target.result.split(',')[1];

        ws.send(JSON.stringify({
            type: 'file',
            filename: file.name,
            fileData: fileData,
            mimeType: file.type
        }));
    };

    reader.readAsDataURL(file);
}

// File upload events
document.getElementById('fileBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        sendFile(file);
    });
    e.target.value = '';
});

// Drag and drop support
const chatContainer = document.querySelector('.chat-container');
chatContainer.addEventListener('dragover', function(e) {
    e.preventDefault();
    chatContainer.style.boxShadow = '0 0 50px rgba(0, 212, 255, 0.5), inset 0 0 50px rgba(0, 212, 255, 0.1)';
});

chatContainer.addEventListener('dragleave', function(e) {
    e.preventDefault();
    chatContainer.style.boxShadow = '0 0 50px rgba(0, 212, 255, 0.2), inset 0 0 50px rgba(0, 212, 255, 0.05)';
});

chatContainer.addEventListener('drop', function(e) {
    e.preventDefault();
    chatContainer.style.boxShadow = '0 0 50px rgba(0, 212, 255, 0.2), inset 0 0 50px rgba(0, 212, 255, 0.05)';
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

// Input events
document.getElementById('sendBtn').addEventListener('click', sendMessage);

document.getElementById('messageInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Add input glow effect
document.getElementById('messageInput').addEventListener('focus', function() {
    this.parentElement.style.background = 'rgba(0, 212, 255, 0.05)';
});

document.getElementById('messageInput').addEventListener('blur', function() {
    this.parentElement.style.background = 'rgba(0, 0, 0, 0.8)';
});

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    createParticles();
    connect();
});
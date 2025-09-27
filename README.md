git remote add origin https://github.com/vijaybalaji516/realtime-collab-editor.git
git branch -M main
git push -u origin main
#Index.html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Realtime Collaborative Editor</title>
    <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
      #toolbar { background: #f3f3f3; padding: 8px; }
      #editor { height: calc(100vh - 80px); }
      #topbar { display:flex; gap:8px; align-items:center; padding:8px; }
      #status { margin-left:auto; font-size:0.9rem; color:#555 }
    </style>
  </head>
  <body>
    <div id="topbar">
      <div>
        Doc ID: <input id="docId" value="default" />
        <button id="joinBtn">Join</button>
        <button id="saveBtn">Save</button>
      </div>
      <div id="status">Not connected</div>
    </div>

    <div id="toolbar">
      <span class="ql-formats">
        <select class="ql-header"></select>
        <button class="ql-bold"></button>
        <button class="ql-italic"></button>
        <button class="ql-underline"></button>
      </span>
      <span class="ql-formats">
        <button class="ql-list" value="ordered"></button>
        <button class="ql-list" value="bullet"></button>
      </span>
    </div>

    <div id="editor"></div>

    <script src="/socket.io/socket.io.js"></script>
    <script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>
    <script src="client.js"></script>
  </body>
</html>
#server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const documents = {};

const PERSIST_FILE = path.join(__dirname, 'docs.json');
if (fs.existsSync(PERSIST_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
    Object.assign(documents, data);
    console.log('Loaded persisted documents');
  } catch (err) {
    console.warn('Failed to load persisted docs:', err.message);
  }
}

setInterval(() => {
  try {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(documents, null, 2));
  } catch (err) {
    console.error('Error while persisting docs:', err);
  }
}, 10000);

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  socket.on('join-doc', (docId) => {
    if (!docId || typeof docId !== 'string') return;
    socket.join(docId);
    console.log(`Socket ${socket.id} joined doc ${docId}`);

    if (!documents[docId]) {
      documents[docId] = { delta: { ops: [{ insert: "\n" }] }, savedAt: Date.now() };
    }

    socket.emit('load-doc', documents[docId].delta);
  });

  socket.on('send-changes', ({ docId, delta }) => {
    if (!docId || !documents[docId]) return;
    socket.to(docId).emit('receive-changes', delta);
    try {
      const existing = documents[docId].delta;
      existing.ops = existing.ops.concat(delta.ops || []);
      documents[docId].savedAt = Date.now();
    } catch (err) {
      console.error('Failed to apply delta:', err);
    }
  });

  socket.on('save-doc', ({ docId, delta }) => {
    if (!docId) return;
    documents[docId] = { delta: delta || { ops: [{ insert: "\n" }] }, savedAt: Date.now() };
    console.log(`Document ${docId} saved by ${socket.id}`);
    socket.emit('saved', { ok: true, docId, savedAt: documents[docId].savedAt });
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
#client.js
const socket = io();


const statusEl = document.getElementById('status');
const docIdInput = document.getElementById('docId');
const joinBtn = document.getElementById('joinBtn');
const saveBtn = document.getElementById('saveBtn');


let quill;
let currentDocId = null;
let applyingRemote = false;


function setStatus(text) {
statusEl.textContent = text;
}


function initEditor() {
quill = new Quill('#editor', {
theme: 'snow',
modules: {
toolbar: '#toolbar'
}
});


quill.on('text-change', (delta, oldDelta, source) => {
if (source !== 'user' || applyingRemote) return;
if (!currentDocId) return;
socket.emit('send-changes', { docId: currentDocId, delta });
});
}


joinBtn.addEventListener('click', () => {
const id = docIdInput.value.trim() || 'default';
currentDocId = id;
socket.emit('join-doc', id);
setStatus(`Joined ${id} — waiting for content...`);
});


saveBtn.addEventListener('click', () => {
if (!currentDocId) return alert('Join a doc first');
const delta = quill.getContents();
socket.emit('save-doc', { docId: currentDocId, delta });
});


socket.on('connect', () => setStatus('Connected'));
socket.on('disconnect', () => setStatus('Disconnected'));


socket.on('load-doc', (delta) => {
if (!quill) initEditor();
applyingRemote = true;
quill.setContents(delta);
applyingRemote = false;
setStatus(`Editing: ${currentDocId}`);
});


socket.on('receive-changes', (delta) => {
if (!quill) return;
applyingRemote = true;
quill.updateContents(delta);
applyingRemote = false;
});


socket.on('saved', ({ ok, docId, savedAt }) => {
if (ok) setStatus(`Saved ${docId} at ${new Date(savedAt).toLocaleTimeString()}`);
});


initEditor();
#package.json
{
"name": "realtime-collab-editor",
"version": "1.0.0",
"description": "Simple real-time collaborative editor using Socket.io and Quill",
"main": "server.js",
"scripts": {
"start": "node server.js"
},
"dependencies": {
"express": "^4.18.2",
"socket.io": "^4.8.1"
}
}

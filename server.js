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

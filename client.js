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

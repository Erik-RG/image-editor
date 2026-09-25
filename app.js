const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const fileInput = $('file');
const empty = $('empty');
const status = $('status');
const viewButton = $('view');
const exportButton = $('export');

const controls = ['brightness','contrast','saturation','grayscale','sepia','hue','size','color'].reduce((result, id) => { result[id] = $(id); return result; }, {});
const outputs = ['brightness','contrast','saturation','grayscale','sepia','hue','size'].reduce((result, id) => { result[id] = $(`${id}Out`); return result; }, {});

let image = null;
let baseCanvas = document.createElement('canvas');
let baseCtx = baseCanvas.getContext('2d');
let strokes = [];
let texts = [];
let zoom = 1;
let drawing = false;
let tool = 'select';

function updateLabels() {
  outputs.brightness.textContent = `${controls.brightness.value}%`;
  outputs.contrast.textContent = `${controls.contrast.value}%`;
  outputs.saturation.textContent = `${controls.saturation.value}%`;
  outputs.grayscale.textContent = `${controls.grayscale.value}%`;
  outputs.sepia.textContent = `${controls.sepia.value}%`;
  outputs.hue.textContent = `${controls.hue.value}°`;
  outputs.size.textContent = `${controls.size.value}px`;
}

function updateZoom() { $('zoomOutLabel').textContent = `${Math.round(zoom * 100)}%`; }
function filterString() { return `brightness(${controls.brightness.value}%) contrast(${controls.contrast.value}%) saturate(${controls.saturation.value}%) grayscale(${controls.grayscale.value}%) sepia(${controls.sepia.value}%) hue-rotate(${controls.hue.value}deg)`; }
function setLoaded(loaded) { empty.hidden = loaded; canvas.style.visibility = loaded ? 'visible' : 'hidden'; viewButton.disabled = !loaded; exportButton.disabled = !loaded; }

function fitImage() {
  if (!image) return;
  zoom = Math.min(1, Math.max(120, stage.clientWidth - 48) / baseCanvas.width, Math.max(120, stage.clientHeight - 48) / baseCanvas.height);
  zoom = Number(zoom.toFixed(3));
  updateZoom();
}

function render() {
  if (!image) { ctx.clearRect(0, 0, canvas.width, canvas.height); setLoaded(false); return; }

  const filtered = document.createElement('canvas');
  filtered.width = baseCanvas.width;
  filtered.height = baseCanvas.height;
  const filteredCtx = filtered.getContext('2d');
  filteredCtx.filter = filterString();
  filteredCtx.drawImage(baseCanvas, 0, 0);

  canvas.width = filtered.width;
  canvas.height = filtered.height;
  canvas.style.width = `${Math.max(1, canvas.width * zoom)}px`;
  canvas.style.height = `${Math.max(1, canvas.height * zoom)}px`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(filtered, 0, 0);

  strokes.forEach((stroke) => {
    if (!stroke.points.length) return;
    ctx.save(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    stroke.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke(); ctx.restore();
  });
  texts.forEach((item) => { ctx.save(); ctx.fillStyle = item.color; ctx.font = '32px system-ui'; ctx.fillText(item.text, item.x, item.y); ctx.restore(); });
  setLoaded(true);
}

function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) { status.textContent = 'Please choose a valid image file.'; return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  status.textContent = 'Loading image…';
  img.onload = () => { image = img; baseCanvas.width = img.naturalWidth; baseCanvas.height = img.naturalHeight; baseCtx.drawImage(img, 0, 0); strokes = []; texts = []; fitImage(); status.textContent = `Loaded: ${file.name}`; render(); URL.revokeObjectURL(url); };
  img.onerror = () => { status.textContent = 'The image could not be loaded.'; URL.revokeObjectURL(url); };
  img.src = url;
}

function downloadPng() {
  if (!image) return;
  canvas.toBlob((blob) => {
    if (!blob) { status.textContent = 'Could not create the PNG.'; return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pixelforge-edited.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'PNG download started';
  }, 'image/png');
}

$('open').onclick = () => fileInput.click();
fileInput.onchange = (event) => { loadImage(event.target.files && event.target.files[0]); event.target.value = ''; };
stage.ondragover = (event) => { event.preventDefault(); stage.classList.add('dragging'); };
stage.ondragleave = () => stage.classList.remove('dragging');
stage.ondrop = (event) => { event.preventDefault(); stage.classList.remove('dragging'); loadImage(event.dataTransfer && event.dataTransfer.files[0]); };
Object.keys(controls).forEach((key) => controls[key].oninput = () => { updateLabels(); render(); });
document.querySelectorAll('.tool').forEach((button) => button.onclick = () => { tool = button.dataset.tool; document.querySelectorAll('.tool').forEach((item) => item.classList.toggle('active', item === button)); });
function point(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; }
canvas.onpointerdown = (event) => { if (!image) return; const p = point(event); if (tool === 'brush') { drawing = true; canvas.setPointerCapture?.(event.pointerId); strokes.push({ color: controls.color.value, size: Number(controls.size.value), points: [p] }); render(); } else if (tool === 'text') { const text = prompt('Add text:', 'Your text'); if (text) { texts.push({ text, x: p.x, y: p.y, color: controls.color.value }); render(); } } };
canvas.onpointermove = (event) => { if (drawing) { strokes[strokes.length - 1].points.push(point(event)); render(); } };
canvas.onpointerup = () => { drawing = false; };
canvas.onpointercancel = () => { drawing = false; };
canvas.ondblclick = () => { if (image) { zoom = zoom === 1 ? 2 : 1; updateZoom(); render(); } };
$('zoomIn').onclick = () => { zoom = Math.min(4, +(zoom + .25).toFixed(2)); updateZoom(); render(); };
$('zoomOut').onclick = () => { zoom = Math.max(.25, +(zoom - .25).toFixed(2)); updateZoom(); render(); };
$('fit').onclick = () => { fitImage(); render(); };
$('reset').onclick = () => { ['brightness','contrast','saturation'].forEach((key) => controls[key].value = 100); ['grayscale','sepia','hue'].forEach((key) => controls[key].value = 0); controls.size.value = 12; controls.color.value = '#ff5d73'; strokes = []; texts = []; if (image) fitImage(); updateLabels(); render(); };
viewButton.onclick = () => { if (image) window.open(canvas.toDataURL('image/png'), '_blank', 'noopener,noreferrer'); };
exportButton.onclick = downloadPng;
window.onresize = () => { if (image && zoom < 1) { fitImage(); render(); } };
updateLabels(); updateZoom(); setLoaded(false); render();

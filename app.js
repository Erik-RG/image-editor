const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const empty = $('empty');
const status = $('status');
const fileInput = $('file');
const controls = ['brightness','contrast','saturation','grayscale','sepia','hue','size','color'].reduce((o, id) => (o[id] = $(id), o), {});
const outputs = ['brightness','contrast','saturation','grayscale','sepia','hue','size'].reduce((o, id) => (o[id] = $(`${id}Out`), o), {});
let image = null;
let zoom = 1;
let tool = 'select';
let drawing = false;
let strokes = [];
let texts = [];

function setEmpty(visible) {
  empty.hidden = visible;
  empty.style.display = visible ? 'grid' : 'none';
  canvas.style.visibility = visible ? 'hidden' : 'visible';
}
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
function getFilter() { return `brightness(${controls.brightness.value}%) contrast(${controls.contrast.value}%) saturate(${controls.saturation.value}%) grayscale(${controls.grayscale.value}%) sepia(${controls.sepia.value}%) hue-rotate(${controls.hue.value}deg)`; }
function fitImage() { if (!image) return; const w = Math.max(120, stage.clientWidth - 48); const h = Math.max(120, stage.clientHeight - 48); zoom = Math.min(1, w / canvas.width, h / canvas.height); updateZoom(); }
function render() {
  if (!image) { ctx.clearRect(0, 0, canvas.width, canvas.height); setEmpty(true); return; }
  setEmpty(false);
  canvas.style.width = `${Math.max(1, canvas.width * zoom)}px`;
  canvas.style.height = `${Math.max(1, canvas.height * zoom)}px`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.filter = getFilter(); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); ctx.restore();
  strokes.forEach((s) => { ctx.save(); ctx.strokeStyle = s.color; ctx.lineWidth = s.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); s.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); ctx.restore(); });
  texts.forEach((t) => { ctx.fillStyle = t.color; ctx.font = '32px system-ui'; ctx.fillText(t.text, t.x, t.y); });
}
function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) { status.textContent = 'Please choose a valid image file.'; return; }
  const url = URL.createObjectURL(file); const img = new Image(); status.textContent = 'Loading image…';
  img.onload = () => { image = img; canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; strokes = []; texts = []; fitImage(); status.textContent = `Loaded: ${file.name}`; render(); URL.revokeObjectURL(url); };
  img.onerror = () => { status.textContent = 'The image could not be loaded.'; URL.revokeObjectURL(url); };
  img.src = url;
}
$('open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { loadImage(e.target.files && e.target.files[0]); e.target.value = ''; });
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragging'); });
stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('dragging'); loadImage(e.dataTransfer && e.dataTransfer.files[0]); });
Object.keys(controls).forEach((key) => controls[key].addEventListener('input', () => { updateLabels(); render(); }));
document.querySelectorAll('.tool').forEach((button) => button.addEventListener('click', () => { tool = button.dataset.tool; document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b === button)); }));
function point(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
canvas.addEventListener('pointerdown', (e) => { if (!image) return; if (tool === 'brush') { drawing = true; canvas.setPointerCapture(e.pointerId); strokes.push({ color: controls.color.value, size: Number(controls.size.value), points: [point(e)] }); render(); } else if (tool === 'text') { const text = prompt('Add text:', 'Your text'); if (text) { texts.push({ text, x: point(e).x, y: point(e).y, color: controls.color.value }); render(); } } });
canvas.addEventListener('pointermove', (e) => { if (drawing) { strokes.at(-1).points.push(point(e)); render(); } });
canvas.addEventListener('pointerup', () => { drawing = false; });
canvas.addEventListener('pointercancel', () => { drawing = false; });
$('zoomIn').addEventListener('click', () => { zoom = Math.min(4, +(zoom + .25).toFixed(2)); updateZoom(); render(); });
$('zoomOut').addEventListener('click', () => { zoom = Math.max(.25, +(zoom - .25).toFixed(2)); updateZoom(); render(); });
$('fit').addEventListener('click', () => { fitImage(); render(); });
window.addEventListener('resize', () => { if (image && zoom < 1) { fitImage(); render(); } });
canvas.addEventListener('dblclick', () => { if (image) { zoom = zoom === 1 ? 2 : 1; updateZoom(); render(); } });
$('reset').addEventListener('click', () => { ['brightness','contrast','saturation'].forEach((k) => controls[k].value = 100); ['grayscale','sepia','hue'].forEach((k) => controls[k].value = 0); controls.size.value = 12; controls.color.value = '#ff5d73'; strokes = []; texts = []; if (image) fitImage(); updateLabels(); render(); });
$('export').addEventListener('click', () => { if (!image) return; const a = document.createElement('a'); a.download = 'edited-image.png'; a.href = canvas.toDataURL('image/png'); a.click(); });
updateLabels(); updateZoom(); render();

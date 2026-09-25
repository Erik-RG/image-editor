const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const fileInput = document.getElementById('file');
const openBtn = document.getElementById('open');
const exportBtn = document.getElementById('export');
const resetBtn = document.getElementById('reset');
const empty = document.getElementById('empty');
const status = document.getElementById('status');
const zoomLabel = document.getElementById('zoomOutLabel');

const controls = {
  brightness: document.getElementById('brightness'),
  contrast: document.getElementById('contrast'),
  saturation: document.getElementById('saturation'),
  grayscale: document.getElementById('grayscale'),
  sepia: document.getElementById('sepia'),
  hue: document.getElementById('hue'),
  size: document.getElementById('size'),
  color: document.getElementById('color')
};

const outputs = {
  brightness: document.getElementById('brightnessOut'),
  contrast: document.getElementById('contrastOut'),
  saturation: document.getElementById('saturationOut'),
  grayscale: document.getElementById('grayscaleOut'),
  sepia: document.getElementById('sepiaOut'),
  hue: document.getElementById('hueOut'),
  size: document.getElementById('sizeOut')
};

let image = null;
let strokes = [];
let texts = [];
let drawing = false;
let zoom = 1;
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

function updateZoom() {
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function getFilterString() {
  return `brightness(${controls.brightness.value}%) contrast(${controls.contrast.value}%) saturate(${controls.saturation.value}%) grayscale(${controls.grayscale.value}%) sepia(${controls.sepia.value}%) hue-rotate(${controls.hue.value}deg)`;
}

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!image) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  const w = canvas.width;
  const h = canvas.height;
  canvas.style.width = `${w * zoom}px`;
  canvas.style.height = `${h * zoom}px`;

  ctx.save();
  ctx.filter = getFilterString();
  ctx.drawImage(image, 0, 0, w, h);
  ctx.restore();

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;

    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    stroke.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });

    ctx.stroke();
    ctx.restore();
  }

  for (const item of texts) {
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.font = '32px system-ui';
    ctx.fillText(item.text, item.x, item.y);
    ctx.restore();
  }
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

function setImageFromFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    status.textContent = 'Please choose a valid image file.';
    return;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    image = img;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    strokes = [];
    texts = [];
    zoom = 1;
    updateZoom();
    status.textContent = `Loaded: ${file.name}`;
    renderCanvas();
    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    status.textContent = 'The image could not be loaded.';
    URL.revokeObjectURL(url);
  };

  img.src = url;
}

function resetEditor() {
  controls.brightness.value = 100;
  controls.contrast.value = 100;
  controls.saturation.value = 100;
  controls.grayscale.value = 0;
  controls.sepia.value = 0;
  controls.hue.value = 0;
  controls.size.value = 12;
  controls.color.value = '#ff5d73';
  strokes = [];
  texts = [];
  zoom = 1;
  updateLabels();
  updateZoom();
  renderCanvas();
}

openBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  setImageFromFile(file);
  fileInput.value = '';
});

stage.addEventListener('dragover', (event) => {
  event.preventDefault();
  stage.classList.add('dragging');
});

stage.addEventListener('dragleave', () => {
  stage.classList.remove('dragging');
});

stage.addEventListener('drop', (event) => {
  event.preventDefault();
  stage.classList.remove('dragging');
  const file = event.dataTransfer && event.dataTransfer.files[0];
  setImageFromFile(file);
});

Object.keys(controls).forEach((key) => {
  controls[key].addEventListener('input', () => {
    updateLabels();
    renderCanvas();
  });
});

canvas.addEventListener('pointerdown', (event) => {
  if (!image) return;

  const point = getPoint(event);

  if (tool === 'brush') {
    drawing = true;
    strokes.push({
      color: controls.color.value,
      size: Number(controls.size.value),
      points: [point]
    });
    renderCanvas();
    return;
  }

  if (tool === 'text') {
    const text = window.prompt('Add text:', 'Your text');
    if (!text) return;

    texts.push({
      text,
      x: point.x,
      y: point.y,
      color: controls.color.value
    });
    renderCanvas();
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (!drawing || !image) return;

  const point = getPoint(event);
  const lastStroke = strokes[strokes.length - 1];
  if (lastStroke) {
    lastStroke.points.push(point);
    renderCanvas();
  }
});

canvas.addEventListener('pointerup', () => {
  drawing = false;
});

canvas.addEventListener('pointerleave', () => {
  drawing = false;
});

canvas.addEventListener('dblclick', (event) => {
  event.preventDefault();
  if (!image) return;

  zoom = zoom === 1 ? 2 : 1;
  updateZoom();
  renderCanvas();
});

document.querySelectorAll('.tool').forEach((button) => {
  button.addEventListener('click', () => {
    tool = button.dataset.tool;
    document.querySelectorAll('.tool').forEach((node) => {
      node.classList.toggle('active', node === button);
    });
  });
});

document.getElementById('zoomIn').addEventListener('click', () => {
  zoom = Math.min(4, Number((zoom + 0.25).toFixed(2)));
  updateZoom();
  renderCanvas();
});

document.getElementById('zoomOut').addEventListener('click', () => {
  zoom = Math.max(0.25, Number((zoom - 0.25).toFixed(2)));
  updateZoom();
  renderCanvas();
});

document.getElementById('fit').addEventListener('click', () => {
  if (!image) return;

  const maxWidth = stage.clientWidth - 40;
  const maxHeight = stage.clientHeight - 40;
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height, 1);
  zoom = Number(scale.toFixed(2));
  updateZoom();
  renderCanvas();
});

exportBtn.addEventListener('click', () => {
  if (!image) return;

  const link = document.createElement('a');
  link.download = 'edited-image.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

resetBtn.addEventListener('click', resetEditor);

updateLabels();
updateZoom();
renderCanvas();

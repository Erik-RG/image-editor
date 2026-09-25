const $ = (id) => document.getElementById(id);

const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const empty = $('empty');
const fileInput = $('file');
const status = $('status');
const viewButton = $('view');
const exportButton = $('export');
const sizeInput = $('size');
const strengthInput = $('strength');
const sizeOutput = $('sizeOut');
const strengthOutput = $('strengthOut');
const layerList = $('layersList');
const zoomLabel = $('zoomLabel');
const optionButtons = [...document.querySelectorAll('.option-button')];

const filterValues = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0
};

const layers = [
  { name: 'Background', type: 'image', visible: true, active: false },
  { name: 'Filter layer', type: 'filter', visible: true, active: true }
];

let source = null;
let zoom = 1;
let mode = 'whole';
let drawing = false;
let strokePoints = [];
let layerNumber = 1;

function setStatus(message) {
  status.textContent = message;
}

function updateLabels() {
  sizeOutput.textContent = `${sizeInput.value}px`;
  strengthOutput.textContent = `${strengthInput.value}%`;
}

function setLoaded(isLoaded) {
  empty.hidden = isLoaded;
  canvas.style.visibility = isLoaded ? 'visible' : 'hidden';
  viewButton.disabled = !isLoaded;
  exportButton.disabled = !isLoaded;
}

function updateZoomLabel() {
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function processPixels(raw) {
  const pixels = new Uint8ClampedArray(raw);
  const exposure = 2 ** (filterValues.exposure / 100);
  const brightness = filterValues.brightness;
  const contrast = filterValues.contrast;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const saturation = 1 + filterValues.saturation / 100;
  const hue = filterValues.hue * Math.PI / 180;
  const cos = Math.cos(hue);
  const sin = Math.sin(hue);

  for (let index = 0; index < pixels.length; index += 4) {
    let red = clamp(pixels[index] * exposure + brightness);
    let green = clamp(pixels[index + 1] * exposure + brightness);
    let blue = clamp(pixels[index + 2] * exposure + brightness);

    red = clamp(contrastFactor * (red - 128) + 128);
    green = clamp(contrastFactor * (green - 128) + 128);
    blue = clamp(contrastFactor * (blue - 128) + 128);

    const average = (red + green + blue) / 3;
    red = clamp(average + (red - average) * saturation);
    green = clamp(average + (green - average) * saturation);
    blue = clamp(average + (blue - average) * saturation);

    pixels[index] = clamp(red * cos + green * sin * 0.7);
    pixels[index + 1] = clamp(green * cos - red * sin * 0.7);
    pixels[index + 2] = clamp(blue * cos + (1 - Math.abs(sin)) * 25);
  }

  return pixels;
}

function drawStroke(points, color, width) {
  if (!points.length) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 0.8;
  ctx.beginPath();

  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });

  if (points.length === 1) {
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.stroke();
  }

  ctx.restore();
}

function render() {
  if (!source) {
    setLoaded(false);
    return;
  }

  const imageData = new ImageData(processPixels(source.data), source.width, source.height);

  canvas.width = source.width;
  canvas.height = source.height;
  canvas.style.width = `${source.width * zoom}px`;
  canvas.style.height = `${source.height * zoom}px`;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(imageData, 0, 0);

  if (mode === 'brush') {
    drawStroke(strokePoints, 'rgba(255, 255, 255, 0.85)', Number(sizeInput.value));
  } else if (mode === 'mask') {
    drawStroke(strokePoints, 'rgba(125, 130, 255, 0.55)', Number(sizeInput.value));
  }

  setLoaded(true);
}

function fitImage() {
  if (!source) return;
  zoom = Math.max(0.05, Math.min(1, (stage.clientWidth - 48) / source.width, (stage.clientHeight - 48) / source.height));
  updateZoomLabel();
  render();
}

function getPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height
  };
}

function loadImage(file) {
  if (!file) {
    setStatus('Please choose an image file.');
    return;
  }

  const isImage = file.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || '');
  if (!isImage) {
    setStatus('Please choose an image file.');
    return;
  }

  setStatus('Loading…');

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = image.naturalWidth;
        tempCanvas.height = image.naturalHeight;

        const tempContext = tempCanvas.getContext('2d');
        tempContext.drawImage(image, 0, 0);

        source = {
          width: tempCanvas.width,
          height: tempCanvas.height,
          data: tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data
        };

        strokePoints = [];
        fitImage();
        setStatus(`Loaded: ${file.name}`);
      } catch (error) {
        console.error(error);
        setStatus('The image could not be processed.');
      }
    };

    image.onerror = () => {
      setStatus('The image could not be loaded.');
    };

    image.src = reader.result;
  };

  reader.onerror = () => {
    setStatus('The image could not be loaded.');
  };

  reader.readAsDataURL(file);
}

function renderLayers() {
  layerList.innerHTML = layers.map((layer, index) => `
    <li class="layer-item ${layer.active ? 'active' : ''} ${layer.visible ? '' : 'hidden'}" data-index="${index}">
      <span class="layer-swatch ${layer.type === 'mask' ? 'mask' : 'filter'}"></span>
      <span class="layer-name">${layer.name}</span>
      <button class="layer-toggle" type="button" data-toggle="${index}">${layer.visible ? '◉' : '○'}</button>
    </li>
  `).join('');

  layerList.querySelectorAll('.layer-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      if (event.target.closest('.layer-toggle')) return;
      const index = Number(item.dataset.index);
      layers.forEach((layer, layerIndex) => { layer.active = layerIndex === index; });
      renderLayers();
      setStatus(`${layers[index].name} selected`);
    });
  });

  layerList.querySelectorAll('.layer-toggle').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const index = Number(button.dataset.toggle);
      layers[index].visible = !layers[index].visible;
      renderLayers();
      render();
    });
  });
}

function setMode(nextMode) {
  mode = nextMode;
  strokePoints = [];
  optionButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.target === mode);
  });

  const messages = {
    whole: 'Whole image mode: apply adjustments across the full image.',
    brush: 'Brush mode: paint with a soft round brush.',
    mask: 'Mask mode: paint a local mask.'
  };

  setStatus(messages[mode] || 'Ready');
  render();
}

$('open').onclick = () => fileInput.click();
fileInput.onchange = (event) => {
  loadImage(event.target.files?.[0]);
  event.target.value = '';
};

$('zoomIn').onclick = () => {
  zoom = Math.min(4, zoom + 0.25);
  updateZoomLabel();
  render();
};

$('zoomOut').onclick = () => {
  zoom = Math.max(0.25, zoom - 0.25);
  updateZoomLabel();
  render();
};

$('fit').onclick = fitImage;

$('reset').onclick = () => {
  Object.keys(filterValues).forEach((key) => { filterValues[key] = 0; });
  sizeInput.value = 12;
  strengthInput.value = 80;
  strokePoints = [];
  updateLabels();
  render();
};

$('addLayer').onclick = () => {
  layerNumber += 1;
  const type = layerNumber % 2 === 0 ? 'filter' : 'mask';
  layers.forEach((layer) => { layer.active = false; });
  layers.push({
    name: type === 'mask' ? `Mask ${layerNumber}` : `Filter ${layerNumber}`,
    type,
    visible: true,
    active: true
  });
  renderLayers();
  setStatus(`${layers[layers.length - 1].name} added`);
};

optionButtons.forEach((button) => {
  button.onclick = () => setMode(button.dataset.target);
});

sizeInput.oninput = () => {
  updateLabels();
  render();
};

strengthInput.oninput = () => {
  updateLabels();
  render();
};

stage.ondragover = (event) => {
  event.preventDefault();
  stage.classList.add('dragging');
};

stage.ondragleave = () => stage.classList.remove('dragging');
stage.ondrop = (event) => {
  event.preventDefault();
  stage.classList.remove('dragging');
  loadImage(event.dataTransfer?.files?.[0]);
};

canvas.onpointerdown = (event) => {
  if (!source || mode === 'whole') return;
  drawing = true;
  strokePoints = [getPoint(event)];
  canvas.setPointerCapture?.(event.pointerId);
  render();
};

canvas.onpointermove = (event) => {
  if (!drawing || !source) return;
  strokePoints.push(getPoint(event));
  render();
};

canvas.onpointerup = () => { drawing = false; };
canvas.onpointercancel = () => { drawing = false; };
window.onresize = () => { if (source) fitImage(); };

$('export').onclick = () => {
  if (!source) return;
  render();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pixelforge-edited.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
};

$('view').onclick = () => {
  if (!source) return;
  render();
  window.open(canvas.toDataURL('image/png'), '_blank');
};

updateLabels();
updateZoomLabel();
renderLayers();
setLoaded(false);

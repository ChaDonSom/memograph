export const MAX_DATA_IMAGE_URL_LENGTH = 1_500_000;
export const UPLOAD_IMAGE_MAX_EDGE_LENGTH_ATTEMPTS = [1600, 1200, 900, 600];
export const UPLOAD_IMAGE_QUALITIES = [0.82, 0.7, 0.6];

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function imageToDataUrl(image, maxEdgeLength, type = 'image/jpeg', imageQuality) {
  const scale = Math.min(1, maxEdgeLength / Math.max(1, image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Unable to resize image upload because this browser could not create a canvas context. The image will not be inserted; try another browser if this continues.');
    return '';
  }
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return type === 'image/jpeg'
    ? canvas.toDataURL(type, imageQuality ?? UPLOAD_IMAGE_QUALITIES[0])
    : canvas.toDataURL(type);
}

function isSafeDataImageUrl(value) {
  const trimmed = value.trim();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed)) {
    if (trimmed.length > MAX_DATA_IMAGE_URL_LENGTH) return false;
    const commaIndex = trimmed.indexOf(',');
    const data = trimmed.slice(commaIndex + 1);
    if (!data || data.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(data)) return false;
    try {
      atob(data);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function prepareImageUpload(file) {
  const original = await readFileAsDataUrl(file);
  if (isSafeDataImageUrl(original)) return original;

  const image = await loadImage(original);
  for (const maxEdgeLength of UPLOAD_IMAGE_MAX_EDGE_LENGTH_ATTEMPTS) {
    if (file.type === 'image/png') {
      const png = imageToDataUrl(image, maxEdgeLength, 'image/png');
      if (isSafeDataImageUrl(png)) return png;
    }

    for (const imageQuality of UPLOAD_IMAGE_QUALITIES) {
      const jpeg = imageToDataUrl(image, maxEdgeLength, 'image/jpeg', imageQuality);
      if (isSafeDataImageUrl(jpeg)) return jpeg;
    }
  }

  return '';
}

async function handleImageUpload(quill, range, files) {
  const fileCount = files.length;
  const images = (await Promise.all(
    Array.from(files, file => prepareImageUpload(file).catch(error => {
      console.warn(`Unable to prepare image upload for ${file.name || file.type || 'selected file'}.`, error);
      return '';
    }))
  )).filter(Boolean);

  if (!images.length) {
    alert('Unable to add that image. Try a smaller image or a different image format.');
    return;
  }
  if (images.length < fileCount) {
    alert('Some images could not be added. Try smaller images or a different image format.');
  }

  quill.deleteText(range.index, range.length, 'user');
  let insertAt = range.index;
  for (const imageDataUrl of images) {
    quill.insertEmbed(insertAt, 'image', imageDataUrl, 'user');
    insertAt++;
  }
  quill.setSelection(insertAt, 0, 'silent');
}

export function imageUploadHandler(range, files) {
  if (!this?.quill) return Promise.resolve();
  return handleImageUpload(this.quill, range, files);
}

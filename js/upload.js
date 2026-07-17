/**
 * Photo upload - modal, file input, drag & drop, form handling
 */

let selectedFile = null;

/**
 * Setup all upload-related event listeners
 */
function setupUpload() {
  const uploadModal = document.getElementById('uploadModal');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const preview = document.getElementById('uploadPreview');
  const previewImage = document.getElementById('previewImage');

  // Open upload modal
  document.getElementById('openUploadBtn').addEventListener('click', openUploadModal);
  document.getElementById('emptyUploadBtn').addEventListener('click', openUploadModal);

  // Close upload modal
  document.getElementById('closeUploadBtn').addEventListener('click', closeUploadModal);
  document.getElementById('cancelUploadBtn').addEventListener('click', closeUploadModal);
  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) closeUploadModal();
  });

  // Click drop zone to open file picker
  dropZone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });

  // Drag & drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  // Change photo button
  document.getElementById('changePhotoBtn').addEventListener('click', () => {
    selectedFile = null;
    preview.style.display = 'none';
    dropZone.style.display = '';
    fileInput.value = '';
  });

  // Save photo
  document.getElementById('savePhotoBtn').addEventListener('click', savePhoto);

  // Upload star rating
  setupUploadStarRating();
}

/**
 * Open the upload modal and reset form
 */
function openUploadModal() {
  const modal = document.getElementById('uploadModal');
  const form = document.getElementById('uploadForm');
  const dropZone = document.getElementById('dropZone');
  const preview = document.getElementById('uploadPreview');

  // Reset
  form.reset();
  selectedFile = null;
  dropZone.style.display = '';
  preview.style.display = 'none';
  document.getElementById('fileInput').value = '';
  updateUploadStars(0);
  document.getElementById('photoRating').value = '0';

  modal.classList.add('open');
}

/**
 * Close the upload modal
 */
function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('open');
}

/**
 * Handle file selection
 */
function handleFileSelect(file) {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showToast('请选择 JPG、PNG 或 WebP 格式的照片', 'error');
    return;
  }

  // Validate file size (max 20MB)
  if (file.size > 20 * 1024 * 1024) {
    showToast('照片文件不能超过 20MB', 'error');
    return;
  }

  selectedFile = file;

  // Show preview
  const preview = document.getElementById('uploadPreview');
  const previewImage = document.getElementById('previewImage');
  const dropZone = document.getElementById('dropZone');

  previewImage.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  dropZone.style.display = 'none';

  // Auto-fill title from filename
  const titleInput = document.getElementById('photoTitle');
  if (!titleInput.value) {
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 50);
    titleInput.value = name;
  }
}

/**
 * Save the uploaded photo to IndexedDB
 */
async function savePhoto() {
  if (!selectedFile) {
    showToast('请先选择一张照片', 'error');
    return;
  }

  const title = document.getElementById('photoTitle').value.trim();
  if (!title) {
    showToast('请输入照片标题', 'error');
    return;
  }

  const saveBtn = document.getElementById('savePhotoBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  try {
    const photoData = {
      title: title,
      description: document.getElementById('photoDesc').value.trim(),
      category: document.getElementById('photoCategory').value,
      tags: document
        .getElementById('photoTags')
        .value.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      equipment: document.getElementById('photoEquipment').value.trim(),
      aperture: document.getElementById('photoAperture').value.trim(),
      shutter: document.getElementById('photoShutter').value.trim(),
      iso: document.getElementById('photoIso').value.trim(),
      focalLength: document.getElementById('photoFocal').value.trim(),
      rating: parseInt(document.getElementById('photoRating').value) || 0,
      notes: document.getElementById('photoNotes').value.trim(),
      dateTaken: document.getElementById('photoDate').value || null,
      imageData: selectedFile,
    };

    await addPhoto(photoData);
    showToast('照片上传成功！', 'success');
    closeUploadModal();
    renderGallery();
  } catch (error) {
    console.error('Failed to save photo:', error);
    showToast('保存失败，请重试', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存照片';
  }
}

/**
 * Setup star rating in upload form
 */
function setupUploadStarRating() {
  const container = document.getElementById('uploadStarRating');
  const ratingInput = document.getElementById('photoRating');

  container.addEventListener('click', (e) => {
    if (!e.target.dataset.star) return;
    const star = parseInt(e.target.dataset.star);
    ratingInput.value = star;
    updateUploadStars(star);
  });

  container.addEventListener('mouseover', (e) => {
    if (!e.target.dataset.star) return;
    updateUploadStars(parseInt(e.target.dataset.star));
  });

  container.addEventListener('mouseleave', () => {
    updateUploadStars(parseInt(ratingInput.value) || 0);
  });
}

/**
 * Update star display in upload form
 */
function updateUploadStars(rating) {
  const stars = document.querySelectorAll('#uploadStarRating span');
  stars.forEach((star) => {
    const val = parseInt(star.dataset.star);
    star.textContent = val <= rating ? '★' : '☆';
    if (val <= rating) star.classList.add('active');
    else star.classList.remove('active');
  });
}

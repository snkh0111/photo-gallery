/**
 * Photo upload - modal, file input, drag & drop, multi-file support
 */

let selectedFiles = [];

/**
 * Setup all upload-related event listeners
 */
function setupUpload() {
  const uploadModal = document.getElementById('uploadModal');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  // Open upload modal
  document.getElementById('openUploadBtn').addEventListener('click', openUploadModal);
  document.getElementById('emptyUploadBtn').addEventListener('click', openUploadModal);

  // Close upload modal
  document.getElementById('closeUploadBtn').addEventListener('click', closeUploadModal);
  document.getElementById('cancelUploadBtn').addEventListener('click', closeUploadModal);
  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) closeUploadModal();
  });

  // Click drop zone to open file picker (multi-select)
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.setAttribute('multiple', 'multiple');

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFilesSelect(Array.from(e.target.files));
    }
  });

  // Drag & drop (supports multiple files)
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
      handleFilesSelect(Array.from(e.dataTransfer.files));
    }
  });

  // Save photo(s)
  document.getElementById('savePhotoBtn').addEventListener('click', savePhotos);

  // Upload star rating
  setupUploadStarRating();

  // Paste from clipboard
  document.addEventListener('paste', (e) => {
    if (!uploadModal.classList.contains('open')) return;
    const items = Array.from(e.clipboardData.items).filter(
      (item) => item.type.startsWith('image/')
    );
    if (items.length > 0) {
      e.preventDefault();
      const files = items.map((item) => item.getAsFile()).filter(Boolean);
      handleFilesSelect(files);
    }
  });
}

/**
 * Open the upload modal and reset form
 */
function openUploadModal() {
  const modal = document.getElementById('uploadModal');
  const form = document.getElementById('uploadForm');

  form.reset();
  selectedFiles = [];
  updateFilePreview();
  document.getElementById('fileInput').value = '';
  updateUploadStars(0);
  document.getElementById('photoRating').value = '0';

  modal.classList.add('open');

  // Focus the title input after a short delay
  setTimeout(() => document.getElementById('photoTitle').focus(), 300);
}

/**
 * Close the upload modal
 */
function closeUploadModal() {
  // Clean up blob URLs
  selectedFiles.forEach((f) => {
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
  });
  selectedFiles = [];
  document.getElementById('uploadModal').classList.remove('open');
}

/**
 * Handle multiple file selection
 */
async function handleFilesSelect(files) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const newFiles = [];

  for (const file of files) {
    if (!validTypes.includes(file.type)) {
      showToast(`"${file.name}" 格式不支持，已跳过`, 'error');
      continue;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast(`"${file.name}" 超过 20MB，已跳过`, 'error');
      continue;
    }
    file.previewUrl = URL.createObjectURL(file);

    // Parse EXIF for JPEG files
    if (file.type === 'image/jpeg') {
      try {
        file.exifData = await parseExif(file);
      } catch (e) {
        file.exifData = null;
      }
    } else {
      file.exifData = null;
    }

    newFiles.push(file);
  }

  if (newFiles.length === 0) return;

  selectedFiles = [...selectedFiles, ...newFiles];
  updateFilePreview();

  // Auto-fill EXIF data from the first/last selected file
  const exifFile = newFiles.find((f) => f.exifData && f.exifData.make) || newFiles[0];
  if (exifFile && exifFile.exifData) {
    autoFillExif(exifFile.exifData);
  }

  // Auto-fill title from first file
  const titleInput = document.getElementById('photoTitle');
  if (!titleInput.value && selectedFiles.length === 1) {
    const name = selectedFiles[0].name
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]/g, ' ')
      .slice(0, 50);
    titleInput.value = name;
  }

  showToast(`已选中 ${selectedFiles.length} 张照片`, 'info');
}

/**
 * Update the file preview area
 */
function updateFilePreview() {
  const dropZone = document.getElementById('dropZone');
  const previewContainer = document.querySelector('.upload-preview-container');
  const previewGrid = document.getElementById('previewGrid');
  const previewCount = document.getElementById('previewCount');

  if (selectedFiles.length === 0) {
    dropZone.style.display = '';
    if (previewContainer) previewContainer.style.display = 'none';
    return;
  }

  dropZone.style.display = 'none';
  if (previewContainer) previewContainer.style.display = 'block';

  // Update count
  if (previewCount) {
    previewCount.textContent = selectedFiles.length + ' 张';
  }

  // Show thumbnail grid
  if (previewGrid) {
    previewGrid.innerHTML = selectedFiles
      .map(
        (file, i) => `
        <div class="preview-thumb">
          <img src="${file.previewUrl}" alt="${file.name}">
          <span class="preview-index">${i + 1}</span>
          <button class="preview-remove" data-index="${i}" title="移除">✕</button>
        </div>`
      )
      .join('');

    // Bind remove buttons
    previewGrid.querySelectorAll('.preview-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const removed = selectedFiles[idx];
        if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        selectedFiles.splice(idx, 1);
        updateFilePreview();
      });
    });
  }
}

/**
 * Save all selected photos to IndexedDB
 */
async function savePhotos() {
  if (selectedFiles.length === 0) {
    showToast('请先选择照片', 'error');
    return;
  }

  const title = document.getElementById('photoTitle').value.trim();
  if (selectedFiles.length === 1 && !title) {
    showToast('请输入照片标题', 'error');
    return;
  }

  const saveBtn = document.getElementById('savePhotoBtn');
  saveBtn.disabled = true;

  // Common metadata (shared across all files when bulk uploading)
  const commonMeta = {
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
  };

  let saved = 0;
  let failed = 0;

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    saveBtn.textContent = `保存中 (${i + 1}/${selectedFiles.length})...`;

    try {
      const photoData = {
        ...commonMeta,
        title:
          selectedFiles.length === 1
            ? commonMeta.title
            : commonMeta.title
              ? `${commonMeta.title} (${i + 1})`
              : file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 50),
        imageData: file,
      };
      await addPhoto(photoData);
      saved++;
    } catch (error) {
      console.error('Failed to save:', file.name, error);
      failed++;
    }
  }

  if (saved > 0) {
    showToast(`${saved} 张照片上传成功！${failed > 0 ? ` ${failed} 张失败` : ''}`, 'success');
  } else {
    showToast('上传失败，请重试', 'error');
  }

  saveBtn.disabled = false;
  saveBtn.textContent = '保存照片';
  closeUploadModal();
  renderGallery();
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

/**
 * Auto-fill form fields from EXIF data
 */
function autoFillExif(exif) {
  if (!exif) return;

  let filled = false;

  // Only auto-fill empty fields (don't overwrite user input)
  const setIfEmpty = (id, value) => {
    const el = document.getElementById(id);
    if (el && !el.value && value) {
      el.value = value;
      filled = true;
    }
  };

  setIfEmpty('photoEquipment', exif.equipment || '');
  setIfEmpty('photoAperture', exif.aperture || '');
  setIfEmpty('photoShutter', exif.shutter || '');
  setIfEmpty('photoIso', exif.iso || '');
  setIfEmpty('photoFocal', exif.focalLength || '');
  setIfEmpty('photoDate', exif.dateTaken || '');

  if (filled) {
    showToast('📷 已自动读取照片 EXIF 参数', 'success');
  }
}

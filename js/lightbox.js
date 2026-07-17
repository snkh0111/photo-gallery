/**
 * Lightbox - full screen photo viewer with detail panel
 */

let currentLightboxPhotoId = null;
let currentLightboxIndex = -1;

/**
 * Open the lightbox for a specific photo
 */
async function openLightbox(photoId) {
  const photo = await getPhotoById(photoId);
  if (!photo) return;

  currentLightboxPhotoId = photoId;

  // Find index in current photo list for prev/next navigation
  const photos = currentPhotos.length > 0 ? currentPhotos : await getAllPhotos();
  currentLightboxIndex = photos.findIndex((p) => p.id === photoId);

  // Update detail panel
  populateLightboxDetail(photo);

  // Show image
  const lightboxImage = document.getElementById('lightboxImage');
  lightboxImage.src = URL.createObjectURL(photo.imageData);
  lightboxImage.alt = photo.title;

  // Open lightbox
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Update star rating display
  updateDetailStars(photo.rating);
}

/**
 * Close the lightbox
 */
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  currentLightboxPhotoId = null;
  currentLightboxIndex = -1;
}

/**
 * Navigate to prev/next photo
 */
async function navigateLightbox(direction) {
  const photos = currentPhotos.length > 0 ? currentPhotos : await getAllPhotos();
  if (photos.length === 0) return;

  let newIndex = currentLightboxIndex + direction;
  if (newIndex < 0) newIndex = photos.length - 1;
  if (newIndex >= photos.length) newIndex = 0;

  const photo = photos[newIndex];
  currentLightboxPhotoId = photo.id;
  currentLightboxIndex = newIndex;

  populateLightboxDetail(photo);

  const lightboxImage = document.getElementById('lightboxImage');
  // Revoke old URL to free memory
  if (lightboxImage.src.startsWith('blob:')) {
    URL.revokeObjectURL(lightboxImage.src);
  }
  lightboxImage.src = URL.createObjectURL(photo.imageData);
  lightboxImage.alt = photo.title;

  updateDetailStars(photo.rating);
}

/**
 * Populate the lightbox detail panel
 */
function populateLightboxDetail(photo) {
  document.getElementById('detailTitle').textContent = photo.title || '未命名';
  document.getElementById('detailDesc').textContent = photo.description || '';
  document.getElementById('detailEquipment').textContent = photo.equipment || '-';
  document.getElementById('detailAperture').textContent = photo.aperture || '-';
  document.getElementById('detailShutter').textContent = photo.shutter || '-';
  document.getElementById('detailIso').textContent = photo.iso || '-';
  document.getElementById('detailFocal').textContent = photo.focalLength || '-';
  document.getElementById('detailDate').textContent = photo.dateTaken || '-';
  document.getElementById('detailNotes').textContent = photo.notes || '暂无备注';

  // Tags
  const tagsContainer = document.getElementById('detailTags');
  const tags = photo.tags || [];
  if (tags.length > 0) {
    tagsContainer.innerHTML = tags.map((t) => `<span class="tag">${t}</span>`).join('');
    tagsContainer.style.display = 'flex';
  } else {
    tagsContainer.innerHTML = '';
    tagsContainer.style.display = 'none';
  }

  // Store current photo ID for edit/delete actions
  document.getElementById('editDetailBtn').dataset.photoId = photo.id;
  document.getElementById('deletePhotoBtn').dataset.photoId = photo.id;
}

/**
 * Initialize star rating in detail panel (click to rate)
 */
function setupDetailStarRating() {
  const container = document.getElementById('detailStarRating');

  container.addEventListener('click', async (e) => {
    if (!e.target.dataset.star) return;
    const star = parseInt(e.target.dataset.star);
    if (currentLightboxPhotoId) {
      await updatePhoto(currentLightboxPhotoId, { rating: star });
      updateDetailStars(star);
      showToast('评分已更新', 'success');
      // Refresh gallery to show updated rating
      renderGallery();
    }
  });

  // Hover effect
  container.addEventListener('mouseover', (e) => {
    if (!e.target.dataset.star) return;
    const star = parseInt(e.target.dataset.star);
    updateDetailStars(star);
  });

  container.addEventListener('mouseleave', async () => {
    if (currentLightboxPhotoId) {
      const photo = await getPhotoById(currentLightboxPhotoId);
      if (photo) updateDetailStars(photo.rating);
    }
  });
}

/**
 * Update the star display in the detail panel
 */
function updateDetailStars(rating) {
  const stars = document.querySelectorAll('#detailStarRating span');
  stars.forEach((star) => {
    const starValue = parseInt(star.dataset.star);
    star.textContent = starValue <= rating ? '★' : '☆';
    if (starValue <= rating) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

/**
 * Setup lightbox event listeners
 */
function setupLightbox() {
  // Close button
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);

  // Nav buttons
  document.getElementById('lightboxPrev').addEventListener('click', () => navigateLightbox(-1));
  document.getElementById('lightboxNext').addEventListener('click', () => navigateLightbox(1));

  // Click overlay background to close
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLightbox();
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox.classList.contains('open')) return;

    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });

  // Detail panel star rating
  setupDetailStarRating();

  // Edit buttons (header icon + detail action)
  function handleEditClick() {
    const photoId = parseInt(document.getElementById('editDetailBtn').dataset.photoId);
    if (photoId) openEditModal(photoId);
  }
  document.getElementById('editPhotoBtn').addEventListener('click', handleEditClick);
  document.getElementById('editDetailBtn').addEventListener('click', handleEditClick);

  // Delete button
  document.getElementById('deletePhotoBtn').addEventListener('click', async () => {
    const photoId = parseInt(document.getElementById('deletePhotoBtn').dataset.photoId);
    if (!photoId) return;

    if (!confirm('确定要删除这张照片吗？此操作不可撤销。')) return;

    await deletePhoto(photoId);
    showToast('照片已删除', 'success');
    closeLightbox();
    renderGallery();
  });
}

/**
 * Open the edit modal for a photo
 */
async function openEditModal(photoId) {
  const photo = await getPhotoById(photoId);
  if (!photo) return;

  const editModal = document.getElementById('editModal');
  const editBody = document.getElementById('editModalBody');

  editBody.innerHTML = `
    <form class="upload-form" id="editForm">
      <div class="form-row">
        <div class="form-group flex-2">
          <label for="editTitle">照片标题 <span class="required">*</span></label>
          <input type="text" id="editTitle" value="${escapeHtml(photo.title || '')}" required>
        </div>
        <div class="form-group flex-1">
          <label for="editCategory">分类</label>
          <select id="editCategory">
            ${['风景','人像','旅行','街拍','美食','其他'].map(c =>
              `<option value="${c}" ${photo.category === c ? 'selected' : ''}>${c}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="editDesc">描述</label>
        <textarea id="editDesc" rows="2">${escapeHtml(photo.description || '')}</textarea>
      </div>

      <div class="form-group">
        <label for="editTags">标签（用逗号分隔）</label>
        <input type="text" id="editTags" value="${escapeHtml((photo.tags || []).join(', '))}">
      </div>

      <fieldset class="form-fieldset">
        <legend>📷 拍摄设备与参数</legend>
        <div class="form-row">
          <div class="form-group flex-2">
            <label for="editEquipment">相机与镜头</label>
            <input type="text" id="editEquipment" value="${escapeHtml(photo.equipment || '')}">
          </div>
          <div class="form-group flex-1">
            <label for="editDate">拍摄日期</label>
            <input type="date" id="editDate" value="${photo.dateTaken || ''}">
          </div>
        </div>
        <div class="form-row form-row-4">
          <div class="form-group">
            <label for="editAperture">光圈</label>
            <input type="text" id="editAperture" value="${escapeHtml(photo.aperture || '')}" placeholder="f/2.8">
          </div>
          <div class="form-group">
            <label for="editShutter">快门</label>
            <input type="text" id="editShutter" value="${escapeHtml(photo.shutter || '')}" placeholder="1/200s">
          </div>
          <div class="form-group">
            <label for="editIso">ISO</label>
            <input type="text" id="editIso" value="${escapeHtml(photo.iso || '')}" placeholder="ISO 100">
          </div>
          <div class="form-group">
            <label for="editFocal">焦距</label>
            <input type="text" id="editFocal" value="${escapeHtml(photo.focalLength || '')}" placeholder="85mm">
          </div>
        </div>
      </fieldset>

      <div class="form-row">
        <div class="form-group">
          <label>评分</label>
          <div class="star-rating" id="editStarRating">
            <span data-star="1">${photo.rating >= 1 ? '★' : '☆'}</span>
            <span data-star="2">${photo.rating >= 2 ? '★' : '☆'}</span>
            <span data-star="3">${photo.rating >= 3 ? '★' : '☆'}</span>
            <span data-star="4">${photo.rating >= 4 ? '★' : '☆'}</span>
            <span data-star="5">${photo.rating >= 5 ? '★' : '☆'}</span>
          </div>
          <input type="hidden" id="editRating" value="${photo.rating || 0}">
        </div>
      </div>

      <div class="form-group">
        <label for="editNotes">备注</label>
        <textarea id="editNotes" rows="3">${escapeHtml(photo.notes || '')}</textarea>
      </div>
    </form>
  `;

  // Store photo ID
  editModal.dataset.photoId = photoId;

  // Setup star rating in edit modal
  setupEditStarRating(photo.rating || 0);

  // Open modal
  editModal.classList.add('open');
}

/**
 * Setup star rating in edit modal
 */
function setupEditStarRating(initialRating) {
  const container = document.getElementById('editStarRating');
  const ratingInput = document.getElementById('editRating');

  function setStars(rating) {
    container.querySelectorAll('span').forEach((s) => {
      const val = parseInt(s.dataset.star);
      s.textContent = val <= rating ? '★' : '☆';
      if (val <= rating) s.classList.add('active');
      else s.classList.remove('active');
    });
  }

  container.addEventListener('click', (e) => {
    if (!e.target.dataset.star) return;
    const star = parseInt(e.target.dataset.star);
    ratingInput.value = star;
    setStars(star);
  });

  container.addEventListener('mouseover', (e) => {
    if (!e.target.dataset.star) return;
    setStars(parseInt(e.target.dataset.star));
  });

  container.addEventListener('mouseleave', () => {
    setStars(parseInt(ratingInput.value) || 0);
  });

  setStars(initialRating);
}

/**
 * Setup edit modal event listeners
 */
function setupEditModal() {
  const modal = document.getElementById('editModal');

  // Close buttons
  document.getElementById('closeEditBtn').addEventListener('click', () => {
    modal.classList.remove('open');
  });
  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    modal.classList.remove('open');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  // Save button
  document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const photoId = parseInt(modal.dataset.photoId);
    if (!photoId) return;

    const updates = {
      title: document.getElementById('editTitle').value.trim(),
      description: document.getElementById('editDesc').value.trim(),
      category: document.getElementById('editCategory').value,
      tags: document.getElementById('editTags').value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      equipment: document.getElementById('editEquipment').value.trim(),
      aperture: document.getElementById('editAperture').value.trim(),
      shutter: document.getElementById('editShutter').value.trim(),
      iso: document.getElementById('editIso').value.trim(),
      focalLength: document.getElementById('editFocal').value.trim(),
      rating: parseInt(document.getElementById('editRating').value) || 0,
      notes: document.getElementById('editNotes').value.trim(),
      dateTaken: document.getElementById('editDate').value || null,
    };

    if (!updates.title) {
      showToast('请输入照片标题', 'error');
      return;
    }

    await updatePhoto(photoId, updates);
    showToast('照片信息已更新', 'success');

    modal.classList.remove('open');

    // Refresh lightbox detail
    const photo = await getPhotoById(photoId);
    populateLightboxDetail(photo);
    updateDetailStars(photo.rating);

    // Refresh gallery
    renderGallery();
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

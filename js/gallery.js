/**
 * Gallery rendering - masonry grid, filtering, search
 * Supports both cloud (photos.json) and local (IndexedDB) photos
 */

let currentCategory = '全部';
let currentPhotos = [];

/**
 * Render the full gallery: filter bar + photo grid
 */
async function renderGallery() {
  const photos = await getAllPhotosUnified(currentCategory);
  currentPhotos = photos;

  await renderFilterBar();
  renderPhotoGrid(photos);
  document.getElementById('photoCount').textContent = `${photos.length} 张照片`;
}

/**
 * Render the category filter chips
 */
async function renderFilterBar() {
  const categories = await getAllCategoriesUnified();
  const filterBar = document.getElementById('filterBar');

  filterBar.innerHTML = categories
    .map(
      (cat) =>
        `<button class="filter-chip ${cat === currentCategory ? 'active' : ''}"
                 data-category="${cat}">${cat}</button>`
    )
    .join('');

  filterBar.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentCategory = chip.dataset.category;
      filterBar.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      renderGallery();
    });
  });
}

/**
 * Render the masonry photo grid
 */
function renderPhotoGrid(photos) {
  const gallery = document.getElementById('gallery');
  const emptyState = document.getElementById('emptyState');

  if (photos.length === 0) {
    if (emptyState) emptyState.style.display = '';
    gallery.querySelectorAll('.gallery-item').forEach((el) => el.remove());
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  gallery.querySelectorAll('.gallery-item').forEach((el) => el.remove());

  photos.forEach((photo) => {
    const item = createGalleryItem(photo);
    gallery.appendChild(item);
  });
}

/**
 * Create a single gallery item card
 */
function createGalleryItem(photo) {
  const item = document.createElement('div');
  item.className = 'gallery-item';
  item.dataset.photoId = photo.id;

  const img = document.createElement('img');
  img.src = getPhotoThumbnailUrl(photo);
  img.alt = photo.title;
  img.loading = 'lazy';

  // Cloud badge
  if (photo.source === 'cloud') {
    const badge = document.createElement('span');
    badge.className = 'cloud-badge';
    badge.textContent = '☁️';
    badge.title = '云端照片';
    badge.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);color:#fff;padding:4px 8px;border-radius:6px;font-size:0.75rem;pointer-events:none;z-index:2;';
    item.appendChild(badge);
  }

  const overlay = document.createElement('div');
  overlay.className = 'gallery-item-overlay';

  const title = document.createElement('div');
  title.className = 'gallery-item-title';
  title.textContent = photo.title;

  const meta = document.createElement('div');
  meta.className = 'gallery-item-meta';
  meta.innerHTML = `
    ${photo.category ? `<span>${photo.category}</span>` : ''}
    ${renderStarsInline(photo.rating)}
  `;

  overlay.appendChild(title);
  overlay.appendChild(meta);
  item.appendChild(img);
  item.appendChild(overlay);

  item.addEventListener('click', () => {
    openLightbox(photo.id);
  });

  return item;
}

/**
 * Render inline star display (read-only)
 */
function renderStarsInline(rating) {
  if (!rating || rating === 0) return '';
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += i <= rating ? '★' : '☆';
  }
  return `<span class="gallery-item-stars">${stars}</span>`;
}

/**
 * Search handler - debounced
 */
let searchTimeout;
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const query = searchInput.value.trim().toLowerCase();
      if (query) {
        const all = await getAllPhotosUnified();
        const results = all.filter((p) => {
          const searchText = [
            p.title, p.description, p.notes, p.equipment,
            (p.tags || []).join(' '),
          ].join(' ').toLowerCase();
          return searchText.includes(query);
        });
        renderPhotoGrid(results);
        document.getElementById('photoCount').textContent = `${results.length} 张照片`;
      } else {
        renderGallery();
      }
    }, 300);
  });
}

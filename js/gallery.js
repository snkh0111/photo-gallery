/**
 * Gallery rendering - masonry grid, filtering, search
 */

let currentCategory = '全部';
let currentSearchQuery = '';
let currentPhotos = [];

/**
 * Render the full gallery: filter bar + photo grid
 */
async function renderGallery() {
  const photos = await getAllPhotos(currentCategory);
  currentPhotos = photos;

  // Update filter bar
  await renderFilterBar();

  // Render photo grid
  renderPhotoGrid(photos);

  // Update photo count
  document.getElementById('photoCount').textContent = `${photos.length} 张照片`;
}

/**
 * Render the category filter chips
 */
async function renderFilterBar() {
  const categories = await getAllCategories();
  const filterBar = document.getElementById('filterBar');

  filterBar.innerHTML = categories
    .map(
      (cat) =>
        `<button class="filter-chip ${cat === currentCategory ? 'active' : ''}"
                 data-category="${cat}">${cat}</button>`
    )
    .join('');

  // Bind click events
  filterBar.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentCategory = chip.dataset.category;
      // Update active state
      filterBar.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      // Re-render
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
    // Show empty state, hide photo cards
    if (emptyState) emptyState.style.display = '';
    // Remove all photo cards
    gallery.querySelectorAll('.gallery-item').forEach((el) => el.remove());
    return;
  }

  // Hide empty state
  if (emptyState) emptyState.style.display = 'none';

  // Remove existing photo cards
  gallery.querySelectorAll('.gallery-item').forEach((el) => el.remove());

  // Create and append photo cards
  photos.forEach((photo, index) => {
    const item = createGalleryItem(photo, index);
    gallery.appendChild(item);
  });
}

/**
 * Create a single gallery item card
 */
function createGalleryItem(photo, index) {
  const item = document.createElement('div');
  item.className = 'gallery-item';
  item.dataset.photoId = photo.id;

  // Image
  const img = document.createElement('img');
  img.src = URL.createObjectURL(photo.thumbnail || photo.imageData);
  img.alt = photo.title;
  img.loading = 'lazy';

  // Overlay on hover
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

  // Click to open lightbox
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
      const query = searchInput.value.trim();
      if (query) {
        const results = await searchPhotos(query);
        renderPhotoGrid(results);
        document.getElementById('photoCount').textContent = `${results.length} 张照片`;
      } else {
        renderGallery();
      }
    }, 300);
  });
}

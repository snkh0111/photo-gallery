/**
 * Cloud photo loader - fetches photos from photos.json
 * These photos are maintained via GitHub and synced to all viewers
 */

const PHOTOS_JSON_URL = './photos.json';

let cloudPhotosCache = null;

/**
 * Fetch photos.json and return cloud photo list
 * Results are cached in memory for the session
 */
async function getCloudPhotos() {
  if (cloudPhotosCache) return cloudPhotosCache;

  try {
    const response = await fetch(PHOTOS_JSON_URL);
    if (!response.ok) {
      console.warn('Failed to fetch photos.json:', response.status);
      return [];
    }
    const data = await response.json();
    // Normalize: mark source as 'cloud', ensure all fields exist
    cloudPhotosCache = data.map((item) => ({
      ...item,
      source: 'cloud',
      description: item.description || '',
      tags: item.tags || [],
      equipment: item.equipment || '',
      aperture: item.aperture || '',
      shutter: item.shutter || '',
      iso: item.iso || '',
      focalLength: item.focalLength || '',
      rating: item.rating || 0,
      notes: item.notes || '',
      dateTaken: item.dateTaken || null,
      dateAdded: item.dateAdded || item.dateTaken || null,
    }));
    return cloudPhotosCache;
  } catch (error) {
    console.warn('Failed to load cloud photos:', error);
    return [];
  }
}

/**
 * Get all photos from both cloud and local sources
 * @param {string} category - filter by category, '全部' for all
 */
async function getAllPhotosUnified(category = '全部') {
  const [cloudPhotos, localPhotos] = await Promise.all([
    getCloudPhotos(),
    getAllPhotos(), // from db.js
  ]);

  // Mark local photos
  const markedLocal = localPhotos.map((p) => ({ ...p, source: 'local' }));

  // Merge: cloud photos first, then local (or interleave by date)
  let all = [...cloudPhotos, ...markedLocal];

  // Filter by category
  if (category && category !== '全部') {
    all = all.filter((p) => p.category === category);
  }

  // Sort by dateAdded / dateTaken descending
  all.sort((a, b) => {
    const da = a.dateAdded || a.dateTaken || '';
    const db = b.dateAdded || b.dateTaken || '';
    return new Date(db) - new Date(da);
  });

  return all;
}

/**
 * Get a photo by ID from either source
 */
async function getPhotoByIdUnified(id) {
  // Check cloud photos first
  const cloudPhotos = await getCloudPhotos();
  const cloudMatch = cloudPhotos.find((p) => p.id === id);
  if (cloudMatch) return cloudMatch;

  // Check local photos
  return getPhotoById(id);
}

/**
 * Get the display URL for a photo (blob or HTTP)
 */
function getPhotoDisplayUrl(photo) {
  if (photo.source === 'cloud') {
    return photo.url;
  }
  return URL.createObjectURL(photo.imageData);
}

/**
 * Get the thumbnail URL for a photo
 */
function getPhotoThumbnailUrl(photo) {
  if (photo.source === 'cloud') {
    return photo.thumbnailUrl || photo.url;
  }
  return URL.createObjectURL(photo.thumbnail || photo.imageData);
}

/**
 * Get all categories from both sources
 */
async function getAllCategoriesUnified() {
  const [cloudPhotos, localPhotos] = await Promise.all([
    getCloudPhotos(),
    getAllPhotos(),
  ]);

  const categories = new Set();
  cloudPhotos.forEach((p) => p.category && categories.add(p.category));
  localPhotos.forEach((p) => p.category && categories.add(p.category));

  return ['全部', ...Array.from(categories)];
}

/**
 * IndexedDB operations for photo gallery
 * Database: photoGallery
 * Store: photos (keyPath: id, autoIncrement)
 */

const DB_NAME = 'photoGallery';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

let db = null;

/**
 * Open / initialize the IndexedDB database
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        // Create indexes for querying
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('rating', 'rating', { unique: false });
        store.createIndex('dateAdded', 'dateAdded', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('Failed to open IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Generate a thumbnail (max 400px wide) from an image blob
 */
function generateThumbnail(imageBlob, maxWidth = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const ratio = maxWidth / img.width;
      const width = maxWidth;
      const height = Math.round(img.height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback: use original if canvas fails
            resolve(imageBlob);
          }
        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail generation'));
    };

    img.src = url;
  });
}

/**
 * Add a new photo to the database
 */
async function addPhoto(photoData) {
  // Generate thumbnail from imageData
  const thumbnail = await generateThumbnail(photoData.imageData);

  const record = {
    title: photoData.title || '未命名',
    description: photoData.description || '',
    category: photoData.category || '其他',
    tags: photoData.tags || [],
    equipment: photoData.equipment || '',
    aperture: photoData.aperture || '',
    shutter: photoData.shutter || '',
    iso: photoData.iso || '',
    focalLength: photoData.focalLength || '',
    rating: photoData.rating || 0,
    notes: photoData.notes || '',
    imageData: photoData.imageData,
    thumbnail: thumbnail,
    dateTaken: photoData.dateTaken || null,
    dateAdded: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all photos, optionally filtered by category
 */
function getAllPhotos(category = '全部') {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      let photos = request.result;

      // Filter by category
      if (category && category !== '全部') {
        photos = photos.filter((p) => p.category === category);
      }

      // Sort by dateAdded descending (newest first)
      photos.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

      resolve(photos);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single photo by ID
 */
function getPhotoById(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update photo metadata (not the image itself)
 */
function updatePhoto(id, updates) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const photo = getRequest.result;
      if (!photo) {
        reject(new Error('Photo not found'));
        return;
      }

      // Merge updates (don't overwrite imageData or thumbnail unless provided)
      const allowedFields = [
        'title', 'description', 'category', 'tags',
        'equipment', 'aperture', 'shutter', 'iso', 'focalLength',
        'rating', 'notes', 'dateTaken',
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          photo[field] = updates[field];
        }
      }

      const putRequest = store.put(photo);
      putRequest.onsuccess = () => resolve(putRequest.result);
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Delete a photo by ID
 */
function deletePhoto(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Search photos by query string (searches title, tags, notes, description, equipment)
 */
function searchPhotos(query) {
  if (!query || query.trim() === '') {
    return getAllPhotos();
  }

  const q = query.trim().toLowerCase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      let photos = request.result;

      photos = photos.filter((p) => {
        const searchText = [
          p.title,
          p.description,
          p.notes,
          p.equipment,
          (p.tags || []).join(' '),
        ]
          .join(' ')
          .toLowerCase();
        return searchText.includes(q);
      });

      photos.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
      resolve(photos);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all unique categories from photos
 */
function getAllCategories() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const photos = request.result;
      const categories = new Set(photos.map((p) => p.category).filter(Boolean));
      resolve(['全部', ...Array.from(categories)]);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Generate and insert demo photos (for first-time use)
 */
async function seedDemoPhotos() {
  const existing = await getAllPhotos();
  if (existing.length > 0) return; // Already has photos, skip seeding

  const demos = [
    {
      title: '山顶日落',
      description: '在黄山光明顶拍摄的壮丽日落',
      category: '风景',
      tags: ['日落', '黄山', '云海'],
      equipment: 'Sony A7M4 + FE 24-70mm f/2.8 GM II',
      aperture: 'f/8.0',
      shutter: '1/250s',
      iso: 'ISO 100',
      focalLength: '35mm',
      rating: 5,
      notes: '等了两个小时才等到这个完美的光线，云海和日落交织在一起，美得让人窒息。',
      dateTaken: '2026-07-10',
    },
    {
      title: '街角咖啡馆',
      description: '一个安静的午后，阳光洒在咖啡馆的老墙上',
      category: '街拍',
      tags: ['咖啡', '街景', '光影'],
      equipment: 'Fujifilm X-T5 + XF 35mm f/1.4',
      aperture: 'f/2.0',
      shutter: '1/500s',
      iso: 'ISO 400',
      focalLength: '35mm',
      rating: 4,
      notes: '路过时被光影吸引，抓拍到一位正在看书的老人的侧影，很有故事感。',
      dateTaken: '2026-07-08',
    },
    {
      title: '夏日花海',
      description: '普罗旺斯的薰衣草田，紫色的海洋',
      category: '旅行',
      tags: ['薰衣草', '法国', '夏天'],
      equipment: 'Canon EOS R5 + RF 70-200mm f/2.8L',
      aperture: 'f/2.8',
      shutter: '1/1000s',
      iso: 'ISO 200',
      focalLength: '135mm',
      rating: 5,
      notes: '一生一定要去一次的薰衣草田，空气中都是花香。',
      dateTaken: '2026-06-20',
    },
    {
      title: '肖像练习',
      description: '朋友在公园里自然光的肖像拍摄',
      category: '人像',
      tags: ['自然光', '肖像', '户外'],
      equipment: 'Nikon Z8 + Z 85mm f/1.2 S',
      aperture: 'f/1.4',
      shutter: '1/400s',
      iso: 'ISO 200',
      focalLength: '85mm',
      rating: 4,
      notes: '黄金时刻的自然光太美了，几乎不需要后期。模特放松的状态让照片很有感染力。',
      dateTaken: '2026-07-05',
    },
    {
      title: '寿司盛宴',
      description: '在东京筑地市场品尝新鲜寿司',
      category: '美食',
      tags: ['寿司', '日本', '美食摄影'],
      equipment: 'Sony A7M4 + FE 90mm f/2.8 Macro G',
      aperture: 'f/4.0',
      shutter: '1/160s',
      iso: 'ISO 800',
      focalLength: '90mm',
      rating: 5,
      notes: '拍摄食物要注意光线和构图，这张用了自然光+反光板补光。',
      dateTaken: '2026-06-15',
    },
    {
      title: '古城晨曦',
      description: '清晨的丽江古城，安静而美好',
      category: '旅行',
      tags: ['丽江', '古城', '日出'],
      equipment: 'DJI Mavic 3 Pro',
      aperture: 'f/2.8',
      shutter: '1/200s',
      iso: 'ISO 100',
      focalLength: '24mm',
      rating: 5,
      notes: '早起是摄影师的必修课，这座800年的古城在晨光中格外迷人。',
      dateTaken: '2026-05-28',
    },
  ];

  // Create colorful placeholder images using Canvas
  const colors = [
    ['#ff7b60', '#ffb74d'], // 日落橙
    ['#8b6f47', '#d4a574'], // 咖啡棕
    ['#7b68ee', '#b388ff'], // 薰衣草紫
    ['#f8bbd0', '#e57373'], // 人像粉
    ['#ff7043', '#ffab91'], // 美食橙
    ['#4fc3f7', '#81d4fa'], // 晨曦蓝
  ];

  for (let i = 0; i < demos.length; i++) {
    const demo = demos[i];
    const [c1, c2] = colors[i];

    // Generate a placeholder image using canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600 + (i % 3) * 200;

    const ctx = canvas.getContext('2d');

    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, c1);
    gradient.addColorStop(1, c2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative elements
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(canvas.width * 0.7, canvas.height * 0.3, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(canvas.width * 0.3, canvas.height * 0.6, 100, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 36px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(demo.title, canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(demo.category + ' · ' + demo.equipment, canvas.width / 2, canvas.height / 2 + 40);

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));

    demo.imageData = blob;
    await addPhoto(demo);
  }
}

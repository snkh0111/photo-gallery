/**
 * App initialization - entry point
 */

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto dismiss after 3 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

/**
 * Initialize the application
 */
async function initApp() {
  try {
    // 1. Open database
    await openDB();

    // 2. Initialize theme
    initTheme();

    // 3. Setup UI components
    setupSearch();
    setupUpload();
    setupLightbox();
    setupEditModal();

    // 5. Render gallery
    await renderGallery();

    console.log('📷 Photo gallery initialized successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    showToast('应用初始化失败，请刷新页面重试', 'error');
  }
}

// Boot the app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

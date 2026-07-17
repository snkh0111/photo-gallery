/**
 * Theme toggle - light/dark mode
 * Persists preference in localStorage
 */

const THEME_KEY = 'photo-gallery-theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  setTheme(saved);

  const toggleBtn = document.getElementById('themeToggle');
  toggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    toggleBtn.title = theme === 'dark' ? '切换浅色模式' : '切换深色模式';
  }
}

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

const theme = document.querySelector('#theme');
const shortcut = document.querySelector('#themeToggle');
const system = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  if (theme.value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme.value;
  const dark = theme.value === 'dark' || (theme.value === 'system' && system.matches);
  const label = dark ? '切换到浅色' : '切换到深色';
  shortcut.setAttribute('aria-label', label); shortcut.title = label;
  document.querySelector('#themeSun').toggleAttribute('hidden', !dark);
  document.querySelector('#themeMoon').toggleAttribute('hidden', dark);
}
theme.addEventListener('change', applyTheme);
system.addEventListener('change', applyTheme);
shortcut.addEventListener('click', () => {
  const dark = theme.value === 'dark' || (theme.value === 'system' && system.matches);
  theme.value = dark ? 'light' : 'dark'; applyTheme();
});
const opacity = document.querySelector('#panelOpacity');
opacity.addEventListener('input', () => {
  document.documentElement.style.setProperty('--panel-alpha', String(1 - Number(opacity.value) / 100));
  document.querySelector('#panelOpacityValue').textContent = opacity.value + '%';
});
applyTheme();

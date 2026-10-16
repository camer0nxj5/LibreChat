/* Native browser chrome accepts an opaque tint, not the page's backdrop filter.
 * Follow the applied theme (including explicit overrides and system changes). */
const meta = document.querySelector('meta[name="theme-color"]');
const root = document.documentElement;
const mobile = window.matchMedia('(max-width: 767px)');
function syncBrowserChrome() {
  if (!meta) return;
  meta.content = mobile.matches
    ? (root.classList.contains('dark') ? '#000000' : '#ffffff')
    : '#171717';
}
new MutationObserver(syncBrowserChrome).observe(root, { attributes: true, attributeFilter: ['class'] });
mobile.addEventListener('change', syncBrowserChrome);
syncBrowserChrome();

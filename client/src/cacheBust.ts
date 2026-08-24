export default {
  install() {
    document.addEventListener('DOMContentLoaded', () => {
      const links = document.querySelectorAll('script[src], link[href]');
      links.forEach((el) => {
        const raw = el.getAttribute('src') ?? el.getAttribute('href');
        if (!raw) return;

        const url = new URL(raw, window.location.href);
        if (!url.searchParams.has('v')) {
          url.searchParams.set('v', String(Date.now()));
          if (el.tagName === 'SCRIPT') el.setAttribute('src', url.toString());
          if (el.tagName === 'LINK') el.setAttribute('href', url.toString());
        }
      });
    });
  }
};

export default {
  install() {
    document.addEventListener('DOMContentLoaded', () => {
      const links = document.querySelectorAll('script[src], link[href]');
      links.forEach((el) => {
        const url = new URL(el.getAttribute('src') || el.getAttribute('href'), window.location.href);
        if (!url.searchParams.has('v')) {
          url.searchParams.set('v', String(Date.now()));
          if (el.tagName === 'SCRIPT') el.setAttribute('src', url.toString());
          if (el.tagName === 'LINK') el.setAttribute('href', url.toString());
        }
      });
    });
  }
};

// Bottom tab bar. The links work without JS (plain hash links); with JS they
// route through the router so the switch gets its view transition.

export class TabBar {
  #router;
  #root = null;

  constructor({ router }) {
    this.#router = router;
  }

  render(root) {
    this.#root = root;
    root.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-route]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      this.#router.go(link.dataset.route);
    });
    this.#router.addEventListener('change', (event) => this.update(event.detail.name));
    if (this.#router.current) this.update(this.#router.current);
    return root;
  }

  update(current) {
    for (const link of this.#root.querySelectorAll('a[data-route]')) {
      if (link.dataset.route === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
}

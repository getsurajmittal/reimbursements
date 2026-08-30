/* A tiny tab router. Views import `go()` from here rather than from app.js,
   which keeps the module graph acyclic (app.js -> views -> router). */

import { state } from './store.js';

const routes = new Map();
let onChange = () => {};

export function defineRoute(id, config) {
  routes.set(id, config);
}

export function getRoute(id) {
  return routes.get(id);
}

export function routeIds() {
  return [...routes.keys()];
}

export function onRouteChange(fn) {
  onChange = fn;
}

/**
 * Switch tabs. `params` is merged into state before the view renders, which
 * is how a dashboard chip can open the Bills tab pre-filtered.
 */
export function go(tabId, params = {}) {
  const route = routes.get(tabId);
  if (!route) return;
  if (params.filters) state.filters = { ...state.filters, ...params.filters };
  state.activeTab = tabId;
  onChange(tabId);
  route.render();
  window.scrollTo(0, 0);
}

/** Re-render the current tab in place - used after any write. */
export function refresh() {
  const route = routes.get(state.activeTab);
  route?.render();
}

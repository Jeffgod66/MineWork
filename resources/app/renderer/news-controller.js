(function initNewsController(root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) module.exports = exported;
  if (root) root.MineWorkNewsController = exported;
})(typeof window !== "undefined" ? window : globalThis, function newsControllerFactory() {
  "use strict";

  const CATEGORIES = ["general", "china-politics", "international", "finance", "technology", "ai", "society", "culture-sports"];
  const empty = () => ({ items: [], status: "idle", updatedAt: null, providers: [], error: "", stale: false });
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function createNewsController({ openExternal, initialCategory = "general", readIds = [], query = "" } = {}) {
    const categories = Object.fromEntries(CATEGORIES.map((category) => [category, empty()]));
    let activeNewsCategory = CATEGORIES.includes(initialCategory) ? initialCategory : "general";
    let newsReadIds = Array.isArray(readIds) ? [...new Set(readIds.map(String))] : [];
    let newsQuery = String(query || "");

    function switchCategory(category) {
      if (!CATEGORIES.includes(category)) return false;
      activeNewsCategory = category;
      return true;
    }
    function merge(result) {
      const category = result?.category;
      if (!CATEGORIES.includes(category)) return false;
      const previous = categories[category];
      if (result.ok) categories[category] = { items: Array.isArray(result.items) ? copy(result.items).slice(0, 20) : [], status: result.stale ? "stale" : "success", updatedAt: result.updatedAt || previous.updatedAt, providers: Array.isArray(result.providers) ? result.providers.map(String) : [], error: String(result.error || ""), stale: result.stale === true };
      else categories[category] = { ...previous, status: "error", error: String(result.error || "News unavailable"), stale: previous.items.length > 0 };
      return true;
    }
    function setStatus(category, status) { if (CATEGORIES.includes(category)) categories[category].status = String(status); }
    function setQuery(value) { newsQuery = String(value || ""); }
    function projection(category = activeNewsCategory) {
      const needle = newsQuery.trim().toLocaleLowerCase();
      return categories[category].items.filter((item) => !needle || `${item.title || ""} ${item.source || ""}`.toLocaleLowerCase().includes(needle)).slice(0, 20);
    }
    async function open(index) {
      const item = projection()[Number(index)];
      if (!item || typeof openExternal !== "function") return false;
      try { if (new URL(item.url).protocol !== "https:") return false; } catch { return false; }
      try {
        const result = await openExternal(item.url);
        if (result !== true && result?.ok !== true) return false;
        const id = String(item.url);
        if (!newsReadIds.includes(id)) newsReadIds.push(id);
        return true;
      } catch { return false; }
    }
    function request() { return { category: activeNewsCategory, force: arguments[0] !== "lazy" }; }
    function snapshot() { return copy({ categories, activeNewsCategory, newsReadIds, newsQuery }); }
    return Object.freeze({ switchCategory, merge, setStatus, setQuery, projection, open, request, snapshot });
  }
  return Object.freeze({ CATEGORIES, createNewsController });
});

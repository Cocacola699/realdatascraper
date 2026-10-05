"use strict";
// Progressive enhancement only. Every record already exists in the server-rendered HTML;
// this script just filters, sorts, paginates and switches views by showing/hiding those elements.
const $ = id => document.getElementById(id);
const grid = $("card-grid"), tbody = $("records-body"), counter = $("record-count");
const cards = [...grid.querySelectorAll("article.record-card")];
const rowById = new Map([...tbody.querySelectorAll("tr.record-row")].map(r => [r.dataset.id, r]));
const text = new Map(cards.map(c => [c, c.textContent.toLowerCase()]));
const loaded = cards.length, generated = counter.dataset.generated;
let page = 1;

function render() {
  const q = $("search").value.trim().toLowerCase(), cat = $("category").value;
  const key = $("sort").value, dir = $("dir").value === "asc" ? 1 : -1, size = +$("pagesize").value;
  const list = cards.filter(c => (!cat || c.dataset.category === cat) && (!q || text.get(c).includes(q)));
  list.sort((a, b) => {
    let x = a.dataset[key], y = b.dataset[key];
    if (x === "" || x == null) return 1;           // empty values always last
    if (y === "" || y == null) return -1;
    if (key === "value") return (parseFloat(x) - parseFloat(y)) * dir;
    return x.localeCompare(y, undefined, { numeric: true }) * dir;
  });
  const pages = Math.max(1, Math.ceil(list.length / size));
  page = Math.min(page, pages);
  const start = (page - 1) * size, shown = new Set(list.slice(start, start + size));
  const matching = new Set(list);
  const cf = document.createDocumentFragment(), rf = document.createDocumentFragment();
  list.forEach(c => { cf.appendChild(c); rf.appendChild(rowById.get(c.dataset.id)); });
  cards.forEach(c => { if (!matching.has(c)) { cf.appendChild(c); rf.appendChild(rowById.get(c.dataset.id)); } });
  cards.forEach(c => { const on = shown.has(c); c.hidden = !on; rowById.get(c.dataset.id).hidden = !on; });
  grid.appendChild(cf); tbody.appendChild(rf);
  counter.dataset.matching = list.length;
  counter.textContent = `${loaded} records in this page (generated ${generated}). ${list.length} match your filters; showing ${shown.size}.`;
  $("page-info").textContent = `Page ${page} of ${pages}`;
  $("page-info").dataset.page = page; $("page-info").dataset.pages = pages;
  $("prev").disabled = page <= 1; $("next").disabled = page >= pages;
}

function setView(v) {
  $("results").dataset.view = v;
  $("btn-cards").classList.toggle("is-active", v === "cards");
  $("btn-table").classList.toggle("is-active", v === "table");
}

["search", "category", "sort", "dir", "pagesize"].forEach(id =>
  $(id).addEventListener(id === "search" ? "input" : "change", () => { page = 1; render(); }));
$("prev").onclick = () => { page--; render(); };
$("next").onclick = () => { page++; render(); };
$("btn-cards").onclick = () => setView("cards");
$("btn-table").onclick = () => setView("table");
render();

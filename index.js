"use strict";
// RealData Explorer: server-side rendered. Public APIs are fetched here, on the server,
// and every record is written into the HTML before it is sent. No JavaScript is needed to read it.

const UA = "RealDataExplorer/1.0 (educational scraping practice)";
const PER_SOURCE_CAP = 250; // keeps the HTML under Vercel's 4.5 MB response limit

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n = 220) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const iso = v => { const d = new Date(v); return isNaN(d) ? "" : d.toISOString(); };
const num = v => (typeof v === "number" && isFinite(v)) ? v : null;

const CITIES = [["London", 51.51, -0.13], ["New York", 40.71, -74.01], ["Tokyo", 35.68, 139.69], ["Bengaluru", 12.97, 77.59],
  ["Sydney", -33.87, 151.21], ["Cairo", 30.04, 31.24], ["Sao Paulo", -23.55, -46.63], ["Reykjavik", 64.15, -21.94],
  ["Nairobi", -1.29, 36.82], ["Singapore", 1.35, 103.82], ["Mexico City", 19.43, -99.13], ["Moscow", 55.76, 37.62]];

const SOURCES = [
  { key: "countries", category: "Countries & geography", source: "REST Countries", home: "https://restcountries.com",
    api: "https://restcountries.com/v3.1/all?fields=name,cca3,region,subregion,capital,population,area,latlng,maps,languages",
    map: d => d.map(c => ({ id: "country-" + c.cca3, name: c.name.common, description: `${c.name.official}. Region: ${c.region}${c.subregion ? " / " + c.subregion : ""}.`,
      date: "", location: (c.capital || [])[0] || "", url: (c.maps || {}).openStreetMaps || "", value: num(c.population), valueLabel: "Population", updated: "",
      meta: { area_km2: c.area, languages: Object.values(c.languages || {}).join(", "), latlng: (c.latlng || []).join(", ") } })) },
  { key: "space", category: "Space & astronomy", source: "SpaceX API (r-spacex)", home: "https://github.com/r-spacex/SpaceX-API",
    api: "https://api.spacexdata.com/v4/launches",
    map: d => d.map(l => ({ id: "launch-" + l.id, name: l.name, description: l.details || "No description supplied by source.",
      date: iso(l.date_utc), location: "", url: (l.links && (l.links.wikipedia || l.links.webcast)) || "https://github.com/r-spacex/SpaceX-API", value: num(l.flight_number), valueLabel: "Flight number", updated: "",
      meta: { success: l.success, upcoming: l.upcoming, rocket_id: l.rocket } })) },
  { key: "weather", category: "Weather", source: "Open-Meteo", home: "https://open-meteo.com",
    api: "https://api.open-meteo.com/v1/forecast?latitude=" + CITIES.map(c => c[1]).join(",") + "&longitude=" + CITIES.map(c => c[2]).join(",") + "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
    map: d => (Array.isArray(d) ? d : [d]).map((w, i) => ({ id: "weather-" + CITIES[i][0].toLowerCase().replace(/\s+/g, "-"), name: "Current weather: " + CITIES[i][0],
      description: `Humidity ${w.current.relative_humidity_2m}%, wind ${w.current.wind_speed_10m} km/h, precipitation ${w.current.precipitation} mm.`,
      date: iso(w.current.time + "Z"), location: CITIES[i][0] + ` (${CITIES[i][1]}, ${CITIES[i][2]})`, url: "https://open-meteo.com/en/docs", value: num(w.current.temperature_2m), valueLabel: "Temperature °C",
      updated: iso(w.current.time + "Z"), meta: { humidity_pct: w.current.relative_humidity_2m, wind_kmh: w.current.wind_speed_10m, elevation_m: w.elevation } })) },
  { key: "quakes", category: "Science (earthquakes)", source: "USGS Earthquake Hazards Program", home: "https://earthquake.usgs.gov",
    api: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
    map: d => d.features.map(f => ({ id: "quake-" + f.id, name: "M" + f.properties.mag + " earthquake", description: f.properties.title,
      date: iso(f.properties.time), location: f.properties.place || "", url: f.properties.url, value: num(f.properties.mag), valueLabel: "Magnitude", updated: iso(f.properties.updated),
      meta: { depth_km: f.geometry.coordinates[2], longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1], tsunami: f.properties.tsunami } })),
    updated: d => iso(d.metadata.generated) },
  { key: "books", category: "Books & authors", source: "Open Library", home: "https://openlibrary.org",
    api: "https://openlibrary.org/search.json?q=subject%3Ascience&sort=editions&limit=100&fields=key,title,author_name,first_publish_year,edition_count,publisher,language",
    map: d => d.docs.map(b => ({ id: "book-" + b.key.split("/").pop(), name: b.title, description: "By " + ((b.author_name || ["unknown author"]).slice(0, 3).join(", ")) + ".",
      date: b.first_publish_year ? String(b.first_publish_year) : "", location: "", url: "https://openlibrary.org" + b.key, value: num(b.edition_count), valueLabel: "Editions", updated: "",
      meta: { publishers: (b.publisher || []).slice(0, 3).join(", "), languages: (b.language || []).slice(0, 5).join(", ") } })) },
  { key: "museums", category: "Museums & culture", source: "Art Institute of Chicago API", home: "https://api.artic.edu/docs/",
    api: "https://api.artic.edu/api/v1/artworks?limit=100&fields=id,title,artist_display,date_display,date_start,place_of_origin,medium_display,dimensions,api_link,updated_at,department_title",
    map: d => d.data.map(a => ({ id: "artwork-" + a.id, name: a.title, description: clip(a.artist_display),
      date: a.date_display || "", location: a.place_of_origin || "", url: "https://www.artic.edu/artworks/" + a.id, value: num(a.date_start), valueLabel: "Start year", updated: iso(a.updated_at),
      meta: { medium: a.medium_display, department: a.department_title, dimensions: a.dimensions } })) },
  { key: "transit", category: "Public transport (bike share)", source: "CityBikes", home: "https://citybik.es",
    api: "https://api.citybik.es/v2/networks",
    map: d => d.networks.map(n => ({ id: "bikenet-" + n.id, name: n.name, description: "Bike-share network operated by " + ([].concat(n.company || []).join(", ") || "unlisted operator") + ".",
      date: "", location: [n.location.city, n.location.country].filter(Boolean).join(", "), url: "https://api.citybik.es" + n.href, value: null, valueLabel: "", updated: "",
      meta: { latitude: n.location.latitude, longitude: n.location.longitude, network_id: n.id } })) },
  { key: "github", category: "GitHub repositories", source: "GitHub REST API", home: "https://docs.github.com/en/rest", github: true,
    api: "https://api.github.com/search/repositories?q=stars:%3E50000&sort=stars&order=desc&per_page=100",
    map: d => d.items.map(r => ({ id: "repo-" + r.id, name: r.full_name, description: r.description || "No description.",
      date: iso(r.created_at), location: "", url: r.html_url, value: num(r.stargazers_count), valueLabel: "Stars", updated: iso(r.updated_at),
      meta: { language: r.language, forks: r.forks_count, open_issues: r.open_issues_count, license: r.license && r.license.spdx_id, topics: (r.topics || []).slice(0, 5).join(", ") } })) },
  { key: "programming", category: "Programming languages", source: "GitHub REST API (topic search)", home: "https://docs.github.com/en/rest/search", github: true,
    api: "https://api.github.com/search/repositories?q=topic:programming-language&sort=stars&order=desc&per_page=100",
    map: d => d.items.map(r => ({ id: "lang-" + r.id, name: r.full_name, description: r.description || "No description.",
      date: iso(r.created_at), location: "", url: r.html_url, value: num(r.stargazers_count), valueLabel: "Stars", updated: iso(r.pushed_at),
      meta: { implementation_language: r.language, forks: r.forks_count, license: r.license && r.license.spdx_id } })) },
  { key: "npm", category: "Open-source packages", source: "npm Registry", home: "https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md",
    api: "https://registry.npmjs.org/-/v1/search?text=keywords:framework&size=100",
    map: d => d.objects.map(o => ({ id: "npm-" + o.package.name.replace(/[^\w.-]/g, "_"), name: o.package.name, description: o.package.description || "No description.",
      date: iso(o.package.date), location: "", url: (o.package.links && o.package.links.npm) || "", value: num(Math.round(o.score.final * 1000) / 1000), valueLabel: "npm score (0-1)", updated: iso(o.package.date),
      meta: { version: o.package.version, publisher: o.package.publisher && o.package.publisher.username, keywords: (o.package.keywords || []).slice(0, 5).join(", ") } })) }
];

// One normal HTTPS request per source per render. No auth tricks: GitHub gets an optional
// GITHUB_TOKEN (your own, set in Vercel env vars) which is GitHub's documented way to get a higher limit.
async function fetchSource(s) {
  const headers = { Accept: s.github ? "application/vnd.github+json" : "application/json", "User-Agent": UA };
  if (s.github && process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  const res = await fetch(s.api, { headers, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const recs = s.map(data).slice(0, PER_SOURCE_CAP).map(r => ({ ...r, category: s.category, source: s.source, sourceUrl: s.home, dataset: s.key }));
  const times = recs.map(r => r.updated).filter(Boolean).sort();
  return { recs, updated: (s.updated ? s.updated(data) : times[times.length - 1]) || "" };
}

const attrs = r => `data-id="${esc(r.id)}" data-name="${esc(r.name)}" data-category="${esc(r.category)}" data-date="${esc(r.date)}" data-location="${esc(r.location)}" data-url="${esc(r.url)}" data-source="${esc(r.source)}" data-value="${r.value ?? ""}" data-updated="${esc(r.updated)}"`;
const metaText = r => Object.entries(r.meta).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join("; ");

const cardHtml = r => `
<article class="record record-card" ${attrs(r)}>
  <span class="record-category">${esc(r.category)}</span>
  <h3 class="record-name">${esc(r.name)}</h3>
  <div class="record-id">ID: <span class="field-id">${esc(r.id)}</span></div>
  <p class="record-description">${esc(clip(r.description))}</p>
  <dl class="record-fields">
    <dt>Date</dt><dd class="field-date">${esc(r.date || "n/a")}</dd>
    <dt>Location</dt><dd class="field-location">${esc(r.location || "n/a")}</dd>
    <dt>${esc(r.valueLabel || "Value")}</dt><dd class="field-value">${r.value ?? "n/a"}</dd>
    <dt>Updated</dt><dd class="field-updated">${r.updated ? `<time datetime="${esc(r.updated)}">${esc(r.updated)}</time>` : "not provided"}</dd>
    <dt>Source</dt><dd class="field-source"><a href="${esc(r.sourceUrl)}" rel="noopener">${esc(r.source)}</a></dd>
    <dt>Record URL</dt><dd class="field-url">${r.url ? `<a href="${esc(r.url)}" rel="noopener">link</a>` : "n/a"}</dd>
  </dl>
  <div class="record-meta field-meta">${esc(metaText(r))}</div>
</article>`;

const rowHtml = r => `
<tr class="record record-row" ${attrs(r)}><td class="field-id">${esc(r.id)}</td><td class="field-name">${esc(r.name)}</td><td class="field-category">${esc(r.category)}</td><td class="field-date">${esc(r.date)}</td><td class="field-location">${esc(r.location)}</td><td class="field-value" title="${esc(r.valueLabel)}">${r.value ?? ""}</td><td class="field-updated">${esc(r.updated)}</td><td class="field-source"><a href="${esc(r.sourceUrl)}" rel="noopener">${esc(r.source)}</a> | ${r.url ? `<a href="${esc(r.url)}" rel="noopener">record</a>` : "n/a"}</td></tr>`;

function renderPage(results, generated) {
  const records = [], seen = new Set();
  results.forEach(x => (x.recs || []).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); records.push(r); } }));
  const categories = [...new Set(records.map(r => r.category))].sort();
  const okCount = results.filter(x => x.ok).length;
  const sourceRows = SOURCES.map((s, i) => {
    const x = results[i];
    return `<tr class="source-row" data-dataset="${s.key}" data-status="${x.ok ? "ok" : "error"}"><td>${esc(s.key)}</td><td>${esc(s.category)}</td>
<td><a href="${esc(s.home)}" rel="noopener">${esc(s.source)}</a> (<a href="${esc(s.api)}" rel="noopener">API request</a>)</td>
<td class="src-status ${x.ok ? "status-ok" : "status-error"}">${x.ok ? "Loaded" : "Unavailable: " + esc(x.error)}</td><td class="src-count">${x.ok ? x.recs.length : 0}</td>
<td class="src-updated">${esc(x.ok ? (x.updated || "Not provided by source") : "-")}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RealData Explorer</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header">
  <h1 class="site-title">RealData Explorer</h1>
  <p class="site-intro">A practice site for legal web scraping. Every record below was fetched from a public, no-login API by the server and is already in the HTML you receive, so <code>requests</code> and BeautifulSoup are enough. Nothing is invented: a source that failed is marked unavailable.</p>
</header>
<main class="site-main" id="main">
  <section class="panel" aria-labelledby="sources-heading">
    <h2 id="sources-heading">Data sources</h2>
    <div class="table-wrap"><table class="sources-table" id="sources-table">
      <thead><tr><th>Dataset</th><th>Category</th><th>Source</th><th>Status</th><th>Records</th><th>Source updated</th></tr></thead>
      <tbody id="sources-body">${sourceRows}</tbody></table></div>
    <p class="note">Page generated <time datetime="${generated}">${generated}</time>. The server makes one request per source and caches the page for a few minutes to respect each provider's rate limits.</p>
  </section>
  <section class="panel" aria-labelledby="controls-heading">
    <h2 id="controls-heading">Search, filter and sort</h2>
    <div class="controls">
      <label>Search<input type="search" id="search" placeholder="Name, description, location..."></label>
      <label>Category<select id="category"><option value="">All categories</option>${categories.map(c => `<option>${esc(c)}</option>`).join("")}</select></label>
      <label>Sort by<select id="sort"><option value="name">Name</option><option value="category">Category</option><option value="date">Date</option><option value="value">Numeric value</option><option value="location">Location</option><option value="id">ID</option></select></label>
      <label>Direction<select id="dir"><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      <label>Per page<select id="pagesize"><option>10</option><option selected>20</option><option>50</option><option>100</option></select></label>
      <div><button type="button" id="btn-cards" class="is-active">Cards</button> <button type="button" id="btn-table">Table</button></div>
    </div>
  </section>
  <p class="record-count" id="record-count" aria-live="polite" data-loaded="${records.length}" data-matching="${records.length}" data-generated="${generated}">${records.length} records from ${okCount} of ${SOURCES.length} sources.</p>
  <div id="results" data-view="cards">
    <div class="view-cards card-grid" id="card-grid" aria-label="Records as cards">${records.map(cardHtml).join("")}</div>
    <div class="view-table table-wrap"><table class="records-table" id="records-table">
      <thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Date</th><th>Location</th><th>Value</th><th>Updated</th><th>Source</th></tr></thead>
      <tbody id="records-body">${records.map(rowHtml).join("")}</tbody></table></div>
  </div>
  <nav class="pagination" aria-label="Pagination"><button type="button" id="prev">Previous</button><span id="page-info" data-page="1" data-pages="1"></span><button type="button" id="next">Next</button></nav>
  <section class="panel" aria-labelledby="tips-heading">
    <h2 id="tips-heading">Scraping tips</h2>
    <p class="note">Try <code>soup.select("article.record-card")</code>, then read <code>card["data-id"]</code>, <code>data-name</code>, <code>data-value</code>. Table rows are <code>tr.record-row</code> with the same attributes. All records are in the HTML; the page controls only show and hide them.</p>
  </section>
</main>
<footer class="site-footer note">Data belongs to the sources listed above; check each source's terms before reusing it.</footer>
<script src="/app.js" defer></script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));
  const results = settled.map(p => p.status === "fulfilled"
    ? { ok: true, ...p.value }
    : { ok: false, error: String((p.reason && p.reason.message) || p.reason).slice(0, 80), recs: [] });
  const allOk = results.every(r => r.ok);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Cache at Vercel's edge so upstream APIs are hit rarely; retry sooner if something failed.
  res.setHeader("Cache-Control", allOk ? "public, s-maxage=900, stale-while-revalidate=3600" : "public, s-maxage=60, stale-while-revalidate=300");
  res.end(renderPage(results, new Date().toISOString()));
};
module.exports.renderPage = renderPage;

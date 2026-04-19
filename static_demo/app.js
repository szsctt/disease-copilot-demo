const DATA_INDEX_PATH = "./data/index.json";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function parseCitations(citationsJson) {
  if (!citationsJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(citationsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function citationKey(citation) {
  const doi = citation.doi || "(no-doi)";
  const chunk = citation.chunk_index ?? citation.paragraph_index ?? "?";
  const s = citation.highlight_start_word ?? "?";
  const e = citation.highlight_end_word ?? "?";
  const startWords = citation.start_words || "";
  const endWords = citation.end_words || "";
  return `${doi}|${chunk}|${s}|${e}|${startWords}|${endWords}`;
}

function citationSnippet(citation) {
  const text = citation.chunk_text || citation.chunk_text_raw || citation.quote || "";
  if (!text) {
    return "(no supporting snippet available)";
  }
  return text;
}

function formatSnippetHtml(snippet) {
  const escaped = escapeHtml(snippet);
  return escaped.replace(/\*\*(.*?)\*\*/g, "<mark>$1</mark>");
}

function buildCitationRegistry(scores) {
  const byKey = new Map();
  const ordered = [];

  for (const score of scores) {
    const citations = parseCitations(score.citations_json);
    for (const citation of citations) {
      const key = citationKey(citation);
      if (!byKey.has(key)) {
        const entry = {
          number: ordered.length + 1,
          key,
          citation,
        };
        byKey.set(key, entry);
        ordered.push(entry);
      }
    }
  }

  return { byKey, ordered };
}

function renderSummaryCards(result) {
  const cards = [
    { label: "Last Run (UTC)", value: result.last_run_at ?? "-" },
    { label: "Papers", value: (result.papers || []).length },
  ];

  const container = document.getElementById("summaryCards");
  container.innerHTML = cards
    .map(
      (card) => `
      <div class="col-12 col-sm-6 col-lg-6">
        <div class="summary-card p-3 h-100">
          <div class="text-body-secondary small">${card.label}</div>
          <div class="fw-semibold mt-1">${escapeHtml(card.value)}</div>
        </div>
      </div>`
    )
    .join("");
}

function renderScoresTable(scores, registry) {
  const tbody = document.querySelector("#scoresTable tbody");
  const rows = [];

  for (const score of scores) {
    const citations = parseCitations(score.citations_json);
    const refs = citations
      .map((citation) => registry.byKey.get(citationKey(citation))?.number)
      .filter((number) => Number.isInteger(number));
    const citationRefs = refs.length
      ? refs
          .map((n) => `<span class="badge text-bg-light citation-ref">[${escapeHtml(n)}]</span>`)
          .join(" ")
      : '<span class="text-body-secondary">none</span>';

    rows.push(`
      <tr>
        <td class="fw-semibold">${escapeHtml(score.criterion_name ?? "")}</td>
        <td>${escapeHtml(score.score ?? "")}</td>
        <td>${escapeHtml(score.confidence ?? "")}</td>
        <td>${escapeHtml(score.rationale ?? "")}</td>
        <td>${citationRefs}</td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("");
}

function renderCitations(registry) {
  const container = document.getElementById("citationsList");
  if (!registry.ordered.length) {
    container.innerHTML = '<div class="text-body-secondary">No citations available.</div>';
    return;
  }

  container.innerHTML = registry.ordered
    .map(({ number, citation }) => {
      const doi = citation.doi || "(no DOI)";
      const pmid = citation.pmid ? `PMID ${citation.pmid}` : null;
      const pmcid = citation.pmcid ? `PMCID ${citation.pmcid}` : null;
      const ids = [pmid, pmcid].filter(Boolean).join(" | ");
      const chunk = citation.chunk_index ?? citation.paragraph_index ?? "unknown";
      const meta = ids ? `${ids} | chunk ${chunk}` : `chunk ${chunk}`;
      const snippet = citationSnippet(citation);

      return `
        <article class="card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <h3 class="h6 mb-1">[${escapeHtml(number)}] DOI ${escapeHtml(doi)}</h3>
              <span class="text-body-secondary small">${escapeHtml(meta)}</span>
            </div>
            <div class="evidence-quote mt-2">${formatSnippetHtml(snippet)}</div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDiseaseMeta(result) {
  const paperLines = (result.papers || []).map((paper) => {
    const doi = paper.doi || "(no DOI)";
    const title = paper.title || "(no title)";
    return `<li><span class="fw-semibold">${escapeHtml(doi)}</span>: ${escapeHtml(title)}</li>`;
  });

  const meta = document.getElementById("diseaseMeta");
  meta.innerHTML = `
    <div class="mb-1"><span class="fw-semibold">Papers in run:</span> ${(result.papers || []).length}</div>
    <ul class="ps-3 mb-0 small">${paperLines.join("")}</ul>
  `;
}

function renderResult(result) {
  document.getElementById("pageTitle").textContent = `${result.disease_name || "Disease"} report`;
  const scores = Array.isArray(result.scores) ? result.scores : [];
  const registry = buildCitationRegistry(scores);

  renderSummaryCards(result);
  renderScoresTable(scores, registry);
  renderCitations(registry);
  renderDiseaseMeta(result);
}

async function loadAndRenderDisease(path) {
  const result = await fetchJson(path);
  renderResult(result);
}

async function init() {
  const index = await fetchJson(DATA_INDEX_PATH);
  const diseases = Array.isArray(index.diseases) ? index.diseases : [];
  if (!diseases.length) {
    throw new Error("No diseases listed in data/index.json");
  }

  const select = document.getElementById("diseaseSelect");
  select.innerHTML = diseases
    .map(
      (disease, idx) =>
        `<option value="${escapeHtml(disease.path)}" ${idx === 0 ? "selected" : ""}>${escapeHtml(
          disease.label || disease.path
        )}</option>`
    )
    .join("");

  select.addEventListener("change", async (event) => {
    const selectedPath = event.target.value;
    await loadAndRenderDisease(selectedPath);
  });

  await loadAndRenderDisease(diseases[0].path);
}

init().catch((err) => {
  const container = document.getElementById("citationsList");
  container.innerHTML = `<div class="alert alert-danger" role="alert">Failed to load demo data: ${err.message}</div>`;
});

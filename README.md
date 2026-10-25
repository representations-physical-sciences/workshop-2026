# RPS 2026 workshop website

Static HTML, CSS, and JavaScript, served directly by GitHub Pages. No application server, package installation, or client-side routing is required.

## Accepted papers

Edit `data/papers.json`, then run:

```sh
python3 scripts/build-papers.py
```

For final camera-ready publication, use the screening dashboard as the source
of truth. Run `python3 camera_ready_review.py` from `../openreview-tools` (or
`--port 8877` alongside an older session). Choose each paper's publication
decision, click **Save publication decision**, then click **EXPORT FOR MAIN SITE**. Automated passes are included
by default. One final decision controls both the Ready for export group and the
bundle: approve with a PDF, approve without a PDF, leave pending, or hide. You can hide a paper, list it
without a PDF, or upload and approve a replacement/redacted/emailed PDF.

Import the resulting bundle from this repository:

```sh
python3 scripts/import-screened-papers.py "/path/to/main-site-bundle.zip" --dry-run
python3 scripts/import-screened-papers.py "/path/to/main-site-bundle.zip"
```

The import validates all selected PDFs and renders the pages, then replaces
`data/papers.json`, `papers.html`, and generated `papers/*.html`. Approved PDFs
are copied to `assets/papers/`. `data/paper-bundle-manifest.json` tracks imported
files so later imports remove previously imported PDFs that are now withheld.
Excluded papers' generated pages are also removed. Commit those files together.
The export itself leaves the website unchanged. Existing presentation/video
assignments are retained, while publication choices and camera-ready metadata
come from final screening. No screening notes or private email fields enter the
public bundle. See `../openreview-tools/README.md` for the full workflow.

The following older importer is for initial acceptance metadata only and does
not apply final-screening publication choices.

The adjacent `openreview-tools` workspace includes an importer for accepted
submission metadata. Once every accepted paper has a presentation assignment,
create `data/presentation-assignments.csv` with columns
`submission_number,type,session,time`, then run from `../openreview-tools`:

```sh
uvx --from openreview-py --with python-dotenv python import_accepted_papers.py \
  --assignments ../workshop-2026/data/presentation-assignments.csv
```

Use `poster` with `morning` or `afternoon` in `session`, or `oral` with a Paris
local `HH:MM` value or `TBD` in `time`; leave the other column empty. TBD oral
times display as “time TBD” until the schedule is finalized. The importer stops
if an accepted paper is unassigned. It does not download PDFs and includes an
OpenReview PDF link only for submissions with public-release consent. Review
the generated JSON, then run the site generator above.

Commit the data and generated `papers.html` and `papers/*.html` together. The generator uses `templates/papers-layout.html` for the shared layout. Each paper has a stable URL based on its slug; keep the slug unchanged when correcting a title. Entries appear in the order supplied in the data. Example data below is illustrative only. Until the final schedule is assigned, use `"session": "TBD"` for posters and `"time": "TBD"` for orals.

```json
[
  {
    "slug": "example-paper",
    "title": "Example paper title",
    "authors": ["First Author", "Second Author"],
    "abstract": "First paragraph.\n\nSecond paragraph.",
    "presentation": {"type": "poster", "session": "morning"},
    "pdf": null,
    "video": null
  }
]
```

Use `"session": "afternoon"` for the afternoon poster session. Both sessions display time TBD. Use `"session": "TBD"` when the morning/afternoon assignment is not final; this is the current publication setting for posters. For an oral presentation use `"presentation": {"type": "oral", "time": "10:30"}`; times are in 24-hour format, local to Paris on 13 December 2026 (CET). Use `"time": "TBD"` until oral times are assigned.

`pdf` is optional: omit it or set it to `null` when authors have not agreed to publication. **Do not place private submissions anywhere in the website repository.** For a public PDF use a root-relative asset path such as `"assets/papers/example-paper.pdf"` or an HTTPS URL. The detail page includes a PDF viewer and an open-PDF link; browser PDF support varies, especially on mobile. Remote hosts must permit embedding.

`video` is independently optional. Supported forms:

```json
{"type": "file", "url": "assets/videos/example-paper.mp4", "captions": "assets/videos/example-paper.en.vtt"}
```

```json
{"type": "youtube", "id": "VIDEO_ID_11"}
```

```json
{"type": "vimeo", "id": "123456789"}
```

```json
{"type": "loom", "id": "0123456789abcdef0123456789abcdef"}
```

File URLs may be HTTPS URLs or paths under `assets/`; MP4 and WebM are supported. English WebVTT captions are optional. Hosted videos must allow public playback and embedding. Third-party players load only after clicking “Load video poster”; a direct watch link also works without JavaScript. Use a downloadable MP4 to publish a recording from any other recorder. The site does not record submissions or enforce video duration: check the five-minute limit before publishing. Large video files are better served by a video host than GitHub Pages.

The generator rejects duplicate or unsafe slugs, incomplete metadata, invalid oral times, and unsupported media values before writing pages. Removing an entry removes its generated detail page on the next build; manually authored HTML in `papers/` is preserved.

The catalogue includes live search across titles, authors, and abstracts. It matches all whitespace-separated search words in any order, without regard to case, and supports partial words. Matching text is highlighted; abstract matches show a short excerpt. Clearing the search restores the full list. Search runs entirely in the browser, and the complete catalogue remains available without JavaScript. Rebuild after changing paper data to update the searchable abstracts.

Titles and abstracts support KaTeX math: `$...$` or `\(...\)` for inline formulas, and `$$...$$` or `\[...\]` for display formulas. Keep the LaTeX in `papers.json`; JSON requires backslashes to be escaped, for example `"title": "Learning $\\Delta p\\mathrm{CO}_2$"`. When generating JSON in Python, pass ordinary strings to `json.dump` to handle escaping automatically. KaTeX 0.19.0 is loaded from jsDelivr on paper pages. Unsupported math remains visible as source text; untrusted HTML commands are disabled. Search still matches the original LaTeX and surrounding prose, highlights matching formulas as a whole, and keeps formulas intact in excerpts.

## Paper discovery map

The map at the top of `papers.html` is a topic landscape with an integrated
search field and paper list. Click a coloured topic label or chip to filter and
zoom to that group; click a dot or a search result for the full abstract and
related papers. Hover a dot for an immediate title/author preview. Drag to pan,
scroll or use +/− to zoom, and use **Fit map** to recover the view. Titles appear
when zooming closer. Touch supports pan and pinch. **Expand map** opens a larger
workspace; Escape closes it. Dots and topics also support keyboard selection.

Generate embeddings from all published titles and full abstracts, then build:

```sh
uv run scripts/build-paper-map.py
python3 scripts/build-papers.py
```

The standalone script declares pinned dependencies for `uv` and selects Python
3.11–3.13. The default encoder is the local `all-MiniLM-L6-v2` sentence-transformer,
pinned to a model revision. The first run downloads packages and the model;
papers are encoded locally, with no external embedding API. Long abstracts are
split into token-bounded chunks, each prefixed by the title, then length-weighted
and averaged. Full vectors, slugs, input hash and encoder identity are cached in
`data/paper-map.npz`. An unchanged catalogue reuses those vectors.

Scikit-learn computes up to 50 SVD components and a seeded t-SNE layout
(perplexity up to 8, 2,000 iterations), plus PCA coordinates for other uses.
K-means groups the original embeddings into seven topics. Names are matched to
a small scientific vocabulary by the groups' TF-IDF centroids; they are broad,
automatic descriptions, and papers can connect across topics. Related papers
are ranked by cosine similarity in full embedding space. The JSON records the
model revision, seed, parameters, library version and local trustworthiness.
Plot orientation is rotated to fit a landscape viewport, preserving distances.

The script accepts `--data`, `--output`, `--seed` (42), `--topics` (7), and
`--encoder semantic|tfidf`. For a model-free build use:

```sh
uv run scripts/build-paper-map.py --encoder tfidf
```

The TF-IDF backend itself needs only `scikit-learn==1.7.2`, so it can also run
with `python3 scripts/build-paper-map.py --encoder tfidf` in a suitably installed
environment. Its recommendations use lexical rather than semantic similarity.
Exact numerical results may vary across platforms.

The site generator still uses only Python's standard library. It embeds the
small map JSON into the catalogue; full vectors and the model never load in the
browser. Commit `data/paper-map.json`, `data/paper-map.npz`, generated HTML, the
script and frontend assets together. A fingerprint prevents stale maps from
appearing. Screened imports preserve a matching map and remove stale JSON and
vector caches, so excluded papers do not remain in those artifacts. Regenerate
the map and pages after catalogue updates. Alternate catalogues look for
`paper-map.json` beside their input JSON. Without JavaScript or matching map
data, the full static catalogue remains available.

## Preview and checks

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://localhost:8765. To check the generator and scripts:

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
node --check assets/js/site.js
node --check assets/js/papers.js
node --check assets/js/paper-map.js
```

For sample-data previews without publishing examples, use `--data /tmp/sample-papers.json --output /tmp/rps-preview`. Copy `assets/`, `index.html`, and `privacy.html` into that preview directory to serve the whole site.

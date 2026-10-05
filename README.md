# RPS 2026 workshop website

Static HTML, CSS, and JavaScript, served directly by GitHub Pages. No application server, package installation, or client-side routing is required.

## Accepted papers

Edit `data/papers.json`, then run:

```sh
python3 scripts/build-papers.py
```

Commit the data and generated `papers.html` and `papers/*.html` together. The generator uses `templates/papers-layout.html` for the shared layout. Each paper has a stable URL based on its slug; keep the slug unchanged when correcting a title. Entries appear in the order supplied in the data. The current catalogue is empty pending the accepted-paper list; example data below is illustrative only.

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

Use `"session": "afternoon"` for the afternoon poster session. Both sessions display time TBD. For an oral presentation use `"presentation": {"type": "oral", "time": "10:30"}`; times are in 24-hour format, local to Paris on 13 December 2026 (CET).

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

## Preview and checks

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://localhost:8765. To check the generator and scripts:

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
node --check assets/js/site.js
node --check assets/js/papers.js
```

For sample-data previews without publishing examples, use `--data /tmp/sample-papers.json --output /tmp/rps-preview`. Copy `assets/`, `index.html`, and `privacy.html` into that preview directory to serve the whole site.

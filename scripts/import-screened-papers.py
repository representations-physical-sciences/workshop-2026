#!/usr/bin/env python3
"""Validate a final-screening ZIP, import selected papers/PDFs, and build pages."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FIELDS = {'slug', 'title', 'authors', 'abstract', 'presentation', 'pdf', 'video', 'openreview_id', 'openreview_url'}
PDF_PATH = re.compile(r'assets/papers/[a-z0-9]+(?:-[a-z0-9]+)*\.pdf')


def builder_module():
    spec = importlib.util.spec_from_file_location('site_builder', ROOT / 'scripts/build-papers.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_bundle(path):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        names = {entry.filename for entry in entries}
        if len(names) != len(entries) or not {'data/papers.json', 'manifest.json'} <= names:
            raise ValueError('Bundle has duplicate entries or is missing metadata / manifest')
        if sum(entry.file_size for entry in entries) > 512 * 1024 * 1024:
            raise ValueError('Bundle exceeds 512 MB uncompressed')
        for entry in entries:
            limit = 25 * 1024 * 1024 if PDF_PATH.fullmatch(entry.filename) else 20 * 1024 * 1024
            if entry.file_size > limit:
                raise ValueError(f'Bundle entry is too large: {entry.filename}')
        papers = json.loads(archive.read('data/papers.json'))
        manifest = json.loads(archive.read('manifest.json'))
        builder_module().validate(papers)
        if not papers or manifest.get('version') != 1 or not isinstance(manifest.get('papers'), list):
            raise ValueError('Unsupported or empty paper bundle')
        items = manifest['papers']
        if len(items) != len(papers) or len({item['slug'] for item in items}) != len(items):
            raise ValueError('Manifest must describe every paper exactly once')
        by_slug = {item['slug']: item for item in items}
        expected_names = {'data/papers.json', 'manifest.json'}
        payloads = {}
        for paper in papers:
            if set(paper) - PUBLIC_FIELDS:
                raise ValueError(f'{paper["slug"]}: unexpected non-public fields')
            item = by_slug.get(paper['slug'])
            if item is None or paper.get('pdf') != item.get('pdf'):
                raise ValueError('Manifest disagrees with paper metadata')
            pdf = paper.get('pdf')
            if pdf is not None:
                if not PDF_PATH.fullmatch(pdf) or pdf != f'assets/papers/{paper["slug"]}.pdf':
                    raise ValueError('Bundle PDF must use the paper slug under assets/papers/')
                if pdf not in names:
                    raise ValueError(f'Missing selected PDF: {pdf}')
                content = archive.read(pdf)
                if b'%PDF-' not in content[:1024] or hashlib.sha256(content).hexdigest() != item.get('sha256'):
                    raise ValueError(f'PDF checksum mismatch: {pdf}')
                expected_names.add(pdf)
                payloads[pdf] = content
        if names != expected_names:
            raise ValueError('Bundle contains unexpected files; only selected PDFs and metadata are allowed')
    return papers, manifest, payloads


def atomic_bytes(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f'.{path.name}.', suffix='.tmp')
    temporary = Path(temporary)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(content)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def import_bundle(path, output=ROOT, dry_run=False):
    papers, manifest, payloads = read_bundle(path)
    builder = builder_module()
    # Render every new page before touching the existing website.
    with tempfile.TemporaryDirectory(prefix='screened-paper-import-') as temporary:
        staging = Path(temporary)
        source = staging / 'data/papers.json'
        source.parent.mkdir()
        source.write_text(json.dumps(papers, ensure_ascii=False, indent=2) + '\n')
        # A discovery map is public data too: retain it only for the exact incoming
        # catalogue. Otherwise removed papers could remain in its raw JSON.
        map_path = output.resolve() / 'data/paper-map.json'
        keep_map = False
        if map_path.exists():
            try:
                map_data = json.loads(map_path.read_text())
                fields = [{key: paper[key] for key in ('slug', 'title', 'authors', 'abstract')} for paper in papers]
                fingerprint = hashlib.sha256(json.dumps(fields, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
                slugs = {paper['slug'] for paper in papers}
                keep_map = (map_data.get('version') == 2 and map_data.get('fingerprint') == fingerprint
                            and {paper['slug'] for paper in map_data['papers']} == slugs
                            and all(neighbour['slug'] in slugs for paper in map_data['papers'] for neighbour in paper['neighbours']))
            except (ValueError, KeyError, TypeError):
                keep_map = False
            if keep_map:
                (staging / 'data/paper-map.json').write_bytes(map_path.read_bytes())
        builder.build(source, staging)
        if dry_run:
            print(f'Valid bundle: {len(papers)} papers, {len(payloads)} PDFs. No website files changed.')
            return
        output = output.resolve()
        previous = output / 'data/paper-bundle-manifest.json'
        obsolete_pdfs = set()
        if previous.exists():
            old = json.loads(previous.read_text())
            for item in old.get('papers', []):
                pdf = item.get('pdf')
                if isinstance(pdf, str) and PDF_PATH.fullmatch(pdf) and pdf not in payloads:
                    obsolete_pdfs.add(pdf)
        generated_names = {f'papers/{paper["slug"]}.html' for paper in papers}
        obsolete_pages = [page for page in (output / 'papers').glob('*.html')
                          if page.relative_to(output).as_posix() not in generated_names
                          and builder.MARKER in page.read_text()]
        # The complete incoming publication set replaces the previous catalogue.
        for name, content in payloads.items():
            atomic_bytes(output / name, content)
        for page in [source, staging / 'papers.html', *(staging / 'papers').glob('*.html')]:
            atomic_bytes(output / page.relative_to(staging), page.read_bytes())
        atomic_bytes(previous, (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode())
        if not keep_map:
            map_path.unlink(missing_ok=True)
            map_path.with_suffix('.npz').unlink(missing_ok=True)
        for name in obsolete_pdfs:
            (output / name).unlink(missing_ok=True)
        for page in obsolete_pages:
            page.unlink()
    print(f'Imported {len(papers)} screened papers and {len(payloads)} selected PDFs into {output}.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path, help='ZIP produced by EXPORT FOR MAIN SITE')
    parser.add_argument('--output', type=Path, default=ROOT, help='Website directory (default: this repository)')
    parser.add_argument('--dry-run', action='store_true', help='Validate PDFs, metadata and page generation without changing the website')
    args = parser.parse_args()
    try:
        import_bundle(args.bundle, args.output, args.dry_run)
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
        parser.exit(1, f'Cannot import screened paper bundle: {error}\n')


if __name__ == '__main__':
    main()

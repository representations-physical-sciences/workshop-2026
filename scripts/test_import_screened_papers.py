"""Verify screened bundle imports do not retain withdrawn pages or private PDFs."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('import_screened', Path(__file__).with_name('import-screened-papers.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class ImportTests(unittest.TestCase):
    def bundle(self, root, pdf=True, slug='paper-1', bad_hash=False, extra=None):
        paper = {'slug': slug, 'title': 'Final camera-ready title', 'authors': ['A Person'],
                 'abstract': 'Final abstract', 'presentation': {'type': 'poster', 'session': 'morning'},
                 'pdf': f'assets/papers/{slug}.pdf' if pdf else None, 'video': None,
                 'openreview_id': 'note1', 'openreview_url': 'https://openreview.net/forum?id=note1'}
        content = b'%PDF-1.4\nAPPROVED PDF\n%%EOF'
        item = {'submission_number': 1, 'slug': slug, 'pdf': paper['pdf']}
        if pdf:
            item['sha256'] = 'wrong' if bad_hash else hashlib.sha256(content).hexdigest()
        path = root / 'bundle.zip'
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('data/papers.json', json.dumps([paper]))
            archive.writestr('manifest.json', json.dumps({'version': 1, 'papers': [item]}))
            if pdf: archive.writestr(paper['pdf'], content)
            if extra: archive.writestr(extra, 'PRIVATE')
        return path

    def test_import_and_later_withholding_remove_only_managed_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = root / 'site'
            importer.import_bundle(self.bundle(root), output)
            self.assertTrue((output / 'assets/papers/paper-1.pdf').exists())
            self.assertIn('Final camera-ready title', (output / 'papers/paper-1.html').read_text())
            manual = output / 'papers/manual.html'; manual.write_text('Keep this manual page')
            asset = output / 'assets/papers/manual.pdf'; asset.write_bytes(b'Keep this manual asset')
            importer.import_bundle(self.bundle(root, pdf=False, slug='paper-2'), output)
            self.assertFalse((output / 'assets/papers/paper-1.pdf').exists())
            self.assertFalse((output / 'papers/paper-1.html').exists())
            self.assertTrue(manual.exists())
            self.assertTrue(asset.exists())
            papers = json.loads((output / 'data/papers.json').read_text())
            self.assertIsNone(papers[0]['pdf'])

    def test_import_preserves_current_map_and_removes_stale_public_map_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = root / 'site'
            importer.import_bundle(self.bundle(root), output)
            papers = json.loads((output / 'data/papers.json').read_text())
            fields = [{key: paper[key] for key in ('slug', 'title', 'authors', 'abstract')} for paper in papers]
            fingerprint = hashlib.sha256(json.dumps(fields, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
            map_path = output / 'data/paper-map.json'
            map_path.write_text(json.dumps({'version': 2, 'fingerprint': fingerprint,
                                           'papers': [{'slug': 'paper-1', 'neighbours': []}]}))
            map_path.with_suffix('.npz').write_bytes(b'cached full-dimensional vectors')
            original = map_path.read_bytes()
            importer.import_bundle(self.bundle(root), output)
            self.assertEqual(map_path.read_bytes(), original)
            self.assertIn('data-paper-map-data', (output / 'papers.html').read_text())
            importer.import_bundle(self.bundle(root, slug='paper-2'), output, dry_run=True)
            self.assertTrue(map_path.exists())
            importer.import_bundle(self.bundle(root, slug='paper-2'), output)
            self.assertFalse(map_path.exists())
            self.assertFalse(map_path.with_suffix('.npz').exists())
            self.assertNotIn('data-paper-map-data', (output / 'papers.html').read_text())

    def test_validation_failure_and_dry_run_do_not_change_site(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = root / 'site'
            importer.import_bundle(self.bundle(root), output)
            original = (output / 'data/papers.json').read_bytes()
            for args in [{'bad_hash': True}, {'extra': '../private.txt'}, {'extra': 'review_decisions.json'}]:
                with self.subTest(args=args), self.assertRaises(ValueError):
                    importer.import_bundle(self.bundle(root, **args), output)
                self.assertEqual((output / 'data/papers.json').read_bytes(), original)
            importer.import_bundle(self.bundle(root, pdf=False), output, dry_run=True)
            self.assertEqual((output / 'data/papers.json').read_bytes(), original)
            self.assertTrue((output / 'assets/papers/paper-1.pdf').exists())


if __name__ == '__main__':
    unittest.main()

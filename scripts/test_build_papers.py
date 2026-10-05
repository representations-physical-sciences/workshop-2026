"""Integration checks for generated pages and publication boundaries."""
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('build_papers', Path(__file__).with_name('build-papers.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

PAPER = {
    'slug': 'example-paper',
    'title': 'Geometry & <Structure>',
    'authors': ['Alice Example', 'Bob Example'],
    'abstract': 'First paragraph.\n\nSecond paragraph with <script>markup</script>.',
    'presentation': {'type': 'poster', 'session': 'morning'},
}


class PaperPagesTests(unittest.TestCase):
    def generate(self, papers, root):
        source = root / 'data.json'
        source.write_text(json.dumps(papers))
        builder.build(source, root)
        return (root / 'papers.html').read_text()

    def test_publication_without_media_and_static_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            listing = self.generate([PAPER], root)
            detail = (root / 'papers/example-paper.html').read_text()
            for page in (listing, detail):
                self.assertIn('Geometry &amp; &lt;Structure&gt;', page)
                self.assertIn('Alice Example, Bob Example', page)
                self.assertIn('Morning', page)
                self.assertIn('(time TBD)', page)
            self.assertIn('href="papers/example-paper.html"', listing)
            self.assertIn('href="../papers.html"', detail)
            self.assertIn('src="../assets/js/site.js"', detail)
            self.assertIn('First paragraph.</p><p>Second paragraph', detail)
            self.assertNotIn('<script>markup', detail)
            self.assertNotIn('<object', detail)
            self.assertNotIn('<video', detail)
            self.assertNotIn('data-video-embed', detail)

    def test_schedules_pdf_and_file_video(self):
        oral = copy.deepcopy(PAPER)
        oral.update(presentation={'type': 'oral', 'time': '10:30'}, pdf='assets/papers/public.pdf',
                    video={'type': 'file', 'url': 'assets/videos/poster.mp4', 'captions': 'assets/videos/poster.vtt'})
        afternoon = copy.deepcopy(PAPER)
        afternoon.update(slug='afternoon-paper', presentation={'type': 'poster', 'session': 'afternoon'})
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            listing = self.generate([oral, afternoon], root)
            page = (root / 'papers/example-paper.html').read_text()
            self.assertIn('10:30 (Paris time)', listing.replace('</time>', '').replace('<time datetime="2026-12-13T10:30:00+01:00">', ''))
            self.assertIn('Afternoon', listing)
            self.assertIn('2026-12-13T10:30:00+01:00', page)
            self.assertIn('data="../assets/papers/public.pdf"', page)
            self.assertIn('src="../assets/videos/poster.mp4"', page)
            self.assertIn('src="../assets/videos/poster.vtt"', page)

    def test_hosted_videos_are_not_loaded_until_requested(self):
        ids = {'youtube': 'abcdefghijk', 'vimeo': '123456789', 'loom': 'a' * 32}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for provider, ident in ids.items():
                paper = dict(PAPER, video={'type': provider, 'id': ident})
                self.generate([paper], root)
                page = (root / 'papers/example-paper.html').read_text()
                self.assertIn('data-video-embed="https://', page)
                self.assertIn('data-load-video', page)
                self.assertNotIn('<iframe', page)
                self.assertIn('target="_blank" rel="noopener noreferrer"', page)

    def test_invalid_input_does_not_overwrite_existing_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = self.generate([PAPER], root)
            invalids = [
                [PAPER, PAPER],
                [dict(PAPER, slug='../escape')],
                [dict(PAPER, abstract='')],
                [dict(PAPER, authors=[])],
                [dict(PAPER, presentation={'type': 'oral', 'time': '25:00'})],
                [dict(PAPER, presentation={'type': 'poster', 'session': 'evening'})],
                [dict(PAPER, pdf='javascript:alert(1)')],
                [dict(PAPER, pdf='assets/../private.pdf')],
                [dict(PAPER, video={'type': 'youtube', 'id': 'invalid'})],
            ]
            for papers in invalids:
                with self.subTest(papers=papers), self.assertRaises(ValueError):
                    self.generate(papers, root)
                self.assertEqual(original, (root / 'papers.html').read_text())

    def test_removed_papers_and_empty_catalogue(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.generate([PAPER], root)
            manual = root / 'papers/manual.html'
            manual.write_text('<p>Keep this manually authored page.</p>')
            listing = self.generate([], root)
            self.assertFalse((root / 'papers/example-paper.html').exists())
            self.assertTrue(manual.exists())
            self.assertIn('Accepted papers coming soon', listing)
            self.assertNotIn('example-paper.html', listing)


if __name__ == '__main__':
    unittest.main()

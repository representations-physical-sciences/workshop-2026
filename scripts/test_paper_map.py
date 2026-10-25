"""Map integrity and discovery checks (numerical checks need scikit-learn)."""
import copy
import importlib.util
import json
import math
import tempfile
import unittest
from pathlib import Path


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mapping = load('paper_map', 'build-paper-map.py')
builder = load('builder', 'build-papers.py')
PAPERS = [
    {'slug': 'protein', 'title': 'Protein structure prediction', 'authors': ['Alice'],
     'abstract': 'Protein sequence folding structure amino acid prediction.'},
    {'slug': 'folding', 'title': 'Protein folding from sequence', 'authors': ['Bob'],
     'abstract': 'Protein structure sequence amino acid prediction folding.'},
    {'slug': 'galaxy', 'title': 'Galaxy telescope images', 'authors': ['Carol'],
     'abstract': 'Galaxy astronomical telescope images photometry stars sky.'},
]


class MapPublicationTests(unittest.TestCase):
    def test_stale_or_removed_papers_cannot_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'paper-map.json'
            data = {'version': 2, 'fingerprint': mapping.fingerprint(PAPERS), 'papers': []}
            path.write_text(json.dumps(data))
            self.assertIn('data-paper-map-data', builder.paper_map(PAPERS, path))
            self.assertEqual('', builder.paper_map(PAPERS[:-1], path))
            edited = copy.deepcopy(PAPERS)
            edited[0]['abstract'] += ' New findings.'
            self.assertEqual('', builder.paper_map(edited, path))

    def test_embedded_json_cannot_close_script_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'paper-map.json'
            path.write_text(json.dumps({'version': 2, 'fingerprint': mapping.fingerprint(PAPERS),
                                        'papers': [], 'example': '</script><script>alert(1)</script>'}))
            html = builder.paper_map(PAPERS, path)
            self.assertNotIn('<script>alert', html)
            self.assertIn(r'\u003c/script\u003e', html)


@unittest.skipUnless(importlib.util.find_spec('sklearn'), 'Run with scikit-learn for numerical checks')
class EmbeddingTests(unittest.TestCase):
    def test_recommendations_use_text_and_are_reproducible(self):
        result = mapping.embed(PAPERS)
        self.assertEqual(result, mapping.embed(PAPERS))
        self.assertEqual('folding', result['papers'][0]['neighbours'][0]['slug'])
        for paper in result['papers']:
            for projection in ('tsne', 'pca'):
                self.assertTrue(all(math.isfinite(v) and abs(v) <= .5 for v in paper[projection]))
            self.assertTrue(all(n['slug'] != paper['slug'] for n in paper['neighbours']))
        changed = copy.deepcopy(PAPERS)
        changed[0]['authors'] = ['Unrelated Name']
        self.assertEqual(result['papers'], mapping.embed(changed)['papers'])

    def test_empty_and_small_catalogues(self):
        self.assertEqual([], mapping.embed([])['papers'])
        for size in (1, 2):
            result = mapping.embed(PAPERS[:size])
            self.assertEqual(size, len(result['papers']))
            self.assertEqual(size - 1, len(result['papers'][0]['neighbours']))


if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["scikit-learn==1.7.2", "sentence-transformers==5.1.2"]
# ///
"""Build embeddings, projections, topics and recommendations for published papers.

Run: uv run scripts/build-paper-map.py
The default encoder runs locally after a one-time model download. --encoder tfidf
uses only scikit-learn and needs no model. Cached full-dimensional vectors are
saved beside the map in an NPZ file, with their input hash and encoder identity.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
REVISION = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
# These phrases name discovered clusters; they do not determine paper membership
# or move points. Unsupervised K-means determines membership in embedding space.
TOPIC_NAMES = {
    'Proteins & molecules': 'Protein sequences, molecular structure, binding, drug discovery, biomolecular representations.',
    'Astronomy & multimodal': 'Galaxies, astronomical images, spectra, cosmology, gravitational lenses, sky surveys.',
    'Neural operators & PDEs': 'Neural operators, Fourier operators, PDE solvers, continuous fields, differential equations.',
    'Dynamics & forecasting': 'Dynamical systems, trajectories, chaotic dynamics, time evolution, forecasting physical systems.',
    'Generation & reconstruction': 'Generative models, diffusion, flow matching, image generation, 3D reconstruction, inverse problems.',
    'Symmetry & geometry': 'Equivariance, physical symmetries, invariance, geometric representations, graph neural networks.',
    'Transfer & robustness': 'Transfer learning, fine tuning, distribution shift, generalization, robustness and foundation models.',
    'Materials & atomistic models': 'Materials science, molecular potentials, atomistic simulations, microstructures, material properties.',
    'Fields & inverse problems': 'Sparse observations, field reconstruction, continuous representations, inverse problems and physical measurements.',
    'Optimization & sampling': 'Optimization, training dynamics, learning rates, sampling, Monte Carlo, preconditioning, numerical methods.',
    'Multimodal representations': 'Multimodal representations, spectral data, cross modal alignment, images, audio and text.',
    'Climate & geoscience': 'Climate, ocean, hydrology, rivers, atmospheric modelling, earth systems, environmental forecasting.',
}


def fingerprint(papers):
    fields = [{key: p[key] for key in ('slug', 'title', 'authors', 'abstract')} for p in papers]
    return hashlib.sha256(json.dumps(fields, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def prose(text):
    return re.sub(r'\s+', ' ', re.sub(r'\\[a-zA-Z]+|[${}\\_^]', ' ', text)).strip()


def semantic_vectors(papers):
    """Mean-pool token-bounded chunks so long abstracts are not silently truncated."""
    import numpy as np
    from sentence_transformers import SentenceTransformer
    from sklearn.preprocessing import normalize
    model = SentenceTransformer(MODEL, revision=REVISION, device='cpu',
                                model_kwargs={'use_safetensors': True})
    chunks, owners, weights = [], [], []
    for i, paper in enumerate(papers):
        title_ids = model.tokenizer.encode(prose(paper['title']), add_special_tokens=False)[:64]
        title = model.tokenizer.decode(title_ids)
        abstract_ids = model.tokenizer.encode(prose(paper['abstract']), add_special_tokens=False, verbose=False)
        budget = model.max_seq_length - len(title_ids) - 8
        for start in range(0, max(1, len(abstract_ids)), budget):
            ids = abstract_ids[start:start + budget]
            chunks.append(title + '. ' + model.tokenizer.decode(ids))
            owners.append(i)
            weights.append(max(1, len(ids)))
    encoded = model.encode(chunks, normalize_embeddings=True, show_progress_bar=True)
    vectors = np.zeros((len(papers), encoded.shape[1]))
    for owner, weight, vector in zip(owners, weights, encoded):
        vectors[owner] += weight * vector
    return normalize(vectors)


def embed(papers, seed=42, encoder='tfidf', cache=None, topics=7):
    import numpy as np
    import sklearn
    from scipy.optimize import linear_sum_assignment
    from sklearn.cluster import KMeans
    from sklearn.decomposition import PCA, TruncatedSVD
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
    from sklearn.manifold import TSNE, trustworthiness
    from sklearn.metrics.pairwise import cosine_similarity
    from sklearn.preprocessing import normalize

    slugs = [p['slug'] for p in papers]
    if len(set(slugs)) != len(slugs):
        raise ValueError('Paper slugs must be unique')
    identity = MODEL + '@' + REVISION + ':chunked-v1' if encoder == 'semantic' else 'tfidf-v2'
    result = {'version': 2, 'fingerprint': fingerprint(papers), 'seed': seed,
              'encoder': identity, 'sklearn_version': sklearn.__version__, 'papers': [], 'topics': []}
    if not papers:
        return result
    stop = sorted(set(ENGLISH_STOP_WORDS) | {
        'paper', 'propose', 'proposed', 'approach', 'method', 'methods', 'results',
        'show', 'work', 'using', 'based', 'demonstrate', 'study', 'learning',
        'model', 'models', 'representation', 'representations', 'data', 'neural',
    })
    vectorizer = TfidfVectorizer(stop_words=stop, strip_accents='unicode',
                               ngram_range=(1, 2), sublinear_tf=True, max_features=16000)
    documents = [prose(f"{p['title']} {p['title']} {p['abstract']}") for p in papers]
    try:
        lexical = vectorizer.fit_transform(documents)
    except ValueError as error:
        raise ValueError('Titles and abstracts must contain searchable words') from error
    terms = vectorizer.get_feature_names_out()
    cache_hit = False
    if encoder == 'semantic':
        cached = None
        if cache and cache.exists():
            with np.load(cache, allow_pickle=False) as stored:
                if str(stored['fingerprint']) == result['fingerprint'] and str(stored['encoder']) == identity:
                    cached = stored['vectors']
        cache_hit = cached is not None
        vectors = cached if cache_hit else semantic_vectors(papers)
    elif encoder == 'tfidf':
        vectors = lexical.toarray()
    else:
        raise ValueError('Encoder must be semantic or tfidf')
    if cache and not cache_hit:
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(cache, vectors=vectors,
                            slugs=np.array(slugs), fingerprint=result['fingerprint'], encoder=identity)
    count = len(papers)
    rank = min(50, count - 1, vectors.shape[1] - 1)
    latent = (TruncatedSVD(n_components=rank, random_state=seed).fit_transform(vectors)
              if rank >= 2 else vectors.copy())
    latent = normalize(latent)
    perplexity = min(8.0, max(1.0, (count - 1) / 3))
    if count >= 3 and latent.shape[1] >= 2 and np.ptp(latent, axis=0).max() > 1e-10:
        pca = PCA(n_components=2, random_state=seed).fit_transform(latent)
        tsne = TSNE(n_components=2, perplexity=perplexity, init='pca',
                    learning_rate='auto', max_iter=2000, random_state=seed).fit_transform(latent)
    else:
        pca = np.column_stack((np.arange(count, dtype=float), np.zeros(count)))
        tsne = pca.copy()
        perplexity = None
    def coordinates(array):
        # Projection orientation is arbitrary. Align its principal axis horizontally
        # to use the landscape viewport; rotation preserves every pairwise distance.
        centered = array - array.mean(axis=0)
        if len(array) > 1 and np.ptp(centered, axis=0).max() > 1e-10:
            _, _, axes = np.linalg.svd(centered, full_matrices=False)
            centered = centered @ axes.T
        centered -= (centered.max(axis=0) + centered.min(axis=0)) / 2
        return np.round(centered / (float(np.ptp(centered, axis=0).max()) or 1.0), 6).tolist()
    projections = {'tsne': coordinates(tsne), 'pca': coordinates(pca)}
    unique = len(np.unique(np.round(vectors, 8), axis=0))
    n_topics = min(topics, max(1, count // 3), unique)
    clustering = KMeans(n_clusters=n_topics, n_init=20, random_state=seed).fit(vectors)
    labels = clustering.labels_
    # Name groups from their distinctive scientific vocabulary. Matching lexical
    # centroids avoids generic semantic phrases overwhelming specific topic names.
    lexical_centers = np.array([np.asarray(lexical[labels == i].mean(axis=0)).ravel() for i in range(n_topics)])
    name_vectors = vectorizer.transform(list(TOPIC_NAMES.values()))
    groups, names = linear_sum_assignment(-cosine_similarity(lexical_centers, name_vectors))
    topic_labels = {int(group): list(TOPIC_NAMES)[int(name)] for group, name in zip(groups, names)}
    for group in range(n_topics):
        members = np.flatnonzero(labels == group)
        mean = np.asarray(lexical[members].mean(axis=0)).ravel()
        # Rank distinctive cluster words, rather than ubiquitous workshop vocabulary.
        other = np.flatnonzero(labels != group)
        background = np.asarray(lexical[other].mean(axis=0)).ravel() if len(other) else 0
        ranked = np.argsort(-(mean - .7 * background), kind='stable')
        keywords = []
        for index in ranked:
            term = str(terms[index])
            if mean[index] > 0 and not any(term in old or old in term for old in keywords):
                keywords.append(term)
            if len(keywords) == 5:
                break
        label = topic_labels.get(group, ' · '.join(keywords[:2]).title())
        result['topics'].append({'id': group, 'label': label, 'keywords': keywords, 'count': len(members)})
    similarity = cosine_similarity(vectors)
    for i, paper in enumerate(papers):
        weights = lexical.getrow(i).toarray().ravel()
        keywords = [str(terms[j]) for j in np.argsort(-weights, kind='stable')[:5] if weights[j] > 0]
        neighbours = []
        for j in np.argsort(-similarity[i], kind='stable'):
            if i == j or similarity[i, j] <= 0:
                continue
            shared = weights * lexical.getrow(j).toarray().ravel()
            common = [str(terms[k]) for k in np.argsort(-shared, kind='stable')[:3] if shared[k] > 0]
            neighbours.append({'slug': slugs[j], 'score': round(float(similarity[i, j]), 6), 'terms': common})
            if len(neighbours) == 4:
                break
        result['papers'].append({'slug': paper['slug'], 'topic': int(labels[i]), 'keywords': keywords,
                                 'tsne': projections['tsne'][i], 'pca': projections['pca'][i],
                                 'neighbours': neighbours})
    result['parameters'] = {'svd_components': rank if rank >= 2 else None, 'perplexity': perplexity,
                            'max_iter': 2000, 'topics': n_topics, 'n_init': 20}
    if count >= 6 and perplexity is not None:
        result['trustworthiness'] = round(float(trustworthiness(vectors, tsne, n_neighbors=min(5, (count - 1) // 2), metric='cosine')), 4)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'data/papers.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/paper-map.json')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--encoder', choices=('semantic', 'tfidf'), default='semantic')
    parser.add_argument('--topics', type=int, default=7, choices=range(1, 13), metavar='1..12')
    args = parser.parse_args()
    try:
        result = embed(json.loads(args.data.read_text()), args.seed, args.encoder,
                       args.output.with_suffix('.npz'), args.topics)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'Cannot build paper map: {error}\n')
    print(f"Mapped {len(result['papers'])} papers into {len(result['topics'])} topics: {args.output}")
    print('Run python3 scripts/build-papers.py to publish it.')


if __name__ == '__main__':
    main()

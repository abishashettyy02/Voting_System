const { hammingSimilarity } = require('./biometricHash');

function createRng(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function majorityLabel(samples) {
  let ones = 0;
  for (const s of samples) {
    if (s.label === 1) ones += 1;
  }
  return ones >= samples.length - ones ? 1 : 0;
}

function gini(samples) {
  if (!samples.length) return 0;
  let ones = 0;
  for (const s of samples) {
    if (s.label === 1) ones += 1;
  }
  const p1 = ones / samples.length;
  const p0 = 1 - p1;
  return 1 - (p1 * p1 + p0 * p0);
}

function splitSamples(samples, featureIndex, threshold) {
  const left = [];
  const right = [];
  for (const s of samples) {
    if (s.features[featureIndex] <= threshold) left.push(s);
    else right.push(s);
  }
  return { left, right };
}

function sampleFeatureIndices(total, rng) {
  const target = Math.max(1, Math.floor(Math.sqrt(total)));
  const indices = new Set();
  while (indices.size < target) {
    indices.add(Math.floor(rng() * total));
  }
  return [...indices];
}

function bestSplit(samples, featureCount, rng) {
  const base = gini(samples);
  let best = null;
  const featureIndices = sampleFeatureIndices(featureCount, rng);

  for (const featureIndex of featureIndices) {
    const values = samples.map((s) => s.features[featureIndex]).sort((a, b) => a - b);
    const candidates = [];
    const stride = Math.max(1, Math.floor(values.length / 6));
    for (let i = stride; i < values.length; i += stride) {
      candidates.push(values[i]);
    }

    for (const threshold of candidates) {
      const { left, right } = splitSamples(samples, featureIndex, threshold);
      if (!left.length || !right.length) continue;
      const weighted = (left.length / samples.length) * gini(left) + (right.length / samples.length) * gini(right);
      const gain = base - weighted;
      if (!best || gain > best.gain) {
        best = { gain, featureIndex, threshold, left, right };
      }
    }
  }

  return best;
}

function buildTree(samples, featureCount, maxDepth, minSamples, rng, depth = 0) {
  if (!samples.length) return { leaf: 0 };
  if (depth >= maxDepth || samples.length <= minSamples || gini(samples) === 0) {
    return { leaf: majorityLabel(samples) };
  }

  const split = bestSplit(samples, featureCount, rng);
  if (!split || split.gain <= 0) {
    return { leaf: majorityLabel(samples) };
  }

  return {
    featureIndex: split.featureIndex,
    threshold: split.threshold,
    left: buildTree(split.left, featureCount, maxDepth, minSamples, rng, depth + 1),
    right: buildTree(split.right, featureCount, maxDepth, minSamples, rng, depth + 1),
  };
}

function predictTree(tree, features) {
  if (typeof tree.leaf === 'number') return tree.leaf;
  if (features[tree.featureIndex] <= tree.threshold) return predictTree(tree.left, features);
  return predictTree(tree.right, features);
}

function bootstrap(samples, rng) {
  const bag = [];
  for (let i = 0; i < samples.length; i += 1) {
    bag.push(samples[Math.floor(rng() * samples.length)]);
  }
  return bag;
}

function trainRandomForest(samples, featureCount, options = {}) {
  const treeCount = options.treeCount || 25;
  const maxDepth = options.maxDepth || 4;
  const minSamples = options.minSamples || 4;
  const seed = options.seed || 42;
  const rng = createRng(seed);
  const forest = [];

  for (let i = 0; i < treeCount; i += 1) {
    forest.push(buildTree(bootstrap(samples, rng), featureCount, maxDepth, minSamples, rng));
  }

  return forest;
}

function predictForest(forest, features) {
  let ones = 0;
  for (const tree of forest) {
    if (predictTree(tree, features) === 1) ones += 1;
  }
  const confidence = forest.length ? ones / forest.length : 0;
  return { label: confidence >= 0.5 ? 1 : 0, confidence };
}

function toFeatures(fpSimilarity, faceSimilarity, requireFace) {
  if (!requireFace) return [fpSimilarity];
  return [fpSimilarity, faceSimilarity, (fpSimilarity + faceSimilarity) / 2, Math.abs(fpSimilarity - faceSimilarity)];
}

function buildTrainingSet(records, requireFace) {
  const samples = [];

  for (const r of records) {
    const fp = hammingSimilarity(r.fingerprintTemplateHash, r.fingerprintTemplateHash);
    const face = requireFace
      ? hammingSimilarity(r.faceEmbeddingHash || '', r.faceEmbeddingHash || '')
      : 0;
    samples.push({ features: toFeatures(fp, face, requireFace), label: 1 });
  }

  let negatives = 0;
  const maxNegatives = 500;
  for (let i = 0; i < records.length && negatives < maxNegatives; i += 1) {
    for (let j = i + 1; j < records.length && negatives < maxNegatives; j += 1) {
      const fp = hammingSimilarity(records[i].fingerprintTemplateHash, records[j].fingerprintTemplateHash);
      const face = requireFace
        ? hammingSimilarity(records[i].faceEmbeddingHash || '', records[j].faceEmbeddingHash || '')
        : 0;
      samples.push({ features: toFeatures(fp, face, requireFace), label: 0 });
      negatives += 1;
    }
  }

  return samples;
}

function detectDuplicateWithRandomForest({
  incomingFingerprintHash,
  incomingFaceHash = '',
  records,
  requireFace = true,
}) {
  if (!records || !records.length) {
    return { isDuplicate: false, match: null, reason: 'NO_REFERENCE_RECORDS' };
  }

  const exact = records.find(
    (r) =>
      r.fingerprintTemplateHash === incomingFingerprintHash &&
      (!requireFace || (r.faceEmbeddingHash || '') === incomingFaceHash)
  );

  if (exact) {
    return { isDuplicate: true, match: exact, reason: 'EXACT_MATCH', confidence: 1 };
  }

  const training = buildTrainingSet(records, requireFace);
  const hasBothClasses = training.some((s) => s.label === 1) && training.some((s) => s.label === 0);
  const featureCount = requireFace ? 4 : 1;
  const forest = hasBothClasses ? trainRandomForest(training, featureCount) : null;

  let best = null;
  for (const r of records) {
    const fpSimilarity = hammingSimilarity(r.fingerprintTemplateHash, incomingFingerprintHash);
    const faceSimilarity = requireFace
      ? hammingSimilarity(r.faceEmbeddingHash || '', incomingFaceHash)
      : 0;
    const features = toFeatures(fpSimilarity, faceSimilarity, requireFace);

    const prediction = forest
      ? predictForest(forest, features)
      : { label: fpSimilarity >= 0.995 && (!requireFace || faceSimilarity >= 0.995) ? 1 : 0, confidence: 0.5 };

    const combined = requireFace ? (fpSimilarity + faceSimilarity) / 2 : fpSimilarity;
    const acceptedByThreshold = fpSimilarity >= 0.98 && (!requireFace || faceSimilarity >= 0.98);
    const isDuplicate = prediction.label === 1 && acceptedByThreshold;

    if (!best || combined > best.combined) {
      best = {
        record: r,
        combined,
        fpSimilarity,
        faceSimilarity,
        confidence: prediction.confidence,
        isDuplicate,
      };
    }
  }

  if (!best || !best.isDuplicate) {
    return { isDuplicate: false, match: null, reason: 'NO_RF_DUPLICATE', confidence: best?.confidence || 0 };
  }

  return {
    isDuplicate: true,
    match: best.record,
    reason: 'RANDOM_FOREST_DUPLICATE',
    confidence: Number(best.confidence.toFixed(4)),
    fpSimilarity: Number(best.fpSimilarity.toFixed(4)),
    faceSimilarity: Number(best.faceSimilarity.toFixed(4)),
  };
}

module.exports = {
  detectDuplicateWithRandomForest,
};

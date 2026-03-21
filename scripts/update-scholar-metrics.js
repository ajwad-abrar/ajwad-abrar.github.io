const fs = require('fs');
const path = require('path');

const apiKey = process.env.SERPAPI_KEY;
const authorId = process.env.SCHOLAR_AUTHOR_ID || 'GQObpIcAAAAJ';

if (!apiKey) {
  throw new Error('SERPAPI_KEY is required.');
}

const outputDir = path.join(__dirname, '..', 'data');
const jsonPath = path.join(outputDir, 'scholar-metrics.json');
const jsPath = path.join(outputDir, 'scholar-metrics.js');

const coerceMetricValue = (value) => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const getMetricValue = (table, key) => {
  const metric = table.find((entry) => entry[key]);
  if (!metric || !metric[key]) {
    return null;
  }

  return coerceMetricValue(metric[key].all);
};

const buildSerpApiUrl = (params = {}) => {
  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('engine', 'google_scholar_author');
  url.searchParams.set('author_id', authorId);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', apiKey);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
};

const findMetricsTable = (payload) => {
  if (Array.isArray(payload?.cited_by?.table)) {
    return payload.cited_by.table;
  }

  if (Array.isArray(payload?.author?.cited_by?.table)) {
    return payload.author.cited_by.table;
  }

  return [];
};

const decodeHtml = (value) => value
  .replace(/&nbsp;/g, ' ')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .trim();

const parseMetricsFromHtml = (html) => {
  const matches = [...html.matchAll(/class="gsc_rsb_std">([\d,]+)</g)]
    .map((match) => coerceMetricValue(decodeHtml(match[1])));

  if (matches.length >= 5) {
    return {
      citations: matches[0] ?? null,
      h_index: matches[2] ?? null,
      i10_index: matches[4] ?? null
    };
  }

  return {
    citations: null,
    h_index: null,
    i10_index: null
  };
};

const run = async () => {
  const response = await fetch(buildSerpApiUrl());

  if (!response.ok) {
    throw new Error(`SerpApi request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const table = findMetricsTable(payload);

  const metrics = {
    author_id: authorId,
    profile_url: `https://scholar.google.com/citations?user=${authorId}&hl=en`,
    citations: getMetricValue(table, 'citations'),
    h_index: getMetricValue(table, 'h_index'),
    i10_index: getMetricValue(table, 'i10_index'),
    updated_at: payload?.search_metadata?.processed_at || new Date().toISOString()
  };

  if (payload?.error) {
    throw new Error(`SerpApi returned an error: ${payload.error}`);
  }

  if (metrics.citations === null && metrics.h_index === null && metrics.i10_index === null) {
    const htmlResponse = await fetch(buildSerpApiUrl({ output: 'html' }));

    if (!htmlResponse.ok) {
      throw new Error(`Scholar metrics were not found in the SerpApi JSON response, and HTML fallback failed with status ${htmlResponse.status}. Available top-level keys: ${Object.keys(payload).join(', ')}`);
    }

    const html = await htmlResponse.text();
    const htmlMetrics = parseMetricsFromHtml(html);

    metrics.citations = htmlMetrics.citations;
    metrics.h_index = htmlMetrics.h_index;
    metrics.i10_index = htmlMetrics.i10_index;
  }

  if (metrics.citations === null && metrics.h_index === null && metrics.i10_index === null) {
    throw new Error(`Scholar metrics were not found in either the SerpApi JSON or HTML response. Available top-level keys: ${Object.keys(payload).join(', ')}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
  fs.writeFileSync(jsPath, `window.scholarMetrics = ${JSON.stringify(metrics, null, 2)};\n`, 'utf8');

  console.log('Updated scholar metrics:', metrics);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

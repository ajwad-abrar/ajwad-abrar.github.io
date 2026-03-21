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

const getMetricValue = (table, key) => {
  const metric = table.find((entry) => entry[key]);
  if (!metric || !metric[key]) {
    return null;
  }

  return metric[key].all ?? null;
};

const run = async () => {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_scholar_author');
  url.searchParams.set('author_id', authorId);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', apiKey);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`SerpApi request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const table = payload?.cited_by?.table || [];

  const metrics = {
    author_id: authorId,
    profile_url: `https://scholar.google.com/citations?user=${authorId}&hl=en`,
    citations: getMetricValue(table, 'citations'),
    h_index: getMetricValue(table, 'h_index'),
    i10_index: getMetricValue(table, 'i10_index'),
    updated_at: new Date().toISOString()
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
  fs.writeFileSync(jsPath, `window.scholarMetrics = ${JSON.stringify(metrics, null, 2)};\n`, 'utf8');

  console.log('Updated scholar metrics:', metrics);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

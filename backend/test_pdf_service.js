const https = require('https');
const { parsePdf } = require('./services/pdfService');
const { chunkPages } = require('./services/chunkService');

const PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

const downloadFile = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${res.statusCode}`));
        return;
      }
      const data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data)));
      res.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
};

const runTest = async () => {
  console.log('--- Start PDF Parsing Engine Test ---');
  console.log(`Downloading test PDF from: ${PDF_URL}`);

  let buffer;
  try {
    buffer = await downloadFile(PDF_URL);
    console.log(`Successfully downloaded PDF buffer. Size: ${buffer.length} bytes`);
  } catch (error) {
    console.error('Failed to download test PDF:', error.message);
    process.exit(1);
  }

  console.log('Parsing PDF...');
  try {
    const result = await parsePdf(buffer);

    // 1. Validate return structure
    if (!result || typeof result !== 'object') {
      throw new Error('parsePdf did not return a valid object');
    }
    if (!Array.isArray(result.pages)) {
      throw new Error('result.pages is not an array');
    }
    if (!result.metadata || typeof result.metadata !== 'object') {
      throw new Error('result.metadata is not a valid object');
    }

    console.log('\n[Document Metadata]');
    console.log(JSON.stringify(result.metadata, null, 2));

    console.log('\n[Pages Found]:', result.pages.length);
    result.pages.forEach((page) => {
      console.log(`\n--- Page ${page.pageNumber} ---`);
      console.log(`Text preview (first 60 chars): "${page.text.substring(0, 60)}..."`);
      console.log('Page-level metadata:');
      console.log(JSON.stringify(page.metadata, null, 2));

      // Assert basic page-level metadata structure
      if (typeof page.pageNumber !== 'number') throw new Error('pageNumber is missing or not a number');
      if (typeof page.text !== 'string') throw new Error('text is missing or not a string');
      if (!page.metadata || typeof page.metadata !== 'object') throw new Error('page metadata is missing');
      if (typeof page.metadata.wordCount !== 'number') throw new Error('wordCount is missing or not a number');
      if (typeof page.metadata.characterCount !== 'number') throw new Error('characterCount is missing or not a number');
    });

    // 2. Validate Chunking integration
    console.log('\nTesting chunkPages with parsed pages...');
    const chunks = chunkPages(result.pages, 200, 20);
    console.log(`Generated ${chunks.length} chunks.`);

    chunks.forEach((chunk, index) => {
      console.log(`\nChunk ${index + 1}:`);
      console.log(`- Page Number: ${chunk.pageNumber}`);
      console.log(`- Text length: ${chunk.text.length} chars`);
      console.log(`- Word count: ${chunk.text.split(/\s+/).filter(Boolean).length}`);
      console.log('- Chunk metadata (carried forward):');
      console.log(JSON.stringify(chunk.metadata, null, 2));

      // Assert chunk metadata exists and matches source page
      if (!chunk.metadata || typeof chunk.metadata !== 'object') {
        throw new Error(`Chunk ${index + 1} is missing metadata`);
      }
      const sourcePage = result.pages.find((p) => p.pageNumber === chunk.pageNumber);
      if (!sourcePage) {
        throw new Error(`Could not find source page ${chunk.pageNumber} for chunk`);
      }
      if (chunk.metadata.width !== sourcePage.metadata.width) {
        throw new Error(`Width mismatch: chunk has ${chunk.metadata.width}, page has ${sourcePage.metadata.width}`);
      }
    });

    console.log('\n--- PDF Parsing Engine Test Passed Successfully! ---');
  } catch (error) {
    console.error('\n--- Test Failed! ---');
    console.error(error);
    process.exit(1);
  }
};

runTest();

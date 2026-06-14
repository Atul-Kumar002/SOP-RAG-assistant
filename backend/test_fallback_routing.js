// backend/test_fallback_routing.js
require('dotenv').config();
const { parseResponseChunks } = require('./services/citationService');
const { formatSources } = require('./services/contextBuilderService');

async function testFallback() {
  console.log('==================================================');
  console.log('    Testing Fallback Response & Citation Parsing  ');
  console.log('==================================================\n');

  const mockSources = [
    {
      documentName: 'Policy_A.pdf',
      pageNumber: 1,
      text: 'Policy A states X.',
      metadata: { sectionInfo: 'Overview' }
    }
  ];

  const fallbackResponseText = "I don't know based on the provided SOPs.";
  const formatted = formatSources(mockSources);
  const responseChunks = parseResponseChunks(fallbackResponseText, formatted);

  console.log('Parsed Chunks:', JSON.stringify(responseChunks, null, 2));

  if (responseChunks.length !== 1) {
    throw new Error(`Expected exactly 1 chunk, got ${responseChunks.length}`);
  }

  if (responseChunks[0].text !== "I don't know based on the provided SOPs.") {
    throw new Error(`Expected text to match, got: "${responseChunks[0].text}"`);
  }

  if (responseChunks[0].citations.length !== 0) {
    throw new Error(`Expected 0 citations for fallback response, got ${responseChunks[0].citations.length}`);
  }

  console.log('\n✅ Fallback response citation parsing tests passed successfully!');
}

testFallback().catch(err => {
  console.error(err);
  process.exit(1);
});

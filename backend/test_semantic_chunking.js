const { chunkPages, isHeader, cleanHeader, splitIntoSentences, chunkSentences } = require('./services/chunkService');

const runSemanticTests = () => {
  console.log('--- Running Semantic Chunking Unit Tests ---');

  // Test 1: Heading Detection
  console.log('\n[Test 1] Heading Detection');
  const testHeaders = [
    '# Introduction',
    '## 1.1 Getting Started',
    'Section 3: Operations Guide',
    '1.2.3 Detail Level',
    'STANDARD OPERATING PROCEDURE',
    'This is a normal sentence that does not look like a header.'
  ];

  testHeaders.forEach(h => {
    const isHead = isHeader(h);
    console.log(`- "${h}" -> isHeader: ${isHead} | cleaned: "${isHead ? cleanHeader(h) : ''}"`);
  });

  // Test 2: Sentence Splitting
  console.log('\n[Test 2] Sentence Splitting');
  const mockText = `1. INTRODUCTION
This is a standard operating procedure. It describes the guidelines.

Section 2. Refunding
Please follow this rule. Thank you!`;
  
  const sentences = splitIntoSentences(mockText);
  console.log('Parsed sentences/headers:');
  sentences.forEach((s, idx) => {
    console.log(`  ${idx + 1}: "${s}"`);
  });

  // Test 3: Semantic Chunking with Overlap
  console.log('\n[Test 3] Semantic Chunking & Metadata Attachment');
  const mockPages = [
    {
      pageNumber: 1,
      text: `1. INTRODUCTION
This is a standard operating procedure. It describes the guidelines for refunding.
We want to verify that our system chunks correctly.
Each sentence should be preserved. We do not want to split in the middle of a sentence.

Section 2. Refund Procedure
Refunds are processed within 10 business days.
Please ensure all fields in the request are filled correctly.`,
      metadata: { width: 600, height: 800 }
    }
  ];

  const chunks = chunkPages(mockPages, 'SOP_Document.pdf', 150, 40);
  console.log(`Generated ${chunks.length} chunks.`);

  chunks.forEach((c, idx) => {
    console.log(`\n--- Chunk ${idx + 1} ---`);
    console.log(`Text: "${c.text}"`);
    console.log('Metadata:');
    console.log(JSON.stringify(c.metadata, null, 2));
  });

  // Verification assertions
  if (chunks.length === 0) throw new Error('No chunks generated');
  
  // Verify metadata fields
  const firstChunk = chunks[0];
  if (firstChunk.metadata.documentName !== 'SOP_Document.pdf') throw new Error('documentName metadata mismatch');
  if (firstChunk.metadata.pageNumber !== 1) throw new Error('pageNumber metadata mismatch');
  if (firstChunk.metadata.sectionInfo !== 'INTRODUCTION') throw new Error('sectionInfo metadata mismatch');
  if (firstChunk.metadata.chunkIndex !== 0) throw new Error('chunkIndex metadata mismatch');

  // Verify that the second chunk gets sectionInfo 'Refund Procedure'
  const secondSectionChunk = chunks.find(c => c.text.includes('Refunds are processed'));
  if (secondSectionChunk && secondSectionChunk.metadata.sectionInfo !== 'Refund Procedure') {
    throw new Error('sectionInfo did not update to Section 2');
  }

  console.log('\n--- All Semantic Chunking Tests Passed! ---');
};

runSemanticTests();

// backend/test_citation_service.js
const { parseResponseChunks, processSegment } = require('./services/citationService');

async function runCitationServiceTests() {
  console.log('==================================================');
  console.log('       Running Citation Service Unit Tests        ');
  console.log('==================================================\n');

  const mockSources = [
    {
      documentName: 'SOP_Leave_Policy.pdf',
      pageNumber: 2,
      sectionRef: 'Annual Leave',
      score: 0.95
    },
    {
      documentName: 'SOP_IT_Security.pdf',
      pageNumber: 5,
      sectionRef: 'Password Guidelines',
      score: 0.88
    }
  ];

  try {
    // ----------------------------------------------------
    // Test 1: Single Sentence with Single Citation
    // ----------------------------------------------------
    console.log('[Test 1] Testing single sentence with a single citation...');
    const text1 = 'Employees get 15 annual leave days [Source Reference 1].';
    const result1 = parseResponseChunks(text1, mockSources);

    if (result1.length !== 1) {
      throw new Error(`Expected 1 chunk, got ${result1.length}`);
    }
    if (result1[0].text !== 'Employees get 15 annual leave days.') {
      throw new Error(`Unexpected text cleaning: "${result1[0].text}"`);
    }
    if (result1[0].citations.length !== 1) {
      throw new Error(`Expected 1 citation, got ${result1[0].citations.length}`);
    }
    if (result1[0].citations[0].sourceIndex !== 1) {
      throw new Error(`Expected sourceIndex 1, got ${result1[0].citations[0].sourceIndex}`);
    }
    if (result1[0].citations[0].documentName !== 'SOP_Leave_Policy.pdf') {
      throw new Error(`Expected document SOP_Leave_Policy.pdf, got ${result1[0].citations[0].documentName}`);
    }
    console.log('✅ Test 1 Passed.\n');

    // ----------------------------------------------------
    // Test 2: Multiple Citations in One Sentence
    // ----------------------------------------------------
    console.log('[Test 2] Testing sentence with multiple citations...');
    const text2 = 'Passwords must be updated periodically [Source Reference 2] after returning from vacation [Source Reference 1].';
    const result2 = parseResponseChunks(text2, mockSources);

    if (result2.length !== 1) {
      throw new Error(`Expected 1 chunk, got ${result2.length}`);
    }
    if (result2[0].text !== 'Passwords must be updated periodically after returning from vacation.') {
      throw new Error(`Unexpected text cleaning: "${result2[0].text}"`);
    }
    if (result2[0].citations.length !== 2) {
      throw new Error(`Expected 2 citations, got ${result2[0].citations.length}`);
    }
    const citationIndices = result2[0].citations.map(c => c.sourceIndex);
    if (!citationIndices.includes(1) || !citationIndices.includes(2)) {
      throw new Error(`Citations list should contain indices 1 and 2, got ${JSON.stringify(citationIndices)}`);
    }
    console.log('✅ Test 2 Passed.\n');

    // ----------------------------------------------------
    // Test 3: List Items Formatting & Preservation
    // ----------------------------------------------------
    console.log('[Test 3] Testing list items parsing...');
    const text3 = `
* First item uses leave policy [Source Reference 1]
* Second item is about security guidelines [Source Reference 2]
    `.trim();
    const result3 = parseResponseChunks(text3, mockSources);

    if (result3.length !== 2) {
      throw new Error(`Expected 2 chunks for list items, got ${result3.length}`);
    }
    if (!result3[0].isListItem || !result3[1].isListItem) {
      throw new Error('Expected chunks to be flagged as list items');
    }
    if (result3[0].text !== '* First item uses leave policy') {
      throw new Error(`Unexpected first item text: "${result3[0].text}"`);
    }
    if (result3[0].citations[0].sourceIndex !== 1) {
      throw new Error('First item should cite source 1');
    }
    if (result3[1].text !== '* Second item is about security guidelines') {
      throw new Error(`Unexpected second item text: "${result3[1].text}"`);
    }
    if (result3[1].citations[0].sourceIndex !== 2) {
      throw new Error('Second item should cite source 2');
    }
    console.log('✅ Test 3 Passed.\n');

    // ----------------------------------------------------
    // Test 4: Sentence Splitting Accuracy
    // ----------------------------------------------------
    console.log('[Test 4] Testing paragraph splitting into multiple sentences...');
    const text4 = 'This is paragraph sentence one [Source Reference 1]. This is sentence two [Source Reference 2]! And sentence three?';
    const result4 = parseResponseChunks(text4, mockSources);

    if (result4.length !== 3) {
      throw new Error(`Expected 3 sentences, got ${result4.length}`);
    }
    if (result4[0].text !== 'This is paragraph sentence one.') {
      throw new Error(`Sentence one mismatch: "${result4[0].text}"`);
    }
    if (result4[0].citations[0].sourceIndex !== 1) {
      throw new Error('Sentence one citation mismatch');
    }
    if (result4[1].text !== 'This is sentence two!') {
      throw new Error(`Sentence two mismatch: "${result4[1].text}"`);
    }
    if (result4[1].citations[0].sourceIndex !== 2) {
      throw new Error('Sentence two citation mismatch');
    }
    if (result4[2].text !== 'And sentence three?') {
      throw new Error(`Sentence three mismatch: "${result4[2].text}"`);
    }
    if (result4[2].citations.length !== 0) {
      throw new Error('Sentence three should have 0 citations');
    }
    console.log('✅ Test 4 Passed.\n');

    // ----------------------------------------------------
    // Test 5: Out of Bound/Malformed Citation Handling
    // ----------------------------------------------------
    console.log('[Test 5] Testing out of bound and malformed citations...');
    const text5 = 'This cites a non-existent source [Source Reference 99] and has a malformed tag [Source Reference abc].';
    const result5 = parseResponseChunks(text5, mockSources);

    if (result5[0].citations.length !== 0) {
      throw new Error(`Expected 0 valid citations, got ${result5[0].citations.length}`);
    }
    if (result5[0].text !== 'This cites a non-existent source and has a malformed tag [Source Reference abc].') {
      throw new Error(`Text cleaning mismatch for invalid formats: "${result5[0].text}"`);
    }
    console.log('✅ Test 5 Passed.\n');

    // ----------------------------------------------------
    // Test 6: Case Insensitive and Plus (+) Bullet Matches
    // ----------------------------------------------------
    console.log('[Test 6] Testing case-insensitive matching and plus (+) bullets...');
    const text6 = `
+ Plus item one uses [source reference 1]
+ Plus item two uses [ref 2]
    `.trim();
    const result6 = parseResponseChunks(text6, mockSources);

    if (result6.length !== 2) {
      throw new Error(`Expected 2 chunks, got ${result6.length}`);
    }
    if (!result6[0].isListItem || !result6[1].isListItem) {
      throw new Error('Expected chunks to be flagged as list items');
    }
    if (result6[0].text !== '+ Plus item one uses') {
      throw new Error(`Unexpected text cleaning: "${result6[0].text}"`);
    }
    if (result6[0].citations[0].sourceIndex !== 1) {
      throw new Error(`Expected sourceIndex 1, got ${result6[0].citations[0].sourceIndex}`);
    }
    if (result6[1].text !== '+ Plus item two uses') {
      throw new Error(`Unexpected text cleaning: "${result6[1].text}"`);
    }
    if (result6[1].citations[0].sourceIndex !== 2) {
      throw new Error(`Expected sourceIndex 2, got ${result6[1].citations[0].sourceIndex}`);
    }
    console.log('✅ Test 6 Passed.\n');

    console.log('==================================================');
    console.log('🎉 All Citation Service Unit Tests Passed!');
    console.log('==================================================');

  } catch (error) {
    console.error('❌ Citation service test failed:', error.message);
    process.exit(1);
  }
}

runCitationServiceTests();

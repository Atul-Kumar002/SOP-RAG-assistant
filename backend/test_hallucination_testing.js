// backend/test_hallucination_testing.js
require('dotenv').config();
const { generateAnswer } = require('./services/assistantService');
const { parseResponseChunks } = require('./services/citationService');
const { buildContext, formatSources } = require('./services/contextBuilderService');

async function runHallucinationTests() {
  console.log('==================================================');
  console.log('         Running Hallucination Test Suite         ');
  console.log('==================================================\n');

  // Verify GEMINI_API_KEY is configured
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    console.error('❌ GEMINI_API_KEY is not configured in backend/.env.');
    process.exit(1);
  }

  // 1. Mock SOP Context containing leave policy info
  const mockSopChunks = [
    {
      documentName: 'SOP_Leave_Policy.pdf',
      pageNumber: 2,
      text: 'Employees are entitled to 15 days of annual leave. Approval from the HOD is required 14 days in advance.',
      metadata: { sectionInfo: 'Annual Leave Request' }
    }
  ];

  const structuredContext = buildContext(mockSopChunks);
  const formattedSources = formatSources(mockSopChunks);

  try {
    // ----------------------------------------------------
    // Test 1: Unsupported Questions & Refusal Behavior
    // ----------------------------------------------------
    console.log('--- 1. Testing Unsupported Questions & Refusal Behavior ---');
    const unsupportedQuery = 'What is the refund policy for tuition fees?';
    console.log(`Query (Not in context): "${unsupportedQuery}"`);
    console.log('Generating response via Gemini...');
    
    const refusalResponse = await generateAnswer(unsupportedQuery, structuredContext);
    console.log(`🤖 Refusal Response: "${refusalResponse}"`);

    // Verify refusal behavior text
    const expectedRefusal = "I don't know based on the provided SOPs.";
    if (refusalResponse !== expectedRefusal) {
      throw new Error(`Refusal verification failed. Expected exactly: "${expectedRefusal}", but got: "${refusalResponse}"`);
    }
    console.log('✅ Model correctly refused to answer when the context lacked information.');

    // Verify citation behavior during refusal (Verify refusal behavior)
    const refusalChunks = parseResponseChunks(refusalResponse, formattedSources);
    console.log('Parsed Refusal Chunks:', JSON.stringify(refusalChunks, null, 2));

    if (refusalChunks.length !== 1) {
      throw new Error(`Expected exactly 1 chunk, got ${refusalChunks.length}`);
    }
    if (refusalChunks[0].citations.length !== 0) {
      throw new Error(`Hallucination detected! Expected 0 citations for refusal response, but got ${refusalChunks[0].citations.length} citations.`);
    }
    console.log('✅ Refusal response contains 0 citations (no hallucinated sources).');

    // ----------------------------------------------------
    // Test 2: Source Dependency & Grounding (Supported Questions)
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Source Dependency & Grounding (Supported Questions) ---');
    const supportedQuery = 'How many days of annual leave are employees entitled to?';
    console.log(`Query (Present in context): "${supportedQuery}"`);
    console.log('Generating response via Gemini...');

    const groundedResponse = await generateAnswer(supportedQuery, structuredContext);
    console.log(`🤖 Grounded Response: "${groundedResponse}"`);

    // Parse the response chunks to verify citation extraction
    const groundedChunks = parseResponseChunks(groundedResponse, formattedSources);
    console.log('Parsed Grounded Chunks:', JSON.stringify(groundedChunks, null, 2));

    // Verify that the answer text contains the information from context
    const responseLower = groundedResponse.toLowerCase();
    if (!responseLower.includes('15') || !responseLower.includes('leave')) {
      throw new Error(`Grounding failed: Response does not seem to contain the correct answer (15 days of leave).`);
    }

    // Verify citations mapped back correctly to source reference 1
    const hasValidCitation = groundedChunks.some(chunk => 
      chunk.citations.some(cit => cit.sourceIndex === 1 && cit.documentName === 'SOP_Leave_Policy.pdf')
    );

    if (!hasValidCitation) {
      throw new Error(`Source dependency failure: The response did not cite Source Reference 1 for the answer, or the citation was parsed incorrectly.`);
    }

    console.log('✅ Grounded response correctly answered using only context information.');
    console.log('✅ Grounded response correctly cited the source document.');

    console.log('\n==================================================');
    console.log('🎉 All Hallucination Tests PASSED!');
    console.log('==================================================');

  } catch (error) {
    console.error('\n❌ Hallucination Test Failed:', error.message);
    process.exit(1);
  }
}

runHallucinationTests();

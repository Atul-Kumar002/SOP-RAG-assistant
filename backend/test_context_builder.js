// backend/test_context_builder.js
require('dotenv').config();
const { buildContext, formatSources } = require('./services/contextBuilderService');
const { generateAnswer } = require('./services/assistantService');
const { GenerativeModel } = require('@google/generative-ai');

// Save original GenerativeModel prototype methods
const originalGenerateContent = GenerativeModel.prototype.generateContent;

// Mock Gemini generateContent
GenerativeModel.prototype.generateContent = async function(request) {
  console.log(`[Mock LLM API] generateContent called with request:`, JSON.stringify(request).substring(0, 150) + '...');
  return {
    response: {
      text: () => "Mocked LLM Answer: The refund policy states that standard requests are processed in 10 business days."
    }
  };
};

// Set mock key if not configured
const originalApiKey = process.env.GEMINI_API_KEY;
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
  process.env.GEMINI_API_KEY = 'mock_key_for_testing';
}

async function runTests() {
  console.log('==================================================');
  console.log('       Running Context Builder & LLM Q&A Tests    ');
  console.log('==================================================\n');

  try {
    // ----------------------------------------------------
    // Test 1: Context Builder - Standard chunks merging
    // ----------------------------------------------------
    console.log('[Test 1] Testing buildContext with standard chunks...');
    const mockChunks = [
      {
        documentName: 'Refund_SOP.pdf',
        pageNumber: 3,
        text: 'Refund requests must be filed within 30 days of purchase.',
        metadata: { sectionInfo: 'Policy Window' }
      },
      {
        documentName: 'Refund_SOP.pdf',
        pageNumber: 4,
        text: 'Refund approvals require manager signoff.',
        metadata: { sectionInfo: 'Workflow' }
      }
    ];

    const context = buildContext(mockChunks);
    console.log('Generated Context:\n' + context + '\n');

    if (!context.includes('Document Name: Refund_SOP.pdf')) {
      throw new Error('Test 1 Failed: Context missing document name');
    }
    if (!context.includes('Page Number: 3')) {
      throw new Error('Test 1 Failed: Context missing page number');
    }
    if (!context.includes('Section Reference: Policy Window')) {
      throw new Error('Test 1 Failed: Context missing section info');
    }
    if (!context.includes('Refund approvals require manager signoff.')) {
      throw new Error('Test 1 Failed: Context missing chunk text');
    }
    console.log('✅ Test 1 Passed.\n');

    // ----------------------------------------------------
    // Test 2: Context Builder - Missing/malformed metadata
    // ----------------------------------------------------
    console.log('[Test 2] Testing buildContext fallback for missing metadata...');
    const emptyMetadataChunks = [
      {
        text: 'This chunk has no metadata at all.'
      }
    ];

    const fallbackContext = buildContext(emptyMetadataChunks);
    console.log('Generated Fallback Context:\n' + fallbackContext + '\n');

    if (!fallbackContext.includes('Document Name: Unknown Document')) {
      throw new Error('Test 2 Failed: Fallback missing Document Name placeholder');
    }
    if (!fallbackContext.includes('Page Number: Unknown Page')) {
      throw new Error('Test 2 Failed: Fallback missing Page Number placeholder');
    }
    if (!fallbackContext.includes('Section Reference: Introduction')) {
      throw new Error('Test 2 Failed: Fallback missing Section Reference default');
    }
    console.log('✅ Test 2 Passed.\n');

    // ----------------------------------------------------
    // Test 3: formatSources - Standard source mapping
    // ----------------------------------------------------
    console.log('[Test 3] Testing formatSources mapping...');
    const formatted = formatSources(mockChunks);
    console.log('Formatted sources output:', JSON.stringify(formatted, null, 2));

    if (formatted.length !== 2) {
      throw new Error(`Test 3 Failed: Expected 2 formatted sources, got ${formatted.length}`);
    }
    const firstSource = formatted[0];
    if (firstSource.documentName !== 'Refund_SOP.pdf') throw new Error('Test 3 Failed: docName mapping error');
    if (firstSource.pageNumber !== 3) throw new Error('Test 3 Failed: pageNumber mapping error');
    if (firstSource.sectionRef !== 'Policy Window') throw new Error('Test 3 Failed: sectionRef mapping error');
    if (firstSource.text !== 'Refund requests must be filed within 30 days of purchase.') {
      throw new Error('Test 3 Failed: text mapping error');
    }
    console.log('✅ Test 3 Passed.\n');

    // ----------------------------------------------------
    // Test 4: generateAnswer - LLM answer generation under mock
    // ----------------------------------------------------
    console.log('[Test 4] Testing generateAnswer with mocked Gemini LLM...');
    const query = 'What is the refund timeline?';
    const structuredContext = buildContext(mockChunks);
    
    const answer = await generateAnswer(query, structuredContext);
    console.log('LLM generated response:', answer);

    if (!answer.startsWith('Mocked LLM Answer:')) {
      throw new Error(`Test 4 Failed: Expected mock answer string, got "${answer}"`);
    }
    console.log('✅ Test 4 Passed.\n');

    console.log('==================================================');
    console.log('🎉 All Context Builder & LLM Q&A Tests Passed!');
    console.log('==================================================');

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  } finally {
    // Restore
    GenerativeModel.prototype.generateContent = originalGenerateContent;
    process.env.GEMINI_API_KEY = originalApiKey;
  }
}

runTests();

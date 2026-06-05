// backend/test_search_mock.js
require('dotenv').config();
const { searchChunks } = require('./services/chunkService');
const Chunk = require('./models/Chunk');
const { GenerativeModel } = require('@google/generative-ai');

// Save original methods
const originalEmbedContent = GenerativeModel.prototype.embedContent;
const originalAggregate = Chunk.aggregate;

// Mock Gemini embedContent
GenerativeModel.prototype.embedContent = async function(request) {
  return {
    embedding: {
      values: Array(768).fill(0.123)
    }
  };
};

// Ensure API key is present for import validation
const originalApiKey = process.env.GEMINI_API_KEY;
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
  process.env.GEMINI_API_KEY = 'mock_api_key_for_testing';
}

async function runSearchMockTests() {
  console.log('==================================================');
  console.log('    Running Vector Search Mock Pipeline Tests     ');
  console.log('==================================================\n');

  let lastPipeline = null;

  // Mock Chunk.aggregate
  Chunk.aggregate = async function(pipeline) {
    lastPipeline = pipeline;
    return [
      {
        _id: 'mock_chunk_id_1',
        documentId: 'mock_doc_id',
        documentName: 'SOP_Test.pdf',
        pageNumber: 1,
        text: 'This is the first mock chunk text response.',
        metadata: { sectionInfo: 'Overview' },
        score: 0.92
      },
      {
        _id: 'mock_chunk_id_2',
        documentId: 'mock_doc_id',
        documentName: 'SOP_Test.pdf',
        pageNumber: 2,
        text: 'This is the second mock chunk text response.',
        metadata: { sectionInfo: 'Procedure' },
        score: 0.85
      }
    ];
  };

  try {
    // Test 1: Default limit (should clamp/default to 5)
    console.log('[Test 1] Testing searchChunks with default limit...');
    await searchChunks('refund instructions');
    
    if (!lastPipeline || lastPipeline.length !== 2) {
      throw new Error(`Test 1 Failed: Expected pipeline length 2, got ${lastPipeline?.length}`);
    }
    
    let vectorSearchStage = lastPipeline[0].$vectorSearch;
    if (!vectorSearchStage) {
      throw new Error('Test 1 Failed: Missing $vectorSearch stage in pipeline');
    }
    if (vectorSearchStage.limit !== 5) {
      throw new Error(`Test 1 Failed: Expected limit 5, got ${vectorSearchStage.limit}`);
    }
    if (vectorSearchStage.queryVector[0] !== 0.123) {
      throw new Error('Test 1 Failed: queryVector did not match mock embedding values');
    }
    console.log('✅ Test 1 Passed: default limit successfully set to 5.\n');

    // Test 2: Under-bound limit clamping (limit = 2 should clamp to 3)
    console.log('[Test 2] Testing searchChunks with limit = 2 (should clamp to 3)...');
    await searchChunks('refund instructions', 2);
    vectorSearchStage = lastPipeline[0].$vectorSearch;
    if (vectorSearchStage.limit !== 3) {
      throw new Error(`Test 2 Failed: Expected limit to clamp to 3, got ${vectorSearchStage.limit}`);
    }
    console.log('✅ Test 2 Passed: limit 2 successfully clamped to minimum of 3.\n');

    // Test 3: Over-bound limit clamping (limit = 10 should clamp to 5)
    console.log('[Test 3] Testing searchChunks with limit = 10 (should clamp to 5)...');
    await searchChunks('refund instructions', 10);
    vectorSearchStage = lastPipeline[0].$vectorSearch;
    if (vectorSearchStage.limit !== 5) {
      throw new Error(`Test 3 Failed: Expected limit to clamp to 5, got ${vectorSearchStage.limit}`);
    }
    console.log('✅ Test 3 Passed: limit 10 successfully clamped to maximum of 5.\n');

    // Test 4: Valid limit within range (limit = 4 should remain 4)
    console.log('[Test 4] Testing searchChunks with limit = 4 (should remain 4)...');
    await searchChunks('refund instructions', 4);
    vectorSearchStage = lastPipeline[0].$vectorSearch;
    if (vectorSearchStage.limit !== 4) {
      throw new Error(`Test 4 Failed: Expected limit to be 4, got ${vectorSearchStage.limit}`);
    }
    console.log('✅ Test 4 Passed: limit 4 preserved.\n');

    // Test 5: Verify projection stage and options
    console.log('[Test 5] Verifying aggregation projection stage...');
    const projectionStage = lastPipeline[1].$project;
    if (!projectionStage) {
      throw new Error('Test 5 Failed: Missing $project stage in pipeline');
    }
    const expectedProjection = {
      _id: 1,
      documentId: 1,
      documentName: 1,
      pageNumber: 1,
      text: 1,
      metadata: 1,
      score: { $meta: 'vectorSearchScore' }
    };
    if (JSON.stringify(projectionStage) !== JSON.stringify(expectedProjection)) {
      throw new Error(`Test 5 Failed: Projection stage mismatch. Got: ${JSON.stringify(projectionStage)}`);
    }
    console.log('✅ Test 5 Passed: projection schema matches specification.\n');

    console.log('==================================================');
    console.log('🎉 All $vectorSearch Mock Pipeline Tests Passed!');
    console.log('==================================================');

  } catch (error) {
    console.error('❌ Mock test failed:', error.message);
    process.exit(1);
  } finally {
    // Restore
    GenerativeModel.prototype.embedContent = originalEmbedContent;
    Chunk.aggregate = originalAggregate;
    process.env.GEMINI_API_KEY = originalApiKey;
  }
}

runSearchMockTests();

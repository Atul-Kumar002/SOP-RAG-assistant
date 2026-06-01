// backend/test_embedding_mock.js
require('dotenv').config();
const { GenerativeModel } = require('@google/generative-ai');

// Save original methods
const originalEmbedContent = GenerativeModel.prototype.embedContent;
const originalBatchEmbedContents = GenerativeModel.prototype.batchEmbedContents;

let mockBatchFail = false;

// Mock embedContent
GenerativeModel.prototype.embedContent = async function(text) {
  console.log(`[Mock API] embedContent called for: "${typeof text === 'string' ? text.substring(0, 30) : JSON.stringify(text).substring(0, 30)}"`);
  return {
    embedding: {
      values: Array(768).fill(0.1) // 768-dimensional mock embedding
    }
  };
};

// Mock batchEmbedContents
GenerativeModel.prototype.batchEmbedContents = async function(batchRequest) {
  console.log(`[Mock API] batchEmbedContents called with ${batchRequest.requests.length} items`);
  if (mockBatchFail) {
    throw new Error('Mock batch request failed for testing fallback');
  }
  return {
    embeddings: batchRequest.requests.map(() => ({
      values: Array(768).fill(0.2)
    }))
  };
};

// Save original env key and set a fake key if not present or placeholder
const originalApiKey = process.env.GEMINI_API_KEY;
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
  process.env.GEMINI_API_KEY = 'fake_key_for_testing';
}

const { getEmbedding, getBatchEmbeddings } = require('./services/embeddingService');

async function runMockTests() {
  console.log('--- Running Embedding Mock Tests ---');

  try {
    // Test 1: Single embedding
    console.log('\n[Test 1] Testing single embedding generation...');
    const singleVector = await getEmbedding('Hello World');
    if (!Array.isArray(singleVector) || singleVector.length !== 768) {
      throw new Error(`Test 1 Failed: Expected array of 768, got ${singleVector?.length}`);
    }
    console.log(`Test 1 Passed: Single embedding dimensions = ${singleVector.length}, values = [${singleVector.slice(0, 3).join(', ')}...]`);

    // Test 2: Batch embeddings (more than BATCH_SIZE = 20)
    console.log('\n[Test 2] Testing batch embedding generation (25 items)...');
    const texts = Array.from({ length: 25 }, (_, i) => `Sample text ${i + 1}`);
    mockBatchFail = false;
    const batchVectors = await getBatchEmbeddings(texts);
    if (!Array.isArray(batchVectors) || batchVectors.length !== 25) {
      throw new Error(`Test 2 Failed: Expected 25 embeddings, got ${batchVectors?.length}`);
    }
    if (batchVectors[0].length !== 768) {
      throw new Error(`Test 2 Failed: Expected embedding dimension 768, got ${batchVectors[0].length}`);
    }
    console.log(`Test 2 Passed: Batch embedding generated ${batchVectors.length} vectors of dimension ${batchVectors[0].length}`);

    // Test 3: Batch fallback to sequential
    console.log('\n[Test 3] Testing batch embedding fallback (triggering error)...');
    mockBatchFail = true;
    const fallbackVectors = await getBatchEmbeddings(texts);
    if (!Array.isArray(fallbackVectors) || fallbackVectors.length !== 25) {
      throw new Error(`Test 3 Failed: Expected 25 embeddings on fallback, got ${fallbackVectors?.length}`);
    }
    console.log(`Test 3 Passed: Fallback generated ${fallbackVectors.length} vectors successfully via sequential fallback`);

    console.log('\n--- All Mock Embedding Tests Passed! ---');
  } catch (error) {
    console.error('Mock tests failed:', error);
    process.exit(1);
  } finally {
    // Restore original prototype methods and env
    GenerativeModel.prototype.embedContent = originalEmbedContent;
    GenerativeModel.prototype.batchEmbedContents = originalBatchEmbedContents;
    process.env.GEMINI_API_KEY = originalApiKey;
  }
}

runMockTests();

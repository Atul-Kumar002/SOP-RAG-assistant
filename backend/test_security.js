// backend/test_security.js
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// 1. Setup mock environment variables
process.env.PORT = 5001;
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
  process.env.GEMINI_API_KEY = 'mock_key_for_testing';
}

// 2. Mock MongoDB database connection
mongoose.connect = async function() {
  console.log('🚀 [Mock DB] Mongoose connection mocked for security tests.');
  return {
    connection: {
      host: 'security-test-cluster.example.net'
    }
  };
};

const Document = require('./models/Document');
const Chunk = require('./models/Chunk');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

// Mock model methods so database operations succeed without database
Document.find = () => ({ sort: () => Promise.resolve([]) });
Document.findById = (id) => Promise.resolve(null);
Conversation.findById = (id) => Promise.resolve(null);
Message.find = () => ({ sort: () => Promise.resolve([]) });
Chunk.aggregate = async () => [
  {
    _id: 'mock_chunk_id',
    text: 'Mock chunk text',
    score: 0.95
  }
];

// Mock generative model
const { GenerativeModel } = require('@google/generative-ai');
GenerativeModel.prototype.embedContent = async () => ({
  embedding: { values: Array(768).fill(0.08) }
});
GenerativeModel.prototype.batchEmbedContents = async () => ({
  embeddings: Array(10).fill({ values: Array(768).fill(0.08) })
});

// 3. Start standard server.js on port 5001
console.log('⚡ Starting Express server on port 5001 for security verification tests...');
require('./server.js');

// Give the server a small moment to boot
setTimeout(async () => {
  console.log('\n--- Starting Security & Validation Verification Tests ---');
  let passed = 0;
  let failed = 0;

  const baseUrl = 'http://localhost:5001';

  const runTest = async (name, testFn) => {
    try {
      console.log(`\n▶️ Testing: ${name}...`);
      await testFn();
      console.log(`✅ Passed: ${name}`);
      passed++;
    } catch (error) {
      console.error(`❌ Failed: ${name}\n   Error: ${error.message}`);
      failed++;
    }
  };

  // Test 1: HTTP Security Headers
  await runTest('HTTP Security Headers presence', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const headers = res.headers;

    const expectedHeaders = {
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'x-xss-protection': '1; mode=block',
      'referrer-policy': 'strict-origin-when-cross-origin'
    };

    for (const [key, value] of Object.entries(expectedHeaders)) {
      const headerVal = headers.get(key);
      if (headerVal !== value) {
        throw new Error(`Expected header "${key}" to be "${value}", but got "${headerVal}"`);
      }
    }
  });

  // Test 2: Input Parameter Validation (Search Endpoint bounds)
  await runTest('Search Endpoint Bounds Validation', async () => {
    // 2.a: similarityThreshold out of bounds (> 1.0)
    const res1 = await fetch(`${baseUrl}/api/docs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query', similarityThreshold: 1.5 })
    });
    if (res1.status !== 400) {
      throw new Error(`Expected 400 Bad Request for threshold > 1.0, got ${res1.status}`);
    }
    const data1 = await res1.json();
    if (!data1.error.includes('threshold')) {
      throw new Error(`Expected error message about similarity threshold, got: ${JSON.stringify(data1)}`);
    }

    // 2.b: limit out of bounds (> 50)
    const res2 = await fetch(`${baseUrl}/api/docs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query', limit: 100 })
    });
    if (res2.status !== 400) {
      throw new Error(`Expected 400 Bad Request for limit > 50, got ${res2.status}`);
    }

    // 2.c: empty/missing query
    const res3 = await fetch(`${baseUrl}/api/docs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' })
    });
    if (res3.status !== 400) {
      throw new Error(`Expected 400 Bad Request for empty query, got ${res3.status}`);
    }
  });

  // Test 3: NoSQL Injection Protection
  await runTest('NoSQL Injection protection', async () => {
    // Attempt passing query as an object to bypass string checks or inject query operator
    const res = await fetch(`${baseUrl}/api/docs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { $ne: '' } })
    });
    // Should return 400 because query is not a string
    if (res.status !== 400) {
      throw new Error(`Expected 400 Bad Request for object query input, got ${res.status}`);
    }
  });

  // Test 4: Invalid ObjectId Validation
  await runTest('Invalid ObjectId parameter validation', async () => {
    const res = await fetch(`${baseUrl}/api/chat/conversations/invalid-id-format`);
    if (res.status !== 400) {
      throw new Error(`Expected 400 Bad Request for invalid ObjectId conversation GET, got ${res.status}`);
    }
    const data = await res.json();
    if (!data.error.includes('Invalid identifier format')) {
      throw new Error(`Expected error about identifier format, got: ${JSON.stringify(data)}`);
    }
  });

  // Test 5: Magic number verification on uploaded files
  await runTest('PDF Magic Number File Signature validation', async () => {
    const formData = new FormData();
    // Create a plain text "fake" PDF file
    const blob = new Blob(['This is not a real PDF file! It is plain text.'], { type: 'application/pdf' });
    formData.append('file', blob, 'fake_invoice.pdf');

    const res = await fetch(`${baseUrl}/api/docs/upload`, {
      method: 'POST',
      body: formData
    });

    if (res.status !== 400) {
      throw new Error(`Expected 400 Bad Request for fake PDF upload, got ${res.status}`);
    }

    const data = await res.json();
    if (!data.error.includes('Invalid file format')) {
      throw new Error(`Expected error regarding file format magic number verification, got: ${JSON.stringify(data)}`);
    }
  });

  // Test 6: Rate Limiting Enforcement
  await runTest('Rate Limiter blocks excessive requests', async () => {
    // The query endpoint `/api/docs/search` is rate-limited to 20 queries/min
    let rateLimited = false;
    let attempts = 0;
    
    // Hit the endpoint 22 times
    for (let i = 0; i < 22; i++) {
      attempts++;
      const res = await fetch(`${baseUrl}/api/docs/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'rate limit test' })
      });
      
      if (res.status === 429) {
        rateLimited = true;
        break;
      }
    }

    if (!rateLimited) {
      throw new Error(`Expected rate limiter to return 429 after 22 requests, but all succeeded/failed with non-429 (attempts: ${attempts})`);
    }
  });

  console.log(`\n=== Verification Results: Passed ${passed}/${passed + failed}, Failed ${failed} ===`);
  
  if (failed > 0) {
    console.error('❌ Security tests failed!');
    process.exit(1);
  } else {
    console.log('🎉 All security verification tests passed successfully!');
    process.exit(0);
  }
}, 1000);

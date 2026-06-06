// backend/test_server.js
require('dotenv').config();
const mongoose = require('mongoose');

// 1. Mock MongoDB database connection
mongoose.connect = async function() {
  console.log('🚀 [Mock DB] MongoDB Connected (Mocking MongoDB Atlas)');
  return {
    connection: {
      host: 'mock-atlas-cluster.example.net'
    }
  };
};

const Document = require('./models/Document');
const Chunk = require('./models/Chunk');

// Mock Document store
const mockDocs = [
  {
    _id: 'doc_id_1',
    name: 'Employee_Handbook.pdf',
    size: 1048576,
    chunkCount: 12,
    storageProvider: 'local',
    filePath: '/uploads/Employee_Handbook.pdf',
    createdAt: new Date()
  },
  {
    _id: 'doc_id_2',
    name: 'Refund_Policy_SOP.pdf',
    size: 512000,
    chunkCount: 5,
    storageProvider: 'local',
    filePath: '/uploads/Refund_Policy_SOP.pdf',
    createdAt: new Date(Date.now() - 86400000)
  }
];

// Mock database Document functions
Document.find = function() {
  return {
    sort: function() {
      return Promise.resolve(mockDocs);
    }
  };
};

Document.findById = function(id) {
  const doc = mockDocs.find(d => String(d._id) === String(id));
  return Promise.resolve(doc);
};

Document.prototype.save = async function() {
  console.log('📝 [Mock DB] Document.save called for:', this.name);
  this._id = 'new_doc_id_' + Date.now();
  this.createdAt = new Date();
  mockDocs.unshift(this);
  return this;
};

Document.deleteOne = async function(query) {
  console.log('🗑️ [Mock DB] Document.deleteOne called for:', query);
  const idx = mockDocs.findIndex(d => String(d._id) === String(query._id));
  if (idx !== -1) {
    mockDocs.splice(idx, 1);
  }
  return { deletedCount: 1 };
};

// Mock database Chunk functions
Chunk.insertMany = async function(chunks) {
  console.log('📝 [Mock DB] Chunk.insertMany called with', chunks.length, 'chunks');
  return chunks;
};

Chunk.deleteMany = async function(query) {
  console.log('🗑️ [Mock DB] Chunk.deleteMany called for:', query);
  return { deletedCount: 1 };
};

Chunk.aggregate = async function(pipeline) {
  console.log('🔍 [Mock DB] Chunk.aggregate called. Simulating vector similarity search results.');
  return [
    {
      _id: 'chunk_id_1',
      documentId: 'doc_id_2',
      documentName: 'Refund_Policy_SOP.pdf',
      pageNumber: 2,
      text: 'Our refund policy specifies that standard items can be returned within 14 days of receipt. All returned items must be in original condition with packaging intact.',
      metadata: { sectionInfo: 'Return Window' },
      score: 0.94
    },
    {
      _id: 'chunk_id_2',
      documentId: 'doc_id_2',
      documentName: 'Refund_Policy_SOP.pdf',
      pageNumber: 3,
      text: 'To request a refund, submit a ticket through our customer service portal. Refunds are processed back to the original payment method within 10 business days.',
      metadata: { sectionInfo: 'Refund Process' },
      score: 0.88
    }
  ];
};

// 2. Mock Generative AI API methods
const { GenerativeModel } = require('@google/generative-ai');

// Mock content generation for RAG answer
GenerativeModel.prototype.generateContent = async function(request) {
  console.log('🤖 [Mock LLM] generateContent called. Creating structured answer.');
  return {
    response: {
      text: () => `Based on the Refund Policy SOP:
* **Return Window**: You can return standard items within 14 days of receipt, provided they are in original condition with original packaging.
* **Refund Process**: To request a refund, submit a ticket in our portal. Refunds are processed back to your original payment method in **10 business days**.`
    }
  };
};

// Mock embedding generation for PDF uploads and chunk search query
GenerativeModel.prototype.embedContent = async function(request) {
  return {
    embedding: {
      values: Array(768).fill(0.08)
    }
  };
};

GenerativeModel.prototype.batchEmbedContents = async function(batchRequest) {
  return {
    embeddings: batchRequest.requests.map(() => ({
      values: Array(768).fill(0.08)
    }))
  };
};

// Override the environment key if empty to pass startup validations
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
  process.env.GEMINI_API_KEY = 'mock_key_for_testing';
}

// 3. Start standard server.js
console.log('⚡ Starting Express server with mocks...');
require('./server.js');

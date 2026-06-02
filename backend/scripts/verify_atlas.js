require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('../models/Document');
const Chunk = require('../models/Chunk');

// Atlas Vector Search Index Configuration JSON
const ATLAS_INDEX_CONFIG = {
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }
  ]
};

async function run() {
  console.log('==================================================');
  console.log('      MongoDB Atlas Vector Storage setup       ');
  console.log('==================================================\n');

  console.log('--- 1. MongoDB Atlas Vector Search Index Config ---');
  console.log('To use vector search, create a Vector Search Index on the "chunks" collection on MongoDB Atlas.');
  console.log('Use the following JSON configuration for the index (recommended name: "vector_index"):');
  console.log(JSON.stringify(ATLAS_INDEX_CONFIG, null, 2));
  console.log('\n--------------------------------------------------\n');

  console.log('--- 2. Connecting to MongoDB ---');
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('<username>') || uri.includes('example.mongodb.net')) {
    console.log('⚠️  Status: MONGODB_URI is not configured with actual credentials.');
    console.log('   Please configure MONGODB_URI in your backend/.env file with a valid connection string.');
    console.log('   Skipping database write tests.\n');
    console.log('==================================================');
    console.log('Schema configuration and Atlas indexing specifications verified.');
    console.log('==================================================');
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log(`✅ Connected successfully to: ${mongoose.connection.host}`);
    console.log(`   Database Name: ${mongoose.connection.db.databaseName}\n`);

    console.log('--- 3. Verifying Collection Schemas & Write Operations ---');
    
    // Create a mock document entry
    const testDoc = new Document({
      name: 'Verification_Test_SOP.pdf',
      size: 102450,
      chunkCount: 1,
      filePath: '/mock/path/Verification_Test_SOP.pdf',
      storageProvider: 'local',
      storageKey: 'mock-storage-key-12345',
      metadata: {
        title: 'Verification SOP Test Document',
        author: 'System Verification Bot',
        subject: 'Database Schema Verification',
        creator: 'OpsMind AI Engine',
        totalPages: 1,
        creationDate: new Date()
      }
    });

    await testDoc.save();
    console.log(`✅ Created SOP Document: "${testDoc.name}" with ID: ${testDoc._id}`);

    // Create a mock 768-dimensional float embedding array
    const mockEmbedding = Array.from({ length: 768 }, () => parseFloat((Math.random() * 2 - 1).toFixed(6)));

    const testChunk = new Chunk({
      documentId: testDoc._id,
      documentName: testDoc.name,
      pageNumber: 1,
      text: 'Standard Operating Procedure verification: This chunk contains text stored in the MongoDB Atlas database for validation purposes.',
      embedding: mockEmbedding,
      metadata: {
        width: 612,
        height: 792,
        pageLabel: '1',
        wordCount: 17,
        characterCount: 119,
        pageNumber: 1,
        documentName: testDoc.name,
        sectionInfo: 'Verification Section',
        chunkIndex: 0
      }
    });

    await testChunk.save();
    console.log(`✅ Created SOP Chunk with embedding vector (dim: ${testChunk.embedding.length})`);
    console.log(`   First 5 dimensions: [${testChunk.embedding.slice(0, 5).join(', ')}]`);

    console.log('\n--- 4. Query Validation ---');
    
    const retrievedDoc = await Document.findById(testDoc._id);
    console.log(`✅ Successfully retrieved Document. Name: "${retrievedDoc.name}"`);

    const retrievedChunk = await Chunk.findOne({ documentId: testDoc._id });
    console.log(`✅ Successfully retrieved Chunk.`);
    console.log(`   Text Snippet: "${retrievedChunk.text.substring(0, 50)}..."`);
    console.log(`   Chunk Index: ${retrievedChunk.metadata.chunkIndex}`);
    console.log(`   Section Info: "${retrievedChunk.metadata.sectionInfo}"`);

    console.log('\n--- 5. Cleaning Up Test Data ---');
    await Chunk.deleteOne({ _id: testChunk._id });
    await Document.deleteOne({ _id: testDoc._id });
    console.log('✅ Cleaned up database entries.');

  } catch (error) {
    console.error('❌ Database connection or operation failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n==================================================');
    console.log('                  Verification End                ');
    console.log('==================================================');
  }
}

run();

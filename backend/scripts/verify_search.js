require('dotenv').config();
const mongoose = require('mongoose');
const { getEmbedding } = require('../services/embeddingService');
const Chunk = require('../models/Chunk');

async function testVectorSearch() {
  console.log('==================================================');
  console.log('    MongoDB Atlas Vector Search Verification     ');
  console.log('==================================================\n');

  // 1. Check Env Config
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<username>') || uri.includes('example.mongodb.net')) {
    console.error('❌ Error: MONGODB_URI is not configured in backend/.env.');
    console.log('Please set MONGODB_URI in backend/.env to a valid MongoDB Atlas connection string.');
    process.exit(1);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey === 'your_gemini_api_key_here') {
    console.error('❌ Error: GEMINI_API_KEY is not configured in backend/.env.');
    console.log('Please set GEMINI_API_KEY to a valid Google Generative AI API key.');
    process.exit(1);
  }

  try {
    // 2. Connect to Database
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri);
    console.log(`✅ Connected successfully to: ${mongoose.connection.host}`);
    console.log(`   Database Name: ${mongoose.connection.db.databaseName}\n`);

    // 3. Generate query embedding
    const testQuery = 'refund policy instructions';
    console.log(`Generating embedding for test query: "${testQuery}"...`);
    const queryEmbedding = await getEmbedding(testQuery);
    console.log(`✅ Embedding generated successfully. Dimension: ${queryEmbedding.length}\n`);

    // 4. Test vector search
    console.log('Executing $vectorSearch aggregation on "chunks" collection...');
    const results = await Chunk.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 100,
          limit: 3
        }
      },
      {
        $project: {
          _id: 1,
          documentId: 1,
          documentName: 1,
          pageNumber: 1,
          text: 1,
          metadata: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ]);

    console.log(`✅ Vector Search query completed. Found ${results.length} matches.\n`);

    if (results.length === 0) {
      console.log('⚠️  No chunks match the query. If you have not uploaded any PDFs yet, please ingest a PDF first via the UI or using the upload system.');
    } else {
      results.forEach((match, idx) => {
        console.log(`--- Match #${idx + 1} (Similarity Score: ${(match.score * 100).toFixed(2)}%) ---`);
        console.log(`Document: ${match.documentName} | Page: ${match.pageNumber}`);
        if (match.metadata && match.metadata.sectionInfo) {
          console.log(`Section: ${match.metadata.sectionInfo}`);
        }
        console.log(`Snippet: "${match.text.substring(0, 150)}..."`);
        console.log('--------------------------------------------------\n');
      });
    }

    console.log('==================================================');
    console.log('✅ Cosine Similarity Vector Search Verification PASSED!');
    console.log('==================================================');

  } catch (error) {
    console.error('\n❌ Vector Search Verification Failed:', error.message);
    console.log('\n--- Troubleshooting Guidance ---');
    if (error.message.includes('$vectorSearch') || error.message.includes('not supported') || error.message.includes('unrecognized pipeline stage')) {
      console.log('⚠️  It appears your MongoDB database instance does not support Atlas Vector Search ($vectorSearch).');
      console.log('   Note that local MongoDB community servers do NOT support Atlas Vector Search. You must connect');
      console.log('   to a MongoDB Atlas cluster (M0 clusters or higher are supported).');
    } else if (error.message.toLowerCase().includes('index') || error.message.includes('vector_index')) {
      console.log('⚠️  The Atlas Vector Search Index "vector_index" could not be found.');
      console.log('   Please configure the search index in your MongoDB Atlas Dashboard:');
      console.log('   1. Navigate to your Atlas Project -> Database Deployments.');
      console.log('   2. Click on the "Atlas Search" tab next to your Cluster name.');
      console.log('   3. Click "Create Search Index", then select "JSON Editor" under "Atlas Vector Search".');
      console.log('   4. Select your database (opsmind_ai) and collection (chunks).');
      console.log('   5. Set the Index Name to exactly: "vector_index".');
      console.log('   6. Paste the following configuration JSON:');
      console.log(JSON.stringify({
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: 768,
            similarity: 'cosine'
          }
        ]
      }, null, 2));
      console.log('   7. Click "Next", then "Create Search Index". Wait ~1-2 minutes for it to build.');
    } else {
      console.log('   Verify your credentials in backend/.env, confirm the server has internet access,');
      console.log('   and check that you have uploaded at least one PDF file.');
    }
    console.log('--------------------------------------------------\n');
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

testVectorSearch();

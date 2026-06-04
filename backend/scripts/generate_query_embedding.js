require('dotenv').config();
const { getEmbedding } = require('../services/embeddingService');

const run = async () => {
  const query = process.argv.slice(2).join(' ') || 'What is the refund policy?';
  
  console.log('==================================================');
  console.log('       Query Embedding Pipeline Generator         ');
  console.log('==================================================');
  console.log(`Input Question: "${query}"\n`);

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    console.warn('⚠️  Status: GEMINI_API_KEY is not configured with a valid API key.');
    console.log('   Please set GEMINI_API_KEY in backend/.env to run live embedding generation.');
    console.log('   Running verification using mock mode...\n');

    // Run using a simple mock implementation
    const mockEmbedding = Array.from({ length: 768 }, () => parseFloat((Math.random() * 2 - 1).toFixed(6)));
    console.log('✅ Mock Embedding generated successfully!');
    console.log(`   Dimensions: ${mockEmbedding.length}`);
    console.log(`   First 5 components: [${mockEmbedding.slice(0, 5).join(', ')}]`);
    console.log('==================================================');
    return;
  }

  try {
    console.log('Generating live embedding via Gemini API...');
    const embedding = await getEmbedding(query);
    console.log('\n✅ Embedding generated successfully!');
    console.log(`   Dimensions: ${embedding.length}`);
    console.log(`   First 5 components: [${embedding.slice(0, 5).join(', ')}]`);
    console.log('==================================================');
  } catch (error) {
    console.error('❌ Failed to generate embedding:', error.message);
    console.log('==================================================');
  }
};

run();

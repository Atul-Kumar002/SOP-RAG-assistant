require('dotenv').config();
const { chunkPages } = require('./services/chunkService');
const { getEmbedding } = require('./services/embeddingService');

const runTest = async () => {
  console.log('--- Testing Chunk Service ---');
  const mockPages = [
    {
      pageNumber: 1,
      text: 'This is page one. Standard operating procedures are guidelines. '.repeat(20) // ~1200 characters
    },
    {
      pageNumber: 2,
      text: 'This is page two. Refund policy rules. '.repeat(10) // ~400 characters
    }
  ];

  const chunks = chunkPages(mockPages, 500, 50);
  console.log(`Generated ${chunks.length} chunks.`);
  chunks.forEach((c, idx) => {
    console.log(`Chunk ${idx + 1}: Page ${c.pageNumber}, length: ${c.text.length} chars`);
    console.log(`Snippet: "${c.text.substring(0, 60)}..."`);
  });

  console.log('\n--- Testing Embedding Service ---');
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    console.log('Skipping Embedding test: GEMINI_API_KEY is not configured in .env file.');
    return;
  }

  try {
    console.log('Requesting embedding for "Hello, OpsMind AI!"');
    const vector = await getEmbedding('Hello, OpsMind AI!');
    console.log(`Successfully generated vector. Dimensions: ${vector.length}`);
    console.log(`First 5 components: [${vector.slice(0, 5).join(', ')}]`);
  } catch (error) {
    console.error('Embedding test failed:', error.message);
  }
};

runTest();

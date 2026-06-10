const { GoogleGenerativeAI } = require('@google/generative-ai');

const EMBEDDING_MODEL = 'gemini-embedding-001';
let genAI;

/**
 * Returns a cached instance of the Google Generative AI client.
 */
const getClient = () => {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      throw new Error('GEMINI_API_KEY is not configured or contains the default placeholder. Please set it in your .env file.');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
};

/**
 * Generates a vector embedding for a single text string using gemini-embedding-001.
 *
 * @param {string} text - The input text to embed.
 * @returns {Promise<Array<number>>} - A 768-dimensional array of floats.
 */
const getEmbedding = async (text) => {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    });
    
    if (result && result.embedding && result.embedding.values) {
      return result.embedding.values;
    }
    throw new Error('Invalid response format received from embedding service API.');
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Embedding Generation Failed: ${error.message}`);
  }
};

/**
 * Generates vector embeddings for a list of text strings in batches.
 * Features a fallback mechanism to process individual embeddings if a batch request fails.
 *
 * @param {Array<string>} texts - Array of texts to embed.
 * @returns {Promise<Array<Array<number>>>} - Array of 768-dimensional vector embeddings.
 */
const getBatchEmbeddings = async (texts) => {
  const client = getClient();
  const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
  const embeddings = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const result = await model.batchEmbedContents({
        requests: batch.map(t => ({
          content: { parts: [{ text: t }] },
          outputDimensionality: 768,
        }))
      });
      
      if (result && result.embeddings) {
        embeddings.push(...result.embeddings.map(e => e.values));
      } else {
        throw new Error('Batch embeddings response did not contain embeddings list.');
      }
    } catch (error) {
      console.warn(`Batch embedding failed for index ${i} to ${i + batch.length}. Falling back to sequential embedding...`, error);
      // Fallback: request sequentially to ensure robustness
      for (const text of batch) {
        const emb = await getEmbedding(text);
        embeddings.push(emb);
      }
    }
  }

  return embeddings;
};

module.exports = { getEmbedding, getBatchEmbeddings };

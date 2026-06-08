const { GoogleGenerativeAI } = require('@google/generative-ai');

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
 * Generates an answer to a user query using the structured SOP context.
 *
 * @param {string} query - The user's question or search query
 * @param {string} structuredContext - The merged chunks of SOP text formatted as structured context
 * @returns {Promise<string>} - The AI-generated answer
 */
const generateAnswer = async (query, structuredContext) => {
  try {
    const client = getClient();
    // Use gemini-1.5-flash as it is fast, stable, and highly capable for RAG tasks
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a professional enterprise SOP Query Assistant.
Your task is to answer the user's question accurately using ONLY the standard operating procedure content in the structured context below.

Rules:
1. Ground your response strictly in the provided context references.
2. If the context does not contain enough information to answer the question, state: "I cannot find the answer in the provided SOP documents."
3. Do not assume or extrapolate beyond the provided text.
4. Keep the answer clear, structured, and professional.
5. EVERY statement, claim, sentence, or list item you generate MUST be explicitly cited. Append the exact citation marker \`[Source Reference X]\` (where X is the 1-based index of the source in the context) at the end of the statement, sentence, or list item that uses that source. If a sentence uses information from multiple sources, append multiple citation markers (e.g. \`[Source Reference 1] [Source Reference 2]\`). Do not use any citation markers that are not in the context.

Example of citation placement:
"According to the handbook, employees are entitled to 15 days of paid annual leave [Source Reference 1]. However, approval from the department head is required at least two weeks in advance [Source Reference 2]."

Structured Context:
${structuredContext}

User Question:
${query}

Answer:`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    if (result && result.response) {
      // Use the text() helper method from the Gemini SDK response object
      const responseText = typeof result.response.text === 'function' 
        ? result.response.text() 
        : result.response.text;
      
      return responseText.trim();
    }
    throw new Error('Invalid response format received from Generative AI API.');
  } catch (error) {
    console.error('Error generating AI answer:', error);
    throw new Error(`AI Answer Generation Failed: ${error.message}`);
  }
};

module.exports = {
  generateAnswer
};

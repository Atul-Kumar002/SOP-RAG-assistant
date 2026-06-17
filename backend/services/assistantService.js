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
 * Returns the list of models to try, prioritizing the one set in environment variables.
 */
const getModelsToTry = () => {
  const models = [
    'gemini-1.5-flash',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ];
  
  if (process.env.GEMINI_MODEL) {
    if (!models.includes(process.env.GEMINI_MODEL)) {
      models.unshift(process.env.GEMINI_MODEL);
    } else {
      const idx = models.indexOf(process.env.GEMINI_MODEL);
      models.splice(idx, 1);
      models.unshift(process.env.GEMINI_MODEL);
    }
  }
  return models;
};

/**
 * Generates an answer to a user query using the structured SOP context.
 *
 * @param {string} query - The user's question or search query
 * @param {string} structuredContext - The merged chunks of SOP text formatted as structured context
 * @returns {Promise<string>} - The AI-generated answer
 */
const generateAnswer = async (query, structuredContext) => {
  const modelsToTry = getModelsToTry();
  let lastError = null;
  
  for (const modelName of modelsToTry) {
    try {
      console.log(`[Assistant Service] Attempting AI generation with model: ${modelName}`);
      const client = getClient();
      const model = client.getGenerativeModel({ model: modelName });

      const prompt = `You are a professional enterprise SOP Query Assistant.
Your task is to answer the user's question accurately using ONLY the standard operating procedure content in the structured context below.

Rules & Constraints:
1. Ground your response strictly in the provided context references. Do not use external knowledge, assumptions, or extrapolations.
2. If the context does not contain enough information to answer the question, state exactly: "I don't know based on the provided SOPs." and absolutely nothing else. Do not try to write a response or add citation markers if you cannot find the answer.
3. Keep the answer clear, structured, and professional.
4. Do not make up facts or hallucinate source references. Everything in your response must be traceable to the provided context.
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
        
        console.log(`[Assistant Service] Successfully generated answer using model: ${modelName}`);
        return responseText.trim();
      }
      throw new Error('Invalid response format received from Generative AI API.');
    } catch (error) {
      console.warn(`[Assistant Service] Generation failed for model ${modelName}:`, error.message || error);
      lastError = error;
    }
  }

  // If all models failed, throw the last error
  throw new Error(`AI Answer Generation Failed: ${lastError ? lastError.message : 'All models failed to respond'}`);
};

/**
 * Condenses the conversation history and follow-up question into a single standalone search query.
 *
 * @param {string} query - The follow-up question from the user
 * @param {Array} history - The conversation history (messages)
 * @returns {Promise<string>} - The standalone search query
 */
const generateStandaloneQuery = async (query, history) => {
  const modelsToTry = getModelsToTry();
  const formattedHistory = history
    .map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n');

  const prompt = `You are an AI assistant helping to reformulate user questions for a search engine.
Given the following conversation history and a new follow-up question, rephrase the follow-up question into a single, standalone query (in English) that includes all necessary context from the conversation history.
Do not include any conversational filler, explanations, or metadata. Output ONLY the standalone search query.

Conversation History:
${formattedHistory}

Follow-up Question:
${query}

Standalone Query:`;

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      console.log(`[Assistant Service] Attempting query rephrasing with model: ${modelName}`);
      const client = getClient();
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      
      if (result && result.response) {
        const responseText = typeof result.response.text === 'function'
          ? result.response.text()
          : result.response.text;
        console.log(`[Assistant Service] Rephrased query successfully: "${responseText.trim()}"`);
        return responseText.trim();
      }
      throw new Error('Invalid response format from Generative AI API.');
    } catch (error) {
      console.warn(`[Assistant Service] Rephrasing failed for model ${modelName}:`, error.message || error);
      lastError = error;
    }
  }
  // Fallback: If rephrasing fails, return the original query
  console.warn('[Assistant Service] Rephrasing failed for all models. Falling back to original query.');
  return query;
};

/**
 * Generates a streaming response using system instructions, retrieved context, and conversation history.
 *
 * @param {string} query - The user's latest question
 * @param {string} structuredContext - The RAG context format
 * @param {Array} history - Previous messages in this conversation
 * @returns {Promise<Object>} - The Gemini stream result object
 */
const generateAnswerStream = async (query, structuredContext, history) => {
  const modelsToTry = getModelsToTry();
  const formattedHistory = history
    .map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n');

  const prompt = `You are a professional enterprise SOP Query Assistant.
Your task is to answer the user's question accurately using ONLY the standard operating procedure content in the structured context below.

Rules & Constraints:
1. Ground your response strictly in the provided context references. Do not use external knowledge, assumptions, or extrapolations.
2. If the context does not contain enough information to answer the question, state exactly: "I don't know based on the provided SOPs." and absolutely nothing else. Do not try to write a response or add citation markers if you cannot find the answer.
3. Keep the answer clear, structured, and professional.
4. Do not make up facts or hallucinate source references. Everything in your response must be traceable to the provided context.
5. EVERY statement, claim, sentence, or list item you generate MUST be explicitly cited. Append the exact citation marker \`[Source Reference X]\` (where X is the 1-based index of the source in the context) at the end of the statement, sentence, or list item that uses that source. If a sentence uses information from multiple sources, append multiple citation markers (e.g. \`[Source Reference 1] [Source Reference 2]\`). Do not use any citation markers that are not in the context.

Structured Context:
${structuredContext}

Conversation History:
${formattedHistory}

User Question:
${query}

Answer:`;

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      console.log(`[Assistant Service] Attempting streaming AI generation with model: ${modelName}`);
      const client = getClient();
      const model = client.getGenerativeModel({ model: modelName });
      const resultStream = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return resultStream;
    } catch (error) {
      console.warn(`[Assistant Service] Streaming attempt failed for model ${modelName}:`, error.message || error);
      lastError = error;
    }
  }
  throw new Error(`AI Streaming Answer Generation Failed: ${lastError ? lastError.message : 'All models failed to respond'}`);
};

module.exports = {
  generateAnswer,
  generateStandaloneQuery,
  generateAnswerStream
};

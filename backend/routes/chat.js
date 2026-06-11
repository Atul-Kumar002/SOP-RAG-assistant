const express = require('express');
const router = express.Router();
const { searchChunks } = require('../services/chunkService');
const { buildContext, formatSources } = require('../services/contextBuilderService');
const { generateAnswer } = require('../services/assistantService');
const { parseResponseChunks } = require('../services/citationService');

// @route   POST /api/chat/query
// @desc    Perform Atlas Vector Search, merge context, generate LLM answer and format sources
// @access  Public
router.post('/query', async (req, res) => {
  const { query, limit = 5, similarityThreshold = 0.0, numCandidates = 100 } = req.body;
  if (!query || query.trim() === '') {
    return res.status(400).json({ error: 'Search query is required.' });
  }

  try {
    console.log(`[Chat Query] Performing Vector Search for query: "${query}" with limit: ${limit}, threshold: ${similarityThreshold}, candidates: ${numCandidates}`);
    const results = await searchChunks(query, limit, similarityThreshold, numCandidates);
    
    // Build structured LLM context
    const structuredContext = buildContext(results);
    
    // Format retrieved sources with Document Name, Page Number, and Section Reference
    const formattedSources = formatSources(results);
    
    // Generate AI answer using Gemini
    let answerText = '';
    try {
      answerText = await generateAnswer(query, structuredContext);
    } catch (genError) {
      console.error('[Chat Query] AI answer generation failed:', genError);
      let errorDetails = genError.message || '';
      if (errorDetails.includes('Quota exceeded') || errorDetails.includes('429')) {
        errorDetails = 'AI service quota exceeded (the daily free-tier limit has been reached).';
      } else {
        // Strip out long JSON payloads or internal trace info
        errorDetails = errorDetails.replace(/\[\{"@type":.*/g, '').trim();
        if (errorDetails.length > 150) {
          errorDetails = errorDetails.substring(0, 147) + '...';
        }
      }
      answerText = `⚠️ **AI Service Error:** We failed to generate a synthesized answer because the AI service responded with: "${errorDetails}"\n\nBelow are the matching source references retrieved from the documents.`;
    }

    // Generate traceable response chunks mapped to sources
    const responseChunks = parseResponseChunks(answerText, formattedSources);

    res.json({
      answer: answerText,
      responseChunks: responseChunks,
      sources: formattedSources,
      context: structuredContext
    });
  } catch (error) {
    console.error('[Chat Query] Ask Assistant endpoint failed:', error);
    res.status(500).json({
      error: `Assistant Query failed: ${error.message}`,
      details: 'Check your MongoDB Atlas Vector Search index and GEMINI_API_KEY environment variable configurations.'
    });
  }
});

module.exports = router;

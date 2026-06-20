const express = require('express');
const router = express.Router();
const { searchChunks } = require('../services/chunkService');
const { buildContext, formatSources } = require('../services/contextBuilderService');
const { generateAnswer, generateStandaloneQuery, generateAnswerStream } = require('../services/assistantService');
const { parseResponseChunks } = require('../services/citationService');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

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

// @route   POST /api/chat/conversations
// @desc    Create a new conversation session
// @access  Public
router.post('/conversations', async (req, res) => {
  try {
    const conversation = new Conversation({ title: 'New Chat' });
    await conversation.save();
    res.status(201).json(conversation);
  } catch (error) {
    console.error('[Chat] Create conversation failed:', error);
    res.status(500).json({ error: `Failed to create conversation: ${error.message}` });
  }
});

// @route   GET /api/chat/conversations
// @desc    Get all conversations sorted by updatedAt desc
// @access  Public
router.get('/conversations', async (req, res) => {
  try {
    const conversations = await Conversation.find().sort({ updatedAt: -1 });
    res.json(conversations);
  } catch (error) {
    console.error('[Chat] List conversations failed:', error);
    res.status(500).json({ error: `Failed to list conversations: ${error.message}` });
  }
});

// @route   GET /api/chat/conversations/:id
// @desc    Get a conversation and its messages
// @access  Public
router.get('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    const messages = await Message.find({ conversationId: id }).sort({ createdAt: 1 });
    res.json({ conversation, messages });
  } catch (error) {
    console.error('[Chat] Get conversation history failed:', error);
    res.status(500).json({ error: `Failed to get conversation history: ${error.message}` });
  }
});

// @route   DELETE /api/chat/conversations/:id
// @desc    Delete a conversation and all its messages
// @access  Public
router.delete('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Conversation.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    await Message.deleteMany({ conversationId: id });
    res.json({ message: 'Conversation deleted successfully.' });
  } catch (error) {
    console.error('[Chat] Delete conversation failed:', error);
    res.status(500).json({ error: `Failed to delete conversation: ${error.message}` });
  }
});

// @route   POST /api/chat/conversations/:id/messages
// @desc    Send a message to a conversation (SSE streaming supported)
// @access  Public
router.post('/conversations/:id/messages', async (req, res) => {
  const { id: conversationId } = req.params;
  const { text, stream = false, limit = 5, similarityThreshold = 0.0, numCandidates = 100 } = req.body;

  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    // 1. Save User Message
    const userMessage = new Message({
      conversationId,
      sender: 'user',
      text: text.trim()
    });
    await userMessage.save();

    // Update Conversation title if it was 'New Chat'
    if (conversation.title === 'New Chat') {
      conversation.title = text.trim().substring(0, 40) + (text.trim().length > 40 ? '...' : '');
      await conversation.save();
    }

    // 2. Fetch history (excluding the new user message we just saved)
    const history = await Message.find({ conversationId }).sort({ createdAt: 1 });
    // Limit prior messages to the last 6 messages (3 turns) to optimize token usage
    const priorMessages = history.slice(0, -1).slice(-6);

    // 3. Rephrase query if history exists
    let searchTerms = text.trim();
    if (priorMessages.length > 0) {
      try {
        searchTerms = await generateStandaloneQuery(text.trim(), priorMessages);
      } catch (rephraseErr) {
        console.warn('[Chat Route] Standalone query generation failed, using original query:', rephraseErr);
      }
    }

    // 4. Perform Vector Search
    console.log(`[Conversational Chat] Performing search for query: "${searchTerms}"`);
    const results = await searchChunks(searchTerms, limit, similarityThreshold, numCandidates);
    const structuredContext = buildContext(results);
    const formattedSources = formatSources(results);

    // 5. Respond (SSE or JSON)
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      // Send sources immediately
      res.write(`data: ${JSON.stringify({ type: 'sources', sources: formattedSources })}\n\n`);

      let answerText = '';
      try {
        const resultStream = await generateAnswerStream(text.trim(), structuredContext, priorMessages);
        for await (const chunk of resultStream.stream) {
          const chunkText = typeof chunk.text === 'function' ? chunk.text() : chunk.text;
          answerText += chunkText;
          res.write(`data: ${JSON.stringify({ type: 'token', text: chunkText })}\n\n`);
        }
      } catch (streamErr) {
        console.error('[Chat Route] AI streaming answer failed:', streamErr);
        let errorDetails = streamErr.message || '';
        if (errorDetails.includes('Quota exceeded') || errorDetails.includes('429')) {
          errorDetails = 'AI service quota exceeded (the daily free-tier limit has been reached).';
        } else {
          errorDetails = errorDetails.replace(/\[\{"@type":.*/g, '').trim();
          if (errorDetails.length > 150) {
            errorDetails = errorDetails.substring(0, 147) + '...';
          }
        }
        answerText = `\n\n⚠️ **AI Service Error:** Streaming answer failed because: "${errorDetails}"`;
        res.write(`data: ${JSON.stringify({ type: 'token', text: answerText })}\n\n`);
      }

      // Generate traceable response chunks
      const responseChunks = parseResponseChunks(answerText, formattedSources);

      // Save Assistant Message
      const assistantMessage = new Message({
        conversationId,
        sender: 'assistant',
        text: answerText,
        sources: formattedSources,
        responseChunks
      });
      await assistantMessage.save();

      // Update Conversation updatedAt
      await Conversation.findByIdAndUpdate(conversationId, { updatedAt: new Date() });

      res.write(`data: ${JSON.stringify({ type: 'done', answer: answerText, responseChunks })}\n\n`);
      res.end();
    } else {
      // Non-streaming response
      let answerText = '';
      try {
        const resultStream = await generateAnswerStream(text.trim(), structuredContext, priorMessages);
        for await (const chunk of resultStream.stream) {
          const chunkText = typeof chunk.text === 'function' ? chunk.text() : chunk.text;
          answerText += chunkText;
        }
      } catch (genError) {
        console.error('[Chat Route] Non-stream AI generation failed:', genError);
        let errorDetails = genError.message || '';
        if (errorDetails.includes('Quota exceeded') || errorDetails.includes('429')) {
          errorDetails = 'AI service quota exceeded.';
        } else {
          errorDetails = errorDetails.replace(/\[\{"@type":.*/g, '').trim();
        }
        answerText = `⚠️ **AI Service Error:** We failed to generate an answer because: "${errorDetails}"`;
      }

      const responseChunks = parseResponseChunks(answerText, formattedSources);

      const assistantMessage = new Message({
        conversationId,
        sender: 'assistant',
        text: answerText,
        sources: formattedSources,
        responseChunks
      });
      await assistantMessage.save();

      await Conversation.findByIdAndUpdate(conversationId, { updatedAt: new Date() });

      res.json({
        answer: answerText,
        responseChunks,
        sources: formattedSources,
        context: structuredContext
      });
    }
  } catch (error) {
    console.error('[Chat Route] Conversational Message endpoint failed:', error);
    res.status(500).json({ error: `Message transaction failed: ${error.message}` });
  }
});

module.exports = router;

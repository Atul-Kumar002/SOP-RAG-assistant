const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Chunk = require('../models/Chunk');
const { parsePdf } = require('../services/pdfService');
const { chunkPages, searchChunks } = require('../services/chunkService');
const { getEmbedding, getBatchEmbeddings } = require('../services/embeddingService');
const storageService = require('../services/storageService');
const { buildContext, formatSources } = require('../services/contextBuilderService');
const { generateAnswer } = require('../services/assistantService');

// Ensure upload directory exists for temporary Multer files
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Sanitize original filename to prevent path traversal / shell injection
    const sanitized = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitized);
  }
});

const fileFilter = (req, file, cb) => {
  const fileExt = path.extname(file.originalname).toLowerCase();
  if (file.mimetype === 'application/pdf' && fileExt === '.pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF documents (.pdf) are allowed.'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// @route   POST /api/docs/upload
// @desc    Upload a PDF, parse it, chunk text, generate embeddings, and index into MongoDB Atlas Vector Search
// @access  Public
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a PDF file.' });
  }

  const tempFilePath = req.file.path;
  const fileName = path.basename(req.file.originalname);
  const fileSize = req.file.size;

  let document = null;
  let uploadResult = null;

  try {
    // 1. Read PDF file into buffer from temporary path
    const dataBuffer = fs.readFileSync(tempFilePath);

    // 2. Parse PDF to extract text page-by-page
    console.log(`Parsing PDF: ${fileName}`);
    // 2. Parse PDF to extract text page-by-page along with metadata
    console.log(`Parsing PDF: ${fileName}`);
    const { pages, metadata } = await parsePdf(dataBuffer);
    
    if (!pages || pages.length === 0) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return res.status(400).json({ error: 'The PDF document contains no extractable text.' });
    }

    // 3. Chunk the pages
    console.log(`Chunking text for: ${fileName}`);
    const rawChunks = chunkPages(pages, fileName, 1000, 100);

    if (rawChunks.length === 0) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return res.status(400).json({ error: 'No text chunks could be generated from the document.' });
    }

    // 4. Move/upload file using the storage service
    console.log(`Uploading file via storage service...`);
    uploadResult = await storageService.uploadFile(req.file);

    // 5. Create Document in database
    document = new Document({
      name: fileName,
      size: fileSize,
      chunkCount: rawChunks.length,
      filePath: uploadResult.path,
      storageProvider: uploadResult.provider,
      storageKey: uploadResult.key,
      metadata: metadata // Save document-level metadata
    });
    await document.save();

    // 6. Generate embeddings for each chunk
    console.log(`Generating embeddings for ${rawChunks.length} chunks of: ${fileName}`);
    const chunkTexts = rawChunks.map(c => c.text);
    const embeddings = await getBatchEmbeddings(chunkTexts);

    // 7. Save chunks with embeddings in DB
    const chunksToInsert = rawChunks.map((chunk, index) => ({
      documentId: document._id,
      documentName: fileName,
      pageNumber: chunk.pageNumber,
      text: chunk.text,
      embedding: embeddings[index],
      metadata: chunk.metadata // Save page-level metadata
    }));

    await Chunk.insertMany(chunksToInsert);
    console.log(`Ingestion completed successfully for: ${fileName}`);

    res.status(201).json({
      message: 'Document uploaded and indexed successfully.',
      document: {
        id: document._id,
        name: document.name,
        size: document.size,
        chunkCount: document.chunkCount,
        storageProvider: document.storageProvider,
        filePath: document.filePath
      }
    });

  } catch (error) {
    console.error(`Error processing file ${fileName}:`, error);
    
    // Clean up database records
    if (document && document._id) {
      await Document.deleteOne({ _id: document._id });
      await Chunk.deleteMany({ documentId: document._id });
    }

    // Clean up uploaded file from storage service
    if (uploadResult) {
      try {
        await storageService.deleteFile(uploadResult.provider, uploadResult.key, uploadResult.path);
      } catch (err) {
        console.error('Failed to delete uploaded file during rollback:', err.message);
      }
    } else if (fs.existsSync(tempFilePath)) {
      // If uploadResult is not yet created, delete local temp file
      fs.unlinkSync(tempFilePath);
    }

    res.status(500).json({ error: `File processing failed: ${error.message}` });
  }
});

// @route   GET /api/docs
// @desc    Get list of all processed documents
// @access  Public
router.get('/', async (req, res) => {
  try {
    const documents = await Document.find().sort({ createdAt: -1 });
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
});

// @route   DELETE /api/docs/:id
// @desc    Delete a document, its associated chunks, and the physical PDF from storage
// @access  Public
router.delete('/:id', async (req, res) => {
  try {
    const documentId = req.params.id;
    
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Delete chunks
    await Chunk.deleteMany({ documentId });
    
    // Delete document from DB
    await Document.deleteOne({ _id: documentId });

    // Clean up physical file from storage provider
    try {
      await storageService.deleteFile(document.storageProvider, document.storageKey, document.filePath);
      console.log(`Deleted storage file for document: ${document.name}`);
    } catch (err) {
      console.error(`Failed to delete storage file: ${err.message}`);
    }

    res.json({ message: 'Document and associated chunks deleted successfully.' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

// @route   POST /api/docs/search
// @desc    Perform Atlas Vector Search on SOP chunks using cosine similarity
// @access  Public
router.post('/search', async (req, res) => {
  const { query, limit = 5, similarityThreshold = 0.0, numCandidates = 100 } = req.body;
  if (!query || query.trim() === '') {
    return res.status(400).json({ error: 'Search query is required.' });
  }

  try {
    console.log(`Performing Vector Search for query: "${query}" with limit: ${limit}, threshold: ${similarityThreshold}, candidates: ${numCandidates}`);
    const results = await searchChunks(query, limit, similarityThreshold, numCandidates);
    res.json(results);
  } catch (error) {
    console.error('Vector search failed:', error);
    // Provide diagnostics to guide configuration
    res.status(500).json({ 
      error: `Vector Search failed: ${error.message}`,
      details: 'Ensure you have configured a Vector Search index named "vector_index" on the "chunks" collection in MongoDB Atlas with fields matching { type: "vector", path: "embedding", numDimensions: 768, similarity: "cosine" }.'
    });
  }
});

// @route   POST /api/docs/ask
// @desc    Perform Atlas Vector Search, merge context, generate LLM answer and format sources
// @access  Public
router.post('/ask', async (req, res) => {
  const { query, limit = 5, similarityThreshold = 0.0, numCandidates = 100 } = req.body;
  if (!query || query.trim() === '') {
    return res.status(400).json({ error: 'Search query is required.' });
  }

  try {
    console.log(`Performing Vector Search for Q&A query: "${query}" with limit: ${limit}, threshold: ${similarityThreshold}, candidates: ${numCandidates}`);
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
      console.error('AI answer generation failed:', genError);
      answerText = `I failed to generate an answer due to an AI service error: ${genError.message}. However, here are the matching source references retrieved from the documents.`;
    }

    res.json({
      answer: answerText,
      sources: formattedSources,
      context: structuredContext
    });
  } catch (error) {
    console.error('Ask Assistant endpoint failed:', error);
    res.status(500).json({
      error: `Assistant Query failed: ${error.message}`,
      details: 'Check your MongoDB Atlas Vector Search index and GEMINI_API_KEY environment variable configurations.'
    });
  }
});

module.exports = router;

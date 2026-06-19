const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Chunk = require('../models/Chunk');
const { parsePdf } = require('../services/pdfService');
const { chunkPages } = require('../services/chunkService');
const { getBatchEmbeddings } = require('../services/embeddingService');
const storageService = require('../services/storageService');

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

// @route   POST /api/admin/upload
// @desc    Upload a PDF, parse it, chunk text, generate embeddings, and index into MongoDB Atlas Vector Search
// @access  Public (or Admin in future)
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

    // 2. Parse PDF to extract text page-by-page along with metadata
    console.log(`[Admin Upload] Parsing PDF: ${fileName}`);
    const { pages, metadata } = await parsePdf(dataBuffer);
    
    if (!pages || pages.length === 0) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return res.status(400).json({ error: 'The PDF document contains no extractable text.' });
    }

    // 3. Chunk the pages
    console.log(`[Admin Upload] Chunking text for: ${fileName}`);
    const rawChunks = chunkPages(pages, fileName, 1000, 100);

    if (rawChunks.length === 0) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return res.status(400).json({ error: 'No text chunks could be generated from the document.' });
    }

    // 4. Move/upload file using the storage service
    console.log(`[Admin Upload] Uploading file via storage service...`);
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
    console.log(`[Admin Upload] Generating embeddings for ${rawChunks.length} chunks of: ${fileName}`);
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
    console.log(`[Admin Upload] Ingestion completed successfully for: ${fileName}`);

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
    console.error(`[Admin Upload] Error processing file ${fileName}:`, error);
    
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
        console.error('[Admin Upload] Failed to delete uploaded file during rollback:', err.message);
      }
    } else if (fs.existsSync(tempFilePath)) {
      // If uploadResult is not yet created, delete local temp file
      fs.unlinkSync(tempFilePath);
    }

    res.status(500).json({ error: `File processing failed: ${error.message}` });
  }
});

// @route   GET /api/admin/documents
// @desc    Get list of all processed documents
// @access  Public (or Admin in future)
router.get('/documents', async (req, res) => {
  try {
    const documents = await Document.find().sort({ createdAt: -1 });
    res.json(documents);
  } catch (error) {
    console.error('[Admin Documents] Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
});

// @route   DELETE /api/admin/documents/:id
// @desc    Delete a document, its associated chunks, and the physical PDF from storage
// @access  Public (or Admin in future)
router.delete('/documents/:id', async (req, res) => {
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
      console.log(`[Admin Documents] Deleted storage file for document: ${document.name}`);
    } catch (err) {
      console.error(`[Admin Documents] Failed to delete storage file: ${err.message}`);
    }

    res.json({ message: 'Document and associated chunks deleted successfully.' });
  } catch (error) {
    console.error('[Admin Documents] Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

// @route   GET /api/admin/documents/:id/view
// @desc    View/Download the PDF document
// @access  Public
router.get('/documents/:id/view', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    if (document.storageProvider === 's3') {
      return res.redirect(document.filePath);
    } else {
      if (fs.existsSync(document.filePath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.name)}"`);
        return res.sendFile(document.filePath);
      } else {
        return res.status(404).json({ error: 'Physical PDF file not found on server.' });
      }
    }
  } catch (error) {
    console.error('[Admin Documents] Error fetching file for view:', error);
    res.status(500).json({ error: 'Failed to retrieve physical document.' });
  }
});

// @route   POST /api/admin/documents/:id/reindex
// @desc    Re-index the embeddings for a specific document (re-parse, re-chunk, re-embed, re-save)
// @access  Public
router.post('/documents/:id/reindex', async (req, res) => {
  try {
    const documentId = req.params.id;
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    console.log(`[Admin Re-index] Re-indexing document: ${document.name}`);
    
    // Get file buffer (local or S3)
    let dataBuffer;
    if (document.storageProvider === 's3') {
      // Fetch from S3
      const response = await fetch(document.filePath);
      if (!response.ok) throw new Error(`Failed to fetch file from S3: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      dataBuffer = Buffer.from(arrayBuffer);
    } else {
      // Read local file
      if (!fs.existsSync(document.filePath)) {
        return res.status(404).json({ error: `Physical PDF file not found locally at ${document.filePath}` });
      }
      dataBuffer = fs.readFileSync(document.filePath);
    }

    // Re-parse
    const { pages, metadata } = await parsePdf(dataBuffer);
    if (!pages || pages.length === 0) {
      return res.status(400).json({ error: 'Failed to extract text from the document during re-indexing.' });
    }

    // Re-chunk
    const rawChunks = chunkPages(pages, document.name, 1000, 100);
    if (rawChunks.length === 0) {
      return res.status(400).json({ error: 'Failed to generate text chunks during re-indexing.' });
    }

    // Generate embeddings
    const chunkTexts = rawChunks.map(c => c.text);
    const embeddings = await getBatchEmbeddings(chunkTexts);

    // Delete old chunks
    await Chunk.deleteMany({ documentId });

    // Insert new chunks
    const chunksToInsert = rawChunks.map((chunk, index) => ({
      documentId: document._id,
      documentName: document.name,
      pageNumber: chunk.pageNumber,
      text: chunk.text,
      embedding: embeddings[index],
      metadata: chunk.metadata
    }));
    await Chunk.insertMany(chunksToInsert);

    // Update document
    document.chunkCount = rawChunks.length;
    document.metadata = metadata;
    await document.save();

    console.log(`[Admin Re-index] Re-indexing completed for: ${document.name}. New chunk count: ${document.chunkCount}`);
    res.json({
      message: 'Document re-indexed successfully.',
      document: {
        id: document._id,
        name: document.name,
        chunkCount: document.chunkCount
      }
    });
  } catch (error) {
    console.error(`[Admin Re-index] Error re-indexing document ${req.params.id}:`, error);
    res.status(500).json({ error: `Re-indexing failed: ${error.message}` });
  }
});

module.exports = router;

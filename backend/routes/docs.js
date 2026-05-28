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

// Ensure upload directory exists
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
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF documents are allowed.'), false);
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

  const filePath = req.file.path;
  const fileName = req.file.originalname;
  const fileSize = req.file.size;

  let document = null;

  try {
    // 1. Read PDF file into buffer
    const dataBuffer = fs.readFileSync(filePath);

    // 2. Parse PDF to extract text page-by-page
    console.log(`Parsing PDF: ${fileName}`);
    const pages = await parsePdf(dataBuffer);
    
    if (pages.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'The PDF document contains no extractable text.' });
    }

    // 3. Chunk the pages
    console.log(`Chunking text for: ${fileName}`);
    const rawChunks = chunkPages(pages);

    if (rawChunks.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'No text chunks could be generated from the document.' });
    }

    // 4. Create Document in database
    document = new Document({
      name: fileName,
      size: fileSize,
      chunkCount: rawChunks.length,
      filePath: filePath
    });
    await document.save();

    // 5. Generate embeddings for each chunk
    console.log(`Generating embeddings for ${rawChunks.length} chunks of: ${fileName}`);
    const chunkTexts = rawChunks.map(c => c.text);
    const embeddings = await getBatchEmbeddings(chunkTexts);

    // 6. Save chunks with embeddings in DB
    const chunksToInsert = rawChunks.map((chunk, index) => ({
      documentId: document._id,
      documentName: fileName,
      pageNumber: chunk.pageNumber,
      text: chunk.text,
      embedding: embeddings[index]
    }));

    await Chunk.insertMany(chunksToInsert);
    console.log(`Ingestion completed successfully for: ${fileName}`);

    res.status(201).json({
      message: 'Document uploaded and indexed successfully.',
      document: {
        id: document._id,
        name: document.name,
        size: document.size,
        chunkCount: document.chunkCount
      }
    });

  } catch (error) {
    console.error(`Error processing file ${fileName}:`, error);
    
    // Clean up database records
    if (document && document._id) {
      await Document.deleteOne({ _id: document._id });
      await Chunk.deleteMany({ documentId: document._id });
    }

    // Clean up uploaded file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
// @desc    Delete a document, its associated chunks, and the physical PDF from disk
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

    // Clean up physical file on disk
    if (document.filePath && fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
      console.log(`Deleted file on disk: ${document.filePath}`);
    }

    res.json({ message: 'Document and associated chunks deleted successfully.' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

module.exports = router;

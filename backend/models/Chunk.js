const mongoose = require('mongoose');

const ChunkSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
  },
  documentName: {
    type: String,
    required: true,
  },
  pageNumber: {
    type: Number,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  embedding: {
    type: [Number], // Array of floats, dimension 768 for gemini-embedding-001 (or configured outputDimensionality)
    required: true,
  },
  metadata: {
    width: Number,
    height: Number,
    pageLabel: String,
    wordCount: Number,
    characterCount: Number,
    pageNumber: Number,
    documentName: String,
    sectionInfo: String,
    chunkIndex: Number,
  },
});

module.exports = mongoose.model('Chunk', ChunkSchema);

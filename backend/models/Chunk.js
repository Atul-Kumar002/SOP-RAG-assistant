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
    type: [Number], // Array of floats, dimension 768 for text-embedding-004
    required: true,
  },
});

module.exports = mongoose.model('Chunk', ChunkSchema);

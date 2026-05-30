const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  chunkCount: {
    type: Number,
    default: 0,
  },
  filePath: {
    type: String,
    required: true,
  },
  storageProvider: {
    type: String,
    enum: ['local', 's3'],
    default: 'local',
  },
  storageKey: {
    type: String,
  },
  metadata: {
    title: String,
    author: String,
    subject: String,
    creator: String,
    producer: String,
    creationDate: Date,
    modificationDate: Date,
    totalPages: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Document', DocumentSchema);

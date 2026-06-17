const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    default: 'New Conversation',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Conversation', ConversationSchema);

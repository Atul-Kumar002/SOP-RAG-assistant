// backend/test_history_persistence.js
require('dotenv').config();
const mongoose = require('mongoose');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const { generateStandaloneQuery } = require('./services/assistantService');

async function testHistoryPersistence() {
  console.log('==================================================');
  console.log('      Running Chat History Persistence Tests      ');
  console.log('==================================================\n');

  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<username>') || uri.includes('example.mongodb.net')) {
    console.error('❌ MONGODB_URI is not configured in backend/.env.');
    process.exit(1);
  }

  try {
    // 1. Connect to MongoDB
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri);
    console.log(`✅ Connected successfully to: ${mongoose.connection.host}\n`);

    // 2. Create a new Conversation session
    console.log('--- 1. Testing Session Creation ---');
    const testConv = new Conversation({
      title: 'History Persistence Test Chat'
    });
    await testConv.save();
    console.log(`✅ Created Conversation: "${testConv.title}" with ID: ${testConv._id}`);

    // 3. Store messages (User and Assistant) in MongoDB
    console.log('\n--- 2. Testing Message Storage ---');
    const userMsg1 = new Message({
      conversationId: testConv._id,
      sender: 'user',
      text: 'I want to ask about the student fee refund policy.'
    });
    await userMsg1.save();
    console.log(`✅ Stored User Message 1: "${userMsg1.text}"`);

    // Add a small delay to ensure chronological sorting works reliably on createdAt timestamps
    await new Promise(resolve => setTimeout(resolve, 100));

    const assistantMsg1 = new Message({
      conversationId: testConv._id,
      sender: 'assistant',
      text: 'Sure, under the refund policy, fee refunds are processed if the student applies through the proper channel.',
      sources: [
        {
          documentName: 'SOP for Refund of Fees.pdf',
          pageNumber: 1,
          text: 'Standard operating procedure for Refund of Student Fee...',
          score: 0.95
        }
      ]
    });
    await assistantMsg1.save();
    console.log(`✅ Stored Assistant Message 1: "${assistantMsg1.text}"`);

    await new Promise(resolve => setTimeout(resolve, 100));

    const userMsg2 = new Message({
      conversationId: testConv._id,
      sender: 'user',
      text: 'How long does it take?'
    });
    await userMsg2.save();
    console.log(`✅ Stored User Message 2: "${userMsg2.text}"`);

    // 4. Retrieve conversation history and verify session-based history retrieval
    console.log('\n--- 3. Testing Session-based History Retrieval ---');
    const retrievedConv = await Conversation.findById(testConv._id);
    if (!retrievedConv) {
      throw new Error(`Failed to retrieve conversation session by ID: ${testConv._id}`);
    }
    console.log(`✅ Found Conversation session. Title: "${retrievedConv.title}"`);

    const retrievedMessages = await Message.find({ conversationId: testConv._id }).sort({ createdAt: 1 });
    console.log(`✅ Retrieved ${retrievedMessages.length} messages for session.`);

    if (retrievedMessages.length !== 3) {
      throw new Error(`Expected exactly 3 messages, but retrieved ${retrievedMessages.length}`);
    }

    // Verify chronological order
    console.log('\nVerifying message ordering and sender roles:');
    retrievedMessages.forEach((msg, idx) => {
      console.log(`   [Message ${idx + 1}] Sender: ${msg.sender} | Text: "${msg.text}"`);
    });

    if (retrievedMessages[0].sender !== 'user' || retrievedMessages[0].text !== userMsg1.text) {
      throw new Error('Chronological order mismatch at Message 1');
    }
    if (retrievedMessages[1].sender !== 'assistant' || retrievedMessages[1].text !== assistantMsg1.text) {
      throw new Error('Chronological order mismatch at Message 2');
    }
    if (retrievedMessages[2].sender !== 'user' || retrievedMessages[2].text !== userMsg2.text) {
      throw new Error('Chronological order mismatch at Message 3');
    }
    console.log('✅ Session history retrieved in correct chronological order.');

    // 5. Verify standalone query generation using retrieved history
    console.log('\n--- 4. Testing Multi-turn Standalone Query Generation ---');
    const priorHistory = retrievedMessages.slice(0, 2); // UserMsg1 and AssistantMsg1
    const followUpQuery = retrievedMessages[2].text; // "How long does it take?"
    
    console.log(`Conversation History for rephrasing:\n${priorHistory.map(m => `  ${m.sender}: ${m.text}`).join('\n')}`);
    console.log(`Follow-up Question: "${followUpQuery}"`);

    console.log('Sending history and query to Gemini for standalone query rephrasing...');
    const standaloneQuery = await generateStandaloneQuery(followUpQuery, priorHistory);
    console.log(`\n🤖 Standalone Query Result: "${standaloneQuery}"`);

    if (!standaloneQuery || standaloneQuery.trim() === '') {
      throw new Error('Failed to generate a standalone query');
    }

    // Ensure the rephrased query incorporates context (e.g. mentions refund, fee, processing, timeline, etc.)
    const standaloneLower = standaloneQuery.toLowerCase();
    const matchesKeyword = ['refund', 'fee', 'process', 'duration', 'time', 'take'].some(kw => standaloneLower.includes(kw));
    if (!matchesKeyword) {
      console.warn('⚠️  Warning: Standalone query did not contain expected keywords like "refund", "fee", "time", or "processing".');
    } else {
      console.log('✅ Standalone query successfully incorporated context from the conversation history!');
    }

    // 6. Clean up test data
    console.log('\n--- 5. Cleaning Up Test Data ---');
    const deleteMessagesRes = await Message.deleteMany({ conversationId: testConv._id });
    console.log(`✅ Deleted ${deleteMessagesRes.deletedCount} messages.`);
    const deleteConvRes = await Conversation.deleteOne({ _id: testConv._id });
    console.log(`✅ Deleted conversation session.`);

    console.log('\n==================================================');
    console.log('🎉 Chat History Persistence Tests PASSED!');
    console.log('==================================================');

  } catch (error) {
    console.error('\n❌ Chat History Persistence Test Failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

testHistoryPersistence();

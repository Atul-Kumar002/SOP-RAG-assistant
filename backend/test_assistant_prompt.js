// backend/test_assistant_prompt.js
require('dotenv').config();
const { generateAnswer } = require('./services/assistantService');
const { GenerativeModel } = require('@google/generative-ai');

// Save original generateContent method
const originalGenerateContent = GenerativeModel.prototype.generateContent;

let capturedPrompt = '';

// Mock Gemini generateContent to capture the prompt
GenerativeModel.prototype.generateContent = async function(request) {
  if (request && request.contents && request.contents[0] && request.contents[0].parts && request.contents[0].parts[0]) {
    capturedPrompt = request.contents[0].parts[0].text;
  }
  return {
    response: {
      text: () => "Mocked LLM Answer"
    }
  };
};

// Set mock key if not configured
const originalApiKey = process.env.GEMINI_API_KEY;
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
  process.env.GEMINI_API_KEY = 'mock_key_for_testing';
}

async function runPromptTest() {
  console.log('==================================================');
  console.log('       Testing Prompt Engineering Constraints     ');
  console.log('==================================================\n');

  try {
    const mockContext = '[Source Reference 1]\nDocument Name: HR_Policy.pdf\nPage Number: 1\nContent: Employees get 15 days of leaves.';
    const query = 'What is the refund policy?';

    await generateAnswer(query, mockContext);

    console.log('--- Captured Prompt to Gemini ---');
    console.log(capturedPrompt);
    console.log('---------------------------------\n');

    // Assertions
    if (!capturedPrompt.includes('gemini-1.5-flash') && !capturedPrompt.includes('SOP')) {
      throw new Error('Test Failed: Prompt is not correctly formatted.');
    }

    if (!capturedPrompt.includes("I don't know based on the provided SOPs.")) {
      throw new Error('Test Failed: Prompt is missing the exact fallback response string: "I don\'t know based on the provided SOPs."');
    }

    if (!capturedPrompt.includes('Ground your response strictly in the provided context references') && 
        !capturedPrompt.includes('Ground your response strictly')) {
      throw new Error('Test Failed: Prompt is missing strict grounding instructions.');
    }

    if (!capturedPrompt.includes('Do not make up facts') && !capturedPrompt.includes('hallucinate')) {
      throw new Error('Test Failed: Prompt is missing anti-hallucination constraints.');
    }

    console.log('✅ Prompt validation successful! All constraints are present in the template.');
    console.log('\n==================================================');
    console.log('🎉 Prompt Engineering Test Passed!');
    console.log('==================================================');

  } catch (error) {
    console.error('❌ Prompt validation failed:', error.message);
    process.exit(1);
  } finally {
    // Restore
    GenerativeModel.prototype.generateContent = originalGenerateContent;
    process.env.GEMINI_API_KEY = originalApiKey;
  }
}

runPromptTest();

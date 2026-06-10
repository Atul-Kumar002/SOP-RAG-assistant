const Chunk = require('../models/Chunk');
const { getEmbedding } = require('./embeddingService');

/**
 * Helper to identify if a line is likely a section header.
 * Looks for common patterns like markdown headers, numbered sections, or uppercase standalone lines.
 */
const isHeader = (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return false;

  // Markdown style header (e.g., "# Introduction")
  if (trimmed.startsWith('#')) return true;

  // Numbered section header: e.g., "1. Introduction", "Section 2:", "Chapter 3", "2.1.3 Background"
  const numberedHeaderRegex = /^(?:section\s+\d+|chapter\s+\d+|\d+(?:\.\d+)*\.?)[.:]?\b/i;
  const simpleNumberedHeaderRegex = /^(?:section\s+\d+|chapter\s+\d+|\d+(?:\.\d+)*\.?)[.:]?\s+[A-Z]/i;
  if (numberedHeaderRegex.test(trimmed) || simpleNumberedHeaderRegex.test(trimmed)) {
    return true;
  }

  // Standalone uppercase header (at least 3 characters, all uppercase, no trailing punctuation)
  if (trimmed.length >= 3 && trimmed === trimmed.toUpperCase() && !/[.!?]$/.test(trimmed)) {
    return true;
  }

  return false;
};

/**
 * Helper to clean section headers of formatting.
 */
const cleanHeader = (headerText) => {
  return headerText
    .replace(/^#+\s+/, '') // Remove leading markdown # symbols
    .replace(/^(?:section\s+\d+|chapter\s+\d+|\d+(?:\.\d+)*\.?)[.:]?\s+/i, '') // Remove leading section numbers/labels
    .replace(/[:\s]+$/, '') // Remove trailing colons/whitespace
    .trim();
};

/**
 * Splits text into logical sentences while preserving section headers.
 */
const splitIntoSentences = (text) => {
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const sentences = [];
  let currentParagraph = [];

  const flushParagraph = () => {
    if (currentParagraph.length === 0) return;
    const paraText = currentParagraph.join(' ');
    // Match sentence punctuation followed by space/newline, or end of text
    const matches = paraText.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (matches) {
      for (const match of matches) {
        const trimmed = match.trim();
        if (trimmed) sentences.push(trimmed);
      }
    } else {
      sentences.push(paraText);
    }
    currentParagraph = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      flushParagraph();
      continue;
    }

    if (isHeader(trimmedLine)) {
      flushParagraph();
      sentences.push(trimmedLine);
    } else {
      currentParagraph.push(trimmedLine);
    }
  }
  flushParagraph();

  return sentences;
};

/**
 * Groups sentences into chunks of maximum size with overlap, keeping boundary alignment.
 */
const chunkSentences = (
  sentences,
  pageNumber,
  documentName,
  pageMetadata,
  startChunkIndex,
  activeSectionRef,
  chunkSize = 1000,
  overlap = 100
) => {
  const chunks = [];
  let i = 0;
  let chunkIndex = startChunkIndex;

  while (i < sentences.length) {
    const currentChunkSentences = [];
    let currentLength = 0;
    const startIdx = i;

    // Build the chunk
    while (i < sentences.length) {
      const sentence = sentences[i];
      const sentenceLength = sentence.length;

      // Check if adding this sentence would exceed the chunk size
      if (currentLength + (currentChunkSentences.length > 0 ? 1 : 0) + sentenceLength > chunkSize) {
        // Force add at least one sentence if chunk is empty to prevent infinite loops
        if (currentChunkSentences.length === 0) {
          if (isHeader(sentence)) {
            activeSectionRef.value = cleanHeader(sentence);
          }
          currentChunkSentences.push(sentence);
          currentLength += sentenceLength;
          i++;
        }
        break;
      }

      // Update active section if this sentence is a header and fits in the chunk
      if (isHeader(sentence)) {
        activeSectionRef.value = cleanHeader(sentence);
      }

      currentChunkSentences.push(sentence);
      currentLength += (currentChunkSentences.length > 1 ? 1 : 0) + sentenceLength;
      i++;
    }

    const chunkText = currentChunkSentences.join(' ');

    const metadata = {
      ...pageMetadata,
      pageNumber,
      documentName,
      sectionInfo: activeSectionRef.value,
      chunkIndex: chunkIndex++
    };

    chunks.push({
      pageNumber,
      text: chunkText,
      metadata
    });

    if (i >= sentences.length) {
      break;
    }

    // Backtrack to find overlap start
    let overlapLength = 0;
    let backtrackIdx = i - 1;

    while (backtrackIdx > startIdx) {
      const sLength = sentences[backtrackIdx].length;
      if (overlapLength + sLength > overlap) {
        if (overlapLength >= overlap) {
          break;
        }
      }
      overlapLength += sLength + 1;
      backtrackIdx--;
    }

    // Progress is guaranteed because backtrackIdx + 1 is at least startIdx + 1
    i = Math.max(startIdx + 1, backtrackIdx + 1);
  }

  return chunks;
};

/**
 * Chunks the text content of pages using a semantic, sentence-boundary-aware pipeline.
 *
 * @param {Array<{pageNumber: number, text: string}>} pages - Array of page objects.
 * @param {string|number} [documentNameOrSize] - Name of the document, or chunkSize (for backward compatibility).
 * @param {number} [chunkSize=1000] - Maximum size of each chunk in characters.
 * @param {number} [overlap=100] - Overlap between consecutive chunks in characters.
 * @returns {Array<{pageNumber: number, text: string, metadata: object}>} - Array of semantic chunks.
 */
const chunkPages = (pages, documentNameOrSize, chunkSize = 1000, overlap = 100) => {
  let documentName = '';
  let actualChunkSize = 1000;
  let actualOverlap = 100;

  if (typeof documentNameOrSize === 'number') {
    actualChunkSize = documentNameOrSize;
    if (typeof chunkSize === 'number') {
      actualOverlap = chunkSize;
    }
  } else {
    documentName = documentNameOrSize || '';
    if (typeof chunkSize === 'number') {
      actualChunkSize = chunkSize;
    }
    if (typeof overlap === 'number') {
      actualOverlap = overlap;
    }
  }

  const allChunks = [];
  let chunkIndex = 0;
  const activeSectionRef = { value: 'Introduction' };

  for (const page of pages) {
    const text = page.text;
    const pageNumber = page.pageNumber;
    const pageMetadata = page.metadata || {};

    if (!text || text.trim().length === 0) {
      continue;
    }

    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) {
      continue;
    }

    const pageChunks = chunkSentences(
      sentences,
      pageNumber,
      documentName,
      pageMetadata,
      chunkIndex,
      activeSectionRef,
      actualChunkSize,
      actualOverlap
    );

    allChunks.push(...pageChunks);
    chunkIndex += pageChunks.length;
  }

  return allChunks;
};

/**
 * Performs MongoDB Atlas Vector Search on the chunks collection using cosine similarity.
 *
 * @param {string} queryText - The search query.
 * @param {number} [limit=5] - Number of top chunks to retrieve. Clamped between 1 and 20.
 * @param {number} [minSimilarity=0.0] - Minimum similarity score threshold to filter matches.
 * @param {number} [numCandidates=100] - Total candidates to consider during vector search. Clamped between 10 and 500.
 * @returns {Promise<Array>} - Top semantically relevant chunks.
 */
const searchChunks = async (queryText, limit = 5, minSimilarity = 0.0, numCandidates = 100) => {
  if (!queryText || queryText.trim() === '') {
    throw new Error('Search query is required.');
  }

  // Parse limit and clamp to [1, 20]
  const parsedLimit = parseInt(limit);
  const searchLimit = Math.max(1, Math.min(20, isNaN(parsedLimit) ? 5 : parsedLimit));

  // Parse numCandidates and clamp to [10, 500]
  const parsedCandidates = parseInt(numCandidates);
  const searchCandidates = Math.max(10, Math.min(500, isNaN(parsedCandidates) ? 100 : parsedCandidates));

  // 1. Generate embedding for the search query
  const queryEmbedding = await getEmbedding(queryText);

  // 2. Perform MongoDB Atlas Vector Search using aggregation
  const pipeline = [
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: searchCandidates,
        limit: searchLimit
      }
    },
    {
      $project: {
        _id: 1,
        documentId: 1,
        documentName: 1,
        pageNumber: 1,
        text: 1,
        metadata: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ];

  // Print the MongoDB query to the console
  console.log('\n--- [MongoDB Vector Search Query] ---');
  console.log(JSON.stringify({
    collection: 'chunks',
    pipeline: [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: `[Array of ${queryEmbedding.length} floats. First 3 components: ${queryEmbedding.slice(0, 3).join(', ')}, ...]`,
          numCandidates: searchCandidates,
          limit: searchLimit
        }
      },
      ...pipeline.slice(1)
    ]
  }, null, 2));
  console.log('-------------------------------------\n');

  // Apply similarity threshold if specified
  const parsedMinSimilarity = parseFloat(minSimilarity);
  if (!isNaN(parsedMinSimilarity) && parsedMinSimilarity > 0) {
    pipeline.push({
      $match: {
        score: { $gte: parsedMinSimilarity }
      }
    });
  }

  return await Chunk.aggregate(pipeline);
};

module.exports = {
  chunkPages,
  isHeader,
  cleanHeader,
  splitIntoSentences,
  chunkSentences,
  searchChunks
};

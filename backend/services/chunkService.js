/**
 * Chunks the text content of pages.
 * Chunks are bound to pages to ensure accurate source citation (e.g., Page 3).
 *
 * @param {Array<{pageNumber: number, text: string}>} pages - Array of page objects.
 * @param {number} chunkSize - Maximum size of each chunk in characters.
 * @param {number} overlap - Overlap between consecutive chunks in characters.
 * @returns {Array<{pageNumber: number, text: string}>} - Array of chunked text items with page numbers.
 */
const chunkPages = (pages, chunkSize = 1000, overlap = 100) => {
  const chunks = [];

  for (const page of pages) {
    const text = page.text;
    const pageNumber = page.pageNumber;

    if (!text || text.trim().length === 0) {
      continue;
    }

    // If page content is smaller than chunk size, store it as a single chunk
    if (text.length <= chunkSize) {
      chunks.push({
        pageNumber,
        text: text.trim()
      });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = start + chunkSize;
      let chunkText = text.substring(start, end);

      // Attempt to avoid splitting words by adjusting end pointer backward to a space
      if (end < text.length) {
        const lastSpace = chunkText.lastIndexOf(' ');
        // If we found a space and it's not too far back (within 80% of chunk size), adjust the boundary
        if (lastSpace > chunkSize * 0.8) {
          end = start + lastSpace;
          chunkText = text.substring(start, end);
        }
      }

      chunks.push({
        pageNumber,
        text: chunkText.trim()
      });

      start = end - overlap;

      // Prevent infinite loop or over-indexing
      if (start >= text.length || end >= text.length) {
        break;
      }
    }
  }

  return chunks;
};

module.exports = { chunkPages };

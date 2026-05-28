const pdf = require('pdf-parse');

/**
 * Parses a PDF buffer and extracts text page-by-page.
 * @param {Buffer} dataBuffer - The PDF file data buffer.
 * @returns {Promise<Array<{pageNumber: number, text: string}>>} - Array of page objects.
 */
const parsePdf = async (dataBuffer) => {
  const pages = [];

  const pagerender = async (pageData) => {
    // textContent is a structure containing strings of items on a page
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false
    });
    
    let lastY, text = '';
    for (let item of textContent.items) {
      if (lastY === undefined || lastY === item.transform[5]) {
        text += item.str;
      } else {
        text += '\n' + item.str;
      }
      lastY = item.transform[5];
    }
    
    // Add page number (1-based index) and text
    pages.push({
      pageNumber: pageData.pageIndex + 1,
      text: text.trim()
    });
    
    return text;
  };

  try {
    await pdf(dataBuffer, { pagerender });
    
    // Sort pages to guarantee ordering
    pages.sort((a, b) => a.pageNumber - b.pageNumber);
    
    return pages;
  } catch (error) {
    console.error('Error in PDF parsing service:', error);
    throw new Error('Failed to parse PDF document.');
  }
};

module.exports = { parsePdf };

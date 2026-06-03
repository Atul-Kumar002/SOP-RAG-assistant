document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const selectedFileContainer = document.getElementById('selectedFileContainer');
  const selectedFileName = document.getElementById('selectedFileName');
  const selectedFileSize = document.getElementById('selectedFileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const progressWrapper = document.getElementById('progressWrapper');
  const progressBar = document.getElementById('progressBar');
  const uploadStatusText = document.getElementById('uploadStatusText');
  const uploadPercentage = document.getElementById('uploadPercentage');
  const uploadBtn = document.getElementById('uploadBtn');
  const searchDocsInput = document.getElementById('searchDocsInput');
  const loadingDocs = document.getElementById('loadingDocs');
  const emptyDocs = document.getElementById('emptyDocs');
  const tableContainer = document.getElementById('tableContainer');
  const documentsTableBody = document.getElementById('documentsTableBody');
  const toastContainer = document.getElementById('toastContainer');
  
  // Search UI Elements
  const searchQueryInput = document.getElementById('searchQueryInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchResultsWrapper = document.getElementById('searchResultsWrapper');
  const resultsCount = document.getElementById('resultsCount');
  const searchResultsList = document.getElementById('searchResultsList');

  let activeFile = null;
  let allDocuments = [];

  // Initialize Lucide Icons
  lucide.createIcons();

  // Load documents on init
  loadDocuments();

  // Dropzone Events
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  ['dragleave', 'dragend'].forEach(type => {
    dropzone.addEventListener(type, () => {
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUploadState();
  });

  uploadBtn.addEventListener('click', () => {
    if (!activeFile) return;
    uploadAndIndexFile(activeFile);
  });

  // Real-time search/filtering
  searchDocsInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allDocuments.filter(doc => doc.name.toLowerCase().includes(term));
    renderTable(filtered);
  });

  // SOP Query Assistant Search Events
  searchBtn.addEventListener('click', () => {
    performSemanticSearch();
  });

  searchQueryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performSemanticSearch();
    }
  });

  // Functions
  function handleFileSelection(file) {
    // Client-side validations
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (fileExt !== '.pdf') {
      showToast('Invalid File Type', 'Only PDF files (.pdf) are supported.', 'error');
      return;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      showToast('File Too Large', 'Maximum file size limit is 50MB.', 'error');
      return;
    }

    activeFile = file;
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = formatBytes(file.size);
    
    // Hide dropzone, show active file box
    dropzone.style.display = 'none';
    selectedFileContainer.style.display = 'flex';
    progressWrapper.style.display = 'none';
    uploadBtn.disabled = false;
    
    lucide.createIcons();
  }

  function resetUploadState() {
    activeFile = null;
    fileInput.value = '';
    dropzone.style.display = 'flex';
    selectedFileContainer.style.display = 'none';
    progressWrapper.style.display = 'none';
    progressBar.style.width = '0%';
    uploadPercentage.textContent = '0%';
    uploadBtn.disabled = false;
  }

  function uploadAndIndexFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    
    // Setup listeners
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        
        // Cap upload visual indicator at 95% while processing
        const visualPercent = percentComplete >= 98 ? 98 : percentComplete;
        progressBar.style.width = `${visualPercent}%`;
        uploadPercentage.textContent = `${visualPercent}%`;
        
        if (visualPercent >= 98) {
          uploadStatusText.textContent = 'Processing & indexing knowledge blocks...';
        } else {
          uploadStatusText.textContent = `Uploading file (${percentComplete}%)...`;
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 201) {
        progressBar.style.width = '100%';
        uploadPercentage.textContent = '100%';
        uploadStatusText.textContent = 'Completed!';
        
        const response = JSON.parse(xhr.responseText);
        showToast('Success', response.message || 'File uploaded successfully!', 'success');
        
        setTimeout(() => {
          resetUploadState();
          loadDocuments();
        }, 1500);
      } else {
        let errorMsg = 'An unexpected error occurred during processing.';
        try {
          const response = JSON.parse(xhr.responseText);
          errorMsg = response.error || errorMsg;
        } catch (e) {}
        
        showToast('Processing Failed', errorMsg, 'error');
        uploadStatusText.textContent = 'Failed';
        uploadBtn.disabled = false;
      }
    });

    xhr.addEventListener('error', () => {
      showToast('Network Error', 'Could not complete file upload request.', 'error');
      uploadStatusText.textContent = 'Failed';
      uploadBtn.disabled = false;
    });

    // Make the request
    xhr.open('POST', '/api/docs/upload', true);
    
    // UI Updates
    progressWrapper.style.display = 'block';
    uploadBtn.disabled = true;
    uploadStatusText.textContent = 'Uploading...';
    
    xhr.send(formData);
  }

  async function loadDocuments() {
    showTableLoading(true);
    try {
      const res = await fetch('/api/docs');
      if (!res.ok) throw new Error('Failed to retrieve catalog');
      
      allDocuments = await res.json();
      renderTable(allDocuments);
    } catch (error) {
      console.error(error);
      showToast('Fetch Error', 'Failed to retrieve ingested documents list.', 'error');
      showTableLoading(false);
    }
  }

  function renderTable(docs) {
    showTableLoading(false);
    documentsTableBody.innerHTML = '';
    
    if (docs.length === 0) {
      tableContainer.style.display = 'none';
      emptyDocs.style.display = 'flex';
      return;
    }
    
    emptyDocs.style.display = 'none';
    tableContainer.style.display = 'block';

    docs.forEach(doc => {
      const tr = document.createElement('tr');
      
      // Name cell
      const nameTd = document.createElement('td');
      nameTd.className = 'doc-name-cell';
      nameTd.innerHTML = `
        <i data-lucide="file-text"></i>
        <span class="doc-name-text" title="${doc.name}">${doc.name}</span>
      `;
      tr.appendChild(nameTd);

      // Size cell
      const sizeTd = document.createElement('td');
      sizeTd.textContent = formatBytes(doc.size);
      tr.appendChild(sizeTd);

      // Chunk count cell
      const chunkTd = document.createElement('td');
      chunkTd.innerHTML = `<span class="badge badge-chunks">${doc.chunkCount} chunks</span>`;
      tr.appendChild(chunkTd);

      // Storage Provider cell
      const storageTd = document.createElement('td');
      const provider = doc.storageProvider || 'local';
      storageTd.innerHTML = `<span class="badge badge-${provider}">${provider.toUpperCase()}</span>`;
      tr.appendChild(storageTd);

      // Ingested Date cell
      const dateTd = document.createElement('td');
      const date = new Date(doc.createdAt);
      dateTd.className = 'doc-date';
      dateTd.textContent = date.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      tr.appendChild(dateTd);

      // Actions cell
      const actionsTd = document.createElement('td');
      actionsTd.className = 'actions-cell';
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-icon btn-delete';
      deleteBtn.title = 'Delete Document';
      deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      deleteBtn.addEventListener('click', () => confirmAndDeleteDocument(doc));
      actionsTd.appendChild(deleteBtn);
      
      tr.appendChild(actionsTd);
      documentsTableBody.appendChild(tr);
    });

    lucide.createIcons();
  }

  async function confirmAndDeleteDocument(doc) {
    if (confirm(`Are you sure you want to delete "${doc.name}"? This will delete all chunks and the physical file.`)) {
      try {
        const res = await fetch(`/api/docs/${doc.id || doc._id}`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          showToast('Deleted', 'Document deleted successfully.', 'success');
          loadDocuments();
        } else {
          const err = await res.json();
          showToast('Deletion Failed', err.error || 'Failed to delete file.', 'error');
        }
      } catch (error) {
        console.error(error);
        showToast('Error', 'An error occurred during deletion request.', 'error');
      }
    }
  }

  function showTableLoading(isLoading) {
    if (isLoading) {
      loadingDocs.style.display = 'flex';
      tableContainer.style.display = 'none';
      emptyDocs.style.display = 'none';
    } else {
      loadingDocs.style.display = 'none';
    }
  }

  // Toast System
  function showToast(title, desc, type = 'info') {
    // Check if duplicate toast exists to prevent spam
    const existingToasts = Array.from(toastContainer.querySelectorAll('.toast'));
    const isDuplicate = existingToasts.some(t => {
      const tTitle = t.querySelector('.toast-title').textContent;
      const tDesc = t.querySelector('.toast-desc').textContent;
      return tTitle === title && tDesc === desc;
    });
    if (isDuplicate) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${icon}" class="toast-icon"></i>
      <div class="toast-content">
        <h4 class="toast-title">${title}</h4>
        <p class="toast-desc">${desc}</p>
      </div>
    `;

    toastContainer.appendChild(toast);
    lucide.createIcons();

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, 4000);
  }

  // Helper: Format Bytes to human readable
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Vector Search Implementation
  async function performSemanticSearch() {
    const query = searchQueryInput.value.trim();
    if (!query) {
      showToast('Empty Query', 'Please enter a question or keywords to search.', 'info');
      return;
    }

    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; margin: 0 0.5rem 0 0; display: inline-block; border-width: 2px; vertical-align: middle;"></span> Searching...';
    searchResultsWrapper.style.display = 'none';
    searchResultsList.innerHTML = '';

    try {
      const res = await fetch('/api/docs/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, limit: 5 })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to complete similarity search.');
      }

      const results = await res.json();
      renderSearchResults(results);
    } catch (error) {
      console.error(error);
      showToast('Search Failed', error.message || 'An error occurred during search query.', 'error');
    } finally {
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<i data-lucide="sparkles"></i> Ask Assistant';
      lucide.createIcons();
    }
  }

  function renderSearchResults(results) {
    searchResultsWrapper.style.display = 'block';
    resultsCount.textContent = `${results.length} match${results.length === 1 ? '' : 'es'}`;

    if (results.length === 0) {
      searchResultsList.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.85rem; background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          No matching knowledge chunks found. Try uploading a relevant PDF or refining your search.
        </div>
      `;
      return;
    }

    results.forEach(result => {
      const div = document.createElement('div');
      div.className = 'search-result-item';

      const matchPercent = (result.score * 100).toFixed(1);
      const sectionInfo = result.metadata?.sectionInfo || 'Introduction';

      div.innerHTML = `
        <div class="result-meta">
          <span class="result-doc-name" title="${result.documentName}">
            <i data-lucide="file-text"></i>
            ${result.documentName}
          </span>
          <span class="badge badge-score">${matchPercent}% match</span>
          <span class="badge badge-page">Page ${result.pageNumber}</span>
        </div>
        <p class="result-text">"${escapeHtml(result.text)}"</p>
        <div class="result-section">
          <i data-lucide="hash"></i>
          Section: ${sectionInfo}
        </div>
      `;

      searchResultsList.appendChild(div);
    });

    lucide.createIcons();
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});

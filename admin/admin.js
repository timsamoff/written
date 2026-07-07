// ==========================================================================
// Written Admin - Complete Admin Logic with Series Support
// ==========================================================================

// State
let projects = [];
let allGenres = ['sci-fi', 'ya', 'article', 'poetry', 'essay', 'guide'];
let allThemes = ['technology', 'writing', 'post-apocalyptic', 'publishing', 'autobiographical'];
let selectedGenres = [];
let selectedThemes = [];
let isEditing = false;
let editId = null;
let currentSearchTerm = '';
let autoSaveTimeout = null;

// Series state
let series = [];
let selectedSeriesFilter = null;

// Content cache (memory only - not saved to JSON)
let contentCache = {};

// DOM Elements
const form = document.getElementById('piece-form');
const formHeading = document.getElementById('form-title-heading');
const formEditId = document.getElementById('form-edit-id');
const formTitle = document.getElementById('form-title');
const formPath = document.getElementById('form-path');
const formSlug = document.getElementById('form-slug');
const formDate = document.getElementById('form-date');
const formMedia = document.getElementById('form-media');
const formHtml = document.getElementById('form-html');
const formSeries = document.getElementById('form-series');
const formPart = document.getElementById('form-part');
const submitBtn = document.getElementById('submit-btn');
const downloadBtn = document.getElementById('download-btn');
const previewBtn = document.getElementById('preview-btn');
const newPieceBtn = document.getElementById('new-piece-btn');
const sortableList = document.getElementById('sortable-list');
const urlPreview = document.getElementById('url-preview');
const adminSearch = document.getElementById('admin-search');
const adminSearchClear = document.getElementById('admin-search-clear');
const formPublished = document.getElementById('form-published');

// Genre elements
const genreTagManager = document.getElementById('genre-tag-manager');
const newGenreInput = document.getElementById('new-genre-input');
const addGenreBtn = document.getElementById('add-genre-btn');

// Theme elements
const themeTagManager = document.getElementById('theme-tag-manager');
const newThemeInput = document.getElementById('new-theme-input');
const addThemeBtn = document.getElementById('add-theme-btn');

// Series elements
const seriesList = document.getElementById('series-list');
const addSeriesInlineBtn = document.getElementById('add-series-inline-btn');

// Series Modal
const seriesModal = document.getElementById('series-modal');
const seriesModalTitle = document.getElementById('series-modal-title');
const seriesName = document.getElementById('series-name');
const seriesDescription = document.getElementById('series-description');
const seriesEditId = document.getElementById('series-edit-id');
const seriesAutoSelect = document.getElementById('series-auto-select');
const seriesModalSave = document.getElementById('series-modal-save');
const seriesModalCancel = document.getElementById('series-modal-cancel');
const seriesModalClose = document.getElementById('series-modal-close');

// Series Delete Modal
const seriesDeleteModal = document.getElementById('series-delete-modal');
const seriesDeleteMessage = document.getElementById('series-delete-message');
const seriesDeleteConfirm = document.getElementById('series-delete-confirm');
const seriesDeleteCancel = document.getElementById('series-delete-cancel');
const seriesDeleteClose = document.getElementById('series-delete-close');

// ==========================================================================
// Helper Functions
// ==========================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getFirstImageFromHtml(html) {
    if (!html) return null;
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
        return imgMatch[1];
    }
    return null;
}

function extractArticleContent(html) {
    if (!html) return '';
    
    // First, try to find the innermost article with story-content class
    let content = html;
    let previousContent = '';
    let iterations = 0;
    const maxIterations = 10;
    
    // Keep stripping outer article tags until we get the innermost content
    while (iterations < maxIterations) {
        const match = content.match(/<article[^>]*class="story-content[^>]*>([\s\S]*?)<\/article>/i);
        if (!match) break;
        
        // Store the inner content
        const innerContent = match[1].trim();
        
        // If the inner content doesn't contain another article tag with story-content, we're done
        if (!innerContent.match(/<article[^>]*class="story-content[^>]*>/i)) {
            content = innerContent;
            break;
        }
        
        // Otherwise, continue stripping
        content = innerContent;
        iterations++;
    }
    
    // If we still have an article tag, try a different approach
    if (content.match(/<article[^>]*>/i)) {
        const finalMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (finalMatch) {
            content = finalMatch[1].trim();
        }
    }
    
    return content || html;
}

// ==========================================================================
// Fix image paths for different contexts
// ==========================================================================

function fixImagePaths(html, project, context) {
    if (!html || !project) return html;
    
    // Get the folder name from the media path
    let mediaPath = project.mediaPath || '';
    mediaPath = mediaPath.replace(/\/+$/, '');
    
    // Extract just the folder name (last part of the path)
    const folderName = mediaPath.split('/').pop() || '';
    
    // Build the absolute base path
    // The path is: writing/{project.path}{folderName}/
    const cleanPath = project.path.endsWith('/') ? project.path : project.path + '/';
    const absoluteBase = `/writing/${cleanPath}${folderName}/`;
    
    return html.replace(/<img([^>]+)src=["']([^"']+)["']/gi, function(match, attrs, src) {
        // Skip absolute URLs
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
            return match;
        }
        
        // Extract just the filename
        const filename = src.split('/').pop();
        
        if (context === 'save') {
            // Use relative path: folderName/filename (e.g., ni/ni_001.png)
            const correctedSrc = folderName ? `${folderName}/${filename}` : filename;
            return `<img${attrs}src="${correctedSrc}"`;
        } else {
            // Use absolute path: /writing/path/folderName/filename
            const correctedSrc = folderName ? `${absoluteBase}${filename}` : `/writing/${cleanPath}${filename}`;
            return `<img${attrs}src="${correctedSrc}"`;
        }
    });
}

// ==========================================================================
// Load content from existing HTML file (cached in memory)
// ==========================================================================

async function loadContentFromFile(project) {
    if (!project || !project.path || !project.slug) return '';
    
    const cacheKey = `${project.path}${project.slug}`;
    if (contentCache[cacheKey]) {
        return contentCache[cacheKey];
    }
    
    const filePath = `http://localhost:3000/writing/${project.path}${project.slug}.html`;
    try {
        const response = await fetch(filePath);
        if (!response.ok) return '';
        const html = await response.text();
        const content = extractArticleContent(html);
        const fixedContent = fixImagePaths(content, project, 'preview');
        contentCache[cacheKey] = fixedContent;
        return fixedContent;
    } catch (err) {
        console.warn(`Could not load content for ${project.slug}:`, err);
        return '';
    }
}

// ==========================================================================
// Save HTML to server
// ==========================================================================

async function saveHtmlToServer(filePath, content) {
    try {
        const response = await fetch('http://localhost:3000/api/save-html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath, content })
        });
        const result = await response.json();
        if (!result.success) {
            showNotification('Failed to save HTML: ' + (result.error || 'Unknown error'), 'error');
            return false;
        }
        return true;
    } catch (err) {
        showNotification('Error saving HTML: ' + err.message, 'error');
        return false;
    }
}

// ==========================================================================
// File Upload
// ==========================================================================

const fileInput = document.getElementById('form-html-file');
const fileUploadText = document.getElementById('file-upload-text');
const clearFileBtn = document.getElementById('clear-file-btn');

fileInput.addEventListener('change', function(e) {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const content = event.target.result;
        const extracted = extractArticleContent(content);
        formHtml.value = extracted || content;
        fileUploadText.textContent = file.name;
        fileUploadText.parentElement.classList.add('has-file');
        clearFileBtn.classList.add('visible');
        formHtml.classList.remove('placeholder-warning');
        showNotification(`Loaded: ${file.name}`, 'success');
        if (isEditing) debouncedAutoSave();
    };
    reader.readAsText(file);
});

clearFileBtn.addEventListener('click', function() {
    fileInput.value = '';
    fileUploadText.textContent = 'Choose HTML file...';
    fileUploadText.parentElement.classList.remove('has-file');
    this.classList.remove('visible');
    formHtml.value = '';
    formHtml.classList.remove('placeholder-warning');
    if (isEditing) debouncedAutoSave();
});

formHtml.addEventListener('input', function() {
    if (this.value.trim()) {
        fileUploadText.textContent = 'Manual entry';
        fileUploadText.parentElement.classList.add('has-file');
        clearFileBtn.classList.add('visible');
        this.classList.remove('placeholder-warning');
    }
});

// ==========================================================================
// URL Preview
// ==========================================================================

function updateUrlPreview() {
    const path = formPath.value.trim() || 'shorts/';
    const slug = formSlug.value.trim() || 'title-of-piece';
    const cleanPath = path.endsWith('/') ? path : path + '/';
    urlPreview.textContent = `writing/${cleanPath}${slug}.html`;
}

formPath.addEventListener('input', updateUrlPreview);
formSlug.addEventListener('input', updateUrlPreview);

// ==========================================================================
// Series Management
// ==========================================================================

function renderSeriesDropdown() {
    const currentValue = formSeries.value;
    formSeries.innerHTML = '<option value="">None (Standalone)</option>';
    const sorted = [...series].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        const count = projects.filter(p => p.series_id === s.id).length;
        opt.textContent = `${s.name} (${count} part${count !== 1 ? 's' : ''})`;
        formSeries.appendChild(opt);
    });
    if (currentValue && series.some(s => s.id === currentValue)) {
        formSeries.value = currentValue;
    }
}

function renderSeriesChips() {
    seriesList.innerHTML = '';
    const sorted = [...series].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(s => {
        const count = projects.filter(p => p.series_id === s.id).length;
        const chip = document.createElement('span');
        chip.className = 'series-chip';
        if (selectedSeriesFilter === s.id) chip.classList.add('active');
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = s.name;
        chip.appendChild(nameSpan);
        
        const countSpan = document.createElement('span');
        countSpan.className = 'series-chip-count';
        countSpan.textContent = count;
        chip.appendChild(countSpan);
        
        const editBtn = document.createElement('button');
        editBtn.className = 'series-chip-delete';
        editBtn.textContent = '✎';
        editBtn.title = 'Edit series';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSeriesModal(s.id);
        });
        chip.appendChild(editBtn);
        
        const delBtn = document.createElement('button');
        delBtn.className = 'series-chip-delete';
        delBtn.textContent = '×';
        delBtn.title = 'Delete series';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteSeries(s.id);
        });
        chip.appendChild(delBtn);
        
        chip.addEventListener('click', () => {
            if (selectedSeriesFilter === s.id) {
                selectedSeriesFilter = null;
            } else {
                selectedSeriesFilter = s.id;
            }
            renderSeriesChips();
            renderList();
        });
        
        seriesList.appendChild(chip);
    });
}

function openSeriesModal(id) {
    if (id) {
        const s = series.find(s => s.id === id);
        if (!s) return;
        seriesModalTitle.textContent = 'Edit Series';
        seriesName.value = s.name;
        seriesDescription.value = s.description || '';
        seriesEditId.value = id;
        seriesAutoSelect.value = 'false';
    } else {
        seriesModalTitle.textContent = 'New Series';
        seriesName.value = '';
        seriesDescription.value = '';
        seriesEditId.value = '';
        seriesAutoSelect.value = 'true';
    }
    seriesModal.style.display = 'flex';
    setTimeout(() => seriesName.focus(), 100);
}

function closeSeriesModal() {
    seriesModal.style.display = 'none';
}

function saveSeries() {
    const name = seriesName.value.trim();
    if (!name) {
        showNotification('Series name is required', 'error');
        return;
    }
    const id = seriesEditId.value || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existing = series.find(s => s.id === id && s.id !== seriesEditId.value);
    if (existing) {
        showNotification('A series with this name already exists', 'error');
        return;
    }
    const data = {
        id: id,
        name: name,
        description: seriesDescription.value.trim() || ''
    };
    if (seriesEditId.value) {
        const idx = series.findIndex(s => s.id === seriesEditId.value);
        if (idx !== -1) {
            if (seriesEditId.value !== id) {
                projects.forEach(p => {
                    if (p.series_id === seriesEditId.value) {
                        p.series_id = id;
                    }
                });
            }
            series[idx] = data;
        }
    } else {
        series.push(data);
    }
    closeSeriesModal();
    saveToServer();
    renderSeriesDropdown();
    renderSeriesChips();
    renderList();
    
    if (seriesAutoSelect.value === 'true' && isEditing && editId) {
        formSeries.value = id;
        const parts = projects.filter(p => p.series_id === id && p.id !== editId);
        const nextPart = parts.length + 1;
        formPart.value = nextPart;
        autoSave();
        showNotification(`Series "${name}" created and assigned to current piece`, 'success');
    } else {
        showNotification(`Series "${name}" saved`, 'success');
    }
}

function confirmDeleteSeries(id) {
    const s = series.find(s => s.id === id);
    if (!s) return;
    const count = projects.filter(p => p.series_id === id).length;
    seriesDeleteMessage.textContent = `Delete "${s.name}"? ${count} article${count !== 1 ? 's are' : ' is'} in this series.`;
    seriesDeleteModal.style.display = 'flex';
    seriesDeleteConfirm.dataset.id = id;
}

function deleteSeries(id) {
    projects.forEach(p => {
        if (p.series_id === id) {
            p.series_id = '';
            p.part = undefined;
        }
    });
    series = series.filter(s => s.id !== id);
    if (selectedSeriesFilter === id) selectedSeriesFilter = null;
    seriesDeleteModal.style.display = 'none';
    saveToServer();
    renderSeriesDropdown();
    renderSeriesChips();
    renderList();
    showNotification('Series deleted', 'success');
}

// Series event listeners
addSeriesInlineBtn.addEventListener('click', () => openSeriesModal(null));
seriesModalSave.addEventListener('click', saveSeries);
seriesModalCancel.addEventListener('click', closeSeriesModal);
seriesModalClose.addEventListener('click', closeSeriesModal);
seriesModal.addEventListener('click', (e) => {
    if (e.target === seriesModal) closeSeriesModal();
});
seriesName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveSeries();
});

seriesDeleteConfirm.addEventListener('click', () => {
    deleteSeries(seriesDeleteConfirm.dataset.id);
});
seriesDeleteCancel.addEventListener('click', () => {
    seriesDeleteModal.style.display = 'none';
});
seriesDeleteClose.addEventListener('click', () => {
    seriesDeleteModal.style.display = 'none';
});
seriesDeleteModal.addEventListener('click', (e) => {
    if (e.target === seriesDeleteModal) seriesDeleteModal.style.display = 'none';
});

formSeries.addEventListener('change', function() {
    if (this.value) {
        const parts = projects.filter(p => p.series_id === this.value && p.id !== editId);
        const nextPart = parts.length + 1;
        formPart.value = nextPart;
    } else {
        formPart.value = '';
    }
    if (isEditing && editId) {
        debouncedAutoSave();
    }
});

// ==========================================================================
// Simplified Tag Manager
// ==========================================================================

function renderGenreTags() {
    const sorted = [...allGenres].sort();
    const pillsContainer = document.getElementById('genre-pills');
    pillsContainer.innerHTML = '';
    if (sorted.length === 0) {
        const empty = document.createElement('span');
        empty.style.cssText = 'color:var(--color-text-muted);font-size:0.75rem;padding:0.2rem 0.4rem;font-style:italic;';
        empty.textContent = 'No genres yet';
        pillsContainer.appendChild(empty);
    } else {
        sorted.forEach(genre => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            if (selectedGenres.includes(genre)) chip.classList.add('active');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = genre;
            chip.appendChild(nameSpan);
            if (selectedGenres.includes(genre)) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-tag';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedGenres = selectedGenres.filter(g => g !== genre);
                    renderGenreTags();
                    if (isEditing) debouncedAutoSave();
                });
                chip.appendChild(removeBtn);
            }
            chip.addEventListener('click', () => {
                if (selectedGenres.includes(genre)) {
                    selectedGenres = selectedGenres.filter(g => g !== genre);
                } else {
                    selectedGenres.push(genre);
                }
                renderGenreTags();
                if (isEditing) debouncedAutoSave();
            });
            pillsContainer.appendChild(chip);
        });
    }
}

function renderThemeTags() {
    const sorted = [...allThemes].sort();
    const pillsContainer = document.getElementById('theme-pills');
    pillsContainer.innerHTML = '';
    if (sorted.length === 0) {
        const empty = document.createElement('span');
        empty.style.cssText = 'color:var(--color-text-muted);font-size:0.75rem;padding:0.2rem 0.4rem;font-style:italic;';
        empty.textContent = 'No themes yet';
        pillsContainer.appendChild(empty);
    } else {
        sorted.forEach(theme => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            if (selectedThemes.includes(theme)) chip.classList.add('active');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = theme;
            chip.appendChild(nameSpan);
            if (selectedThemes.includes(theme)) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-tag';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedThemes = selectedThemes.filter(t => t !== theme);
                    renderThemeTags();
                    if (isEditing) debouncedAutoSave();
                });
                chip.appendChild(removeBtn);
            }
            chip.addEventListener('click', () => {
                if (selectedThemes.includes(theme)) {
                    selectedThemes = selectedThemes.filter(t => t !== theme);
                } else {
                    selectedThemes.push(theme);
                }
                renderThemeTags();
                if (isEditing) debouncedAutoSave();
            });
            pillsContainer.appendChild(chip);
        });
    }
}

function addGenre() {
    const name = newGenreInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    if (allGenres.includes(name)) {
        showNotification('Genre already exists', 'error');
        return;
    }
    allGenres.push(name);
    selectedGenres.push(name);
    newGenreInput.value = '';
    renderGenreTags();
    saveToServer();
    showNotification(`Added genre: ${name}`, 'success');
}

function addTheme() {
    const name = newThemeInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    if (allThemes.includes(name)) {
        showNotification('Theme already exists', 'error');
        return;
    }
    allThemes.push(name);
    selectedThemes.push(name);
    newThemeInput.value = '';
    renderThemeTags();
    saveToServer();
    showNotification(`Added theme: ${name}`, 'success');
}

newGenreInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addGenre(); }
});
addGenreBtn.addEventListener('click', addGenre);

newThemeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTheme(); }
});
addThemeBtn.addEventListener('click', addTheme);

// ==========================================================================
// Form Management
// ==========================================================================

function getFormData() {
    return {
        title: formTitle.value.trim(),
        path: formPath.value.trim(),
        slug: formSlug.value.trim(),
        date: formDate.value,
        mediaPath: formMedia.value.trim().replace(/\/+$/, ''), // Just the folder name
        genres: [...selectedGenres],
        themes: [...selectedThemes],
        published: formPublished.checked,
        series_id: formSeries.value || '',
        part: formPart.value ? parseInt(formPart.value) : undefined
    };
}

function setFormData(data) {
    formTitle.value = data.title || '';
    formPath.value = data.path || '';
    formSlug.value = data.slug || '';
    formDate.value = data.date || '';
    formMedia.value = data.mediaPath || '';
    selectedGenres = data.genres || [];
    selectedThemes = data.themes || [];
    formPublished.checked = data.published !== false;
    formSeries.value = data.series_id || '';
    formPart.value = data.part || '';
    renderGenreTags();
    renderThemeTags();
    updateUrlPreview();
}

function resetForm() {
    isEditing = false;
    editId = null;
    formHeading.textContent = 'New Piece';
    formEditId.value = '';
    formTitle.value = '';
    formPath.value = '';
    formSlug.value = '';
    formDate.value = '';
    formMedia.value = '';
    selectedGenres = [];
    selectedThemes = [];
    formHtml.value = '';
    formHtml.classList.remove('placeholder-warning');
    formPublished.checked = true;
    formSeries.value = '';
    formPart.value = '';
    submitBtn.style.display = 'block';
    downloadBtn.style.display = 'none';
    previewBtn.style.display = 'none';
    newPieceBtn.style.display = 'none';
    renderGenreTags();
    renderThemeTags();
    updateUrlPreview();
    document.querySelectorAll('.sort-item.editing').forEach(el => {
        el.classList.remove('editing');
        el.style.borderColor = '';
        el.style.borderWidth = '';
        el.style.borderStyle = '';
        el.style.boxShadow = '';
        el.style.backgroundColor = '';
    });
}

function loadProject(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    
    isEditing = true;
    editId = id;
    formHeading.textContent = 'Editing';  // Just "Editing"
    formEditId.value = id;
    
    loadContentFromFile(project).then(content => {
        if (content) {
            formHtml.value = content;
            formHtml.classList.remove('placeholder-warning');
        } else {
            formHtml.value = '';
            formHtml.placeholder = `⚠️ No HTML file found at writing/${project.path}${project.slug}.html\n\nTo add content:\n1. Upload an HTML file using the "Choose HTML file" button\n2. Or paste the <article> content directly into this textarea\n3. Click "Add Piece" (or "Update") to save both metadata and HTML`;
            formHtml.classList.add('placeholder-warning');
            showNotification('⚠️ No HTML content found. Upload or paste content to enable Preview and Download.', 'error');
        }
        setFormData(project);
    });
    
    submitBtn.style.display = 'none';
    downloadBtn.style.display = 'block';
    previewBtn.style.display = 'block';
    newPieceBtn.style.display = 'inline-block';
    
    document.querySelectorAll('.sort-item.editing').forEach(el => {
        el.classList.remove('editing');
        el.style.borderColor = '';
        el.style.borderWidth = '';
        el.style.borderStyle = '';
        el.style.boxShadow = '';
        el.style.backgroundColor = '';
    });
    const row = document.querySelector(`.sort-item[data-id="${id}"]`);
    if (row) {
        row.classList.add('editing');
        row.style.borderColor = 'var(--color-accent)';
        row.style.borderWidth = '2px';
        row.style.borderStyle = 'solid';
        row.style.boxShadow = '0 0 0 3px rgba(139, 90, 74, 0.15)';
        row.style.backgroundColor = 'var(--color-bg-card)';
    }
}

function newProject() {
    resetForm();
    formHeading.textContent = 'New Piece';
    submitBtn.style.display = 'block';
    downloadBtn.style.display = 'none';
    previewBtn.style.display = 'none';
    newPieceBtn.style.display = 'none';
    formTitle.focus();
}

// ==========================================================================
// Update Orders
// ==========================================================================

function updateOrders() {
    projects.forEach((p, index) => {
        p.order = index;
    });
}

// ==========================================================================
// Save & Load
// ==========================================================================

function saveToServer() {
    const cleanProjects = projects.map(p => {
        const { htmlContent, ...rest } = p;
        return rest;
    });
    
    const data = {
        projects: cleanProjects,
        genres: allGenres,
        themes: allThemes,
        series: series
    };
    
    fetch('http://localhost:3000/api/save-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(res => {
        if (!res.success) {
            showNotification('Save error: ' + res.error, 'error');
        }
    })
    .catch(() => {
        showNotification('Server not running. Run: node save-server.js', 'error');
    });
}

function loadFromServer() {
    fetch('http://localhost:3000/api/projects')
        .then(res => res.json())
        .then(data => {
            projects = data.projects || [];
            allGenres = data.genres || ['sci-fi', 'ya', 'article', 'poetry', 'essay', 'guide'];
            allThemes = data.themes || ['technology', 'writing', 'post-apocalyptic', 'publishing', 'autobiographical'];
            series = data.series || [];
            checkForExistingPieces();
            renderAll();
            showNotification(`Loaded ${projects.length} pieces`, 'success');
        })
        .catch(() => {
            showNotification('Could not load data. Server running?', 'error');
            projects = [];
            series = [];
            renderAll();
        });
}

// ==========================================================================
// Auto-detect Existing Pieces
// ==========================================================================

function checkForExistingPieces() {
    const knownPieces = [
        {
            id: 'threxil-pattern',
            title: 'The Threxil Pattern',
            path: 'shorts/',
            slug: 'threxil',
            date: '2026-05-20',
            dateDisplay: 'May 20, 2026',
            mediaPath: 'threxil',
            genres: ['sci-fi', 'ya'],
            themes: [],
            published: true,
            order: 0,
            series_id: '',
            part: null
        },
        {
            id: 'written-formatted',
            title: 'Written & Formatted',
            path: 'articles/',
            slug: 'written-formatted',
            date: '2026-06-04',
            dateDisplay: 'June 4, 2026',
            mediaPath: 'wf',
            genres: ['article'],
            themes: ['technology', 'writing', 'publishing'],
            published: true,
            order: 1,
            series_id: '',
            part: null
        }
    ];
    
    let addedCount = 0;
    let totalToAdd = knownPieces.filter(p => !projects.some(existing => existing.id === p.id)).length;
    
    if (totalToAdd === 0) {
        return;
    }
    
    knownPieces.forEach(piece => {
        const exists = projects.some(p => p.id === piece.id);
        if (!exists) {
            projects.push(piece);
            addedCount++;
            if (addedCount === totalToAdd) {
                updateOrders();
                saveToServer();
                renderAll();
                console.log(`✅ Auto-added ${addedCount} existing pieces`);
            }
        }
    });
}

// ==========================================================================
// Render All
// ==========================================================================

function renderAll() {
    renderGenreTags();
    renderThemeTags();
    renderSeriesDropdown();
    renderSeriesChips();
    renderList();
    updatePieceCount();
}

function updatePieceCount() {
    const count = document.getElementById('piece-count');
    if (count) {
        count.textContent = `${projects.length} ${projects.length === 1 ? 'piece' : 'pieces'}`;
    }
}

// ==========================================================================
// Auto-save
// ==========================================================================

function autoSave() {
    if (!isEditing || editId === null) return;
    const data = getFormData();
    if (!data.title || !data.slug) return;
    
    const index = projects.findIndex(p => p.id === editId);
    if (index === -1) return;
    
    const dateDisplay = data.date ? formatDate(data.date) : '';
    projects[index] = {
        ...projects[index],
        ...data,
        id: editId,
        dateDisplay: dateDisplay,
        fullPath: `writing/${data.path}${data.slug}.html`
    };
    saveToServer();
    renderList();
    showNotification('Auto-saved', 'success');
}

function debouncedAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(autoSave, 1000);
}

// ==========================================================================
// Date Helpers
// ==========================================================================

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ==========================================================================
// List Rendering
// ==========================================================================

function renderList() {
    const search = currentSearchTerm.toLowerCase();
    
    let filtered = projects.filter(p => 
        p.title.toLowerCase().includes(search) ||
        p.slug.toLowerCase().includes(search) ||
        p.path.toLowerCase().includes(search)
    );
    
    if (selectedSeriesFilter) {
        filtered = filtered.filter(p => p.series_id === selectedSeriesFilter);
    }
    
    sortableList.innerHTML = '';
    
    if (filtered.length === 0) {
        sortableList.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-folder-open"></i>
                <p>${projects.length === 0 ? 'No pieces yet. Add your first one!' : 'No pieces match your search.'}</p>
            </div>
        `;
        return;
    }
    
    const seriesGroups = {};
    const standalone = [];
    
    filtered.forEach(p => {
        if (p.series_id && series.some(s => s.id === p.series_id)) {
            if (!seriesGroups[p.series_id]) seriesGroups[p.series_id] = [];
            seriesGroups[p.series_id].push(p);
        } else {
            standalone.push(p);
        }
    });
    
    const sortedSeriesIds = Object.keys(seriesGroups).sort((a, b) => {
        const sa = series.find(s => s.id === a);
        const sb = series.find(s => s.id === b);
        return (sa ? sa.name : a).localeCompare(sb ? sb.name : b);
    });
    
    sortedSeriesIds.forEach(seriesId => {
        const s = series.find(s => s.id === seriesId);
        const groupItems = seriesGroups[seriesId].sort((a, b) => {
            if (a.part !== undefined && b.part !== undefined) return a.part - b.part;
            return (a.order || 0) - (b.order || 0);
        });
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'sort-group';
        
        const header = document.createElement('div');
        header.className = 'sort-group-header';
        header.innerHTML = `
            <span class="group-icon">📚</span>
            <span>${s ? s.name : seriesId}</span>
            <span class="group-count">${groupItems.length} part${groupItems.length !== 1 ? 's' : ''}</span>
        `;
        groupDiv.appendChild(header);
        
        groupItems.forEach(project => {
            const li = createListItem(project, true);
            groupDiv.appendChild(li);
        });
        
        sortableList.appendChild(groupDiv);
    });
    
    if (standalone.length > 0) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'sort-group';
        
        const header = document.createElement('div');
        header.className = 'sort-group-header';
        header.innerHTML = `
            <span class="group-icon">📄</span>
            <span>Standalone</span>
            <span class="group-count">${standalone.length} article${standalone.length !== 1 ? 's' : ''}</span>
        `;
        groupDiv.appendChild(header);
        
        standalone.sort((a, b) => (a.order || 0) - (b.order || 0));
        standalone.forEach(project => {
            const li = createListItem(project, false);
            groupDiv.appendChild(li);
        });
        
        sortableList.appendChild(groupDiv);
    }
}

function createListItem(project, isSeries) {
    const li = document.createElement('li');
    li.className = 'sort-item';
    if (isSeries) li.classList.add('series-item');
    li.draggable = true;
    li.dataset.id = project.id;
    
    if (editId === project.id) {
        li.classList.add('editing');
        li.style.borderColor = 'var(--color-accent)';
        li.style.borderWidth = '2px';
        li.style.borderStyle = 'solid';
        li.style.boxShadow = '0 0 0 3px rgba(139, 90, 74, 0.15)';
        li.style.backgroundColor = 'var(--color-bg-card)';
    }
    
    const genreDisplay = project.genres && project.genres.length > 0 
        ? project.genres.slice(0, 2).join(', ') + (project.genres.length > 2 ? '…' : '')
        : '';
    
    const publishedBadge = project.published === false 
        ? ' <span style="font-size:0.55rem; background:var(--color-border); color:var(--color-text-muted); padding:0.05rem 0.4rem; border-radius:100px; font-family:Plus Jakarta Sans,sans-serif;">Draft</span>'
        : '';
    
    const partBadge = project.part 
        ? `<span class="part-badge">Part ${project.part}</span>`
        : '';
    
    li.innerHTML = `
        <div class="sort-content" data-id="${project.id}">
            ${partBadge}
            <strong>${project.title}</strong>${publishedBadge}
            <span class="sort-meta">${project.path}${project.slug}.html</span>
            <span class="sort-meta">· ${project.dateDisplay || 'No date'}</span>
            ${genreDisplay ? `<span class="sort-meta" style="color:var(--color-accent);font-weight:500;">${genreDisplay}</span>` : ''}
        </div>
        <div class="sort-actions">
            <button class="row-btn move-up-btn" title="Move up">↑</button>
            <button class="row-btn move-down-btn" title="Move down">↓</button>
            <button class="row-btn delete-btn" data-id="${project.id}" title="Delete">✕</button>
            <span class="sort-handle" title="Drag to reorder">☰</span>
        </div>
    `;
    
    li.querySelector('.sort-content').addEventListener('click', () => {
        loadProject(project.id);
    });
    
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${project.title}" permanently?`)) {
            projects = projects.filter(p => p.id !== project.id);
            if (editId === project.id) resetForm();
            updateOrders();
            saveToServer();
            renderList();
            updatePieceCount();
            renderSeriesDropdown();
            renderSeriesChips();
            showNotification(`Deleted: ${project.title}`, 'success');
        }
    });
    
    const moveProject = (fromId, direction) => {
        const index = projects.findIndex(p => p.id === fromId);
        if (index === -1) return;
        let newIndex = index + direction;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= projects.length) newIndex = projects.length - 1;
        if (newIndex === index) return;
        const [item] = projects.splice(index, 1);
        projects.splice(newIndex, 0, item);
        updateOrders();
        saveToServer();
        renderList();
    };
    
    li.querySelector('.move-up-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        moveProject(project.id, -1);
    });
    
    li.querySelector('.move-down-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        moveProject(project.id, 1);
    });
    
    li.addEventListener('dragstart', (e) => {
        li.classList.add('dragging');
        e.dataTransfer.setData('text/plain', project.id);
    });
    
    li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
    });
    
    return li;
}

// ==========================================================================
// Search
// ==========================================================================

adminSearch.addEventListener('input', () => {
    currentSearchTerm = adminSearch.value;
    adminSearchClear.style.display = currentSearchTerm ? 'flex' : 'none';
    renderList();
});

adminSearchClear.addEventListener('click', () => {
    adminSearch.value = '';
    currentSearchTerm = '';
    adminSearchClear.style.display = 'none';
    adminSearch.focus();
    renderList();
});

// ==========================================================================
// Build Assembled HTML with image path fixing
// ==========================================================================

function buildAssembledHtml(project, content, context) {
    // content should already be extracted - just fix image paths
    const fixedContent = fixImagePaths(content, project, context || 'preview');
    
    return fetch('http://localhost:3000/templates/template.html')
        .then(response => {
            if (!response.ok) throw new Error('Could not load template.html');
            return response.text();
        })
        .then(template => {
            const allTags = [...(project.genres || []), ...(project.themes || [])];
            const allPills = allTags.length > 0 
                ? allTags.map(t => `<span class="pill">${escapeHtml(t)}</span>`).join('\n                        ')
                : '';
            
            let seriesHtml = '';
            let seriesNavHtml = '';
            let seriesSubtitleHtml = '';
            
            if (project.series_id) {
                const seriesInfo = series.find(s => s.id === project.series_id);
                if (seriesInfo) {
                    const seriesParts = projects
                        .filter(p => p.series_id === project.series_id && p.published !== false)
                        .sort((a, b) => (a.part || 0) - (b.part || 0));
                    
                    const currentPart = project.part || 1;
                    const totalParts = seriesParts.length;
                    const partDisplay = `Part ${currentPart}${totalParts > 1 ? ` of ${totalParts}` : ''}`;
                    
                    seriesHtml = `
                        <span class="meta-separator">&middot;</span>
                        <span class="series-meta">
                            <span class="series-badge">📚 ${escapeHtml(seriesInfo.name)}</span>
                            <span class="series-part">${partDisplay}</span>
                        </span>
                    `;
                    
                    seriesSubtitleHtml = `
                        <p class="story-subtitle series-subtitle">
                            <span class="series-label">Part of</span>
                            <span class="series-name">${escapeHtml(seriesInfo.name)}</span>
                            ${seriesInfo.description ? `<span class="series-desc">— ${escapeHtml(seriesInfo.description)}</span>` : ''}
                        </p>
                    `;
                    
                    if (seriesParts.length > 1) {
                        const currentIndex = seriesParts.findIndex(p => p.id === project.id);
                        let navLinks = '';
                        navLinks = `
                            <div class="series-nav">
                                <span class="series-nav-label">${escapeHtml(seriesInfo.name)}</span>
                                <div class="series-nav-links">
                                    ${currentIndex > 0 ? `<a href="${seriesParts[currentIndex - 1].fullPath || '#'}" class="series-nav-prev">← Previous</a>` : '<span class="series-nav-disabled">← Previous</span>'}
                                    <span class="series-nav-current">${currentPart}${totalParts > 1 ? `/${totalParts}` : ''}</span>
                                    ${currentIndex < seriesParts.length - 1 ? `<a href="${seriesParts[currentIndex + 1].fullPath || '#'}" class="series-nav-next">Next →</a>` : '<span class="series-nav-disabled">Next →</span>'}
                                </div>
                            </div>
                        `;
                        seriesNavHtml = navLinks;
                    }
                }
            }
            
            let ogImage = 'https://samoff.com/wbts_icon.png';
            let hasImage = false;
            const imgPath = getFirstImageFromHtml(fixedContent);
            if (imgPath) {
                hasImage = true;
                if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
                    ogImage = imgPath;
                } else if (imgPath.startsWith('/')) {
                    ogImage = `https://samoff.com${imgPath}`;
                } else {
                    // Build path using project.path and media folder
                    const cleanPath = project.path.endsWith('/') ? project.path : project.path + '/';
                    const folderName = project.mediaPath ? project.mediaPath.split('/').pop() : '';
                    const filename = imgPath.split('/').pop();
                    if (folderName) {
                        ogImage = `https://samoff.com/written/writing/${cleanPath}${folderName}/${filename}`;
                    } else {
                        ogImage = `https://samoff.com/written/writing/${cleanPath}${filename}`;
                    }
                }
            }
            
            const title = project.title || 'Untitled';
            const fullTitle = `${title} @ Written by Tim Samoff`;
            const metaDesc = project.title || '';
            
            template = template.replace(/<!-- TITLE: .*? -->/g, `<!-- TITLE: ${title} -->`);
            template = template.replace(/<title>.*?<\/title>/, `<title>${fullTitle}</title>`);
            template = template.replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${metaDesc}">`);
            template = template.replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${fullTitle}">`);
            template = template.replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${metaDesc}">`);
            template = template.replace(/<meta property="og:image" content=".*?">/, `<meta property="og:image" content="${ogImage}">`);
            template = template.replace(/<meta name="twitter:title" content=".*?">/, `<meta name="twitter:title" content="${fullTitle}">`);
            template = template.replace(/<meta name="twitter:description" content=".*?">/, `<meta name="twitter:description" content="${metaDesc}">`);
            template = template.replace(/<meta name="twitter:image" content=".*?">/, `<meta name="twitter:image" content="${ogImage}">`);
            
            const twitterCard = hasImage ? 'summary_large_image' : 'summary';
            template = template.replace(/<meta name="twitter:card" content=".*?">/, `<meta name="twitter:card" content="${twitterCard}">`);
            
            template = template.replace(/<span class="date">.*?<\/span>/, `<span class="date">${project.dateDisplay || ''}</span>`);
            template = template.replace(/TITLE_PLACEHOLDER/g, title);
            template = template.replace(/<h1 class="story-title"[^>]*>.*?<\/h1>/, `<h1 class="story-title" id="story-title">${title}</h1>`);
            template = template.replace(/<!-- SERIES_SUBTITLE: Generated by admin -->/, seriesSubtitleHtml);
            template = template.replace(/<!-- SERIES_META: Generated by admin -->/, seriesHtml);
            template = template.replace(/<!-- SERIES_NAV: Generated by admin -->/, seriesNavHtml);
            template = template.replace(/<div class="pill-container">[\s\S]*?<\/div>/, `<div class="pill-container">\n                        ${allPills}\n                    </div>`);
            
            // Replace article content - insert the cleaned content directly
            const articleMatch = template.match(/<article class="story-content ls-2">[\s\S]*?<\/article>/);
            if (articleMatch) {
                const articleTag = articleMatch[0];
                const newArticle = `<article class="story-content ls-2">\n${fixedContent}\n</article>`;
                template = template.replace(articleTag, newArticle);
            } else {
                const genericArticle = template.match(/<article[^>]*>[\s\S]*?<\/article>/);
                if (genericArticle) {
                    const articleTag = genericArticle[0];
                    const newArticle = `<article class="story-content ls-2">\n${fixedContent}\n</article>`;
                    template = template.replace(articleTag, newArticle);
                } else {
                    template = template.replace(/<!-- REPLACED BY ADMIN -->/g, fixedContent);
                }
            }
            
            return template;
        });
}

// ==========================================================================
// Get content for preview/download
// ==========================================================================

async function getContentForAction(project) {
    let content = contentCache[`${project.path}${project.slug}`];
    if (!content) {
        content = await loadContentFromFile(project);
    }
    return content;
}

// ==========================================================================
// Form Submit - Save metadata AND HTML file
// ==========================================================================

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = formTitle.value.trim();
    const path = formPath.value.trim();
    const slug = formSlug.value.trim();
    const date = formDate.value;
    const html = formHtml.value.trim();
    
    if (!title || !path || !slug || !date) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    if (!html) {
        showNotification('Please add HTML content before saving', 'error');
        return;
    }
    
    const cleanPath = path.endsWith('/') ? path : path + '/';
    const id = slug;
    const dateDisplay = formatDate(date);
    const fullPath = `writing/${cleanPath}${slug}.html`;
    
    const data = {
        id,
        title,
        path: cleanPath,
        slug,
        fullPath,
        date,
        dateDisplay,
        mediaPath: formMedia.value.trim().replace(/\/+$/, ''),
        genres: [...selectedGenres],
        themes: [...selectedThemes],
        published: formPublished.checked,
        series_id: formSeries.value || '',
        part: formPart.value ? parseInt(formPart.value) : undefined,
        order: projects.length
    };
    
    try {
        const content = html;
        const fixedContent = fixImagePaths(content, data, 'save');
        const assembledHtml = await buildAssembledHtml(data, fixedContent, 'save');
        
        const saved = await saveHtmlToServer(fullPath, assembledHtml);
        if (!saved) {
            showNotification('HTML file could not be saved', 'error');
            return;
        }
        
        const cacheKey = `${cleanPath}${slug}`;
        const previewContent = fixImagePaths(content, data, 'preview');
        contentCache[cacheKey] = previewContent;
        
        if (isEditing && editId) {
            const index = projects.findIndex(p => p.id === editId);
            if (index !== -1) {
                projects[index] = { ...projects[index], ...data };
                showNotification(`Updated: ${title} - HTML saved to ${fullPath}`, 'success');
            }
        } else {
            if (projects.find(p => p.id === id)) {
                showNotification('A piece with this slug already exists', 'error');
                return;
            }
            projects.push(data);
            updateOrders();
            showNotification(`Added: ${title} - HTML saved to ${fullPath}`, 'success');
        }
        
        saveToServer();
        resetForm();
        renderList();
        updatePieceCount();
        renderSeriesDropdown();
        renderSeriesChips();
        formTitle.focus();
        
    } catch (err) {
        console.error('Error saving piece:', err);
        showNotification('Error: ' + err.message, 'error');
    }
});

// ==========================================================================
// Submit button - triggers form submit (since it's outside the form)
// ==========================================================================

submitBtn.addEventListener('click', function() {
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});

// Also handle Enter key on the title field to submit
formTitle.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
});

// ==========================================================================
// Preview Button - Opens in new tab with absolute image paths
// ==========================================================================

previewBtn.addEventListener('click', async () => {
    if (!isEditing || !editId) {
        showNotification('No piece loaded to preview', 'error');
        return;
    }
    
    const project = projects.find(p => p.id === editId);
    if (!project) {
        showNotification('Project not found', 'error');
        return;
    }
    
    let content = await getContentForAction(project);
    
    const formContent = formHtml.value;
    if (formContent && !formContent.includes('⚠️ No HTML file found')) {
        content = formContent;
    }
    
    if (!content) {
        showNotification('No HTML content found. Please upload or paste content first.', 'error');
        return;
    }
    
    try {
        const formData = getFormData();
        const mergedProject = { ...project, ...formData };
        
        const assembledHtml = await buildAssembledHtml(mergedProject, content, 'preview');
        
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(assembledHtml);
            newWindow.document.close();
        } else {
            showNotification('Popup blocked. Please allow popups for this site.', 'error');
        }
        
    } catch (err) {
        console.error('Preview error:', err);
        showNotification('Error generating preview: ' + err.message, 'error');
    }
});

// ==========================================================================
// Download Button - Saves directly to server (no dialog)
// ==========================================================================

downloadBtn.addEventListener('click', async () => {
    if (!isEditing || !editId) {
        showNotification('No piece loaded to save', 'error');
        return;
    }
    
    const project = projects.find(p => p.id === editId);
    if (!project) {
        showNotification('Project not found', 'error');
        return;
    }
    
    let content = await getContentForAction(project);
    
    const formContent = formHtml.value;
    if (formContent && !formContent.includes('⚠️ No HTML file found')) {
        content = formContent;
    }
    
    if (!content) {
        showNotification('No HTML content found. Please upload or paste content first.', 'error');
        return;
    }
    
    try {
        const formData = getFormData();
        const mergedProject = { ...project, ...formData };
        
        const fullPath = `writing/${mergedProject.path}${mergedProject.slug}.html`;
        const assembledHtml = await buildAssembledHtml(mergedProject, content, 'save');
        
        const saved = await saveHtmlToServer(fullPath, assembledHtml);
        
        if (saved) {
            const cacheKey = `${mergedProject.path}${mergedProject.slug}`;
            const previewContent = fixImagePaths(content, mergedProject, 'preview');
            contentCache[cacheKey] = previewContent;
            showNotification(`✅ Saved: ${fullPath}`, 'success');
        } else {
            showNotification('Failed to save HTML file', 'error');
        }
        
    } catch (err) {
        console.error('Save error:', err);
        showNotification('Error saving: ' + err.message, 'error');
    }
});

// ==========================================================================
// Notification System
// ==========================================================================

let notificationTimeout = null;

function showNotification(message, type = 'success') {
    const existing = document.querySelector('.admin-notification');
    if (existing) existing.remove();
    if (notificationTimeout) clearTimeout(notificationTimeout);
    const div = document.createElement('div');
    div.className = `admin-notification ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    notificationTimeout = setTimeout(() => {
        div.style.opacity = '0';
        div.style.transform = 'translateX(100%)';
        div.style.transition = 'opacity 0.3s, transform 0.3s';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

// ==========================================================================
// New Piece Button
// ==========================================================================

newPieceBtn.addEventListener('click', newProject);

// ==========================================================================
// Auto-save on form changes
// ==========================================================================

formTitle.addEventListener('input', debouncedAutoSave);
formPath.addEventListener('input', debouncedAutoSave);
formSlug.addEventListener('input', debouncedAutoSave);
formDate.addEventListener('input', debouncedAutoSave);
formMedia.addEventListener('input', debouncedAutoSave);
formHtml.addEventListener('input', debouncedAutoSave);

// ==========================================================================
// Init
// ==========================================================================

loadFromServer();
updateUrlPreview();
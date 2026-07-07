/**
 * Written by Tim Samoff - Filter System
 * Handles multi-category filtering for genres and themes on the index page
 */

function initFilterSystem() {
    const filterToggleBtn = document.getElementById('filter-toggle');
    const filterSection = document.getElementById('filter-section');
    const genreFilterContainer = document.getElementById('genre-filters');
    const themeFilterContainer = document.getElementById('theme-filters');
    const filterCountSpan = document.getElementById('filter-count');
    const clearFiltersBtn = document.getElementById('clear-filters');
    const tbody = document.getElementById('toc-body');
    
    // Get all rows
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    
    // State
    let activeGenres = new Set(['all']);
    let activeThemes = new Set(['all']);
    
    // ============================================
    // Collapsible Section
    // ============================================
    
    if (filterToggleBtn && filterSection) {
        filterSection.classList.add('collapsed');
        const newToggle = filterToggleBtn.cloneNode(true);
        filterToggleBtn.parentNode.replaceChild(newToggle, filterToggleBtn);
        
        newToggle.addEventListener('click', function(e) {
            e.preventDefault();
            const isCollapsed = filterSection.classList.contains('collapsed');
            
            if (isCollapsed) {
                filterSection.classList.remove('collapsed');
                newToggle.classList.add('active');
            } else {
                filterSection.classList.add('collapsed');
                newToggle.classList.remove('active');
            }
        });
    }
    
    // ============================================
    // Filter Functions
    // ============================================
    
    function matchesFilters(row) {
        // Check if it's a series header row
        if (row.classList.contains('series-header-row')) {
            const genres = JSON.parse(row.dataset.genres || '[]');
            const themes = JSON.parse(row.dataset.themes || '[]');
            
            let genreMatch = false;
            if (activeGenres.has('all')) {
                genreMatch = true;
            } else {
                for (let genre of activeGenres) {
                    if (genres.includes(genre)) {
                        genreMatch = true;
                        break;
                    }
                }
            }
            
            let themeMatch = false;
            if (activeThemes.has('all')) {
                themeMatch = true;
            } else {
                for (let theme of activeThemes) {
                    if (themes.includes(theme)) {
                        themeMatch = true;
                        break;
                    }
                }
            }
            
            return genreMatch && themeMatch;
        }
        
        // Regular row
        const genres = JSON.parse(row.dataset.genres || '[]');
        const themes = JSON.parse(row.dataset.themes || '[]');
        
        let genreMatch = false;
        if (activeGenres.has('all')) {
            genreMatch = true;
        } else {
            for (let genre of activeGenres) {
                if (genres.includes(genre)) {
                    genreMatch = true;
                    break;
                }
            }
        }
        
        let themeMatch = false;
        if (activeThemes.has('all')) {
            themeMatch = true;
        } else {
            for (let theme of activeThemes) {
                if (themes.includes(theme)) {
                    themeMatch = true;
                    break;
                }
            }
        }
        
        return genreMatch && themeMatch;
    }
    
    function updateDisplay() {
        let visibleCount = 0;
        let totalCount = 0;
        
        allRows.forEach(row => {
            if (row.classList.contains('series-header-row')) {
                // Check if any child rows are visible
                let childVisible = false;
                let next = row.nextElementSibling;
                while (next && !next.classList.contains('series-header-row')) {
                    if (!next.classList.contains('filter-hidden')) {
                        childVisible = true;
                    }
                    next = next.nextElementSibling;
                }
                // Check if the series header itself matches filters
                const headerMatches = matchesFilters(row);
                if (childVisible && headerMatches) {
                    row.classList.remove('filter-hidden');
                } else {
                    row.classList.add('filter-hidden');
                }
                return;
            }
            
            totalCount++;
            const isVisible = matchesFilters(row);
            if (isVisible) {
                row.classList.remove('filter-hidden');
                visibleCount++;
            } else {
                row.classList.add('filter-hidden');
            }
        });
        
        // Count visible rows (non-header rows)
        const visibleRows = allRows.filter(row => 
            !row.classList.contains('filter-hidden') && 
            !row.classList.contains('series-header-row')
        );
        const actualVisibleCount = visibleRows.length;
        
        if (actualVisibleCount === totalCount && activeGenres.has('all') && activeThemes.has('all')) {
            filterCountSpan.textContent = `Showing all ${totalCount} ${totalCount === 1 ? 'piece' : 'pieces'}`;
        } else {
            filterCountSpan.textContent = `Showing ${actualVisibleCount} of ${totalCount} ${totalCount === 1 ? 'piece' : 'pieces'}`;
        }
        
        // Remove any existing empty state
        const existingEmpty = document.querySelector('.no-results');
        if (existingEmpty) {
            existingEmpty.remove();
        }
        
        // Show empty state if no results
        if (actualVisibleCount === 0) {
            const emptyMessage = document.createElement('tr');
            emptyMessage.className = 'no-results';
            emptyMessage.innerHTML = `
                <td colspan="3">
                    <i class="fa-regular fa-folder-open"></i>
                    <p>No matching pieces found. Try adjusting your filters.</p>
                </td>
            `;
            tbody.appendChild(emptyMessage);
        }
    }
    
    function handleFilterClick(button, type, value) {
        const isActive = button.classList.contains('active');
        const activeSet = type === 'genre' ? activeGenres : activeThemes;
        const container = type === 'genre' ? genreFilterContainer : themeFilterContainer;
        
        if (value === 'all') {
            activeSet.clear();
            activeSet.add('all');
            
            const buttons = container.querySelectorAll('.filter-chip');
            buttons.forEach(btn => {
                if (btn.dataset.filter === 'all') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        } else {
            if (activeSet.has('all')) {
                activeSet.delete('all');
                const allButton = container.querySelector('.filter-chip[data-filter="all"]');
                if (allButton) allButton.classList.remove('active');
            }
            
            if (isActive) {
                activeSet.delete(value);
                button.classList.remove('active');
            } else {
                activeSet.add(value);
                button.classList.add('active');
            }
            
            if (activeSet.size === 0) {
                activeSet.add('all');
                const allButton = container.querySelector('.filter-chip[data-filter="all"]');
                if (allButton) allButton.classList.add('active');
            }
        }
        
        updateDisplay();
    }
    
    function clearAllFilters() {
        activeGenres.clear();
        activeGenres.add('all');
        activeThemes.clear();
        activeThemes.add('all');
        
        const genreButtons = genreFilterContainer.querySelectorAll('.filter-chip');
        genreButtons.forEach(btn => {
            if (btn.dataset.filter === 'all') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        const themeButtons = themeFilterContainer.querySelectorAll('.filter-chip');
        themeButtons.forEach(btn => {
            if (btn.dataset.filter === 'all') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        updateDisplay();
    }
    
    // ============================================
    // Attach Event Listeners to Filter Buttons
    // ============================================
    
    function rebuildButtonListeners() {
        // Genre filters
        const genreButtons = genreFilterContainer.querySelectorAll('.filter-chip');
        genreButtons.forEach(btn => {
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);
            clone.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                handleFilterClick(this, 'genre', this.dataset.filter);
            });
        });
        
        // Theme filters
        const themeButtons = themeFilterContainer.querySelectorAll('.filter-chip');
        themeButtons.forEach(btn => {
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);
            clone.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                handleFilterClick(this, 'theme', this.dataset.filter);
            });
        });
    }
    
    rebuildButtonListeners();
    
    // Clear filters button
    if (clearFiltersBtn) {
        const clearClone = clearFiltersBtn.cloneNode(true);
        clearFiltersBtn.parentNode.replaceChild(clearClone, clearFiltersBtn);
        clearClone.addEventListener('click', clearAllFilters);
    }
    
    // Initial display update
    updateDisplay();
}
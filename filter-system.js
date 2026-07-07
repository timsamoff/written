/**
 * Written by Tim Samoff - Filter System
 * Handles multi-category filtering for genres and themes on the index page
 */

(function() {
    'use strict';
    
    function initFilterSystem() {
        console.log('initFilterSystem called');
        
        const filterToggleBtn = document.getElementById('filter-toggle');
        const filterSection = document.getElementById('filter-section');
        const genreFilterContainer = document.getElementById('genre-filters');
        const themeFilterContainer = document.getElementById('theme-filters');
        const filterCountSpan = document.getElementById('filter-count');
        const clearFiltersBtn = document.getElementById('clear-filters');
        const tbody = document.getElementById('toc-body');
        
        if (!tbody) {
            console.error('tbody not found');
            return;
        }
        
        console.log('Filter system initialized with', tbody.querySelectorAll('tr').length, 'rows');
        
        // ============================================
        // Collapsible Section
        // ============================================
        
        if (filterToggleBtn && filterSection) {
            filterSection.classList.add('collapsed');
            filterToggleBtn.classList.remove('active');
            
            // Remove existing listeners
            const newToggle = filterToggleBtn.cloneNode(true);
            filterToggleBtn.parentNode.replaceChild(newToggle, filterToggleBtn);
            
            // Add click listener
            document.getElementById('filter-toggle').addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                const section = document.getElementById('filter-section');
                const isCollapsed = section.classList.contains('collapsed');
                
                if (isCollapsed) {
                    section.classList.remove('collapsed');
                    this.classList.add('active');
                } else {
                    section.classList.add('collapsed');
                    this.classList.remove('active');
                }
            });
        }
        
        // ============================================
        // Filter Functions
        // ============================================
        
        function getActiveFilters() {
            const genres = [];
            const themes = [];
            
            // Get active genre filters (excluding "All")
            document.querySelectorAll('#genre-filters .filter-chip.active').forEach(function(btn) {
                if (btn.dataset.filter !== 'all') {
                    genres.push(btn.dataset.filter);
                }
            });
            
            // Get active theme filters (excluding "All")
            document.querySelectorAll('#theme-filters .filter-chip.active').forEach(function(btn) {
                if (btn.dataset.filter !== 'all') {
                    themes.push(btn.dataset.filter);
                }
            });
            
            return { genres: genres, themes: themes };
        }
        
        function matchesFilters(row) {
            // Always show header rows (they'll be handled separately)
            if (row.classList.contains('series-header-row') || row.classList.contains('section-header-row')) {
                return true;
            }
            
            // Get active filters
            var active = getActiveFilters();
            var activeGenres = active.genres;
            var activeThemes = active.themes;
            
            // If no filters are active, show everything
            if (activeGenres.length === 0 && activeThemes.length === 0) {
                return true;
            }
            
            // Get row's genres and themes
            var rowGenres = [];
            var rowThemes = [];
            
            try {
                if (row.dataset.genres) {
                    rowGenres = JSON.parse(row.dataset.genres);
                }
                if (row.dataset.themes) {
                    rowThemes = JSON.parse(row.dataset.themes);
                }
            } catch (e) {
                // If parsing fails, use empty arrays
            }
            
            // Check if row matches any active genre
            var genreMatch = true;
            if (activeGenres.length > 0) {
                genreMatch = false;
                for (var i = 0; i < activeGenres.length; i++) {
                    if (rowGenres.indexOf(activeGenres[i]) !== -1) {
                        genreMatch = true;
                        break;
                    }
                }
            }
            
            // Check if row matches any active theme
            var themeMatch = true;
            if (activeThemes.length > 0) {
                themeMatch = false;
                for (var j = 0; j < activeThemes.length; j++) {
                    if (rowThemes.indexOf(activeThemes[j]) !== -1) {
                        themeMatch = true;
                        break;
                    }
                }
            }
            
            return genreMatch && themeMatch;
        }
        
        function updateDisplay() {
            console.log('updateDisplay called');
            
            var allRows = Array.from(tbody.querySelectorAll('tr'));
            var totalContentRows = 0;
            var visibleContentRows = 0;
            
            // First pass: filter regular rows (skip header rows)
            allRows.forEach(function(row) {
                // Skip header rows - they'll be handled in the second pass
                if (row.classList.contains('series-header-row') || row.classList.contains('section-header-row')) {
                    return;
                }
                
                totalContentRows++;
                var isVisible = matchesFilters(row);
                
                if (isVisible) {
                    row.classList.remove('filter-hidden');
                    visibleContentRows++;
                } else {
                    row.classList.add('filter-hidden');
                }
            });
            
            console.log('Content rows:', totalContentRows, 'Visible:', visibleContentRows, 'Hidden:', totalContentRows - visibleContentRows);
            
            // Second pass: show/hide series headers based on visible children
            allRows.forEach(function(row) {
                if (row.classList.contains('series-header-row')) {
                    var hasVisibleChildren = false;
                    var next = row.nextElementSibling;
                    
                    while (next && !next.classList.contains('series-header-row') && !next.classList.contains('section-header-row')) {
                        if (!next.classList.contains('filter-hidden')) {
                            hasVisibleChildren = true;
                            break;
                        }
                        next = next.nextElementSibling;
                    }
                    
                    if (hasVisibleChildren) {
                        row.classList.remove('filter-hidden');
                    } else {
                        row.classList.add('filter-hidden');
                    }
                }
            });
            
            // Third pass: show/hide section headers
            allRows.forEach(function(row) {
                if (row.classList.contains('section-header-row')) {
                    var hasVisibleChildren = false;
                    var next = row.nextElementSibling;
                    
                    while (next && !next.classList.contains('section-header-row')) {
                        if (!next.classList.contains('filter-hidden')) {
                            hasVisibleChildren = true;
                            break;
                        }
                        next = next.nextElementSibling;
                    }
                    
                    if (hasVisibleChildren) {
                        row.classList.remove('filter-hidden');
                    } else {
                        row.classList.add('filter-hidden');
                    }
                }
            });
            
            // Count visible content rows (non-header rows)
            var visibleRows = allRows.filter(function(row) {
                return !row.classList.contains('filter-hidden') && 
                       !row.classList.contains('series-header-row') &&
                       !row.classList.contains('section-header-row');
            });
            var actualVisibleCount = visibleRows.length;
            
            // Update count
            var active = getActiveFilters();
            if (active.genres.length === 0 && active.themes.length === 0) {
                filterCountSpan.textContent = 'Showing all ' + totalContentRows + ' ' + (totalContentRows === 1 ? 'piece' : 'pieces');
            } else {
                filterCountSpan.textContent = 'Showing ' + actualVisibleCount + ' of ' + totalContentRows + ' ' + (totalContentRows === 1 ? 'piece' : 'pieces');
            }
            
            // Remove empty state
            var existingEmpty = document.querySelector('.no-results');
            if (existingEmpty) {
                existingEmpty.remove();
            }
            
            // Show empty state if no results
            if (actualVisibleCount === 0) {
                var emptyMessage = document.createElement('tr');
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
            console.log('Filter clicked:', type, value);
            
            // Toggle the button
            button.classList.toggle('active');
            
            // If "All" was clicked
            if (value === 'all') {
                var container = type === 'genre' ? genreFilterContainer : themeFilterContainer;
                var allButtons = container.querySelectorAll('.filter-chip');
                
                if (button.classList.contains('active')) {
                    // "All" is active - deactivate all others
                    allButtons.forEach(function(btn) {
                        if (btn.dataset.filter !== 'all') {
                            btn.classList.remove('active');
                        }
                    });
                }
            } else {
                // A specific filter was clicked
                var container = type === 'genre' ? genreFilterContainer : themeFilterContainer;
                var allBtn = container.querySelector('.filter-chip[data-filter="all"]');
                
                // If "All" is active, deactivate it
                if (allBtn && allBtn.classList.contains('active')) {
                    allBtn.classList.remove('active');
                }
                
                // Check if any specific filters are active
                var anyActive = container.querySelector('.filter-chip.active:not([data-filter="all"])');
                if (!anyActive) {
                    // No specific filters active, so activate "All"
                    if (allBtn) {
                        allBtn.classList.add('active');
                    }
                }
            }
            
            // Update the display
            updateDisplay();
        }
        
        function clearAllFilters() {
            console.log('Clear all filters');
            
            // Reset genre filters
            document.querySelectorAll('#genre-filters .filter-chip').forEach(function(btn) {
                if (btn.dataset.filter === 'all') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            // Reset theme filters
            document.querySelectorAll('#theme-filters .filter-chip').forEach(function(btn) {
                if (btn.dataset.filter === 'all') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            updateDisplay();
        }
        
        // ============================================
        // Attach Event Listeners
        // ============================================
        
        function attachFilterListeners() {
            console.log('Attaching filter listeners');
            
            // Genre filters
            document.querySelectorAll('#genre-filters .filter-chip').forEach(function(btn) {
                // Remove any existing listeners by cloning
                var clone = btn.cloneNode(true);
                btn.parentNode.replaceChild(clone, btn);
                
                // Add new listener
                clone.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleFilterClick(this, 'genre', this.dataset.filter);
                });
            });
            
            // Theme filters
            document.querySelectorAll('#theme-filters .filter-chip').forEach(function(btn) {
                // Remove any existing listeners by cloning
                var clone = btn.cloneNode(true);
                btn.parentNode.replaceChild(clone, btn);
                
                // Add new listener
                clone.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleFilterClick(this, 'theme', this.dataset.filter);
                });
            });
        }
        
        // Clear filters button
        if (clearFiltersBtn) {
            var clearClone = clearFiltersBtn.cloneNode(true);
            clearFiltersBtn.parentNode.replaceChild(clearClone, clearFiltersBtn);
            clearClone.addEventListener('click', clearAllFilters);
        }
        
        // Attach all listeners
        attachFilterListeners();
        
        // Initial display update
        updateDisplay();
        
        console.log('Filter system ready');
    }
    
    // Make initFilterSystem available globally
    window.initFilterSystem = initFilterSystem;
})();
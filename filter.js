/**
 * Written by Tim Samoff - Filter System
 * Handles multi-category filtering for genres and concepts
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const tbody = document.getElementById('toc-body');
    const genreFilterContainer = document.getElementById('genre-filters');
    const conceptFilterContainer = document.getElementById('concept-filters');
    const filterCountSpan = document.getElementById('filter-count');
    const clearFiltersBtn = document.getElementById('clear-filters');
    
    // Collapsible section elements
    const filterToggleBtn = document.getElementById('filter-toggle');
    const filterSection = document.getElementById('filter-section');
    
    // State
    let activeGenres = new Set(['all']);
    let activeConcepts = new Set(['all']);
    
    // Get all rows
    const rows = Array.from(document.querySelectorAll('#toc-body tr'));
    
    /**
     * Initialize collapsible filter section
     */
    function initCollapsible() {
        if (!filterToggleBtn || !filterSection) return;
        
        // Set collapsed by default
        filterSection.classList.add('collapsed');
        
        // Toggle on click
        filterToggleBtn.addEventListener('click', () => {
            const isCollapsed = filterSection.classList.contains('collapsed');
            
            if (isCollapsed) {
                filterSection.classList.remove('collapsed');
                filterToggleBtn.classList.add('active');
            } else {
                filterSection.classList.add('collapsed');
                filterToggleBtn.classList.remove('active');
            }
        });
    }
    
    /**
     * Check if a row matches current filters
     */
    function matchesFilters(row) {
        const genres = JSON.parse(row.dataset.genres || '[]');
        const concepts = JSON.parse(row.dataset.concepts || '[]');
        
        // Genre matching
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
        
        // Concept matching  
        let conceptMatch = false;
        if (activeConcepts.has('all')) {
            conceptMatch = true;
        } else {
            for (let concept of activeConcepts) {
                if (concepts.includes(concept)) {
                    conceptMatch = true;
                    break;
                }
            }
        }
        
        return genreMatch && conceptMatch;
    }
    
    /**
     * Update the UI by showing/hiding rows
     */
    function updateDisplay() {
        let visibleCount = 0;
        
        rows.forEach(row => {
            const isVisible = matchesFilters(row);
            if (isVisible) {
                row.classList.remove('filter-hidden');
                visibleCount++;
            } else {
                row.classList.add('filter-hidden');
            }
        });
        
        // Update filter count display
        const totalCount = rows.length;
        if (visibleCount === totalCount && activeGenres.has('all') && activeConcepts.has('all')) {
            filterCountSpan.textContent = `Showing all ${totalCount} ${totalCount === 1 ? 'piece' : 'pieces'}`;
        } else {
            filterCountSpan.textContent = `Showing ${visibleCount} of ${totalCount} ${totalCount === 1 ? 'piece' : 'pieces'}`;
        }
        
        // Remove any existing empty state
        const existingEmpty = document.querySelector('.no-results');
        if (existingEmpty) {
            existingEmpty.remove();
        }
        
        // Show empty state if no results
        if (visibleCount === 0) {
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
    
    /**
     * Handle filter chip clicks
     */
    function handleFilterClick(button, type, value) {
        const isActive = button.classList.contains('active');
        const activeSet = type === 'genre' ? activeGenres : activeConcepts;
        const container = type === 'genre' ? genreFilterContainer : conceptFilterContainer;
        
        // If clicking "All" button
        if (value === 'all') {
            // Clear all other filters of this type
            activeSet.clear();
            activeSet.add('all');
            
            // Update UI for this filter group
            const buttons = container.querySelectorAll('.filter-chip');
            buttons.forEach(btn => {
                if (btn.dataset.filter === 'all') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        } 
        // If clicking a specific filter
        else {
            // Remove "all" from this filter type if present
            if (activeSet.has('all')) {
                activeSet.delete('all');
                
                // Update the "All" button UI
                const allButton = container.querySelector('.filter-chip[data-filter="all"]');
                if (allButton) allButton.classList.remove('active');
            }
            
            // Toggle this filter
            if (isActive) {
                activeSet.delete(value);
                button.classList.remove('active');
            } else {
                activeSet.add(value);
                button.classList.add('active');
            }
            
            // If no filters remain, default to "all"
            if (activeSet.size === 0) {
                activeSet.add('all');
                const allButton = container.querySelector('.filter-chip[data-filter="all"]');
                if (allButton) allButton.classList.add('active');
            }
        }
        
        // Update display
        updateDisplay();
    }
    
    /**
     * Clear all filters
     */
    function clearAllFilters() {
        // Reset state
        activeGenres.clear();
        activeGenres.add('all');
        activeConcepts.clear();
        activeConcepts.add('all');
        
        // Reset UI for genre filters
        const genreButtons = genreFilterContainer.querySelectorAll('.filter-chip');
        genreButtons.forEach(btn => {
            if (btn.dataset.filter === 'all') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Reset UI for concept filters
        const conceptButtons = conceptFilterContainer.querySelectorAll('.filter-chip');
        conceptButtons.forEach(btn => {
            if (btn.dataset.filter === 'all') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update display
        updateDisplay();
    }
    
    /**
     * Initialize filter event listeners
     */
    function initFilters() {
        // Initialize collapsible section
        initCollapsible();
        
        // Genre filter listeners
        const genreButtons = genreFilterContainer.querySelectorAll('.filter-chip');
        genreButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filterValue = btn.dataset.filter;
                handleFilterClick(btn, 'genre', filterValue);
            });
        });
        
        // Concept filter listeners
        const conceptButtons = conceptFilterContainer.querySelectorAll('.filter-chip');
        conceptButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filterValue = btn.dataset.filter;
                handleFilterClick(btn, 'concept', filterValue);
            });
        });
        
        // Clear filters button
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', clearAllFilters);
        }
        
        // Initial display update
        updateDisplay();
    }
    
    // Start the filter system
    initFilters();
});
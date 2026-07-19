import React from 'react';

const CATEGORIES = [
  { id: 'all', label: '전체' },
  { id: 'nature', label: '자연' },
  { id: 'architecture', label: '건축' },
  { id: 'technology', label: '기술' },
  { id: 'abstract', label: '추상화' }
];

export default function FilterPanel({ searchQuery, setSearchQuery, activeCategory, setActiveCategory }) {
  return (
    <section className="controls-panel">
      {/* Search */}
      <div className="search-box">
        <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input 
          type="text" 
          id="searchInput" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="이미지 제목, 태그 또는 작가 이름으로 검색해보세요..." 
        />
      </div>

      {/* Category Filter */}
      <div className="filter-group" id="filterGroup">
        {CATEGORIES.map(cat => (
          <button 
            key={cat.id}
            className={`filter-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </section>
  );
}

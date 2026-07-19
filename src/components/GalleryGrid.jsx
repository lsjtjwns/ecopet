import React from 'react';
import GalleryCard from './GalleryCard';

export default function GalleryGrid({ images, onCardClick, onLikeToggle }) {
  if (images.length === 0) {
    return (
      <main className="gallery-grid" style={{ display: 'block' }}>
        <div className="no-results">
          <div className="no-results-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </div>
          <h3>검색 결과가 없습니다</h3>
          <p>검색어나 카테고리 필터를 다시 확인해보세요.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="gallery-grid">
      {images.map(img => (
        <GalleryCard 
          key={img.id}
          image={img}
          onClick={() => onCardClick(img.id)}
          onLikeToggle={onLikeToggle}
        />
      ))}
    </main>
  );
}

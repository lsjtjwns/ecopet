import React from 'react';

export function getCategoryKorean(cat) {
  switch (cat) {
    case 'nature': return '자연';
    case 'architecture': return '건축';
    case 'technology': return '기술';
    case 'abstract': return '추상화';
    default: return '일반';
  }
}

export default function GalleryCard({ image, onClick, onLikeToggle }) {
  const categoryKorean = getCategoryKorean(image.category);

  return (
    <article className="gallery-card" onClick={onClick}>
      <div className="img-container">
        <img src={image.url} alt={image.title} loading="lazy" />
        <div className="card-overlay">
          <span className="card-category">{categoryKorean}</span>
          <h3 className="card-title">{image.title}</h3>
          <p className="card-description">{image.description}</p>
        </div>
      </div>
      <div className="card-footer">
        <div className="card-footer-info">
          <span className="card-author">{image.author}</span>
        </div>
        <div 
          className={`card-likes ${image.liked ? 'liked' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onLikeToggle(image.id);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={image.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
          <span className="like-count">{image.likes}</span>
        </div>
      </div>
    </article>
  );
}

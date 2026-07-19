import React, { useEffect, useState } from 'react';
import { getCategoryKorean } from './GalleryCard';

export default function LightboxModal({ image, isOpen, onClose, onPrev, onNext, onLikeToggle }) {
  const [fadingImgUrl, setFadingImgUrl] = useState(image?.url || '');
  const [opacity, setOpacity] = useState(1);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        triggerNav(onNext);
      } else if (e.key === 'ArrowLeft') {
        triggerNav(onPrev);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onNext, onPrev, onClose]);

  // Sync image source with fading transition
  useEffect(() => {
    if (image?.url) {
      if (fadingImgUrl !== image.url) {
        setOpacity(0);
        const timer = setTimeout(() => {
          setFadingImgUrl(image.url);
          setOpacity(1);
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [image?.url]);

  if (!isOpen || !image) return null;

  const triggerNav = (navAction) => {
    setOpacity(0);
    setTimeout(() => {
      navAction();
    }, 150);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = image.url;
    link.target = '_blank';
    link.download = `${image.title}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`modal active`} onClick={(e) => e.target.classList.contains('modal') && onClose()}>
      <button className="modal-close" onClick={onClose}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      
      <button className="modal-nav modal-prev" onClick={() => triggerNav(onPrev)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      
      <button className="modal-nav modal-next" onClick={() => triggerNav(onNext)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      <div className="modal-content">
        <div className="modal-body">
          <div className="modal-img-container">
            <img 
              id="lightboxImg" 
              src={fadingImgUrl} 
              alt={image.title} 
              style={{ opacity: opacity, transition: 'opacity 0.15s ease' }} 
            />
          </div>
          <div className="modal-details">
            <div className="modal-detail-header">
              <span className="card-category">{getCategoryKorean(image.category)}</span>
              <h2 className="modal-title">{image.title}</h2>
              <p className="modal-desc">{image.description}</p>
              
              <div className="modal-meta-list">
                <div className="modal-meta-item">
                  <span className="modal-meta-label">작가</span>
                  <span className="modal-meta-val">{image.author}</span>
                </div>
                <div className="modal-meta-item">
                  <span className="modal-meta-label">등록일</span>
                  <span className="modal-meta-val">{image.date}</span>
                </div>
                <div className="modal-meta-item">
                  <span className="modal-meta-label">해상도</span>
                  <span className="modal-meta-val">{image.resolution}</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleDownload}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                다운로드
              </button>
              <button 
                className={`btn btn-secondary ${image.liked ? 'liked' : ''}`}
                onClick={() => onLikeToggle(image.id)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={image.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="heart-icon">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span>{image.likes}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

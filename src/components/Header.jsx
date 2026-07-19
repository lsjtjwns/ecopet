import React from 'react';

export default function Header({ onOpenUpload }) {
  return (
    <header>
      <a href="#" className="brand" onClick={(e) => e.preventDefault()}>
        <img src="/logo.jpg" alt="나노바나나 로고" className="logo-img" />
        <span className="brand-text">나노바나나</span>
      </a>
      <div className="header-actions">
        <button className="btn btn-primary" id="openUploadBtn" onClick={onOpenUpload}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          이미지 추가
        </button>
      </div>
    </header>
  );
}

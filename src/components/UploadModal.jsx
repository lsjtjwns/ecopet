import React, { useState } from 'react';

export default function UploadModal({ isOpen, onClose, onAddImage }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('nature');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    const newImage = {
      id: `img-${Date.now()}`,
      url: url,
      title: title,
      author: author,
      category: category,
      description: description,
      date: new Date().toISOString().split('T')[0],
      resolution: '1920 x 1080',
      likes: 0,
      liked: false
    };

    onAddImage(newImage);

    // Reset states
    setUrl('');
    setTitle('');
    setAuthor('');
    setCategory('nature');
    setDescription('');
  };

  return (
    <div className={`modal active`} onClick={(e) => e.target.classList.contains('modal') && onClose()}>
      <div className="modal-form-content">
        <h2 className="modal-form-title">새 이미지 추가</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="imgUrl">이미지 URL</label>
            <input 
              type="url" 
              id="imgUrl" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://images.unsplash.com/... 또는 기타 이미지 링크" 
              required 
            />
          </div>
          <div className="form-group">
            <label htmlFor="imgTitle">제목</label>
            <input 
              type="text" 
              id="imgTitle" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="이미지 제목을 입력해주세요" 
              required 
            />
          </div>
          <div className="form-group">
            <label htmlFor="imgAuthor">작가</label>
            <input 
              type="text" 
              id="imgAuthor" 
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="작가의 이름을 입력해주세요" 
              required 
            />
          </div>
          <div className="form-group">
            <label htmlFor="imgCategory">카테고리</label>
            <select 
              id="imgCategory" 
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="nature">자연</option>
              <option value="architecture">건축</option>
              <option value="technology">기술</option>
              <option value="abstract">추상화</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="imgDesc">설명</label>
            <textarea 
              id="imgDesc" 
              rows="3" 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이미지에 대한 간단한 설명을 입력해주세요" 
              required
            ></textarea>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
            <button type="submit" className="btn btn-primary">등록하기</button>
          </div>
        </form>
      </div>
    </div>
  );
}

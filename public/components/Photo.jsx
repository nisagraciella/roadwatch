import React from "react";

function Photo({ image, code, caption, date }) {
  return (
    <div className="photo-item">
      <img
        src={image}
        alt={caption}
        onError={(e) => {
          console.error("Gambar gagal dimuat:", e.currentTarget.src);
        }}
      />
      <b>{code}</b>
      <span>{caption}</span>
      <small>{date}</small>
    </div>
  );
}

export default Photo;

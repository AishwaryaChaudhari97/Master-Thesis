import React, { useEffect, useState } from "react";
import axios from "axios";

function ImageGrid({ selectedImages, onSelect }) {
  const [images, setImages] = useState([]);

  useEffect(() => {
    axios.get("http://127.0.0.1:5000/list-images").then((response) => {
      setImages(response.data.images);
    });
  }, []);

  const toggleImage = (image) => {
    if (selectedImages.includes(image)) {
      onSelect(selectedImages.filter((img) => img !== image));
    } else {
      onSelect([...selectedImages, image]);
    }
  };

  return (
    <div className="image-grid">
      {images.map((image, index) => (
        <img
          key={index}
          src={`http://127.0.0.1:5000/images/${image}`}
          alt={image}
          className={selectedImages.includes(image) ? "selected" : ""}
          onClick={() => toggleImage(image)}
        />
      ))}
    </div>
  );
}

export default ImageGrid;

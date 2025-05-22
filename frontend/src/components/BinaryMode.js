// === UPDATED BinaryMode.js with Multi-Tree Mode and Image Highlighting ===
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import * as d3 from "d3";

import "./BinaryMode.css";
import ProcessGraphViewer from "./ProcessGraphViewer";
import ProjectionView from "./ProjectionView";

const BinaryMode = ({ children, mode }) => {
  const [prompts, setPrompts] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const dropdownRef = useRef(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [inputText1, setInputText1] = useState("");
  const [images, setImages] = useState([]);
  const [isSubmitting1, setIsSubmitting1] = useState(false);
  const [processTrees, setProcessTrees] = useState([]);
  const [selectedStepData, setSelectedStepData] = useState(null);
  const [output1, setOutput1] = useState([]);
  const [showOutput1, setShowOutput1] = useState(false);
  const [latestExecutedPrompt, setLatestExecutedPrompt] = useState(null);
  const [projectionData, setProjectionData] = useState(null);
  const [lastClickedIndex, setLastClickedIndex] = useState(null);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState(null);
  const [selectedGraphTreeIndex, setSelectedGraphTreeIndex] = useState(null);
  const [selectedGraphNodeLabel, setSelectedGraphNodeLabel] = useState(null);
  


  const isProjectionView = mode === "projectionview";

  useEffect(() => {
    const fetchPrompts = async () => {
      const response = await axios.get("http://127.0.0.1:5000/get-prompts");
      setPrompts(response.data.prompts || []);
      const imageResponse = await axios.get("http://127.0.0.1:5000/images");
      const filenames = imageResponse.data;
      const imageList = filenames.map((filename, index) => ({
        id: index + 1,
        src: `http://127.0.0.1:5000/images/${filename}`,
        filename,
      }));
      setImages(imageList);
    };
    fetchPrompts();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setExpandedCategory(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCategoryClick = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  const handlePromptSelection = (category, prompt) => {
    setSelectedPrompt(prompt);
    setInputText1(prompt);
  };

  const getYesResults = (output) => output.filter(r => /\byes\b/i.test(r.description));
  const getNoResults = (output) => output.filter(r => !/\byes\b/i.test(r.description));

  const intersectFilenames = (a, b) => {
    const aNames = new Set(a.map(r => r.filename));
    return b.filter(r => aNames.has(r.filename));
  };

const handleGraphSelectionForNextPrompt = (results, nodeId, treeIndex, nodeLabel) => {
  const urls = results.map(r => r.imageUrl);
  setSelectedImages(urls);
  setSelectedGraphNodeId(nodeId);
  setSelectedGraphTreeIndex(treeIndex);
  setSelectedGraphNodeLabel(nodeLabel); // 🟢 Save label for later use
};
const handleSubmit = async () => {
  if (!inputText1.trim()) return;
  setIsSubmitting1(true);
  setLatestExecutedPrompt("output1");

  const prompt = inputText1.trim();

  // Safely map selected image srcs to filenames
  const selectedFilenames = selectedImages.map(src => {
    const match = images.find(img => img.src === src);
    if (!match) {
      console.error("🚨 No match found for selected image src:", src);
    }
    return match?.filename;
  }).filter(Boolean); // remove any undefined

  // Prevent backend call with invalid filenames
  if (!isProjectionView && selectedFilenames.length === 0) {
    alert("Image selection failed. Please reselect the images.");
    setIsSubmitting1(false);
    return;
  }

  try {
    let formattedResults = [];

    if (isProjectionView) {
      const response = await axios.post("http://127.0.0.1:5000/process_query", {
        query: prompt
      });

      setProjectionData(response.data); // ✅ Update view

      formattedResults = response.data.matching_images.map((path, index) => {
        const filename = path.split("\\").pop().split("/").pop();
        return {
          filename,
          description: response.data.object_captions[index],
          imageUrl: `http://localhost:5000/images/${filename}`
        };
      });
    } else {
      const response = await axios.post("http://127.0.0.1:5000/process", {
        prompt,
        images: selectedFilenames,
      });

      setOutput1(response.data.results || []);

      formattedResults = response.data.results.map(r => ({
        filename: r.filename,
        description: r.description,
        imageUrl: images.find(img => img.filename === r.filename)?.src
      }));
    }

   const yesResults = getYesResults(formattedResults);
const noResults = getNoResults(formattedResults);

const newStep = {
  label: `${prompt} (${isProjectionView ? "projection" : "binary"})`,
  yesResults,
  noResults,
  category: isProjectionView ? "Projection View" : "Binary Mode",
  parentPath: selectedGraphNodeLabel // 🟢 Save path to control flow
};

let updatedTrees = [...processTrees];

if (selectedGraphTreeIndex !== null && updatedTrees[selectedGraphTreeIndex]) {
  updatedTrees[selectedGraphTreeIndex].push(newStep);
} else {
  updatedTrees.push([newStep]); // fallback
}
    setProcessTrees(updatedTrees);
    setSelectedImages(formattedResults.map(i => i.imageUrl)); // ✅ Sync view selection

    const projRes = await axios.get("http://127.0.0.1:5000/projection-data");
    const filteredProjection = projRes.data.filter(p =>
      formattedResults.find(r => r.filename === p.img.split("/").pop())
    );
    setProjectionData({
      matching_images: filteredProjection.map(p => p.img),
      reduced_embeddings: filteredProjection.map(p => [p.x, p.y]),
      object_captions: formattedResults.map(r => r.description),
      similarities: new Array(filteredProjection.length).fill(0),
      cluster_labels: new Array(filteredProjection.length).fill(0)
    });
  } catch (err) {
    console.error("❌ handleSubmit error:", err);
    alert("Something went wrong. Check console for error.");
  } finally {
    setIsSubmitting1(false);
  }
};



  const getBorderClass = (filename) => {
    const yesResults = getYesResults(output1).map(res => res.filename);
    const noResults = getNoResults(output1).map(res => res.filename);
    if (yesResults.includes(filename)) return "highlight-yes";
    if (noResults.includes(filename)) return "highlight-no";
    return "";
  };

  const renderImageGrid = () => {
    console.log("Rendering image grid with images:", projectionData);
    if (isProjectionView) return <ProjectionView
  data={projectionData}
  onSearch={(prompt) => handleSubmit(prompt, "projection")}
  selectedImageUrls={selectedImages}
  binaryYesFilenames={
    latestExecutedPrompt === "output1"
      ? getYesResults(output1).map(res => res.filename)
      : []
  }
/>

    return (
      <div className="image-grid">
        {images.map((image) => (
          <div
            key={image.id}
            className={`image-item ${selectedImages.includes(image.src) ? "selected" : ""} ${getBorderClass(image.filename)}`}
            onClick={(e) => {
  const clickedIndex = images.findIndex(img => img.id === image.id);

  if (e.shiftKey && lastClickedIndex !== null) {
    const start = Math.min(lastClickedIndex, clickedIndex);
    const end = Math.max(lastClickedIndex, clickedIndex);
    const range = images.slice(start, end + 1).map(img => img.src);
    const merged = Array.from(new Set([...selectedImages, ...range]));
    setSelectedImages(merged);
  } else {
    setSelectedImages(prev =>
      prev.includes(image.src)
        ? prev.filter(i => i !== image.src)
        : [...prev, image.src]
    );
    setLastClickedIndex(clickedIndex);
  }
}}
          >
            <img src={image.src} alt={image.filename} />
          </div>
        ))}
      </div>
    );
  };

  const renderOutputSection = (title, results) => (
    <div className="output-section">
      <h4>{title}</h4>
      <div className="output-grid">
        {results.map((res, idx) => {
          const imgSrc = images.find((img) => img.filename === res.filename)?.src;
          return imgSrc ? (
            <img key={idx} src={imgSrc} className="output-image" />
          ) : null;
        })}
      </div>
    </div>
  );

  const handleFolderSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("images", file, file.webkitRelativePath);
    });

    try {
      await axios.post("http://127.0.0.1:5000/upload-folder", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert("Folder uploaded successfully!");

      const imageResponse = await axios.get("http://127.0.0.1:5000/images");
      const filenames = imageResponse.data;
      const imageList = filenames.map((filename, index) => ({
        id: index + 1,
        src: `http://127.0.0.1:5000/images/${filename}`,
        filename,
      }));
      setImages(imageList);

    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload folder.");
    }
  };


   return (
    <div className="binary-mode">
      <div className="sidebar">
        {children}
          <div>
          <div className="upload-container">
            <label>Select Image Folder:</label>
            <label htmlFor="folder-upload" className="upload-button">
              {'Upload Image Folder'}
            </label>
          </div>
          <input
            type="file"
            id="folder-upload"
            webkitdirectory="true"
            directory=""
            multiple
            onChange={handleFolderSelect}
            className="input-file"
          />
        </div>
        <h2>Prompts</h2>
        <textarea
          className="large-textarea"
          placeholder="Enter prompt..."
          value={inputText1}
          onChange={(e) => setInputText1(e.target.value)}
        />
         <div className="button-checkbox-container">
            <button onClick={handleSubmit} disabled={isSubmitting1} className="large-button">
              {isSubmitting1 ? "Processing..." : "Go ➡️"}
            </button>
          <input
            type="checkbox"
            checked={showOutput1}
            onChange={() => setShowOutput1(!showOutput1)}
            className="large-checkbox"
          />
        </div>
        <div className="category-buttons">
          {Object.keys(prompts).map((category) => (
            <div key={category} className="category">
              <button
                onClick={() => handleCategoryClick(category)}
                className="category-button"
              >
                {category}
              </button>
              {expandedCategory === category && (
                <ul className="dropdown-list" ref={dropdownRef}>
                  {prompts[category]?.map((prompt, index) => (
                    <li
                      key={index}
                      className={selectedPrompt === prompt ? "active" : ""}
                      onClick={() => handlePromptSelection(category, prompt)}
                    >
                      <span>{prompt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
       
      </div>
      
      <div className="main-content">
        {renderImageGrid()}
      </div>

      <div className="output-box">
        {(showOutput1) ? (
          <>
            {renderOutputSection("Output 1 - Yes Results", getYesResults(output1))}
          </>
        ) : latestExecutedPrompt === "output1" ? (
          <>
            {renderOutputSection("Latest Output - Yes Results", getYesResults(output1))}
            {renderOutputSection("Latest Output - No Results", getNoResults(output1))}
          </>
        ) :null}
      </div>

      {
<ProcessGraphViewer
  processTrees={processTrees}
  onReset={() => setProcessTrees([])}
  onSelectNodeResults={setSelectedStepData}
  onSelectNodeForNextPrompt={handleGraphSelectionForNextPrompt}
/>
      }
    </div>
  );
};

export default BinaryMode;

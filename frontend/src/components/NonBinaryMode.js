import React, { useState, useEffect } from "react";
import axios from "axios";

import "./NonBinaryMode.css";

const NonBinaryMode = ({ children }) => {
    const [inputText, setInputText] = useState("");
    const [selectedImages, setSelectedImages] = useState([]);
    const [images, setImages] = useState([]);
    const [output, setOutput] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [imageDescriptions, setImageDescriptions] = useState({});
    const [selectedPrompt, setSelectedPrompt] = useState("");
    const [prompts, setPrompts] = useState([]);
    const [criteria, setRatingCriteria] = useState("");
    const [isRatingPromptSubmitting, setIsRatingPromptSubmitting] = useState(false);

    useEffect(() => {
        const fetchPrompts = async () => {
          try {
            const response = await axios.get("http://127.0.0.1:5000/get-NBprompts");
            if (response.data.prompts) {
              setPrompts(response.data.prompts);
            }
            const imageResponse = await axios.get("http://127.0.0.1:5000/images");
            const filenames = imageResponse.data;
            const imageList = filenames.map((filename, index) => ({
              id: index + 1,
              src: `http://127.0.0.1:5000/images/${filename}`,
              filename,
            }));
            setImages(imageList);
          } catch (error) {
            console.error("Error fetching prompts:", error);
          }
        };
    
        fetchPrompts();
      }, []);
    

  const handleImageSelection = async (imgSrc) => {
    const selectedFilename = images.find((image) => image.src === imgSrc)?.filename;
    if (!selectedFilename) return;

    try {
      const response = await axios.post("http://127.0.0.1:5000/process", {
        prompt: "Describe the image",
        images: [selectedFilename],
      });
      console.log("+++++",response.data);
      setImageDescriptions((prev) => ({
        ...prev,
        [imgSrc]: response.data.results[0] || "No description available",
      }));
    } catch (error) {
      console.error("Error processing image:", error);
      alert("Failed to get image description.");
    }
  };

  const handleSubmit = async () => {
    if (selectedImages.length === 0) {
      alert("Please select at least one image.");
      return;
    }

    if (!inputText.trim()) {
      alert("Please enter a prompt before submitting.");
      return;
    }

    setIsSubmitting(true);
    await handleAddPrompt(inputText);

    const selectedFilenames = selectedImages.map(
      (imgSrc) => images.find((image) => image.src === imgSrc)?.filename
    );

    try {
      const response = await axios.post("http://127.0.0.1:5000/process-nonbinary", {
        prompt: inputText.trim(),
        images: selectedFilenames,
      });
      console.log(response.data.results)
      setOutput(response.data.results || []);
    } catch (error) {
      console.error("Error processing request:", error);
      alert("An error occurred while processing your request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRatingSubmit = async () => {
    
    if (selectedImages.length === 0) {
      alert("Please select at least one image.");
      return;
    }

    const selectedFilenames = selectedImages.map(
      (imgSrc) => images.find((image) => image.src === imgSrc)?.filename
    );


    try {
      const response = await axios.post("http://127.0.0.1:5000/rating-prompt", {
        rating_criteria: criteria,
        images: selectedFilenames,
      });
      console.log(response.data.results)
      setOutput(response.data.results || []);
    } catch (error) {
      console.error("Error processing request:", error);
      alert("An error occurred while processing your request.");
    } finally {
      setIsRatingPromptSubmitting(false);
    }
  };

  const handlePromptSelection = async (prompt) => {
    setSelectedPrompt(prompt);
    setInputText(prompt);
  };

  const handleAddPrompt = async (inputText) => {
    if (inputText.trim() === "") return;

    const newPrompt = inputText.trim();
    
    const promptList = Object.values(prompts).flatMap(category => Object.keys(category));

    if (promptList.some((prompt) => prompt.toLowerCase() === newPrompt.toLowerCase())) {
        setSelectedPrompt(newPrompt);
        return;
    }


    try {
      await axios.post("http://127.0.0.1:5000/save-nonbinary-prompt", { prompt: newPrompt });
      setPrompts([...prompts, newPrompt]);
      const promptResponse = await axios.get("http://127.0.0.1:5000/get-NBprompts");
      setPrompts(promptResponse.data.prompts || []);
      setSelectedPrompt(newPrompt);
    } catch (error) {
      console.error("Error saving prompt:", error);
      alert("Unable to save the prompt.");
    }
  };

  const getBorderClass = (filename, responseData) => {
    // Log the filename and response data to check the match
    console.log("Checking border for:", filename);
  
    if (!Array.isArray(responseData)) return ""; // Ensure responseData is an array
  
    // Find the response data that corresponds to the current filename
    const imageData =output.find((res) => res.filename === filename);
    
    // Log the matched data
    console.log("Matched Data:", imageData);
  
    if (!imageData || !imageData.description) return ""; // Check if description exists
  
    // Match "best", "better", or "good" from the description text (case-insensitive)
    const match = imageData.description.match(/\b(best|better|good)\b/i);
    
    console.log("Match Found:", match); // Log the match to verify if it's working correctly
  
    if (!match) return "";
  
    const rating = match[1].toLowerCase();
    console.log("Rating Extracted:", rating); // Log the rating extracted from description
  
    // Return appropriate class based on the rating
    if (rating === "best") return "highlight-green";  // Green for Best
    if (rating === "better") return "highlight-orange"; // Orange for Better
    if (rating === "good") return "highlight-red"; // Red for Good
  
    return "";
  };
  return (
    <div className="non-binary-mode">
      <div className="sidebar">
        {children}
        <h2>Prompts</h2>
        <ul>
          {prompts.map((prompt, index) => (
            <li
              key={index}
              className={selectedPrompt === prompt ? "active" : ""}
              onClick={() => handlePromptSelection(prompt)}
            >
              {prompt}
            </li>
          ))}
        </ul>
       
      </div>
  
      <div className="main-content">
      <div className="input-box">
          <input
            type="text"
            placeholder="Enter your prompt..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Processing..." : "Submit"}
          </button>
        
        </div>
        <div className="rating-prompt">
        <span>Given the following images provide a rating for each image using the following criteria:</span>
        <input
          type="text"
          placeholder="Enter criteria (e.g. Light, Focus, Composition ...)"
          value={criteria}
          onChange={(e) => setRatingCriteria(e.target.value)}
        />
        <span> Given rating will be 1 to 5</span>
        <button onClick={handleRatingSubmit} disabled={isRatingPromptSubmitting}>
          {isRatingPromptSubmitting ? "Processing..." : "Submit"}
        </button>
      </div>




        <h3>Select Images</h3>
        <div className="image-grid">
  {images.map((image) => {
    // Get the border class for each image
    const borderClass = getBorderClass(image.filename, output); // Pass filename and output
    
    return (
      <div
        key={image.id}
        className={`image-item ${selectedImages.includes(image.src) ? "selected" : ""} ${borderClass}`}
        onClick={() =>
          setSelectedImages((prev) =>
            prev.includes(image.src) ? prev.filter((img) => img !== image.src) : [...prev, image.src]
          )
        }
      >
        <img src={image.src} alt={image.filename} />
        <div className="description-box">
          {imageDescriptions[image.src] ? (
            <span>{imageDescriptions[image.src]}</span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleImageSelection(image.src);
              }}
            >
              Click here for Description
            </button>
          )}
        </div>
      </div>
    );
  })}
</div>
      </div>
    
      <div className="output-box">
        <h3>Output</h3>
        {output.length > 0 ? (
          <div className="output-grid">
            {output.map((res, idx) => {
              const imgSrc = images.find((img) => img.filename === res.filename)?.src;
              return (
                <div key={idx} className="output-item">
                  {imgSrc && <img src={imgSrc} alt={res.filename} className="output-image" />}
                  <div class="output-text">{res.description}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <p>Output will appear here...</p>
        )}
      </div>
    </div>
  );
  
};

export default NonBinaryMode;

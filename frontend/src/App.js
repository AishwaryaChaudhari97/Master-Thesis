import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const App = () => {
  const [prompts, setPrompts] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [output, setOutput] = useState([]);
  const [inputText, setInputText] = useState("");
  const [images, setImages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Fetch saved prompts and images only once when the component mounts
    const fetchInitialData = async () => {
      try {
        const promptResponse = await axios.get("http://127.0.0.1:5000/get-prompts");
        setPrompts(promptResponse.data.prompts || []);

        const imageResponse = await axios.get("http://127.0.0.1:5000/images");
        const filenames = imageResponse.data;
        const imageList = filenames.map((filename, index) => ({
          id: index + 1,
          src: `http://127.0.0.1:5000/images/${filename}`,
          filename,
        }));
        setImages(imageList);
      } catch (error) {
        console.error("Error fetching data:", error);
        alert("Unable to load prompts or images.");
      }
    };

    fetchInitialData();
  }, []); // Runs only once

  const handlePromptClick = (prompt) => {
    setSelectedPrompt(prompt); // Select a prompt without triggering re-renders
  };

  const handleImageSelect = (imageSrc) => {
    setSelectedImages((prev) =>
      prev.includes(imageSrc) ? prev.filter((img) => img !== imageSrc) : [...prev, imageSrc]
    );
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
  };

  const handleAddPrompt = async () => {
    if (inputText.trim() === "") return;

    const newPrompt = inputText.trim();
    try {
      await axios.post("http://127.0.0.1:5000/save-prompt", { prompt: newPrompt });
      setPrompts([...prompts, newPrompt]);
      setSelectedPrompt(newPrompt); // Automatically select the newly added prompt
      setInputText(""); // Clear input field
    } catch (error) {
      console.error("Error saving prompt:", error);
      alert("Unable to save the prompt.");
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    // Validate input and selections
    if (!selectedPrompt && inputText.trim() === "") {
      alert("Please select or add a prompt before submitting.");
      setIsSubmitting(false);
      return;
    }

    if (inputText.trim() && !selectedPrompt) {
      await handleAddPrompt(); // Add the new prompt if inputText exists
      return; // Wait for the prompt to be added before submitting
    }

    if (selectedImages.length === 0) {
      alert("Please select at least one image.");
      setIsSubmitting(false);
      return;
    }

    const selectedFilenames = selectedImages.map((imgSrc) =>
      images.find((image) => image.src === imgSrc)?.filename
    );

    try {
      const response = await axios.post("http://127.0.0.1:5000/process", {
        prompt: selectedPrompt,
        images: selectedFilenames,
      });
      setOutput(response.data.results || []);
    } catch (error) {
      console.error("Error processing request:", error);
      alert("An error occurred while processing your request.");
    } finally {
      setIsSubmitting(false); // Re-enable the button after processing
    }
  };

  const handleGoClick = () => {
    if (inputText.trim() || selectedPrompt) {
      handleSubmit(); // Submit directly if text or prompt is present
    } else {
      alert("Please enter a prompt or select one before proceeding.");
    }
  };

  const handleEnterKey = (e) => {
    if (e.key === "Enter") {
      handleAddPrompt(); // Add the prompt on pressing Enter
    }
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <h2>Prompts</h2>
        {prompts.length === 0 ? (
          <p>No prompts added yet.</p>
        ) : (
          <ul>
            {prompts.map((prompt, index) => (
              <li
                key={index}
                className={selectedPrompt === prompt ? "active" : ""}
                onClick={() => handlePromptClick(prompt)}
              >
                {prompt}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Input Box and Go Button */}
        <div className="input-box">
          <input
            type="text"
            placeholder="Enter a new prompt here..."
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleEnterKey}
          />
          <button onClick={handleGoClick} disabled={isSubmitting}>
            {isSubmitting ? "Processing..." : "Go ➡️"}
          </button>
        </div>

        {/* Active Prompt */}
        <div className="selected-prompt">
          <h2>Selected Prompt</h2>
          <p>{selectedPrompt || "No prompt selected."}</p>
        </div>

        {/* Image Selection */}
        <h3>Select Images</h3>
        <div className="image-grid">
          {images.map((image) => (
            <div
              key={image.id}
              className={`image-item ${
                selectedImages.includes(image.src) ? "selected" : ""
              }`}
              onClick={() => handleImageSelect(image.src)}
            >
              <img src={image.src} alt={image.filename} />
            </div>
          ))}
        </div>
      </div>

      {/* Output Box */}
      <div className="output-box">
      {output.length > 0 ? (
        output.map((res, idx) => (
          <div key={idx} className="output-item">
            <h4>Filename: {res.filename}</h4>
            <p>Description: {res.description}</p>
          </div>
        ))
      ) : (
        <p>Output will appear here...</p>
      )}
    </div>
    </div>
  );
};

export default App;

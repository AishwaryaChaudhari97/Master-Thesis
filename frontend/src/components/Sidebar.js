import React from "react";

function Sidebar({ onPromptSelect }) {
  const prompts = ["Describe the image", "Analyze the scene", "Summarize objects"];

  return (
    <div className="sidebar">
      <h3>Prompts</h3>
      <ul>
        {prompts.map((prompt, index) => (
          <li key={index} onClick={() => onPromptSelect(prompt)}>
            {prompt}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Sidebar;
